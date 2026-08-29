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

const NANO_BANANA_MODEL_ID_BY_TIER: Record<GenerationTier, string> = {
  flash: 'nano-banana-2',
  pro: 'nano-banana-2',
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
  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const [guideTopic, setGuideTopic] = useState<'guide' | null>(null);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const isFlashAvailable = true;
  const isProAvailable = isMagicEditor;
  const isCatalogReady = !catalogLoading;

  useEffect(() => {
    setUploadedImage(null);
    setPrompt('');
    setResolution('1K');
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
          ? 'Dịch vụ Nano Banana 2 đang khởi tạo. Vui lòng thử lại sau ít giây.'
          : 'Nano Banana 2 is still initializing. Please try again in a few seconds.',
        'error',
      );
      return;
    }
    if (!selectedGenerationCost.available) {
      notify(
        lang === 'vi'
          ? 'Cấu hình Nano Banana 2 hiện không khả dụng cho tool này.'
          : 'This Nano Banana 2 configuration is not available for the selected tool.',
        'error',
      );
      return;
    }
    let user;
    try {
      user = await getUserProfile({ force: true });
    } catch (error) {
      console.warn('[EditingTool] Failed to verify current balance', error);
      notify(
        lang === 'vi'
          ? 'Không thể xác minh số dư Vcoin lúc này. Vui lòng thử lại.'
          : 'Unable to verify your Vcoin balance. Please try again.',
        'error',
      );
      return;
    }
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

    const vertexModelId = NANO_BANANA_MODEL_ID_BY_TIER[activeTier];
    const displayPrompt = buildDisplayPrompt(feature.id, prompt, resolution, lang);
    const engineLabel = `Nano Banana 2 ${resolution}`;

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
    <div className="w-full pb-12 animate-fade-in relative">
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

      {/* 1. TOP CYBER CAPSULE HEADER */}
      <div className="w-full neu-card p-4 rounded-3xl mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div data-tour-id="desktop.edit.tabs" className="neu-inset-sm p-1.5 rounded-2xl flex gap-1.5 overflow-x-auto no-scrollbar max-w-full">
              {EDITING_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onNavigateToFeature?.(tab.id)}
                  className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                    feature.id === tab.id
                      ? 'neu-raised-sm text-[#9D00FF] font-accent'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <tab.icon className="w-4 h-4 text-[#9D00FF]" />
                  {tab.label[lang]}
                </button>
              ))}
          </div>

          <div className="flex items-center gap-2">
              <button
                onClick={() => setGuideTopic('guide')}
                className="neu-button px-4 py-2 rounded-2xl text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-2 hover:scale-105 transition-all shadow-md"
              >
                <Icons.Info className="w-4 h-4 text-amber-500" />
                <span>Hướng dẫn</span>
              </button>
          </div>
      </div>

      <div className="w-full mb-6 neu-inset-sm rounded-2xl px-4 py-3 flex items-center gap-3" aria-live="polite">
        <TipIcon className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{SMART_TIPS[currentTipIdx].text}</p>
      </div>

      {/* 2. CREATION WORKSPACE GRID - SEPARATE FUNCTIONAL CARDS */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* BLOCK 1: UPLOAD SOURCE IMAGE (lg:col-span-7 xl:col-span-8) */}
        <div data-tour-id="desktop.edit.upload" className="lg:col-span-7 xl:col-span-8 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                    <Icons.Image className="w-4 h-4 text-[#9D00FF]" /> 1. UPLOAD ẢNH CẦN XỬ LÝ
                </h3>
            </div>

            <div className="neu-inset-sm p-4 rounded-2xl space-y-3">
                <div onClick={() => fileInputRef.current?.click()} className="w-full h-64 neu-card rounded-2xl border-2 border-dashed border-[#9D00FF]/40 hover:border-[#9D00FF] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center transition-all group/item">
                    {uploadedImage ? (
                        <>
                            <img src={uploadedImage} className="w-full h-full object-contain" alt="Source" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <span className="text-[10px] font-bold text-white neu-button px-3 py-1.5 rounded-xl">Đổi Ảnh</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center text-slate-400 group-hover/item:text-[#9D00FF] transition-colors p-2 text-center">
                            <Icons.Upload className="w-10 h-10 mb-2 text-[#9D00FF]" />
                            <span className="text-xs uppercase font-bold tracking-wider">Tải Ảnh Nguồn Lên</span>
                        </div>
                    )}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
            </div>
        </div>

        {/* BLOCK 2: PROMPT OR TOOL DESCRIPTION (lg:col-span-5 xl:col-span-4) */}
        <div data-tour-id="desktop.edit.prompt" className="lg:col-span-5 xl:col-span-4 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20 flex flex-col justify-between">
            {isMagicEditor ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                        <Icons.MessageCircle className="w-4 h-4 text-[#FF007F]" /> 2. YÊU CẦU CHỈNH SỬA PROMPT
                    </h3>
                </div>

                <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={lang === 'vi' ? 'Mô tả chi tiết yêu cầu chỉnh sửa (trang phục, bối cảnh, tóc, phụ kiện...)' : 'Describe the edit request...'}
                    rows={6}
                    className="w-full neu-input rounded-2xl p-4 text-xs leading-relaxed focus:outline-none resize-y placeholder:text-slate-400 font-sans"
                />

                <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Gợi ý nhanh:</span>
                    <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto custom-scrollbar">
                      {SUGGESTIONS.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => setPrompt(suggestion.label[lang])}
                          className="neu-button rounded-xl px-2.5 py-1 text-[10px] text-slate-300 flex items-center gap-1"
                        >
                          <suggestion.icon className="w-3 h-3 text-[#9D00FF]" />
                          {suggestion.label[lang]}
                        </button>
                      ))}
                    </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                        <Icons.Info className="w-4 h-4 text-[#00F2FE]" /> 2. CHỨC NĂNG XỬ LÝ
                    </h3>
                </div>
                <div className="neu-inset-sm p-4 rounded-2xl space-y-2 text-xs text-slate-300 leading-relaxed">
                    {isRemover ? 'Chế độ tách nền AI tự động nhận diện nhân vật Audition và đưa về nền đen sạch 100%.' : 'Chế độ làm nét 4K khôi phục khuôn mặt và chi tiết trang phục siêu nét.'}
                </div>
              </div>
            )}

            <div className="neu-inset-sm p-3 rounded-2xl text-[10px] text-slate-400 leading-relaxed">
                💡 Tiến trình chỉnh sửa sẽ chạy ẩn. Bạn có thể xem lại tác phẩm trong Lịch Sử Chỉnh Sửa.
            </div>
        </div>

        {/* BLOCK 3: CONFIGURATION (lg:col-span-7 xl:col-span-8) */}
        <div data-tour-id="desktop.edit.settings" className="lg:col-span-7 xl:col-span-8 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                    <Icons.Settings className="w-4 h-4 text-[#00F2FE]" /> 3. CẤU HÌNH & ĐỘ PHÂN GIẢI
                </h3>
            </div>

            {!isCatalogReady && (
              <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Đang đồng bộ bảng giá Nano Banana 2. Nút xử lý sẽ được mở khi dữ liệu sẵn sàng.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Độ phân giải đầu ra</label>
                    <div className="grid grid-cols-3 gap-2">
                        {(['1K', '2K', '4K'] as Resolution[]).map((value) => {
                          const disabled = !availableResolutions.includes(value);
                          return (
                            <button
                              key={value}
                              onClick={() => !disabled && setResolution(value)}
                              disabled={disabled}
                              className={`p-3 rounded-2xl text-center font-bold text-xs transition-all ${
                                resolution === value
                                  ? 'neu-raised-sm text-[#9D00FF] font-accent'
                                  : 'neu-button text-slate-400'
                              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              {value}
                            </button>
                          );
                        })}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engine AI</label>
                    {isMagicEditor ? (
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'flash' as GenerationTier, label: 'Flash', icon: Icons.Zap },
                          { id: 'pro' as GenerationTier, label: 'Pro', icon: Icons.Crown },
                        ]).map((model) => {
                          const available = model.id === 'flash' ? isFlashAvailable : isProAvailable;
                          const Icon = model.icon;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              disabled={!available}
                              onClick={() => available && setAiModel(model.id)}
                              className={`p-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-black transition-all ${
                                aiModel === model.id ? 'neu-raised-sm text-[#9D00FF] ring-2 ring-[#9D00FF]/50' : 'neu-button text-slate-600 dark:text-slate-300'
                              } ${!available ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <Icon className="w-4 h-4" />
                              {model.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="neu-inset-sm p-3 rounded-2xl flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">Nano Banana 2 Edition:</span>
                          <span className="text-xs font-black text-[#00F2FE] font-mono">{activeTier.toUpperCase()}</span>
                      </div>
                    )}
                </div>
            </div>
        </div>

        {/* BLOCK 4: COST & LAUNCH (lg:col-span-5 xl:col-span-4) */}
        <div data-tour-id="desktop.edit.price" className="lg:col-span-5 xl:col-span-4 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20 flex flex-col justify-between">
            <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                        <Icons.Zap className="w-4 h-4 text-amber-500" /> 4. XÁC NHẬN & XỬ LÝ
                    </h3>
                </div>

                <div className="neu-inset-sm p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase">Chi Phí VCOIN:</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-amber-500 font-accent">
                          {selectedGenerationCost.available ? selectedGenerationCost.vcoin : '--'}
                        </span>
                        <span className="text-xs font-bold text-amber-500">VCOIN</span>
                    </div>
                </div>
            </div>

            <button
              data-tour-id="desktop.edit.generate"
              onClick={handleExecute}
              disabled={isSubmitting || !uploadedImage || !isCatalogReady || !selectedGenerationCost.available}
              className={`w-full py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-2xl ${
                (isSubmitting || !uploadedImage || !isCatalogReady || !selectedGenerationCost.available)
                  ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-70 neu-inset-sm'
                  : 'neu-button-primary'
              }`}
            >
              {isSubmitting ? <Icons.Loader className="animate-spin w-5 h-5" /> : <Icons.Wand className="w-5 h-5" />}
              {isSubmitting ? 'ĐANG GỬI JOB...' : '🚀 THỰC HIỆN NGAY'}
            </button>
        </div>

      </div>
    </div>
  );
};



