import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bot, ChevronDown, ChevronUp, Crown, Database, Image as ImageIcon, Info, Loader, MessageSquare, Plus, RefreshCw, Sparkles, Upload, Wand2, X, Zap } from 'lucide-react';
import { useNotification } from '../../components/NotificationSystem';
import { getModelPricing, getTstServerAvailabilityConfig, getUserProfile } from '../../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../../services/concurrencyService';
import { enqueueServerJob } from '../../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../../services/storageService';
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
} from '../../services/tstCatalog';
import { optimizePayload } from '../../utils/imageProcessor';
import type { Feature, GeneratedImage, Language, ViewId } from '../../types';
import type { ModelPricing } from '../../services/economyService';

interface PromptImageToolProps {
  feature: Feature;
  lang: Language;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

type PromptImageSlot = string | null;

const MAX_REFERENCE_IMAGES = 4;
const ASPECT_RATIOS = ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2'];
const MODEL_TABS: Array<{
  tier: TstGenerationTier;
  label: string;
  tag: string;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
}> = [
  {
    tier: 'gpt',
    label: 'GPT',
    tag: 'BEST',
    title: 'GPT Image 2',
    description: 'ChatGPT mới nhất, hiểu prompt tốt hơn, chi tiết chính xác và độ hoàn thiện cao nhất.',
    icon: Bot,
    accent: 'from-fuchsia-500 via-violet-500 to-cyan-400',
  },
  {
    tier: 'flash',
    label: 'Flash',
    tag: 'GIÁ RẺ',
    title: 'Nano Banana 2',
    description: 'Gemini Flash, tốc độ nhanh và tiết kiệm, phù hợp ảnh cơ bản/chất lượng trung bình.',
    icon: Zap,
    accent: 'from-cyan-400 via-sky-500 to-blue-500',
  },
  {
    tier: 'pro',
    label: 'Pro',
    tag: 'HOT',
    title: 'Nano Banana Pro',
    description: 'Gemini Pro thông minh hơn Flash, ảnh chi tiết hơn, hỗ trợ hoàn thiện cao và 4K.',
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

const stageReferenceImage = async (source: string, index: number) => {
  const optimized = await optimizePayload(source, 2048);
  return uploadFileToR2(optimized, `inputs/prompt-image/ref-${index + 1}`);
};

const getModelLabel = (tier: TstGenerationTier) => {
  if (tier === 'flash') return 'Flash';
  if (tier === 'pro') return 'Pro';
  return 'GPT';
};

const speedLabelToTst = (label: string) => uiSpeedToTst(label) || 'fast';
const speedIdToLabel = (speedId: string) => (speedId === 'slow' ? 'Tiết Kiệm' : 'Nhanh');

export const PromptImageTool: React.FC<PromptImageToolProps> = ({ feature, onNavigateView }) => {
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referenceImages, setReferenceImages] = useState<PromptImageSlot[]>([null]);
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
  const { queueStats, triggerPoll } = useConcurrency();
  const [isConcurrencyExpanded, setIsConcurrencyExpanded] = useState(false);

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
  const resolutionCostMap = useMemo(
    () =>
      Object.fromEntries(
        (['1K', '2K', '4K'] as TstResolution[]).map((item) => [
          item,
          getGenerationCostBreakdown({
            tier: aiModel,
            resolution: item,
            quality: aiModel === 'gpt' ? gptQuality : undefined,
            speed: generationSpeedId,
            serverId: generationServerId,
            pricingEntries,
            pricingOverrides: pricingOverrideRows,
          }).vcoin * modeCountForPrice,
        ]),
      ) as Record<TstResolution, number>,
    [aiModel, generationServerId, generationSpeedId, gptQuality, modeCountForPrice, pricingEntries, pricingOverrideRows],
  );
  const availableSpeedLabels = availableSpeeds.map((speedId) => speedIdToLabel(speedId));
  const availableServerLabels = availableServers.map((serverId) => tstServerToUi(serverId));

  const handlePickImage = (index: number) => {
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

  const handleSubmit = async () => {
    const userPrompt = prompt.trim();
    if (!userPrompt) {
      notify('Vui lòng nhập prompt tạo ảnh.', 'error');
      return;
    }
    if (queueStats.myImageProcessing >= CONCURRENCY_LIMITS.user.imageProcessing) {
      notify('Bạn đang có quá nhiều job ảnh đang chạy. Vui lòng chờ job hiện tại hoàn tất.', 'error');
      return;
    }
    if (!selectedCost.available || totalCost <= 0) {
      notify('Cấu hình giá cho model này chưa khả dụng. Vui lòng kiểm tra bảng giá admin/TST.', 'error');
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
      const queuePayload: Record<string, unknown> = {
        model: getGenerationModelId(aiModel),
        prompt: userPrompt,
        resolution: resolution.toLowerCase(),
        aspect_ratio: aspectRatio,
        speed: generationSpeedId,
        server_id: generationServerId,
      };
      if (stagedImages.length > 0) queuePayload.img_url = stagedImages;
      if (aiModel === 'gpt') queuePayload.quality = gptQuality;

      const queuedImage: GeneratedImage = {
        id: queuedJobId,
        url: uploadedImages[0] || '',
        prompt: userPrompt,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        toolId: feature.id,
        toolName: feature.name.en,
        engine: `${modelLabel} Prompt Image ${resolution}`,
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
        toolId: feature.id,
        toolName: feature.name.en,
        engine: queuedImage.engine,
        assetType: 'image',
        costVcoin: totalCost,
        queueKind: 'image_generate',
        clientPlatform: 'desktop',
        queuePayload,
      });

      window.dispatchEvent(new Event('balance_updated'));
      notify('Đã đưa job tạo ảnh AI vào hàng đợi.', 'success');
      onNavigateView?.('gallery');
    } catch (error: any) {
      console.error('[PromptImageTool] Submit failed:', error);
      notify(error?.message || 'Không thể gửi job tạo ảnh AI.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full pb-24">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-4">
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-bold uppercase text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-audi-pink" />
                1. Upload ảnh tham chiếu
              </h3>
              <span className="text-xs font-bold text-slate-400">{uploadedCount}/{MAX_REFERENCE_IMAGES} ảnh đã tải</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {referenceImages.map((image, index) => (
                <div key={index} className="relative rounded-2xl border border-white/10 bg-[#11121a] p-2.5 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold text-white">Ảnh {index + 1}</span>
                    {referenceImages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeImageSlot(index)}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePickImage(index)}
                    className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-slate-600 hover:border-audi-pink bg-black/40 overflow-hidden flex flex-col items-center justify-center text-slate-400 transition-colors"
                  >
                    {image ? (
                      <img src={image} alt={`Ảnh ${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <ImageIcon className="w-8 h-8 mb-2" />
                        <span className="text-xs font-bold">Upload ảnh {index + 1}</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
              {referenceImages.length < MAX_REFERENCE_IMAGES && (
                <button
                  type="button"
                  onClick={addImageSlot}
                  className="min-h-[220px] rounded-2xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 flex flex-col items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-7 h-7" />
                  <span className="text-xs font-bold">Thêm ảnh</span>
                </button>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#11121a] p-4 shadow-lg">
            <h3 className="text-sm font-bold uppercase text-white mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-300" />
              2. Mô tả
            </h3>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={9999}
              placeholder="Nhập prompt tạo ảnh. Hệ thống chỉ gửi prompt này và ảnh tham chiếu lên TST, không chèn prompt hệ thống Audition."
              rows={12}
              className="block w-full min-h-[340px] max-h-[760px] rounded-xl border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white outline-none focus:border-audi-pink resize-y overflow-auto placeholder:text-slate-500"
            />
            <div className="mt-2 text-right text-xs text-slate-500">{prompt.length}/9999</div>
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-white/10 bg-[#12121a] p-5 sticky top-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-slate-400" />
              3. Cấu Hình
            </h3>
            <Info className="w-4 h-4 text-audi-yellow" />
          </div>

          <div className="space-y-5 mt-5">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mô hình AI</label>
              <div className="grid gap-2">
                {MODEL_TABS.map(({ tier, label, tag, title, description, icon: Icon, accent }) => {
                  const selected = aiModel === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setAiModel(tier)}
                      className={`relative overflow-hidden rounded-2xl border p-3 text-left transition-all ${
                        selected
                          ? 'border-cyan-300/70 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                          : 'border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accent}`} />
                      <div className="flex items-start gap-3">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">{label}</span>
                            <span className={`rounded-full bg-gradient-to-r ${accent} px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white`}>
                              {tag}
                            </span>
                            {selected && <span className="ml-auto text-xs font-black text-cyan-300">✓</span>}
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-slate-200">{title}</div>
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Tỷ lệ khung hình</label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex-1 py-3 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center ${
                      aspectRatio === ratio ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${availableResolutions.length === 0 ? 'hidden ' : ''}space-y-3 animate-fade-in`}>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Độ phân giải</label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {availableResolutions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setResolution(value)}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                      resolution === value ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {aiModel === 'gpt' && (
              <div className="space-y-3 animate-fade-in">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Chất lượng ảnh GPT</label>
                <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                  {(['low', 'medium', 'high'] as const).map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      onClick={() => setGptQuality(quality)}
                      className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        gptQuality === quality ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {quality}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`${availableSpeedLabels.length === 0 ? 'hidden ' : ''}space-y-3 animate-fade-in`}>
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Tốc độ xử lý
              </label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {availableSpeedLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSpeed(label)}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                      speed === label ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${availableServerLabels.length === 0 ? 'hidden ' : ''}space-y-3 animate-fade-in`}>
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <Database className="w-3 h-3" />
                Server
              </label>
              <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                {availableServerLabels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setServer(label)}
                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                      server === label ? 'bg-audi-cyan text-black shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <div
                className="cursor-pointer hover:bg-white/5 p-3 rounded-xl transition-colors border border-white/5 bg-[#0a0a0f]"
                onClick={() => setIsConcurrencyExpanded(!isConcurrencyExpanded)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                    <Activity className="w-3 h-3 text-audi-cyan" />
                    Luồng xử lý
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={(event) => { event.stopPropagation(); triggerPoll(); }} className="text-slate-500 hover:text-white transition-colors">
                      <RefreshCw className="w-3 h-3" />
                    </button>
                    {isConcurrencyExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>

                {!isConcurrencyExpanded && (
                  <div className="space-y-3 text-[10px] text-slate-400 mt-2">
                    <div>
                      <div className="font-bold text-audi-cyan mb-1">Luồng Của Bạn</div>
                      <div className="flex gap-1.5">
                        <span>Ảnh <span className="text-white font-mono">{queueStats.myImageProcessing}/{CONCURRENCY_LIMITS.user.imageProcessing}</span></span>
                        <span>- Video <span className="text-white font-mono">{queueStats.myVideoProcessing}/{CONCURRENCY_LIMITS.user.videoProcessing}</span></span>
                        <span>- Hàng Chờ <span className="text-white font-mono">{queueStats.myQueued}/{CONCURRENCY_LIMITS.user.queued}</span></span>
                      </div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-300 mb-1">Luồng Hệ Thống</div>
                      <div className="flex gap-1.5">
                        <span>Ảnh <span className="text-white font-mono">{queueStats.systemImageProcessing}/{CONCURRENCY_LIMITS.system.imageProcessing}</span></span>
                        <span>- Video <span className="text-white font-mono">{queueStats.systemVideoProcessing}/{CONCURRENCY_LIMITS.system.videoProcessing}</span></span>
                        <span>- Hàng Chờ <span className="text-white font-mono">{queueStats.systemQueued}/{CONCURRENCY_LIMITS.system.queued}</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-audi-purple/20 to-audi-pink/20 border border-white/10 p-3 mt-4">
              <div className="flex justify-between items-center relative z-10">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Giá hiện tại</span>
                <div className="flex items-end gap-1">
                  <span className="text-xl font-black text-white font-game drop-shadow-md">{totalCost}</span>
                  <span className="text-[10px] font-bold text-audi-yellow mb-1">VCOIN</span>
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-white/5 pt-2">
                <span className={resolution === '1K' ? 'text-white font-bold' : ''}>1K: {resolutionCostMap['1K']}VC</span>
                <span className={resolution === '2K' ? 'text-white font-bold' : ''}>2K: {resolutionCostMap['2K']}VC</span>
                <span className={resolution === '4K' ? 'text-white font-bold' : ''}>4K: {resolutionCostMap['4K']}VC</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full py-3.5 mt-auto rounded-xl font-bold text-white shadow-[0_0_20px_rgba(255,0,153,0.4)] transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-audi-pink to-audi-purple hover:scale-[1.02] disabled:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none disabled:hover:scale-100"
            >
              {isSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
              {isSubmitting ? 'ĐANG GỬI JOB...' : 'TẠO ẢNH NGAY'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
