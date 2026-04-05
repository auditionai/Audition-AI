import { useState, useRef, useEffect } from 'react';
import { Sparkles, Scissors, ImagePlus, Wand2, Zap, Crown, Loader, ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import { getUserProfile, getModelPricing } from '../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../services/concurrencyService';
import { saveImageToLocalCache, uploadFileToR2 } from '../services/storageService';
import {
  getVertexEditToolCostBreakdown,
  getVertexEditResolutionCostMap,
  type AuditionPricingOverride,
} from '../services/tstCatalog';
import type { GeneratedImage } from '../types';
import { runDirectImageEdit } from '../../../services/directImageEditService';
import { buildEnhancedVertexEditInstruction } from '../../../services/characterImageAssistService';
import type { ImageEditRecipePayload } from '../../../shared/queueRecipes';

const loadImageWithTimeout = (url: string, timeoutMs: number = 10000): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let timer: number;
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Image failed to load')); };
    img.src = url;
    timer = window.setTimeout(() => reject(new Error('Image load timeout')), timeoutMs);
  });
};

const calculateAspectRatioString = (w: number, h: number) => {
  if (w === h) return '1:1';
  if (w > h) return w / h >= 1.7 ? '16:9' : '4:3';
  return h / w >= 1.7 ? '9:16' : '3:4';
};

type Stage = 'input' | 'submitting';
type Resolution = '1K' | '2K' | '4K';
type ToolType = 'edit' | 'remove-bg' | 'enhance';

const TOOL_MAP: Record<string, { id: string, name: string, icon: any, desc: string }> = {
  'edit': { id: 'magic_editor_pro', name: 'Chỉnh Sửa Ảnh', icon: Wand2, desc: 'Thay đổi trang phục, bối cảnh bằng trí tuệ nhân tạo' },
  'remove-bg': { id: 'remove_bg_pro', name: 'Tách Nền', icon: Scissors, desc: 'Tách nền thông minh, giữ nguyên chất lượng cao' },
  'enhance': { id: 'sharpen_upscale', name: 'Làm Nét', icon: Sparkles, desc: 'Khôi phục độ nét 4K mà không làm thay đổi khuôn mặt' }
};

const extractMimeType = (input: string) =>
  input.startsWith('data:') ? input.substring(input.indexOf(':') + 1, input.indexOf(';')) : undefined;

const buildInstructionPrompt = (featureId: string, userPrompt: string, resolution: Resolution) => {
  if (featureId === 'magic_editor_pro') {
    return `Act as a professional photo editor. Perform the following edit on the image: "${userPrompt.trim()}".
CRITICAL RULES:
1. KEEP ORIGINAL IMAGE QUALITY AND SIZE. DO NOT DOWNSCALE.
2. Maintain the original identity, face, and outfit fidelity unless explicitly requested otherwise.
3. Preserve character stylization and do not humanize or photorealize the subject.
4. Ensure clean compositing, coherent lighting, and high-detail render quality.
5. Output a polished high-fidelity result without inventing unrelated elements.`;
  }

  if (featureId === 'sharpen_upscale') {
    return buildEnhancedVertexEditInstruction('sharpen_upscale', resolution);
  }

  return buildEnhancedVertexEditInstruction('remove_bg_pro', resolution);
};

const tryStageInputToStorage = async (source: string, folder: string) => {
  try {
    return await uploadFileToR2(source, folder);
  } catch (error) {
    throw new Error('Thất bại khi tải ảnh lên máy chủ. Vui lòng thử lại.');
  }
};

export function WorkspaceEdit() {
  const navigate = useNavigate();
  useAuth();
  const { notify } = useNotification();
  const { queueStats } = useConcurrency();
  const { toolId } = useParams<{ toolId: string }>();

  const validToolId = (toolId && TOOL_MAP[toolId]) ? toolId.toLowerCase() as ToolType : 'edit';
  const toolConfig = TOOL_MAP[validToolId];
  const featureId = toolConfig.id;
  const isMagicEditor = featureId === 'magic_editor_pro';

  const [stage, setStage] = useState<Stage>('input');
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [aiModel, setAiModel] = useState<'flash' | 'pro'>('flash');

  const [auditionPricing, setAuditionPricing] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset inputs when tool changes
    setSourceImage(null);
    setPrompt('');
    setStage('input');
    setResolution('1K');
    setAiModel('flash');
  }, [toolId]);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const pricingConfig = await getModelPricing();
        setAuditionPricing(pricingConfig || []);
      } catch (error) {
        setAuditionPricing([]);
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, []);

  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
    modelId: row.model_id,
    optionId: row.option_id,
    auditionPriceVcoin: row.audition_price_vcoin,
  }));

  const activeTier = isMagicEditor ? aiModel : 'flash';
  const selectedCost = getVertexEditToolCostBreakdown({
    toolId: featureId,
    tier: activeTier,
    resolution,
    pricingOverrides,
  });
  
  const resolutionCostMap = getVertexEditResolutionCostMap({
    toolId: featureId,
    tier: activeTier,
    pricingOverrides,
  });

  const availableResolutions = (['1K', '2K', '4K'] as Resolution[]).filter(
    (value) => resolutionCostMap[value].vcoin >= 0,
  );

  useEffect(() => {
    if (availableResolutions.length > 0 && !availableResolutions.includes(resolution)) {
      setResolution(availableResolutions[0] as Resolution);
    }
  }, [availableResolutions, resolution]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSourceImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreate = async () => {
    if (!sourceImage) {
      notify('Vui lòng tải ảnh gốc để tiến hành.', 'warning');
      return;
    }
    if (isMagicEditor && !prompt.trim()) {
      notify('Bạn chưa nhập nội dung yêu cầu chỉnh sửa.', 'warning');
      return;
    }
    if (catalogLoading) {
      notify('Đang kết nối hệ thống. Vui lòng thử lại sau giây lát.', 'warning');
      return;
    }
    if (!selectedCost.available) {
      notify('Cấu hình AI hiện không khả dụng.', 'error');
      return;
    }
    
    // Check concurrency limits
    if (
      queueStats.myImageProcessing >= CONCURRENCY_LIMITS.user.imageProcessing &&
      queueStats.myQueued >= CONCURRENCY_LIMITS.user.queued
    ) {
      notify('Bạn đã đạt giới hạn luồng xử lý đồng thời. Vui lòng đợi.', 'warning');
      return;
    }
    if (queueStats.systemQueued >= CONCURRENCY_LIMITS.system.queued) {
      notify('Hệ thống đang quá tải. Vui lòng thử lại sau ít phút.', 'error');
      return;
    }

    const user = await getUserProfile();
    if ((user.vcoin_balance || 0) < selectedCost.vcoin) {
      notify(`Bạn cần có ít nhất ${selectedCost.vcoin} Vcoin để thực hiện.`, 'error');
      return;
    }

    setStage('submitting');

    const jobId = crypto.randomUUID();
    let displayPrompt = prompt.trim();
    if (!isMagicEditor) {
      displayPrompt = toolConfig.name;
    }
    
    const engineLabel = activeTier === 'flash' ? `Vertex Flash ${resolution}` : `Vertex Pro ${resolution}`;

    const placeholderImage: GeneratedImage = {
      id: jobId,
      url: '',
      prompt: displayPrompt,
      timestamp: Date.now(),
      updatedAt: Date.now(),
      assetType: 'image',
      toolId: featureId,
      toolName: toolConfig.name,
      engine: engineLabel,
      status: 'queued',
      jobId,
      progress: 0,
      cost: selectedCost.vcoin,
    };

    try {
      await saveImageToLocalCache(placeholderImage);
    } catch { }

    notify('Đang gửi lệnh xử lý...');

    setTimeout(async () => {
      try {
        const stagedSource = await tryStageInputToStorage(sourceImage, `inputs/editing/${featureId}`);
        let aspectRatio = '1:1';
        try {
          const image = await loadImageWithTimeout(sourceImage);
          aspectRatio = calculateAspectRatioString(image.width, image.height);
        } catch { }

        const queuePayload: ImageEditRecipePayload = {
          recipeType: 'image_edit_recipe_v1',
          modelId: activeTier === 'flash' ? 'vertex-flash' : 'vertex-pro',
          prompt: buildInstructionPrompt(featureId, prompt, resolution),
          sourceImage: stagedSource,
          mimeType: extractMimeType(stagedSource) || extractMimeType(sourceImage),
          resolution,
          aspectRatio,
        };

        const result = await runDirectImageEdit({
          id: jobId,
          prompt: displayPrompt,
          toolId: featureId,
          toolName: toolConfig.name,
          engine: engineLabel,
          costVcoin: selectedCost.vcoin,
          queuePayload,
        });

        window.dispatchEvent(new Event('balance_updated'));

        try {
          await saveImageToLocalCache({
            ...placeholderImage,
            url: result.imageUrl || '',
            status: 'completed',
            updatedAt: result.updatedAt ? new Date(result.updatedAt).getTime() : Date.now(),
            progress: 100,
          });
        } catch { }
        
        // Return to Gallery
        navigate('/gallery');
      } catch (err: any) {
        setStage('input');
        notify(err.message || 'Có lỗi xảy ra', 'error');
        // Update local cache error
        try {
          await saveImageToLocalCache({
            ...placeholderImage,
            status: 'failed',
            error: err.message || 'Failed',
            updatedAt: Date.now()
          });
        } catch { }
      }
    }, 300);
  };

  const ToolIcon = toolConfig.icon;

  return (
    <div className="flex flex-col h-[100dvh] bg-[#FAFAFA] dark:bg-[#09090B] overflow-hidden relative">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

      {/* Header */}
      <div className="safe-top flex items-center justify-between px-4 py-3 bg-white dark:bg-[#18181B]/80 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/home')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:bg-zinc-800 active:bg-gray-200 dark:bg-zinc-700 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-200" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-600">
               <ToolIcon className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">{toolConfig.name}</h1>
              <p className="text-[10px] font-medium text-gray-400 dark:text-zinc-500 capitalize">{validToolId} công cụ AI</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Form */}
      <div className="flex-1 overflow-y-auto pb-32 custom-scrollbar">
        <div className="p-4 space-y-6">
          
          <div className="bg-purple-50 dark:bg-purple-500/10 p-3 rounded-2xl border border-purple-100 dark:border-purple-500/30 flex gap-3 items-center">
             <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-purple-600" />
             </div>
             <p className="text-xs text-purple-800 font-medium leading-relaxed">
               {toolConfig.desc}
             </p>
          </div>

          {/* Source Image */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest flex justify-between">
              <span>Ảnh Cần Xử Lý</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-64 bg-white dark:bg-[#18181B]/50 border border-gray-200 dark:border-zinc-700 rounded-[24px] overflow-hidden flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_16px_rgb(0,0,0,0.03)] hover:border-purple-300 group relative"
            >
              {sourceImage ? (
                <>
                  <img src={sourceImage} alt="Source" className="w-full h-full object-contain bg-black/5" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center">
                    <span className="text-xs font-bold text-white uppercase tracking-wider bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md">Đổi ảnh khác</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center border border-purple-100 dark:border-purple-500/30 group-hover:scale-110 transition-transform shadow-sm">
                    <ImagePlus className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-gray-600 dark:text-zinc-300 block mb-0.5">Tải ảnh lên </span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 font-medium">Chọn một ảnh nhân vật sắc nét</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Configs */}
          <div className="space-y-5">
            {isMagicEditor && (
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Mô Tả Chỉnh Sửa</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ví dụ: Đổi màu áo sang xanh đậm..."
                  className="w-full bg-white dark:bg-[#18181B] border border-gray-200 dark:border-zinc-700 rounded-[20px] p-4 text-sm text-gray-900 dark:text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none h-24 shadow-sm"
                />
              </div>
            )}

            {isMagicEditor && (
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Engine Thông Minh</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAiModel('flash')}
                    className={`flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${aiModel === 'flash' ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-500 shadow-sm' : 'bg-white dark:bg-[#18181B] border-gray-200 dark:border-zinc-700 hover:border-purple-300'}`}
                  >
                    <Zap className={`w-5 h-5 mb-1 ${aiModel === 'flash' ? 'text-purple-600' : 'text-gray-400 dark:text-zinc-500'}`} />
                    <span className={`text-xs font-bold ${aiModel === 'flash' ? 'text-purple-700' : 'text-gray-600 dark:text-zinc-300'}`}>Flash</span>
                  </button>
                  <button
                    onClick={() => setAiModel('pro')}
                    className={`flex-1 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${aiModel === 'pro' ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-500 shadow-sm' : 'bg-white dark:bg-[#18181B] border-gray-200 dark:border-zinc-700 hover:border-purple-300'}`}
                  >
                    <Crown className={`w-5 h-5 mb-1 ${aiModel === 'pro' ? 'text-purple-600' : 'text-gray-400 dark:text-zinc-500'}`} />
                    <span className={`text-xs font-bold ${aiModel === 'pro' ? 'text-purple-700' : 'text-gray-600 dark:text-zinc-300'}`}>Pro</span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Chất Lượng Xuất</label>
              <div className="flex gap-2 p-1 bg-gray-100 dark:bg-zinc-800/80 rounded-[18px]">
                {availableResolutions.map((res) => (
                  <button
                    key={res}
                    onClick={() => setResolution(res)}
                    className={`flex-1 py-2.5 rounded-2xl text-xs font-bold transition-all ${resolution === res ? 'bg-white dark:bg-[#18181B] text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700/50' : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:text-zinc-100'}`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-[70px] left-0 right-0 bg-white dark:bg-[#18181B] border-t border-gray-100 dark:border-zinc-800 p-4 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] flex gap-4 items-center max-w-md mx-auto xl:absolute xl:bottom-0">
        {/* Cost info */}
        <div className="flex-1">
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Chi Phí</p>
          <div className="flex items-end gap-1">
            <span className="text-xl font-black text-gray-900 dark:text-white">{selectedCost.available ? selectedCost.vcoin : '--'}</span>
            <span className="text-xs font-bold text-purple-600 mb-0.5">Vcoin</span>
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleCreate}
          disabled={stage === 'submitting' || !sourceImage || !selectedCost.available || catalogLoading}
          className="flex-none w-[180px] h-12 rounded-2xl text-[13px] font-bold shadow-lg"
          variant="primary"
        >
          {stage === 'submitting' ? (
            <span className="flex items-center gap-2">
              <Loader className="w-5 h-5 animate-spin" /> Đang Xử Lý..
            </span>
          ) : (
             <span className="flex items-center gap-2">
               <ToolIcon className="w-5 h-5" /> THỰC HIỆN
             </span>
          )}
        </Button>
      </div>

      {stage === 'submitting' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-fade-in">
           <div className="w-16 h-16 bg-white dark:bg-[#18181B] rounded-2xl shadow-xl flex items-center justify-center animate-pulse">
              <Loader className="w-8 h-8 text-purple-600 animate-spin" />
           </div>
        </div>
      )}
    </div>
  );
}
