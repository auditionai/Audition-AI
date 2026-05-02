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
import type { GeneratedImage } from '../types';
import type { ModelPricing } from '../services/economyService';
import type { PromptImageGenerateRecipePayload } from '../../../shared/queueRecipes';

const MAX_REFERENCE_IMAGES = 4;
const ASPECT_RATIOS = ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2'];
const MODEL_TABS: Array<{ tier: TstGenerationTier; label: string; icon: typeof Zap }> = [
  { tier: 'flash', label: 'Flash', icon: Zap },
  { tier: 'pro', label: 'Pro', icon: Crown },
  { tier: 'gpt', label: 'GPT', icon: Bot },
];

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cannot read file'));
    reader.readAsDataURL(file);
  });

const stageReferenceImage = async (source: string, index: number) => {
  const optimized = await optimizePayload(source, 2048);
  return uploadFileToR2(optimized, `inputs/prompt-image/mobile-ref-${index + 1}`);
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
  const modeCountForPrice = Math.max(1, Math.min(MAX_REFERENCE_IMAGES, uploadedCount));
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
      return safeSlots.length >= MAX_REFERENCE_IMAGES ? safeSlots : [...safeSlots, null];
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
    const userPrompt = prompt.trim();
    if (!userPrompt) {
      notify('Vui lòng nhập prompt tạo ảnh.', 'error');
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

      const stagedImages = await Promise.all(uploadedImages.map((value, index) => stageReferenceImage(value, index)));
      const queuedJobId = crypto.randomUUID();
      const modelLabel = getModelLabel(aiModel);
      const engine = `${modelLabel} Prompt Image ${resolution}`;
      const queuePayload: PromptImageGenerateRecipePayload = {
        recipeType: 'prompt_image_generate_recipe_v1',
        modelId: getGenerationModelId(aiModel),
        prompt: userPrompt,
        referenceImages: stagedImages,
        resolution,
        aspectRatio,
        quality: aiModel === 'gpt' ? gptQuality : undefined,
        speed: generationSpeedId,
        serverId: generationServerId,
      };
      const queuedImage: GeneratedImage = {
        id: queuedJobId,
        url: uploadedImages[0] || '',
        prompt: userPrompt,
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
        prompt: userPrompt,
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090B] pb-28 px-5 pt-4 space-y-5">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />

      <header className="space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-500">Tools</p>
        <h1 className="text-3xl font-black text-gray-950 dark:text-white">Tạo Ảnh AI</h1>
      </header>

      <section className="rounded-[28px] border border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-950 dark:text-white">1. Upload ảnh</h2>
          <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">{uploadedCount}/{MAX_REFERENCE_IMAGES}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
                {image ? <img src={image} className="w-full h-full object-cover" alt={`Ảnh ${index + 1}`} /> : <ImagePlus className="w-8 h-8" />}
              </button>
            </div>
          ))}
          {referenceImages.length < MAX_REFERENCE_IMAGES && (
            <button
              type="button"
              onClick={addImageSlot}
              className="min-h-[190px] rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 flex flex-col items-center justify-center gap-2"
            >
              <Plus className="w-7 h-7" />
              <span className="text-xs font-bold">Thêm ảnh</span>
            </button>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 shadow-sm">
        <h2 className="text-sm font-black text-gray-950 dark:text-white mb-3">2. Mô tả</h2>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={9999}
          placeholder="Nhập prompt tạo ảnh..."
          className="w-full min-h-[150px] rounded-2xl bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-zinc-800 p-4 text-sm text-gray-950 dark:text-white outline-none resize-none placeholder:text-gray-400 dark:placeholder:text-zinc-500"
        />
        <div className="text-right text-[11px] text-gray-400 dark:text-zinc-500 mt-1">{prompt.length}/9999</div>
      </section>

      <section className="rounded-[28px] border border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] p-4 space-y-4 shadow-sm">
        <h2 className="text-sm font-black text-gray-950 dark:text-white">3. Cấu hình</h2>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 dark:bg-black/40 p-1">
          {MODEL_TABS.map(({ tier, label, icon: Icon }) => (
            <button
              key={tier}
              type="button"
              onClick={() => setAiModel(tier)}
              className={`py-3 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 ${
                aiModel === tier ? 'bg-fuchsia-600 text-white' : 'text-gray-500 dark:text-zinc-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setAspectRatio(ratio)}
              className={`py-2 rounded-xl text-[11px] font-bold ${
                aspectRatio === ratio ? 'bg-fuchsia-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-black/40 dark:text-zinc-500'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {availableResolutions.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setResolution(value)}
              className={`py-3 rounded-xl text-xs font-black ${
                resolution === value ? 'bg-fuchsia-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-black/40 dark:text-zinc-500'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        {aiModel === 'gpt' && (
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as const).map((quality) => (
              <button
                key={quality}
                type="button"
                onClick={() => setGptQuality(quality)}
                className={`py-3 rounded-xl text-xs font-black uppercase ${
                  gptQuality === quality ? 'bg-fuchsia-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-black/40 dark:text-zinc-500'
                }`}
              >
                {quality}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <select
            value={speed}
            onChange={(event) => setSpeed(event.target.value)}
            className="rounded-2xl bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-zinc-800 p-3 text-sm text-gray-950 dark:text-white"
          >
            {availableSpeeds.map((value) => (
              <option key={value}>{speedIdToLabel(value)}</option>
            ))}
          </select>
          <select
            value={server}
            onChange={(event) => setServer(event.target.value)}
            className="rounded-2xl bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-zinc-800 p-3 text-sm text-gray-950 dark:text-white"
          >
            {availableServers.map((value) => <option key={value}>{tstServerToUi(value)}</option>)}
          </select>
        </div>
        <div className="rounded-2xl bg-gray-50 dark:bg-black/30 p-3 text-xs text-gray-500 dark:text-zinc-400">
          Giá: {selectedCost.available ? `${selectedCost.vcoin} x ${modeCountForPrice} = ${totalCost} Vcoin` : 'chưa có giá'}
        </div>
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting}
        className="fixed left-5 right-5 bottom-24 z-20 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 py-4 text-white font-black shadow-2xl flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
        {isSubmitting ? 'Đang gửi job...' : <span className="flex items-center gap-1">Tạo ảnh {selectedCost.available ? totalCost : '?'} <Coins className="w-4 h-4" /></span>}
      </button>
    </div>
  );
}
