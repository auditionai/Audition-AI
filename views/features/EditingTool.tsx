import React, { useEffect, useRef, useState } from 'react';
import { Feature, GeneratedImage, Language, ViewId } from '../../types';
import { Icons } from '../../components/Icons';
import { useNotification } from '../../components/NotificationSystem';
import { getModelPricing, getUserProfile, type ModelPricing } from '../../services/economyService';
import { saveImageToLocalCache, uploadFileToR2 } from '../../services/storageService';
import {
  getVertexEditResolutionCostMap,
  getVertexEditToolCostBreakdown,
  type AuditionPricingOverride,
} from '../../services/tstCatalog';
import type { ImageEditRecipePayload } from '../../shared/queueRecipes';
import { DIRECT_IMAGE_EDIT_QUEUE_KIND } from '../../shared/queueKinds';
import { runDirectImageEdit } from '../../services/directImageEditService';
import { calculateAspectRatioString, loadImageWithTimeout } from '../../utils/imageProcessor';
import { buildEnhancedVertexEditInstruction } from '../../services/characterImageAssistService';

interface EditingToolProps {
  feature: Feature;
  lang: Language;
  onNavigateToFeature?: (featureId: string) => void;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

const SUGGESTIONS = [
  { label: { vi: 'Thay đổi background sang biển', en: 'Change background to beach' }, icon: Icons.Image },
  { label: { vi: 'Mặc vest đen sang trọng', en: 'Wear luxury black suit' }, icon: Icons.User },
  { label: { vi: 'Thêm hiệu ứng tuyết rơi', en: 'Add snowing effect' }, icon: Icons.Cloud },
  { label: { vi: 'Biến thành tranh sơn dầu', en: 'Turn into oil painting' }, icon: Icons.Palette },
  { label: { vi: 'Đổi màu tóc sang đỏ', en: 'Change hair color to red' }, icon: Icons.Scissors },
  { label: { vi: 'Thêm kính râm cool ngầu', en: 'Add cool sunglasses' }, icon: Icons.Monitor },
  { label: { vi: 'Chuyển sang phong cách Cyberpunk', en: 'Make it Cyberpunk style' }, icon: Icons.Zap },
  { label: { vi: 'Xóa người thừa phía sau', en: 'Remove background people' }, icon: Icons.Trash },
];

const SMART_TIPS = [
  { icon: Icons.Wand, text: 'Magic Editor giúp thay đổi trang phục, bối cảnh hoặc thêm chi tiết vào ảnh gốc.' },
  { icon: Icons.Scissors, text: 'Tách Nền dùng AI để nhận diện chủ thể và xóa phông nền chính xác.' },
  { icon: Icons.Zap, text: 'Làm Nét giúp khôi phục chi tiết ảnh mờ, vỡ nét mà không vẽ lại khuôn mặt.' },
  { icon: Icons.Image, text: 'Hãy viết yêu cầu càng rõ càng tốt để AI hiểu đúng ý bạn.' },
  { icon: Icons.Crown, text: 'Model Pro cho chất lượng chỉnh sửa đẹp và chi tiết hơn Flash.' },
  { icon: Icons.ExternalLink, text: 'Bạn có thể dùng AuMix3D.com để chuẩn bị ảnh nhân vật tách nền cực nét.' },
];

const EDITING_TABS = [
  { id: 'magic_editor_pro', label: { vi: 'Chỉnh sửa ảnh', en: 'Photo Editor' }, icon: Icons.Wand },
  { id: 'remove_bg_pro', label: { vi: 'Tách nền', en: 'Remove BG' }, icon: Icons.Scissors },
  { id: 'sharpen_upscale', label: { vi: 'Làm nét', en: 'Upscale' }, icon: Icons.Zap },
];

type GenerationTier = 'flash' | 'pro';
type Resolution = '1K' | '2K' | '4K';

const VERTEX_EDIT_MODEL_ID_BY_TIER: Record<GenerationTier, string> = {
  flash: 'vertex-flash',
  pro: 'vertex-pro',
};

const extractMimeType = (input: string) =>
  input.startsWith('data:') ? input.substring(input.indexOf(':') + 1, input.indexOf(';')) : undefined;

const buildDisplayPrompt = (featureId: string, userPrompt: string, resolution: Resolution, lang: Language) => {
  if (featureId === 'remove_bg_pro') {
    return lang === 'vi' ? 'Tách nền khỏi ảnh này' : 'Remove the background of this image';
  }

  if (featureId === 'sharpen_upscale') {
    return lang === 'vi' ? `Làm nét và nâng cấp ảnh lên ${resolution}` : `Upscale and restore this image to ${resolution}`;
  }

  return userPrompt.trim();
};

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

const getGradient = (featureId: string) => {
  if (featureId === 'magic_editor_pro') return 'from-audi-purple to-pink-500';
  if (featureId === 'sharpen_upscale') return 'from-audi-cyan to-blue-500';
  if (featureId === 'remove_bg_pro') return 'from-audi-pink to-purple-600';
  return 'from-audi-purple to-pink-500';
};

const tryStageInputToStorage = async (source: string, folder: string) => {
  try {
    return await uploadFileToR2(source, folder);
  } catch (error) {
    console.warn('[EditingTool] Failed to stage source image to storage.', error);
    throw new Error('Không thể tải ảnh gốc lên vùng đệm. Vui lòng thử lại.');
  }
};

export const EditingTool: React.FC<EditingToolProps> = ({
  feature,
  lang,
  onNavigateToFeature,
  onNavigateView,
}) => {
  const { notify } = useNotification();

  const [prompt, setPrompt] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<GenerationTier>('flash');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('Vertex AI');
  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const [guideTopic, setGuideTopic] = useState<'guide' | null>(null);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUpscaler = feature.id === 'sharpen_upscale';
  const isRemover = feature.id === 'remove_bg_pro';
  const isMagicEditor = feature.id === 'magic_editor_pro';
  const activeTier: GenerationTier = isMagicEditor ? aiModel : 'flash';

  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
    modelId: row.model_id,
    optionId: row.option_id,
    auditionPriceVcoin: row.audition_price_vcoin,
  }));

  const selectedGenerationCost = getVertexEditToolCostBreakdown({
    toolId: feature.id,
    tier: activeTier,
    resolution,
    pricingOverrides,
  });
  const resolutionCostMap = getVertexEditResolutionCostMap({
    toolId: feature.id,
    tier: activeTier,
    pricingOverrides,
  });
  const availableResolutions = (['1K', '2K', '4K'] as Resolution[]).filter(
    (value) => resolutionCostMap[value].vcoin >= 0,
  );
  const availableSpeedLabels = ['Nhanh'];
  const availableServerLabels = ['Vertex AI'];
  const isFlashAvailable = true;
  const isProAvailable = isMagicEditor;
  const isCatalogReady = !catalogLoading;

  useEffect(() => {
    setUploadedImage(null);
    setPrompt('');
    setResolution('1K');
    setSpeed('Nhanh');
    setServer('Vertex AI');
    setAiModel('flash');
    setIsSubmitting(false);
  }, [feature.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTipIdx((prev) => (prev + 1) % SMART_TIPS.length);
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const pricingConfig = await getModelPricing();
        setAuditionPricing(pricingConfig || []);
      } catch (error) {
        console.warn('[EditingTool] Failed to load Vertex edit pricing overrides', error);
        setAuditionPricing([]);
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, []);

  useEffect(() => {
    if (isMagicEditor) {
      if (aiModel === 'flash' && !isFlashAvailable && isProAvailable) {
        setAiModel('pro');
      } else if (aiModel === 'pro' && !isProAvailable && isFlashAvailable) {
        setAiModel('flash');
      }
    }
  }, [aiModel, isFlashAvailable, isMagicEditor, isProAvailable]);

  useEffect(() => {
    if (availableResolutions.length > 0 && !availableResolutions.includes(resolution)) {
      setResolution(availableResolutions[0] as Resolution);
    }
  }, [availableResolutions, resolution]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleExecute = async () => {
    if (isSubmitting) return;
    if (!uploadedImage) {
      notify(lang === 'vi' ? 'Vui lòng tải ảnh lên.' : 'Please upload an image.', 'warning');
      return;
    }
    if (isMagicEditor && !prompt.trim()) {
      notify(lang === 'vi' ? 'Vui lòng nhập yêu cầu chỉnh sửa.' : 'Please enter your edit request.', 'warning');
      return;
    }
    if (!isCatalogReady) {
      notify(
        lang === 'vi'
          ? 'Dịch vụ Vertex AI đang khởi tạo. Vui lòng thử lại sau ít giây.'
          : 'Vertex AI is still initializing. Please try again in a few seconds.',
        'error',
      );
      return;
    }
    if (!selectedGenerationCost.available) {
      notify(
        lang === 'vi'
          ? 'Cấu hình Vertex AI hiện không khả dụng cho tool này.'
          : 'This Vertex AI configuration is not available for the selected tool.',
        'error',
      );
      return;
    }
    const user = await getUserProfile();
    if ((user.vcoin_balance || 0) < selectedGenerationCost.vcoin) {
      notify(
        lang === 'vi'
          ? `Số dư không đủ (cần ${selectedGenerationCost.vcoin} Vcoin).`
          : `Insufficient balance (need ${selectedGenerationCost.vcoin} Vcoin).`,
        'error',
      );
      return;
    }

    setIsSubmitting(true);
    const queuedJobId = crypto.randomUUID();

    const vertexModelId = VERTEX_EDIT_MODEL_ID_BY_TIER[activeTier];
    const displayPrompt = buildDisplayPrompt(feature.id, prompt, resolution, lang);
    const engineLabel = activeTier === 'flash' ? `Vertex Flash ${resolution}` : `Vertex Pro ${resolution}`;

    const queuedImage: GeneratedImage = {
      id: queuedJobId,
      url: '',
      prompt: displayPrompt,
      timestamp: Date.now(),
      updatedAt: Date.now(),
      assetType: 'image',
      queueKind: DIRECT_IMAGE_EDIT_QUEUE_KIND,
      showInGenerationHistory: true,
      toolId: feature.id,
      toolName: feature.name.en,
      engine: engineLabel,
      status: 'processing',
      jobId: queuedJobId,
      progress: 15,
      queueStage: 'preparing',
      queueLogs: [
        {
          at: new Date().toISOString(),
          stage: 'preparing',
          level: 'info',
          message: lang === 'vi'
            ? 'Đang tải ảnh nguồn và khởi tạo xử lý trực tiếp.'
            : 'Uploading source image and initializing direct processing.',
        },
      ],
      cost: selectedGenerationCost.vcoin,
    };

    try {
      await saveImageToLocalCache(queuedImage);
    } catch (error) {
      console.warn('[EditingTool] Failed to persist queued placeholder', error);
    }

    onNavigateView?.('gallery');

    void (async () => {
      try {
        const stagedSourceImage = await tryStageInputToStorage(uploadedImage, `inputs/editing/${feature.id}`);

        let aspectRatio = '1:1';
        try {
          const image = await loadImageWithTimeout(uploadedImage);
          aspectRatio = calculateAspectRatioString(image.width, image.height);
        } catch (error) {
          console.warn('[EditingTool] Failed to calculate aspect ratio', error);
        }

        const queuePayload: ImageEditRecipePayload = {
          recipeType: 'image_edit_recipe_v1',
          modelId: vertexModelId,
          prompt: buildInstructionPrompt(feature.id, prompt, resolution),
          sourceImage: stagedSourceImage,
          mimeType: extractMimeType(stagedSourceImage) || extractMimeType(uploadedImage),
          resolution,
          aspectRatio,
        };

        const result = await runDirectImageEdit({
          id: queuedJobId,
          prompt: displayPrompt,
          toolId: feature.id,
          toolName: feature.name.en,
          engine: engineLabel,
          costVcoin: selectedGenerationCost.vcoin,
          showInGenerationHistory: true,
          queuePayload,
        });

        await saveImageToLocalCache({
          ...queuedImage,
          url: result.imageUrl || '',
          status: 'completed',
          progress: 100,
          queueStage: 'completed',
          updatedAt: result.updatedAt ? new Date(result.updatedAt).getTime() : Date.now(),
          queueLogs: [
            ...(queuedImage.queueLogs || []),
            {
              at: result.updatedAt || new Date().toISOString(),
              stage: 'completed',
              level: 'success',
              message: lang === 'vi'
                ? 'Đã hoàn thành xử lý trực tiếp.'
                : 'Direct edit completed.',
            },
          ],
        });

        window.dispatchEvent(new Event('balance_updated'));
        notify(
          lang === 'vi'
            ? 'Đã xử lý xong. Kết quả đã được lưu vào Lịch sử.'
            : 'Direct edit finished. The result has been saved to History.',
          'success',
        );
      } catch (error) {
        console.error('[EditingTool] Failed to enqueue edit job', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : lang === 'vi'
              ? 'Không thể tạo job chỉnh sửa.'
              : 'Failed to create edit job.';

        try {
          await saveImageToLocalCache({
            ...queuedImage,
            status: 'failed',
            error: errorMessage,
            updatedAt: Date.now(),
            progress: 0,
            queueStage: 'failed',
            queueLogs: [
              ...(queuedImage.queueLogs || []),
              {
                at: new Date().toISOString(),
                stage: 'failed',
                level: 'error',
                message: errorMessage,
              },
            ],
          });
        } catch (persistError) {
          console.warn('[EditingTool] Failed to persist failed placeholder', persistError);
        }
        notify(errorMessage, 'error');
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const renderGuideContent = () => (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      <h3 className="text-xl font-bold text-audi-yellow flex items-center gap-2 border-b border-white/10 pb-2 sticky top-0 bg-[#12121a] z-10">
        <Icons.BookOpen className="w-6 h-6" /> Hướng Dẫn Sử Dụng
      </h3>

      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
        <h4 className="text-sm font-bold text-audi-cyan flex items-center gap-2">
          <Icons.Wand className="w-4 h-4" /> Chỉnh Sửa Ảnh
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed">
          Dùng prompt để thay đổi trang phục, bối cảnh hoặc thêm chi tiết mới vào ảnh gốc.
        </p>
      </div>

      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
        <h4 className="text-sm font-bold text-audi-pink flex items-center gap-2">
          <Icons.Scissors className="w-4 h-4" /> Tách Nền
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed">
          AI sẽ tách chủ thể và đưa ảnh về nền đen sạch, giữ nguyên nhân vật và chi tiết.
        </p>
      </div>

      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
        <h4 className="text-sm font-bold text-audi-yellow flex items-center gap-2">
          <Icons.Zap className="w-4 h-4" /> Làm Nét
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed">
          Khôi phục và nâng chất lượng ảnh mà không làm vẽ lại khuôn mặt hoặc trang phục.
        </p>
      </div>
    </div>
  );

  const TipIcon = SMART_TIPS[currentTipIdx].icon;

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto pb-12 animate-fade-in relative">
      {guideTopic && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-32 animate-fade-in"
          onClick={() => setGuideTopic(null)}
        >
          <div
            className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-audi-yellow/50 shadow-[0_0_30px_rgba(251,218,97,0.2)] relative"
            onClick={(event) => event.stopPropagation()}
          >
            <button onClick={() => setGuideTopic(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <Icons.X className="w-6 h-6" />
            </button>
            {renderGuideContent()}
            <div className="mt-6 pt-4 border-t border-white/10 text-center">
              <button
                onClick={() => setGuideTopic(null)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-colors"
              >
                Đã Hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center mb-4">
        <div className="bg-[#12121a] p-1.5 rounded-2xl border border-white/10 flex gap-1 shadow-lg overflow-x-auto no-scrollbar max-w-full">
          {EDITING_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onNavigateToFeature?.(tab.id)}
              className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                feature.id === tab.id
                  ? 'bg-white text-black shadow-md'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
              {tab.label[lang]}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full mb-4 bg-[#1a1500] border border-audi-yellow/20 rounded-xl p-2 md:p-3 flex items-center gap-2 md:gap-3 overflow-hidden relative shadow-[0_0_15px_rgba(251,218,97,0.05)]">
        <div className="shrink-0 p-1 md:p-1.5 bg-audi-yellow/10 rounded-lg border border-audi-yellow/20">
          <TipIcon className="w-3 h-3 md:w-4 md:h-4 text-audi-yellow animate-pulse" />
        </div>
        <div className="flex-1 overflow-hidden relative h-4 md:h-5">
          <span key={currentTipIdx} className="absolute inset-0 text-[9px] md:text-[11px] text-audi-yellow/80 font-medium whitespace-nowrap overflow-hidden text-ellipsis animate-slide-up">
            {SMART_TIPS[currentTipIdx].text}
          </span>
        </div>
      </div>

      <div className="w-full mb-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 flex items-center gap-3">
        <div className="shrink-0 p-1.5 bg-yellow-500/10 rounded-full">
          <Icons.Flame className="w-4 h-4 text-yellow-500 animate-pulse" />
        </div>
        <p className="text-[10px] md:text-xs text-yellow-200/80 font-medium leading-relaxed">
          <strong className="text-yellow-500">Lưu ý:</strong> Luồng chỉnh sửa giờ chạy ẩn theo hàng chờ.
          Sau khi bấm tạo, tiến trình sẽ được cập nhật realtime trong Lịch sử.
        </p>
      </div>

      <a
        href="https://aumix3d.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full mb-4 md:mb-6 bg-gradient-to-r from-[#001a2c] to-[#000a14] border border-audi-cyan/30 rounded-xl p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4 hover:border-audi-cyan transition-all shadow-[0_0_20px_rgba(33,212,253,0.1)] group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-audi-cyan/10 blur-[40px] rounded-full group-hover:bg-audi-cyan/20 transition-all" />
        <div className="relative z-10 flex items-center gap-3 md:gap-4 w-full md:w-auto">
          <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-audi-cyan/10 flex items-center justify-center border border-audi-cyan/30">
            <Icons.Sparkles className="w-5 h-5 md:w-6 md:h-6 text-audi-cyan" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">MỚI</span>
              <h4 className="text-white font-bold text-xs md:text-sm uppercase tracking-wider group-hover:text-audi-cyan transition-colors">
                Mix Đồ 3D Audition
              </h4>
            </div>
            <p className="text-[10px] md:text-xs text-slate-400 leading-relaxed">
              Bạn chưa có ảnh nhân vật? Mix đồ và chụp ảnh tách nền cực nét ngay trên web.
            </p>
          </div>
        </div>
        <div className="relative z-10 shrink-0 w-full md:w-auto mt-1 md:mt-0">
          <div className="w-full md:w-auto px-4 py-2 bg-audi-cyan/20 hover:bg-audi-cyan/30 border border-audi-cyan/50 rounded-lg flex items-center justify-center gap-2 transition-all">
            <span className="text-[10px] md:text-xs font-bold text-audi-cyan uppercase">Mở AuMix3D</span>
            <Icons.ExternalLink className="w-3 h-3 md:w-4 md:h-4 text-audi-cyan" />
          </div>
        </div>
      </a>

      <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 md:mt-0">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="font-bold text-white text-sm uppercase flex items-center gap-2">
              <Icons.Image className="w-4 h-4 text-audi-pink" /> 1. Upload Ảnh Cần Xử Lý
            </h3>
            <button
              onClick={() => setGuideTopic('guide')}
              className="text-xs text-audi-cyan hover:text-white flex items-center gap-1 transition-colors bg-audi-cyan/10 px-2 py-1 rounded-lg border border-audi-cyan/20"
            >
              <Icons.Info className="w-3 h-3" /> Hướng dẫn
            </button>
          </div>

          <div className="flex flex-col gap-4 w-full">
            <div className="flex justify-center w-full">
              <div className="w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors relative group shrink-0 shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded">ẢNH GỐC</span>
                </div>
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-64 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-pink cursor-pointer relative overflow-hidden transition-all flex flex-col items-center justify-center"
                  >
                    {uploadedImage ? (
                      <img src={uploadedImage} className="w-full h-full object-contain" alt="Source" />
                    ) : (
                      <div className="flex flex-col items-center text-slate-500 transition-colors">
                        <Icons.Upload className="w-8 h-8 mb-1" />
                        <span className="text-[10px] uppercase font-bold">Tải Ảnh Lên</span>
                      </div>
                    )}
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
              </div>
            </div>

            {isMagicEditor && (
              <div className="w-full bg-[#12121a] border border-white/10 rounded-2xl p-4 shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                    <Icons.MessageCircle className="w-4 h-4" /> 2. Yêu cầu chỉnh sửa
                  </label>
                </div>

                <div className="flex flex-col gap-4">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={lang === 'vi' ? 'Mô tả chi tiết yêu cầu chỉnh sửa...' : 'Describe the edit request...'}
                    className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white focus:border-audi-purple outline-none resize-none min-h-[150px]"
                  />

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Gợi ý nhanh</span>
                    <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                      {SUGGESTIONS.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => setPrompt(suggestion.label[lang])}
                          className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 transition-colors"
                        >
                          <suggestion.icon className="w-3 h-3 text-audi-purple" />
                          {suggestion.label[lang]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-5 flex flex-col gap-5 shadow-lg h-full">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Icons.Settings className="w-5 h-5 text-slate-400" />
                {isMagicEditor ? '3. Cấu Hình' : '2. Cấu Hình'}
              </h3>
            </div>

            {isUpscaler && (
              <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-audi-cyan/20 rounded-lg text-audi-cyan">
                    <Icons.Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Làm Nét 4K</h4>
                    <p className="text-xs text-slate-400 mt-1">Khôi phục chi tiết ảnh và giữ nguyên khuôn mặt, trang phục.</p>
                  </div>
                </div>
              </div>
            )}

            {isRemover && (
              <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-audi-pink/20 rounded-lg text-audi-pink">
                    <Icons.Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Chế Độ Tách Nền</h4>
                    <p className="text-xs text-slate-400 mt-1">Tách chủ thể và chuyển nền về đen sạch, vẫn giữ nguyên ảnh gốc.</p>
                  </div>
                </div>
              </div>
            )}

            {isMagicEditor && (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mô hình AI</label>
                <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                  <button
                    onClick={() => isFlashAvailable && setAiModel('flash')}
                    disabled={!isFlashAvailable}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      aiModel === 'flash'
                        ? 'bg-audi-purple text-white shadow-lg'
                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                    } ${!isFlashAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icons.Zap className={`w-4 h-4 ${aiModel === 'flash' ? 'text-white' : 'text-slate-400'}`} />
                    Flash
                  </button>
                  <button
                    onClick={() => isProAvailable && setAiModel('pro')}
                    disabled={!isProAvailable}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      aiModel === 'pro'
                        ? 'bg-audi-purple text-white shadow-lg'
                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                    } ${!isProAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Icons.Crown className={`w-4 h-4 ${aiModel === 'pro' ? 'text-white' : 'text-slate-400'}`} />
                    Pro
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Độ phân giải</label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {(['1K', '2K', '4K'] as Resolution[]).map((value) => {
                  const disabled = !availableResolutions.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => !disabled && setResolution(value)}
                      disabled={disabled}
                      className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                        resolution === value
                          ? 'bg-audi-purple text-white shadow-lg'
                          : 'text-slate-500 hover:text-white hover:bg-white/5'
                      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <Icons.Zap className="w-3 h-3" />
                Tốc độ xử lý
              </label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {availableSpeedLabels.map((label) => (
                  <button
                    key={label}
                    onClick={() => setSpeed(label)}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                      speed === label
                        ? 'bg-audi-purple text-white shadow-lg'
                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <Icons.Database className="w-3 h-3" />
                Server
              </label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {availableServerLabels.map((label) => (
                  <button
                    key={label}
                    onClick={() => setServer(label)}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                      server === label
                        ? 'bg-audi-cyan text-black shadow-lg'
                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-audi-purple/20 to-audi-pink/20 border border-white/10 p-3 mt-2">
              <div className="flex justify-between items-center relative z-10">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Giá hiện tại</span>
                <div className="flex items-end gap-1">
                  <span className="text-xl font-black text-white font-game drop-shadow-md">
                    {selectedGenerationCost.available ? selectedGenerationCost.vcoin : '--'}
                  </span>
                  <span className="text-[10px] font-bold text-audi-yellow mb-1">VCOIN</span>
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-white/5 pt-2">
                <span className={resolution === '1K' ? 'text-white font-bold' : ''}>1K: {resolutionCostMap['1K'].vcoin}VC</span>
                <span className={resolution === '2K' ? 'text-white font-bold' : ''}>2K: {resolutionCostMap['2K'].vcoin}VC</span>
                <span className={resolution === '4K' ? 'text-white font-bold' : ''}>4K: {resolutionCostMap['4K'].vcoin}VC</span>
              </div>
            </div>

            <button
              onClick={handleExecute}
              disabled={isSubmitting || !uploadedImage || !isCatalogReady || !selectedGenerationCost.available}
              className={`w-full py-3.5 mt-auto rounded-xl font-bold text-white shadow-[0_0_20px_rgba(255,0,153,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] bg-gradient-to-r ${getGradient(feature.id)}`}
            >
              {isSubmitting ? <Icons.Loader className="animate-spin" /> : <Icons.Wand />}
              {isSubmitting ? 'ĐANG GỬI JOB...' : 'THỰC HIỆN NGAY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};



