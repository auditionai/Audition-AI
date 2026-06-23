import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Coins, Crown, ImagePlus, Loader, Plus, Sparkles, X, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../components/NotificationSystem';
import { getModelPricing, getTstServerAvailabilityConfig, getUserProfile } from '../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../services/concurrencyService';
import { enqueueServerJob } from '../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../services/storageService';
import {
  fetchTstPricing,
  fetchTstModels,
  getCompatibleGenerationResolutions,
  getCompatibleGenerationServers,
  getCompatibleGenerationSpeeds,
  getGenerationCostBreakdown,
  getGenerationModelId,
  resolveGenerationSelection,
  tstServerToUi,
  uiServerToTst,
  uiSpeedToTst,
  applyServerAvailabilityToRuntimeModels,
  sanitizePricingEntriesWithRuntimeModels,
  type TstGenerationTier,
  type TstPricingEntry,
  type TstResolution,
  type AuditionPricingOverride,
} from '../services/tstCatalog';
import { optimizePayload } from '../../../utils/imageProcessor';
import { buildAuditionKoreaMmoStylePrompt, DEFAULT_IMAGE_NEGATIVE_PROMPT } from '../../../shared/imagePromptDefaults';
import type { GeneratedImage } from '../types';
import type { ModelPricing } from '../services/economyService';
import type { PromptImageGenerateRecipePayload } from '../../../shared/queueRecipes';

const DEFAULT_REFERENCE_IMAGE_LIMIT = 4;
const GPT_REFERENCE_IMAGE_LIMIT = 5;
const MAX_PROMPT_CHARACTERS = 10_000;
const ASPECT_RATIOS = ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2'];
const MODEL_TABS: Array<{
  tier: TstGenerationTier;
  label: string;
  tag: string;
  title: string;
  description: string;
  icon: typeof Zap;
  accent: string;
}> = [
  {
    tier: 'gpt',
    label: 'GPT',
    tag: 'BEST',
    title: 'GPT Image 2',
    description: 'ChatGPT mới nhất, hiểu prompt tốt hơn và hoàn thiện ảnh tốt nhất.',
    icon: Bot,
    accent: 'from-fuchsia-500 via-violet-500 to-cyan-400',
  },
  {
    tier: 'flash',
    label: 'Flash',
    tag: 'GIÁ RẺ',
    title: 'Nano Banana 2',
    description: 'Gemini Flash, nhanh và tiết kiệm, phù hợp ảnh cơ bản.',
    icon: Zap,
    accent: 'from-cyan-400 via-sky-500 to-blue-500',
  },
  {
    tier: 'pro',
    label: 'Pro',
    tag: 'HOT',
    title: 'Nano Banana Pro',
    description: 'Gemini Pro thông minh hơn Flash, chi tiết hơn và hỗ trợ 4K.',
    icon: Crown,
    accent: 'from-amber-300 via-orange-500 to-fuchsia-500',
  },
];

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cannot read file'));
    reader.readAsDataURL(file);
  });

const stageReferenceImage = async (source: string, index: number, preserveOriginal: boolean) => {
  const uploadSource = preserveOriginal ? source : await optimizePayload(source, 2048);
  return uploadFileToR2(uploadSource, `inputs/prompt-image/mobile-ref-${index + 1}`);
};

const getModelLabel = (tier: TstGenerationTier) => {
  if (tier === 'flash') return 'Flash';
  if (tier === 'pro') return 'Pro';
  return 'GPT';
};

const speedLabelToTst = (label: string) => uiSpeedToTst(label) || 'fast';
const speedIdToLabel = (speedId: string) => (speedId === 'slow' ? 'Tiết Kiệm' : 'Nhanh');

export function WorkspacePromptImage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referenceImages, setReferenceImages] = useState<(string | null)[]>([null]);
  const [activeUploadIndex, setActiveUploadIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [aiModel, setAiModel] = useState<TstGenerationTier>('flash');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState<TstResolution>('1K');
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('VIP 1');
  const [gptQuality, setGptQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [pricingOverrides, setPricingOverrides] = useState<ModelPricing[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { queueStats } = useConcurrency();

  const pricingOverrideRows: AuditionPricingOverride[] = useMemo(
    () =>
      pricingOverrides.map((row) => ({
        modelId: row.model_id,
        optionId: row.option_id,
        auditionPriceVcoin: row.audition_price_vcoin,
      })),
    [pricingOverrides],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchTstPricing().catch(() => []),
      fetchTstModels().catch(() => []),
      getModelPricing().catch(() => []),
      getTstServerAvailabilityConfig().catch(() => null),
    ]).then(([tstPricing, runtimeModels, adminPricing, serverAvailabilityConfig]) => {
      if (!alive) return;
      const filteredModels = applyServerAvailabilityToRuntimeModels(runtimeModels, serverAvailabilityConfig);
      setPricingEntries(sanitizePricingEntriesWithRuntimeModels(tstPricing, filteredModels, serverAvailabilityConfig));
      setPricingOverrides(adminPricing);
    }).catch(() => {
      if (!alive) return;
      setPricingEntries([]);
      setPricingOverrides([]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const uploadedImages = referenceImages.filter((value): value is string => Boolean(value));
  const uploadedCount = uploadedImages.length;
  const maxReferenceImages = aiModel === 'gpt' ? GPT_REFERENCE_IMAGE_LIMIT : DEFAULT_REFERENCE_IMAGE_LIMIT;
  const modeCountForPrice = Math.max(1, Math.min(maxReferenceImages, uploadedCount));
  const generationSpeedId = speedLabelToTst(speed);
  const generationServerId = uiServerToTst(server) || 'fast';

  const availableResolutions = useMemo(() => {
    const values = getCompatibleGenerationResolutions({
      tier: aiModel,
      pricingEntries,
      serverId: generationServerId,
      speed: generationSpeedId,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
    });
    return values;
  }, [aiModel, generationServerId, generationSpeedId, gptQuality, pricingEntries]);

  const availableServers = useMemo(() => {
    const values = getCompatibleGenerationServers({
      tier: aiModel,
      pricingEntries,
      speed: generationSpeedId,
      resolution,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
    });
    return values;
  }, [aiModel, generationSpeedId, gptQuality, pricingEntries, resolution]);

  const availableSpeeds = useMemo(() => {
    const values = getCompatibleGenerationSpeeds({
      tier: aiModel,
      pricingEntries,
      serverId: generationServerId,
      resolution,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
    });
    return values;
  }, [aiModel, generationServerId, gptQuality, pricingEntries, resolution]);

  useEffect(() => {
    const nextSelection = resolveGenerationSelection({
      tier: aiModel,
      pricingEntries,
      resolution,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
      speed: generationSpeedId,
      serverId: generationServerId,
    });
    if (!nextSelection.available) {
      return;
    }
    if (nextSelection.resolution !== resolution) {
      setResolution(nextSelection.resolution);
      return;
    }
    const nextServerLabel = tstServerToUi(nextSelection.serverId);
    if (nextServerLabel !== server) {
      setServer(nextServerLabel);
      return;
    }
    const nextSpeedLabel = speedIdToLabel(nextSelection.speed);
    if (nextSpeedLabel !== speed) {
      setSpeed(nextSpeedLabel);
    }
  }, [aiModel, generationServerId, generationSpeedId, gptQuality, pricingEntries, resolution, server, speed]);

  useEffect(() => {
    if (aiModel !== 'gpt') {
      setReferenceImages((prev) => {
        const next = prev.slice(0, DEFAULT_REFERENCE_IMAGE_LIMIT);
        return next.length > 0 ? next : [null];
      });
    }
  }, [aiModel]);

  const selectedCost = getGenerationCostBreakdown({
    tier: aiModel,
    resolution,
    quality: aiModel === 'gpt' ? gptQuality : undefined,
    speed: generationSpeedId,
    serverId: generationServerId,
    pricingEntries,
    pricingOverrides: pricingOverrideRows,
  });
  const totalCost = selectedCost.available ? selectedCost.vcoin * modeCountForPrice : 0;
  const availableSpeedLabels = availableSpeeds.map((value) => speedIdToLabel(value));
  const availableServerLabels = availableServers.map((value) => ({
    id: value,
    label: tstServerToUi(value),
  }));
  const costDisplay = selectedCost.available ? totalCost : '?';
  const isGenerateDisabled = isSubmitting || !prompt.trim() || !selectedCost.available || totalCost <= 0;

  const pickImage = (index: number) => {
    setActiveUploadIndex(index);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Vui lòng chọn file ảnh.', 'error');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setReferenceImages((prev) => prev.map((value, index) => (index === activeUploadIndex ? dataUrl : value)));
    } catch {
      notify('Không đọc được ảnh đã chọn.', 'error');
    }
  };

  const addImageSlot = () => {
    setReferenceImages((prev) => {
      const safeSlots = Array.isArray(prev) && prev.length > 0 ? prev : [null];
      return safeSlots.length >= maxReferenceImages ? safeSlots : [...safeSlots, null];
    });
  };

  const removeImageSlot = (index: number) => {
    setReferenceImages((prev) => {
      const safeSlots = Array.isArray(prev) && prev.length > 0 ? prev : [null];
      const next = safeSlots.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [null];
    });
  };

  const submit = async () => {
    if (!prompt.trim()) {
      notify('Vui lòng nhập prompt tạo ảnh.', 'error');
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARACTERS) {
      notify(`Prompt không được vượt quá ${MAX_PROMPT_CHARACTERS.toLocaleString('vi-VN')} ký tự.`, 'error');
      return;
    }
    if (queueStats.myImageProcessing >= CONCURRENCY_LIMITS.user.imageProcessing) {
      notify('Bạn đang có quá nhiều job ảnh đang chạy.', 'error');
      return;
    }
    if (!selectedCost.available || totalCost <= 0) {
      notify('Cấu hình giá model này chưa khả dụng.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await getUserProfile({ force: true });
      if ((profile.vcoin_balance || 0) < totalCost) {
        notify(`Bạn cần ${totalCost} Vcoin để tạo ảnh.`, 'error');
        return;
      }

      const stagedImages = await Promise.all(
        uploadedImages.slice(0, maxReferenceImages).map((value, index) => stageReferenceImage(value, index, aiModel === 'gpt')),
      );
      const queuedJobId = crypto.randomUUID();
      const modelLabel = getModelLabel(aiModel);
      const engine = `${modelLabel} Prompt Image ${resolution}`;
      const isGptPromptMode = aiModel === 'gpt';
      const queuePayload: PromptImageGenerateRecipePayload = {
        recipeType: 'prompt_image_generate_recipe_v1',
        modelId: getGenerationModelId(aiModel),
        prompt,
        promptMode: isGptPromptMode ? 'user_only' : 'system_assisted',
        systemPromptPrefix: isGptPromptMode ? null : buildAuditionKoreaMmoStylePrompt(null),
        negativePrompt: isGptPromptMode ? null : DEFAULT_IMAGE_NEGATIVE_PROMPT,
        referenceImages: stagedImages,
        resolution,
        aspectRatio,
        speed: generationSpeedId,
        serverId: generationServerId,
        quality: isGptPromptMode ? gptQuality : undefined,
      };
      const queuedImage: GeneratedImage = {
        id: queuedJobId,
        url: uploadedImages[0] || '',
        prompt,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        toolId: 'ai_image_tool',
        toolName: 'AI Image Creator',
        engine,
        status: 'queued',
        displayStatus: 'queued',
        assetType: 'image',
        queueKind: 'image_generate',
        jobId: queuedJobId,
        progress: 0,
        cost: totalCost,
      };

      await saveImageToLocalCache(queuedImage);
      await enqueueServerJob({
        id: queuedJobId,
        prompt,
        toolId: 'ai_image_tool',
        toolName: 'AI Image Creator',
        engine,
        assetType: 'image',
        costVcoin: totalCost,
        queueKind: 'image_generate',
        clientPlatform: 'mobile',
        queuePayload,
      });

      window.dispatchEvent(new Event('balance_updated'));
      notify('Đã đưa job tạo ảnh AI vào hàng đợi.', 'success');
      navigate('/gallery');
    } catch (error: any) {
      console.error('[WorkspacePromptImage] Submit failed:', error);
      notify(error?.message || 'Không thể gửi job tạo ảnh AI.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090B] pb-28 px-4 pt-3 space-y-4">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />

      <header className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-500">Tools</p>
        <h1 className="text-xl font-black text-gray-950 dark:text-white">Tạo Ảnh AI</h1>
      </header>

      <section data-tour-id="mobile.image.references" className="rounded-[24px] border border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-black text-gray-950 dark:text-white">1. Upload ảnh</h2>
          <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">{uploadedCount}/{maxReferenceImages}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {referenceImages.map((image, index) => (
            <div key={index} className="relative rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-black/30 p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black text-gray-900 dark:text-white">Ảnh {index + 1}</span>
                {referenceImages.length > 1 && (
                  <button type="button" onClick={() => removeImageSlot(index)} className="text-gray-400 dark:text-zinc-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => pickImage(index)}
                className="w-full aspect-[3/4] rounded-xl border border-dashed border-gray-300 dark:border-zinc-700 overflow-hidden flex items-center justify-center text-gray-400 dark:text-zinc-500"
              >
                {image ? <img src={image} className="w-full h-full object-cover" alt={`Ảnh ${index + 1}`} /> : <ImagePlus className="w-7 h-7" />}
              </button>
            </div>
          ))}
          {referenceImages.length < maxReferenceImages && (
            <button
              type="button"
              onClick={addImageSlot}
              className="min-h-[150px] rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 flex flex-col items-center justify-center gap-2"
            >
              <Plus className="w-6 h-6" />
              <span className="text-xs font-bold">Thêm ảnh</span>
            </button>
          )}
        </div>
      </section>

      <section data-tour-id="mobile.image.prompt" className="rounded-[24px] border border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-3 shadow-sm">
        <h2 className="text-sm font-black text-gray-950 dark:text-white mb-3">2. Mô tả</h2>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={MAX_PROMPT_CHARACTERS}
          placeholder="Nhập prompt tạo ảnh..."
          rows={12}
          className="block w-full min-h-[320px] max-h-[720px] rounded-2xl bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-zinc-800 p-4 text-sm leading-relaxed text-gray-950 dark:text-white outline-none resize-y overflow-auto placeholder:text-gray-400 dark:placeholder:text-zinc-500"
        />
        <div className="text-right text-[11px] text-gray-400 dark:text-zinc-500 mt-1">{prompt.length}/{MAX_PROMPT_CHARACTERS}</div>
      </section>

      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">KHUNG HÌNH</h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                  aspectRatio === ratio
                    ? 'bg-gray-900 text-white shadow-md dark:bg-white dark:text-gray-950'
                    : 'border border-gray-100 bg-white text-gray-500 dark:border-zinc-800 dark:bg-[#18181B] dark:text-zinc-400'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">MODEL AI</h3>
          <div className="grid gap-2">
            {MODEL_TABS.map(({ tier, label, tag, title, description, icon: Icon, accent }) => {
              const selected = aiModel === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setAiModel(tier)}
                  className={`relative overflow-hidden rounded-[18px] border p-3 text-left transition-all ${
                    selected
                      ? 'border-cyan-300 bg-cyan-50 shadow-sm dark:border-cyan-400/70 dark:bg-cyan-500/10'
                      : 'border-gray-100 bg-white text-gray-500 dark:border-zinc-800 dark:bg-[#18181B] dark:text-zinc-400'
                  }`}
                >
                  <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accent}`} />
                  <div className="flex items-start gap-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${selected ? 'text-gray-950 dark:text-white' : 'text-gray-800 dark:text-zinc-100'}`}>{label}</span>
                        <span className={`rounded-full bg-gradient-to-r ${accent} px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white`}>
                          {tag}
                        </span>
                        {selected && <span className="ml-auto text-xs font-black text-cyan-500">✓</span>}
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-gray-700 dark:text-zinc-200">{title}</div>
                      <p className="mt-1 text-[10px] leading-relaxed text-gray-500 dark:text-zinc-500">{description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {availableResolutions.length > 0 && (
          <div className="space-y-2">
            <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">ĐỘ PHÂN GIẢI</h3>
            <div className="flex gap-2">
              {availableResolutions.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResolution(value)}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                    resolution === value
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200'
                      : 'border border-gray-100 bg-white text-gray-500 dark:border-zinc-800 dark:bg-[#18181B] dark:text-zinc-400'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}

        {aiModel === 'gpt' && (
          <div className="space-y-2">
            <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">CHẤT LƯỢNG ẢNH GPT</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((quality) => (
                <button
                  key={quality}
                  type="button"
                  onClick={() => setGptQuality(quality)}
                  className={`rounded-xl py-2 text-xs font-bold uppercase transition-all ${
                    gptQuality === quality
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200'
                      : 'border border-gray-100 bg-white text-gray-500 dark:border-zinc-800 dark:bg-[#18181B] dark:text-zinc-400'
                  }`}
                >
                  {quality}
                </button>
              ))}
            </div>
          </div>
        )}

        {availableSpeedLabels.length > 0 && (
          <div className="space-y-2">
            <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">TỐC ĐỘ XỬ LÝ</h3>
            <div className="flex gap-2">
              {availableSpeedLabels.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSpeed(value)}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
                    speed === value
                      ? 'border border-orange-200 bg-orange-50 text-orange-700 shadow-sm dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200'
                      : 'border border-gray-100 bg-white text-gray-500 dark:border-zinc-800 dark:bg-[#18181B] dark:text-zinc-400'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        )}

        {availableServerLabels.length > 0 && (
          <div className="space-y-2">
            <h3 className="ml-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">MÁY CHỦ</h3>
            <div className="flex flex-wrap gap-2">
              {availableServerLabels.map((value) => (
                <button
                  key={value.id}
                  type="button"
                  onClick={() => setServer(value.label)}
                  className={`flex-grow rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    server === value.label
                      ? 'border border-red-200 bg-red-50 text-red-700 shadow-sm dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                      : 'border border-gray-100 bg-white text-gray-500 dark:border-zinc-800 dark:bg-[#18181B] dark:text-zinc-400'
                  }`}
                >
                  {value.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-[22px] border border-gray-100 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-[#18181B]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">Luồng xử lý</h3>
            </div>
            <div className="rounded-2xl bg-gray-50 px-2.5 py-2 text-right dark:bg-[#27272A]">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">Chi phí</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-gray-900 dark:text-white">
                {costDisplay}
                <Coins className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-gray-50 p-2.5 dark:bg-[#27272A]">
              <p className="text-gray-400 dark:text-zinc-500">Model</p>
              <p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{getModelLabel(aiModel)}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-2.5 dark:bg-[#27272A]">
              <p className="text-gray-400 dark:text-zinc-500">Queue</p>
              <p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{queueStats.myImageProcessing} đang xử lý • {queueStats.myQueued} chờ</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-2.5 dark:bg-[#27272A]">
              <p className="text-gray-400 dark:text-zinc-500">Server</p>
              <p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{server}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-2.5 dark:bg-[#27272A]">
              <p className="text-gray-400 dark:text-zinc-500">Output</p>
              <p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{resolution} • {aspectRatio}</p>
            </div>
          </div>
        </div>
      </div>

      <button
        data-tour-id="mobile.image.generate"
        type="button"
        onClick={submit}
        disabled={isGenerateDisabled}
        className="fixed left-4 right-4 bottom-24 z-20 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 py-3.5 text-white font-black shadow-2xl flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
        {isSubmitting ? 'Đang gửi job...' : <span className="flex items-center gap-1">Tạo ảnh {selectedCost.available ? totalCost : '?'} <Coins className="w-4 h-4" /></span>}
      </button>
    </div>
  );
}
