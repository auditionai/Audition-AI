import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage, ViewId } from '../../types';
import { Icons } from '../../components/Icons';
import { useNotification } from '../../components/NotificationSystem';
import { getUserProfile, getModelPricing, getTstServerAvailabilityConfig, getGenerationProviderConfig, type ModelPricing, type GenerationProviderConfig } from '../../services/economyService';
import { CONCURRENCY_LIMITS, useConcurrency } from '../../services/concurrencyService';
import { enqueueServerJob } from '../../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../../services/storageService';
import { downloadAssetToBrowser } from '../../services/downloadService';
import { compressDataImageForDirector, generateVideoScriptWithVertex } from '../../services/videoScriptDirectorService';
import { trackEvent } from '../../services/analyticsService';
import type { MotionGenerateRecipePayload, VideoGenerateRecipePayload } from '../../shared/queueRecipes';
import {
  type AuditionPricingOverride,
  fetchTstModels,
  fetchTstPricing,
  applyServerAvailabilityToRuntimeModels,
  getMotionCompatibleResolutions,
  getMotionCompatibleServers,
  getMotionCompatibleSpeeds,
  getMotionCostBreakdown,
  getMotionModelSpecs,
  getVideoCompatibleDurations,
  getVideoCompatibleResolutions,
  getVideoCompatibleServers,
  getVideoCompatibleSpeeds,
  getVideoCostBreakdown,
  getVideoModelSpecs,
  sanitizePricingEntriesWithRuntimeModels,
  tstServerToUi,
  tstSpeedToUi,
  uiServerToTst,
  uiSpeedToTst,
  type TstPricingEntry,
  type TstRuntimeModel
} from '../../services/tstCatalog';
import {
  fetchProviderCatalog,
  getAuditionProviderPricing,
  getGommoPricingInput,
  getMinimumAuditionModelPrice,
  getGommoModelForAudition,
  isGommoCatalogModelAvailable,
  resolveProviderForModel,
  type GommoCatalogModel,
  type GommoProviderCatalog,
} from '../../services/providerCatalog';
import { isModelAllowedForFeature } from '../../shared/providerRouting';
import { VIDEO_GENERATION_TIPS } from '../../shared/videoGenerationTips';
import { getVideoModelPresentation } from '../../shared/videoModelPresentation';

interface VideoToolProps {
  feature: Feature;
  lang: Language;
  onNavigateToFeature?: (featureId: string) => void;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

type VideoMode = 'video_ai' | 'motion_control';
type Stage = 'input' | 'processing' | 'result';

interface AIModelOption {
    id: string;
    name: string;
    price: number;
    badges?: { text: string; type: 'blue' | 'outline' | 'speed' | 'duration' | 'server' }[];
}

type VideoModelFamily = 'grok' | 'seedance' | 'kling' | 'veo' | 'hailuo' | 'wan' | 'other';

const VIDEO_MODEL_FAMILY_ORDER: VideoModelFamily[] = ['grok', 'seedance', 'kling', 'veo', 'hailuo', 'wan', 'other'];

const VIDEO_MODEL_FAMILY_META: Record<VideoModelFamily, {
    label: string;
    tag: string;
    description: string;
    accent: string;
}> = {
    grok: {
        label: 'Grok',
        tag: 'GIÁ RẺ',
        description: 'Chi phí thấp, phù hợp test nhanh. Chất lượng thường ở 480P/720P và có thể không đẹp bằng Seedance/Kling.',
        accent: 'from-emerald-400/20 to-cyan-400/10 border-emerald-400/30 text-emerald-200',
    },
    seedance: {
        label: 'Seedance',
        tag: 'HOT',
        description: 'Chất lượng đẹp gần Kling, giá hợp lý, có thể hỗ trợ 1080P tùy phiên bản và máy chủ.',
        accent: 'from-cyan-400/20 to-blue-500/10 border-audi-cyan/40 text-audi-cyan',
    },
    kling: {
        label: 'Kling',
        tag: 'BEST',
        description: 'Độ hoàn thiện và chuyển động tốt hơn. Một số model Kling tính phí theo giây video.',
        accent: 'from-audi-yellow/20 to-orange-500/10 border-audi-yellow/40 text-audi-yellow',
    },
    veo: { label: 'VEO', tag: 'GOOGLE', description: 'Dòng video Google với nhiều lựa chọn chất lượng và độ phân giải.', accent: 'from-blue-400/20 to-cyan-500/10 border-blue-400/40 text-blue-200' },
    hailuo: { label: 'Hailuo', tag: 'MOTION', description: 'Tối ưu chuyển động tự nhiên và các cảnh quay cinematic.', accent: 'from-violet-400/20 to-fuchsia-500/10 border-violet-400/40 text-violet-200' },
    wan: { label: 'Wan', tag: 'VALUE', description: 'Tạo video nhanh với cấu hình gọn và chi phí linh hoạt.', accent: 'from-emerald-400/20 to-lime-500/10 border-emerald-400/40 text-emerald-200' },
    other: { label: 'Khác', tag: 'NEW', description: 'Các model tạo video mới được đồng bộ trực tiếp từ nhà cung cấp.', accent: 'from-slate-400/20 to-slate-500/10 border-slate-400/40 text-slate-200' },
};

const getVideoModelFamily = (model?: Pick<AIModelOption, 'id' | 'name'> | null): VideoModelFamily => {
    const text = `${model?.id || ''} ${model?.name || ''}`.toLowerCase();
    if (text.includes('grok')) return 'grok';
    if (text.includes('kling')) return 'kling';
    if (text.includes('seedance')) return 'seedance';
    if (text.includes('veo')) return 'veo';
    if (text.includes('hailuo')) return 'hailuo';
    if (text.includes('wan')) return 'wan';
    return 'other';
};

const getModelsByFamily = (models: AIModelOption[], family: VideoModelFamily) =>
    models.filter((model) => getVideoModelFamily(model) === family);

const getFamilyPriceLabel = (models: AIModelOption[]) => {
    if (models.length === 0) return 'Không khả dụng';
    const prices = models.map((model) => model.price).filter((price) => Number.isFinite(price) && price > 0);
    if (prices.length === 0) return 'Đang đồng bộ';
    return `Từ ${Math.min(...prices)} VC`;
};

const getVideoModelHint = (model: AIModelOption) => {
    const text = `${model.id} ${model.name}`.toLowerCase();
    const presentation = getVideoModelPresentation(model);
    if (presentation) return presentation.description;
    if (text.includes('grok')) return 'Tiết kiệm chi phí, hợp test ý tưởng nhanh.';
    if (text.includes('kling')) return 'Ưu tiên chuyển động, độ hoàn thiện và độ mượt.';
    if (text.includes('fast')) return 'Xử lý nhanh hơn, phù hợp thử nhiều biến thể.';
    return 'Cân bằng chất lượng, tốc độ và chi phí.';
};

const getVideoModelTags = (model: AIModelOption) => {
    const text = `${model.id} ${model.name}`.toLowerCase();
    const presentation = getVideoModelPresentation(model);
    if (presentation) return presentation.tags;
    if (text.includes('grok')) return ['#GIÁ_RẺ', '#TEST_NHANH'];
    if (text.includes('kling')) return ['#BEST_MOTION', '#CINEMATIC'];
    if (text.includes('fast')) return ['#TỐC_ĐỘ', '#SEEDANCE'];
    return ['#HOT', '#CHẤT_LƯỢNG'];
};

const getGommoModeDescription = (mode: string) => {
    const value = mode.toLowerCase();
    if (value.includes('relax')) return 'Chậm hơn, ưu tiên tiết kiệm chi phí.';
    if (value.includes('lite')) return 'Nhẹ và tiết kiệm, phù hợp thử nhanh.';
    if (value.includes('quality') || value.includes('professional')) return value.includes('audio')
      ? 'Chất lượng cao, đồng thời tạo âm thanh.'
      : 'Ưu tiên chất lượng, chi tiết và độ ổn định.';
    if (value.includes('fast')) return 'Xử lý nhanh, cân bằng chất lượng và chi phí.';
    if (value.includes('standard')) return 'Cân bằng tốc độ, chất lượng và chi phí.';
    if (value.includes('crazy')) return 'Chuyển động mạnh và sáng tạo hơn.';
    return 'Chế độ xử lý do nhà cung cấp hỗ trợ cho model này.';
};

const getGommoModePriceLabel = (model: GommoCatalogModel | null | undefined, mode: string) => {
    const prices = (model?.prices || [])
      .filter((price) => String(price.mode || '').toLowerCase() === mode.toLowerCase())
      .map((price) => Number(price.price))
      .filter((price) => Number.isFinite(price) && price > 0);
    if (!prices.length) return '';
    const min = Math.min(...prices).toLocaleString('vi-VN');
    const max = Math.max(...prices).toLocaleString('vi-VN');
    return min === max ? min : `${min}–${max}`;
};

const getTstServerDescription = (serverId: string) => {
    const value = serverId.toLowerCase();
    if (value === 'cheap') return 'Tiết kiệm chi phí, thời gian chờ có thể lâu hơn.';
    if (value === 'fast') return 'Xử lý nhanh, phù hợp nhu cầu sử dụng thông thường.';
    if (value === 'standard' || value === 'default') return 'Cân bằng tốc độ, chất lượng và chi phí.';
    if (value.startsWith('vip')) return 'Server ưu tiên, ổn định hơn khi hệ thống đông.';
    return 'Máy chủ được đồng bộ theo thời gian thực.';
};

const getVideoFamilyIcon = (family: VideoModelFamily) => {
    if (family === 'grok') return Icons.Zap;
    if (family === 'seedance') return Icons.Activity;
    if (family === 'kling') return Icons.Crown;
    if (family === 'veo') return Icons.Globe;
    if (family === 'hailuo') return Icons.Sparkles;
    if (family === 'wan') return Icons.Rocket;
    return Icons.Palette;
};

const getVideoFamilyTheme = (family: VideoModelFamily, selected: boolean) => {
    if (!selected) {
        return 'neu-button border border-transparent hover:border-slate-300/60 dark:hover:border-white/10';
    }
    if (family === 'grok') {
        return 'neu-inset-sm border border-emerald-400/60 ring-2 ring-emerald-400/20 bg-gradient-to-br from-emerald-400/15 to-cyan-400/5';
    }
    if (family === 'kling') {
        return 'neu-inset-sm border border-amber-400/60 ring-2 ring-amber-400/20 bg-gradient-to-br from-amber-400/15 to-orange-500/5';
    }
    return 'neu-inset-sm border border-[#FF007F]/60 ring-2 ring-[#FF007F]/20 bg-gradient-to-br from-[#FF007F]/15 to-[#9D00FF]/5';
};

const SMART_TIPS = [
    { icon: Icons.Video, text: "🎥 MỚI: Hỗ trợ tạo video từ ảnh tĩnh với độ mượt mà cao." },
    { icon: Icons.Zap, text: "⚡ Tip: Mô hình Kling cho chuyển động chân thực và tự nhiên nhất." },
    { icon: Icons.Crown, text: "👑 Lưu ý: Video 10s sẽ tốn nhiều thời gian xử lý hơn video 5s." },
    { icon: Icons.Palette, text: "🎨 Mẹo: Mô tả chi tiết hành động (ví dụ: đang đi bộ, mỉm cười) để AI hiểu rõ." },
    { icon: Icons.Image, text: "📸 Mẹo: Ảnh gốc rõ nét sẽ cho ra video chất lượng cao hơn." },
    { icon: Icons.Activity, text: "🏃 Tip: Motion Control giúp bạn điều khiển chuyển động nhân vật theo video mẫu." },
    { icon: Icons.ExternalLink, text: "👗 Mẹo: Truy cập AuMix3D.com để mix đồ và chụp ảnh nhân vật tách nền cực nét làm nguyên liệu cho AI!" }
];

const OptionDropdown = ({ label, value, options, onChange, icon: Icon }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className={`space-y-2 relative ${isOpen ? 'z-50' : 'z-10'}`}>
            <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                {Icon && <Icon className="w-3.5 h-3.5 text-[#00A8C8] dark:text-[#00F2FE]" />}
                {label}
            </label>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full min-h-[42px] flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-xs font-black text-slate-800 dark:text-white transition-all ${
                  isOpen ? 'neu-inset-sm ring-2 ring-[#00F2FE]/30' : 'neu-button hover:-translate-y-0.5'
                }`}
                aria-expanded={isOpen}
            >
                <div className="min-w-0 text-left">
                    <span className="block truncate">{options.find((o: any) => o.value === value)?.label || value}</span>
                    {options.find((o: any) => o.value === value)?.description && (
                      <span className="block mt-0.5 truncate text-[9px] font-semibold text-slate-400">
                        {options.find((o: any) => o.value === value)?.description}
                      </span>
                    )}
                </div>
                <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-2 neu-card border border-slate-200/80 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden p-1.5">
                        {options.map((opt: any) => (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-slate-200/50 dark:hover:bg-white/5 ${
                                  value === opt.value ? 'text-[#FF007F] bg-[#FF007F]/10' : 'text-slate-700 dark:text-slate-300'
                                }`}
                            >
                                <span className="flex items-start justify-between gap-3">
                                  <span className="min-w-0">
                                    <span className="block text-xs font-black">{opt.label}</span>
                                    {opt.description && <span className="block mt-1 text-[9px] font-semibold leading-relaxed opacity-70">{opt.description}</span>}
                                  </span>
                                  {opt.meta && <span className="shrink-0 text-[9px] font-black text-amber-500">{opt.meta}</span>}
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const tryStageInputToR2 = async (source: File | Blob | string, folder: string) => {
    try {
        return await uploadFileToR2(source, folder);
    } catch (error) {
        console.warn('[VideoTool] Failed to stage input to R2.', error);
        throw new Error('Không thể tải tệp tham chiếu lên vùng đệm. Vui lòng thử lại.');
    }
};

export const VideoTool: React.FC<VideoToolProps> = ({ feature, lang, onNavigateToFeature, onNavigateView }) => {
  const { notify } = useNotification();
  const { queueStats } = useConcurrency();
  const [stage, setStage] = useState<Stage>('input');
  const [activeMode, setActiveMode] = useState<VideoMode>(feature.id === 'motion_control_gen' ? 'motion_control' : 'video_ai');
  
  const [currentTipIdx, setCurrentTipIdx] = useState(0);

  useEffect(() => {
      const interval = setInterval(() => {
          setCurrentTipIdx(prev => (prev + 1) % SMART_TIPS.length);
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  // Video AI State
  const [prompt, setPrompt] = useState('');
  const [keyframeImage, setKeyframeImage] = useState<string | null>(null);
  const [videoModel, setVideoModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState('5s');
  const [quality, setQuality] = useState('720P');
  const [sound, setSound] = useState(false);
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('VIP 1');
  const [providerMode, setProviderMode] = useState('');

  // Motion Control State
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [motionVideo, setMotionVideo] = useState<string | null>(null);
  const [motionVideoFile, setMotionVideoFile] = useState<File | null>(null);
  const [motionVideoDurationSeconds, setMotionVideoDurationSeconds] = useState<number | null>(null);
  const [motionPrompt, setMotionPrompt] = useState('');
  const [motionModel, setMotionModel] = useState('');
  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [runtimeModels, setRuntimeModels] = useState<TstRuntimeModel[]>([]);
  const [videoModelOptions, setVideoModelOptions] = useState<AIModelOption[]>([]);
  const [motionModelOptions, setMotionModelOptions] = useState<AIModelOption[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultVideo, setResultVideo] = useState<string | null>(null);
  const [videoModelFamily, setVideoModelFamily] = useState<VideoModelFamily>('grok');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [gommoCatalog, setGommoCatalog] = useState<GommoProviderCatalog | null>(null);
  const [providerConfig, setProviderConfig] = useState<GenerationProviderConfig | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptStyle, setScriptStyle] = useState('Cinematic điện ảnh');
  const [scriptTheme, setScriptTheme] = useState('Tự động theo ảnh');
  const [scriptSoundMood, setScriptSoundMood] = useState('Phù hợp bối cảnh');
  const [scriptVoiceDialogue, setScriptVoiceDialogue] = useState(false);
  const [scriptTrendEdit, setScriptTrendEdit] = useState(false);
  const [scriptTextOverlay, setScriptTextOverlay] = useState(false);
  const [scriptTargetModel, setScriptTargetModel] = useState('');

  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
      modelId: row.model_id,
      optionId: row.option_id,
      auditionPriceVcoin: row.audition_price_vcoin,
  }));

  useEffect(() => {
      const loadCatalog = async (forceRefresh = false) => {
          try {
              const [pricing, models, pricingConfig, serverAvailabilityConfig, providerCatalog, routingConfig] = await Promise.all([
                  fetchTstPricing(forceRefresh).catch(() => []),
                  fetchTstModels(forceRefresh).catch(() => []),
                  getModelPricing({ force: true }),
                  getTstServerAvailabilityConfig().catch(() => null),
                  fetchProviderCatalog(true),
                  getGenerationProviderConfig(),
              ]);
              const filteredModels = applyServerAvailabilityToRuntimeModels(models, serverAvailabilityConfig);
              const livePricing = sanitizePricingEntriesWithRuntimeModels(pricing, filteredModels, serverAvailabilityConfig);
              setPricingEntries(livePricing);
              setRuntimeModels(filteredModels);
              setAuditionPricing(pricingConfig || []);
              setGommoCatalog(providerCatalog);
              setProviderConfig(routingConfig);

              const overrideRows: AuditionPricingOverride[] = (pricingConfig || []).map((row) => ({
                  modelId: row.model_id,
                  optionId: row.option_id,
                  auditionPriceVcoin: row.audition_price_vcoin,
              }));

              const liveVideoModels = getVideoModelSpecs(livePricing, filteredModels)
                .filter((spec) => isModelAllowedForFeature(routingConfig, 'video_generation', spec.modelId))
                .filter((spec) => resolveProviderForModel(routingConfig, spec.modelId, 'video_generation') === 'tst')
                .map((spec) => ({
                  id: spec.modelId,
                  name: spec.displayName,
                  price: getVideoCostBreakdown({
                      modelId: spec.modelId,
                      serverId: spec.servers[0] || 'fast',
                      resolution: spec.resolutions[0] || '720p',
                      duration: spec.durations[0] || '5s',
                      speed: spec.speeds[0] || 'fast',
                      audio: false,
                      pricingEntries: livePricing,
                      pricingOverrides: overrideRows
                  }).vcoin
              }));
              const gommoVideoModels = providerCatalog.models
                .filter((model) => model.kind === 'video' && isModelAllowedForFeature(routingConfig, 'video_generation', model.auditionModelId) && resolveProviderForModel(routingConfig, model.auditionModelId, 'video_generation') === 'gommo' && isGommoCatalogModelAvailable(model))
                .map((model) => ({
                  id: model.auditionModelId,
                  name: model.name,
                  price: getMinimumAuditionModelPrice(pricingConfig || [], model.auditionModelId) || 0,
                }));
              const routedVideoModels = [...liveVideoModels, ...gommoVideoModels];
              const liveMotionModels = getMotionModelSpecs(livePricing, filteredModels)
                .filter((spec) => isModelAllowedForFeature(routingConfig, 'motion_control', spec.modelId))
                .filter((spec) => resolveProviderForModel(routingConfig, spec.modelId, 'motion_control') === 'tst')
                .map((spec) => ({
                  id: spec.modelId,
                  name: spec.displayName,
                  price: getMotionCostBreakdown({
                      modelId: spec.modelId,
                      serverId: spec.servers[0] || 'vip2',
                      resolution: spec.resolutions[0] || '720p',
                      pricingEntries: livePricing,
                      pricingOverrides: overrideRows
                  }).vcoin
              }));
              const gommoMotionModels = providerCatalog.models
                .filter((model) => model.kind === 'motion'
                  && model.fallbackSupported
                  && isModelAllowedForFeature(routingConfig, 'motion_control', model.auditionModelId)
                  && resolveProviderForModel(routingConfig, model.auditionModelId, 'motion_control') === 'gommo'
                  && isGommoCatalogModelAvailable(model))
                .map((model) => ({
                  id: model.auditionModelId,
                  name: model.name,
                  price: getMinimumAuditionModelPrice(pricingConfig || [], model.auditionModelId) || 0,
                }));
              const routedMotionModels = [...liveMotionModels, ...gommoMotionModels];

              if (routedVideoModels.length > 0) {
                  setVideoModelOptions(routedVideoModels);
                  setVideoModel((current) => {
                      const preferredModel = routedVideoModels.find((model) => getVideoModelFamily(model) === 'grok') || routedVideoModels[0];
                      const next = routedVideoModels.some((model) => model.id === current) ? current : preferredModel.id;
                      setVideoModelFamily(getVideoModelFamily(routedVideoModels.find((model) => model.id === next) || preferredModel));
                      return next;
                  });
              }
              if (routedMotionModels.length > 0) {
                  setMotionModelOptions(routedMotionModels);
                  setMotionModel((current) => routedMotionModels.some((model) => model.id === current) ? current : routedMotionModels[0].id);
              }
              setCatalogError(models.length > 0 ? null : (lang === 'vi' ? 'Dịch vụ tạo video đang bảo trì hoặc không sẵn sàng.' : 'The video service is unavailable.'));
          } catch (error) {
              console.warn('Failed to load live TST catalog for video tool', error);
              setPricingEntries([]);
              setRuntimeModels([]);
              setVideoModelOptions([]);
              setMotionModelOptions([]);
              setCatalogError(lang === 'vi' ? 'Dịch vụ tạo video đang bảo trì hoặc không sẵn sàng.' : 'The video service is unavailable.');
          } finally {
              setCatalogLoading(false);
          }
      };
      loadCatalog();
  }, [lang]);

  const [isConcurrencyExpanded, setIsConcurrencyExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const selectedVideoProvider = resolveProviderForModel(providerConfig, videoModel, 'video_generation');
  const isGommoVideoSelected = activeMode === 'video_ai' && selectedVideoProvider === 'gommo';
  const selectedGommoVideoModel = getGommoModelForAudition(gommoCatalog, videoModel);
  const selectedMotionProvider = resolveProviderForModel(providerConfig, motionModel, 'motion_control');
  const isGommoMotionSelected = activeMode === 'motion_control' && selectedMotionProvider === 'gommo';
  const selectedGommoMotionModel = getGommoModelForAudition(gommoCatalog, motionModel);
  const isGommoSelected = isGommoVideoSelected || isGommoMotionSelected;
  const selectedGommoModel = isGommoMotionSelected ? selectedGommoMotionModel : selectedGommoVideoModel;
  const isCatalogReady =
      !catalogLoading &&
      (isGommoSelected
        ? isGommoCatalogModelAvailable(selectedGommoModel)
        : !catalogError && pricingEntries.length > 0 && runtimeModels.length > 0) &&
      (activeMode === 'video_ai' ? videoModelOptions.length > 0 : motionModelOptions.length > 0);
  const hasRequiredInputs = activeMode === 'video_ai'
      ? Boolean(keyframeImage)
      : Boolean(
          characterImage
          && motionVideoFile
          && motionVideoDurationSeconds !== null
          && motionVideoDurationSeconds >= 3
          && motionVideoDurationSeconds <= 30
        );
  const lastAutoSelectedVideoModelRef = useRef<string | null>(null);
  const selectedVideoSpec = getVideoModelSpecs(pricingEntries, runtimeModels).find((spec) => spec.modelId === videoModel);
  const gommoSupportsAudio = Boolean(selectedGommoVideoModel?.modes.some((mode) => mode.type.includes('audio')));
  const effectiveVideoAudio = activeMode === 'video_ai' && (isGommoVideoSelected ? gommoSupportsAudio : Boolean(selectedVideoSpec?.supportsAudio)) && sound;
  const defaultVideoServerId = videoModel.toLowerCase().startsWith('grok') ? 'default' : 'fast';
  const getVideoModelRuntimeMeta = (model: AIModelOption) => {
      const provider = resolveProviderForModel(providerConfig, model.id, 'video_generation');
      if (provider === 'gommo') {
          const catalogModel = getGommoModelForAudition(gommoCatalog, model.id);
          const capabilities = [
              catalogModel?.resolutions.length ? catalogModel.resolutions.map((item) => item.type.toUpperCase()).join('/') : '',
              catalogModel?.durations.length ? `${catalogModel.durations[0].type}–${catalogModel.durations[catalogModel.durations.length - 1]?.type}s` : '',
          ].filter(Boolean).join(' · ');
          return {
              description: catalogModel?.description || getVideoModelHint(model),
              server: `Máy chủ · ${catalogModel?.server || 'Realtime'}`,
              capabilities,
          };
      }
      const spec = getVideoModelSpecs(pricingEntries, runtimeModels).find((entry) => entry.modelId === model.id);
      return {
          description: getVideoModelHint(model),
          server: `Máy chủ · ${(spec?.servers || []).map((item) => item.toUpperCase()).join(' / ') || 'Realtime'}`,
          capabilities: [
              spec?.resolutions?.length ? spec.resolutions.map((item) => item.toUpperCase()).join('/') : '',
              spec?.durations?.length ? spec.durations.join('/') : '',
          ].filter(Boolean).join(' · '),
      };
  };

  useEffect(() => {
      const selected = videoModelOptions.find((model) => model.id === videoModel);
      if (selected) {
          setVideoModelFamily(getVideoModelFamily(selected));
      }
  }, [videoModel, videoModelOptions]);

  const tstCostBreakdown = activeMode === 'motion_control'
      ? getMotionCostBreakdown({
          modelId: motionModel,
          serverId: uiServerToTst(server) || 'vip2',
          resolution: quality.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          durationSeconds: motionVideoDurationSeconds || 1,
          pricingEntries,
          pricingOverrides
        })
      : getVideoCostBreakdown({
          modelId: videoModel,
          serverId: uiServerToTst(server) || defaultVideoServerId,
          resolution: quality.toLowerCase(),
          duration: duration.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: effectiveVideoAudio,
          pricingEntries,
          pricingOverrides
        });
  const gommoVideoPricingInput = getGommoPricingInput(videoModel, {
      resolution: quality,
      duration,
      audio: effectiveVideoAudio,
      providerMode,
  });
  const gommoVideoPricing = getAuditionProviderPricing(auditionPricing, videoModel, gommoVideoPricingInput, { allowGenericFallback: true });
  const gommoMotionPricingInput = getGommoPricingInput(motionModel, { providerMode });
  const gommoMotionPricing = getAuditionProviderPricing(auditionPricing, motionModel, gommoMotionPricingInput, { allowGenericFallback: true });
  const selectedGommoPricing = isGommoMotionSelected ? gommoMotionPricing : gommoVideoPricing;
  const currentCostBreakdown = isGommoSelected
      ? {
          available: selectedGommoPricing !== null && isGommoCatalogModelAvailable(selectedGommoModel),
          vcoin: isGommoMotionSelected
            ? (selectedGommoPricing?.vcoin || 0) * Math.max(1, Math.ceil(motionVideoDurationSeconds || 1))
            : selectedGommoPricing?.vcoin || 0,
          billingUnit: isGommoMotionSelected ? 'second' as const : 'job' as const,
          unitVcoin: isGommoMotionSelected ? selectedGommoPricing?.vcoin || 0 : null,
          billedSeconds: isGommoMotionSelected ? Math.max(1, Math.ceil(motionVideoDurationSeconds || 1)) : null,
        }
      : tstCostBreakdown;

  const calculateCost = () => {
      return currentCostBreakdown.vcoin;
  };
  const perSecondCostLabel = currentCostBreakdown.billingUnit === 'second'
      ? `${currentCostBreakdown.unitVcoin || 0} Vcoin/s × ${currentCostBreakdown.billedSeconds || 0}s = ${currentCostBreakdown.vcoin || 0} Vcoin`
      : '';

  const applyVideoModelConfig = (modelId: string) => {
      if (resolveProviderForModel(providerConfig, modelId, 'video_generation') === 'gommo') {
          const gommoModel = getGommoModelForAudition(gommoCatalog, modelId);
          if (gommoModel?.resolutions[0]) setQuality(gommoModel.resolutions[0].type.toUpperCase());
          if (gommoModel?.durations[0]) setDuration(`${gommoModel.durations[0].type}S`.toUpperCase());
          if (gommoModel?.ratios[0]) setAspectRatio(gommoModel.ratios[0].type);
          if (gommoModel?.modes[0]) setProviderMode(gommoModel.modes[0].type);
          setSound(false);
          return;
      }
      const entries = pricingEntries.filter((entry) => entry.model === modelId);
      const preferredEntry = entries.find((entry) => entry.audio !== true) || entries[0];
      if (!preferredEntry) return;

      const nextServer = tstServerToUi(preferredEntry.server);
      const nextSpeed = tstSpeedToUi(preferredEntry.speed || 'fast');
      if (nextServer) setServer(nextServer);
      if (nextSpeed) setSpeed(nextSpeed);
      if (preferredEntry.resolution) setQuality(preferredEntry.resolution.toUpperCase());
      if (preferredEntry.duration) setDuration(preferredEntry.duration.toUpperCase());
      setSound(Boolean(preferredEntry.audio));
  };

  const selectVideoModel = (modelId: string) => {
      setVideoModel(modelId);
      lastAutoSelectedVideoModelRef.current = null;
      applyVideoModelConfig(modelId);
  };

  const selectVideoFamily = (family: VideoModelFamily) => {
      setVideoModelFamily(family);
      const firstModelInFamily = getModelsByFamily(videoModelOptions, family)[0];
      if (firstModelInFamily && firstModelInFamily.id !== videoModel) {
          selectVideoModel(firstModelInFamily.id);
      }
  };

  const getModelOptions = () => {
      if (activeMode === 'motion_control') {
          if (isGommoMotionSelected) {
              return {
                  showAspectRatio: false,
                  aspectRatios: [] as string[],
                  qualities: (selectedGommoMotionModel?.resolutions || []).map((option) => option.type.toUpperCase()),
                  durations: [] as string[],
                  supportsAudio: false,
              };
          }
          const motionSpec = getMotionModelSpecs(pricingEntries, runtimeModels).find((spec) => spec.modelId === motionModel);
          return {
              showAspectRatio: false,
              aspectRatios: [] as string[],
              qualities: (motionSpec?.resolutions || []).map((value) => value.toUpperCase()),
              durations: [] as string[],
              supportsAudio: false
          };
      }

      if (isGommoVideoSelected) {
          return {
              showAspectRatio: Boolean(selectedGommoVideoModel?.ratios.length),
              aspectRatios: (selectedGommoVideoModel?.ratios || []).map((option) => option.type),
              qualities: (selectedGommoVideoModel?.resolutions || []).map((option) => option.type.toUpperCase()),
              durations: (selectedGommoVideoModel?.durations || []).map((option) => `${option.type}S`.toUpperCase()),
              supportsAudio: gommoSupportsAudio,
          };
      }

      const videoSpec = selectedVideoSpec;
      const compatibleResolutions = getVideoCompatibleResolutions({
          modelId: videoModel,
          pricingEntries,
          serverId: uiServerToTst(server),
          duration: duration.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: effectiveVideoAudio
      });
      const compatibleDurations = getVideoCompatibleDurations({
          modelId: videoModel,
          pricingEntries,
          serverId: uiServerToTst(server),
          resolution: quality.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: effectiveVideoAudio
      });
      return {
          showAspectRatio: (videoSpec?.aspectRatios || []).length > 0,
          aspectRatios: (videoSpec?.aspectRatios || []).map((value) => value.toUpperCase()),
          qualities:
              (compatibleResolutions.length > 0 ? compatibleResolutions : (videoSpec?.resolutions || []))
                  .map((value) => value.toUpperCase()),
          durations:
              (compatibleDurations.length > 0 ? compatibleDurations : (videoSpec?.durations || []))
                  .map((value) => value.toUpperCase()),
          supportsAudio: Boolean(videoSpec?.supportsAudio)
      };
  };

  const pickPreferredVideoServer = () => {
      const compatibleServers = getVideoCompatibleServers({
          modelId: videoModel,
          pricingEntries,
          duration: duration.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: effectiveVideoAudio
      });

      if (compatibleServers.length === 0) return null;

      const preferredServerOrder = ['fast', 'standard', 'default', 'vip1', 'vip2', 'cheap'];
      const rankedServers = [...compatibleServers].sort((a, b) => {
          const resolutionsA = getVideoCompatibleResolutions({
              modelId: videoModel,
              pricingEntries,
              serverId: a,
              duration: duration.toLowerCase(),
              speed: uiSpeedToTst(speed) || 'fast',
              audio: effectiveVideoAudio
          }).length;
          const resolutionsB = getVideoCompatibleResolutions({
              modelId: videoModel,
              pricingEntries,
              serverId: b,
              duration: duration.toLowerCase(),
              speed: uiSpeedToTst(speed) || 'fast',
              audio: effectiveVideoAudio
          }).length;

          if (resolutionsA !== resolutionsB) {
              return resolutionsB - resolutionsA;
          }

          const durationsA = getVideoCompatibleDurations({
              modelId: videoModel,
              pricingEntries,
              serverId: a,
              speed: uiSpeedToTst(speed) || 'fast',
              audio: effectiveVideoAudio
          }).length;
          const durationsB = getVideoCompatibleDurations({
              modelId: videoModel,
              pricingEntries,
              serverId: b,
              speed: uiSpeedToTst(speed) || 'fast',
              audio: effectiveVideoAudio
          }).length;

          if (durationsA !== durationsB) {
              return durationsB - durationsA;
          }

          return preferredServerOrder.indexOf(a) - preferredServerOrder.indexOf(b);
      });

      return rankedServers[0] || compatibleServers[0];
  };

  const modelOptions = getModelOptions();
  const serverOptions = isGommoSelected ? [] : (activeMode === 'video_ai'
      ? getVideoCompatibleServers({
          modelId: videoModel,
          pricingEntries,
          resolution: quality.toLowerCase(),
          duration: duration.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: effectiveVideoAudio
        })
      : getMotionCompatibleServers({
          modelId: motionModel,
          pricingEntries,
          resolution: quality.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast'
        })
  ).map((serverId) => ({ label: tstServerToUi(serverId), value: tstServerToUi(serverId), description: getTstServerDescription(serverId) }));
  const speedOptions = isGommoSelected ? [] : activeMode === 'video_ai'
      ? getVideoCompatibleSpeeds({
          modelId: videoModel,
          pricingEntries,
          serverId: uiServerToTst(server),
          resolution: quality.toLowerCase(),
          duration: duration.toLowerCase(),
          audio: effectiveVideoAudio
        }).map((speedId) => ({ label: tstSpeedToUi(speedId), value: tstSpeedToUi(speedId) }))
      : getMotionCompatibleSpeeds({
          modelId: motionModel,
          pricingEntries,
          resolution: quality.toLowerCase()
        }).map((speedId) => ({ label: tstSpeedToUi(speedId), value: tstSpeedToUi(speedId) }));

  useEffect(() => {
      if (activeMode !== 'video_ai' || !videoModel || isGommoVideoSelected) return;

      const preferredServer = pickPreferredVideoServer();
      if (!preferredServer) return;

      const preferredServerUi = tstServerToUi(preferredServer);
      const serverStillValid = serverOptions.some((option) => option.value === server);
      const shouldAutoSelect =
          lastAutoSelectedVideoModelRef.current !== videoModel || !serverStillValid || !server;

      if (shouldAutoSelect && preferredServerUi && preferredServerUi !== server) {
          setServer(preferredServerUi);
      }
      lastAutoSelectedVideoModelRef.current = videoModel;
  }, [activeMode, isGommoVideoSelected, videoModel, pricingEntries, server, serverOptions]);

  useEffect(() => {
      if (modelOptions.showAspectRatio && modelOptions.aspectRatios?.length > 0 && !modelOptions.aspectRatios.includes(aspectRatio)) {
          setAspectRatio(modelOptions.aspectRatios[0]);
      }
      if (modelOptions.qualities.length > 0 && !modelOptions.qualities.includes(quality)) {
          setQuality(modelOptions.qualities[0]);
      }
      if (activeMode === 'video_ai' && modelOptions.durations.length > 0 && !modelOptions.durations.includes(duration)) {
          setDuration(modelOptions.durations[0]);
      }
      if (serverOptions.length > 0 && !serverOptions.some((option) => option.value === server)) {
          setServer(serverOptions[0].value);
      }
      if (speedOptions.length > 0 && !speedOptions.some((option) => option.value === speed)) {
          setSpeed(speedOptions[0].value);
      }
      if (activeMode === 'video_ai' && !modelOptions.supportsAudio && sound) {
          setSound(false);
      }
      if (isGommoSelected) {
          const modes = (selectedGommoModel?.modes || []).map((option) => option.type);
          if (modes.length > 0 && !modes.includes(providerMode)) setProviderMode(modes[0]);
      }
  }, [activeMode, aspectRatio, duration, isGommoSelected, modelOptions, providerMode, quality, selectedGommoModel, server, serverOptions, sound, speed, speedOptions]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'keyframe' | 'character' | 'motion' | null>(null);

  const getVideoDurationSeconds = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = objectUrl;
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error('Failed to read video metadata'));
      });
      return Number.isFinite(duration) ? duration : null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleVideoDownload = async (url: string, filename: string) => {
      if (!url) return;
      notify(lang === 'vi' ? 'Đang tải video...' : 'Downloading video...', 'info');

      try {
          await downloadAssetToBrowser(url, filename);
          notify(lang === 'vi' ? 'Đã lưu video về máy!' : 'Video downloaded successfully!', 'success');
      } catch (error) {
          console.error('Video download failed', error);
          notify(lang === 'vi' ? 'Tải video thất bại.' : 'Video download failed.', 'error');
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    if (uploadTarget === 'motion') {
        const [url, durationSeconds] = await Promise.all([
          Promise.resolve(URL.createObjectURL(file)),
          getVideoDurationSeconds(file),
        ]);
        setMotionVideo(url);
        setMotionVideoFile(file);
        setMotionVideoDurationSeconds(durationSeconds);
        setUploadTarget(null);
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (uploadTarget === 'keyframe') setKeyframeImage(result);
      if (uploadTarget === 'character') setCharacterImage(result);
      setUploadTarget(null);
    };
    reader.readAsDataURL(file);
  };

  const triggerUpload = (target: 'keyframe' | 'character' | 'motion') => {
    setUploadTarget(target);
    if (fileInputRef.current) {
      fileInputRef.current.accept = target === 'motion' ? 'video/*' : 'image/*';
      fileInputRef.current.click();
    }
  };

  const handleGenerateVideoScript = async () => {
    if (activeMode !== 'video_ai') return;
    if (!keyframeImage) {
      notify('Vui lòng tải ảnh tham chiếu trước khi tạo kịch bản AI.', 'error');
      return;
    }

    setIsGeneratingScript(true);
    trackEvent('video_script_generate_start', {
      client_platform: 'desktop',
      duration_seconds: parseInt(duration, 10) || 5,
      trend_edit: scriptTrendEdit,
      text_overlay: scriptTextOverlay,
      target_model: scriptTargetModel || videoModel,
    });
    try {
      notify('Đang tối ưu và tải ảnh tham chiếu lên R2...', 'info');
      const directorImageSource = await compressDataImageForDirector(keyframeImage);
      const directorImageUrl = await tryStageInputToR2(directorImageSource, 'inputs/video-script-reference');
      const script = await generateVideoScriptWithVertex({
        imageSource: directorImageUrl,
        durationSeconds: parseInt(duration, 10) || 5,
        userPrompt: prompt,
        scriptOptions: {
          style: scriptStyle,
          theme: scriptTheme,
          soundMood: scriptSoundMood,
          voiceDialogue: scriptVoiceDialogue,
          trendEdit: scriptTrendEdit,
          textOverlay: scriptTextOverlay,
          targetModel: scriptTargetModel || videoModel,
        },
      });
      setPrompt(script);
      trackEvent('video_script_generate_success', {
        client_platform: 'desktop',
        duration_seconds: parseInt(duration, 10) || 5,
        trend_edit: scriptTrendEdit,
        text_overlay: scriptTextOverlay,
        target_model: scriptTargetModel || videoModel,
      });
      notify('Đã tạo kịch bản video bằng AI.', 'success');
    } catch (error) {
      console.error('[VideoTool] Video script director failed', error);
      trackEvent('video_script_generate_error', {
        client_platform: 'desktop',
        target_model: scriptTargetModel || videoModel,
        error_message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      });
      notify(error instanceof Error ? error.message : 'Không thể tạo kịch bản video bằng Vertex AI.', 'error');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerate = async () => {
    if (!isCatalogReady) {
      notify(isGommoSelected ? 'Nguồn tạo video đang bảo trì hoặc model không khả dụng.' : 'Dịch vụ tạo video đang bảo trì hoặc không sẵn sàng.', 'error');
      return;
    }

    if (!currentCostBreakdown.available) {
      notify(lang === 'vi' ? 'Cấu hình đang chọn không còn khả dụng trên máy chủ.' : 'The selected configuration is no longer available.', 'error');
      return;
    }

    if (activeMode === 'video_ai' && !keyframeImage) {
      notify(
        lang === 'vi'
          ? 'Vui lòng tải ảnh keyframe trước khi gửi job tạo video.'
          : 'Please upload a keyframe image before sending the video job.',
        'error'
      );
      return;
    }
    if (activeMode === 'motion_control' && (!characterImage || !motionVideoFile)) {
      notify(lang === 'vi' ? 'Vui lòng tải lên cả ảnh nhân vật và video chuyển động' : 'Please upload both character image and motion video', 'error');
      return;
    }
    if (activeMode === 'motion_control' && motionVideoDurationSeconds === null) {
      notify(
        lang === 'vi'
          ? 'Không thể đọc thời lượng video chuyển động. Vui lòng dùng video từ 3 đến 30 giây.'
          : 'Unable to read motion video duration. Please upload a video between 3 and 30 seconds.',
        'error'
      );
      return;
    }
    if (activeMode === 'motion_control' && motionVideoDurationSeconds !== null && (motionVideoDurationSeconds < 3 || motionVideoDurationSeconds > 30)) {
      notify(
        lang === 'vi'
          ? 'Video chuyển động phải dài từ 3 đến 30 giây theo yêu cầu của máy chủ.'
          : 'Motion video must be between 3 and 30 seconds.',
        'error'
      );
      return;
    }

    if (queueStats.myVideoProcessing >= CONCURRENCY_LIMITS.user.videoProcessing && queueStats.myQueued >= CONCURRENCY_LIMITS.user.queued) {
      notify(lang === 'vi' ? 'Bạn đã đạt giới hạn 1 luồng video và 1 hàng chờ. Vui lòng đợi.' : 'You have reached the limit of 1 video processing slot and 1 queued job. Please wait.', 'warning');
      return;
    }

    if (queueStats.systemQueued >= CONCURRENCY_LIMITS.system.queued) {
      notify(lang === 'vi' ? 'Hệ thống đang quá tải (Hàng chờ đầy). Vui lòng thử lại sau ít phút.' : 'System is overloaded (Queue full). Please try again later.', 'error');
      return;
    }

    const cost = calculateCost();
    let user;
    try {
      user = await getUserProfile({ force: true });
    } catch (error) {
      console.warn('[VideoTool] Failed to verify current balance', error);
      notify(
        lang === 'vi'
          ? 'Không thể xác minh số dư Vcoin lúc này. Vui lòng thử lại.'
          : 'Unable to verify your Vcoin balance. Please try again.',
        'error',
      );
      return;
    }
    if (!user) return;

    if ((user.vcoin_balance || 0) < cost) {
        notify(lang === 'vi' ? `Số dư không đủ (Cần ${cost} Vcoin)` : `Insufficient balance (Need ${cost} Vcoin)`, 'error');
        return;
    }

    setIsProcessing(true);
    const queuedId = crypto.randomUUID();

    const activeOptions = activeMode === 'video_ai' ? videoModelOptions : motionModelOptions;
    const selectedModelName = activeOptions.find((model) => model.id === (activeMode === 'video_ai' ? videoModel : motionModel))?.name || (activeMode === 'video_ai' ? videoModel : motionModel);
    const effectiveToolId = activeMode === 'motion_control' ? 'motion_control_gen' : feature.id;
    const effectiveToolName = activeMode === 'motion_control' ? 'Motion Control' : feature.name['en'];
    const effectiveMotionPrompt = motionPrompt.trim() || 'Animate the character naturally by following the motion reference video, preserve the original face, body, outfit, and identity.';
    const queuedPrompt = activeMode === 'video_ai' ? (prompt || 'Create a cinematic video') : effectiveMotionPrompt;
    const queuedVideo: GeneratedImage = {
        id: queuedId,
        url: '',
        prompt: queuedPrompt,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        assetType: 'video',
        toolId: effectiveToolId,
        toolName: effectiveToolName,
        engine: selectedModelName,
        status: 'queued',
        jobId: queuedId,
        progress: 0,
        cost,
    };

    try {
        await saveImageToLocalCache(queuedVideo);
    } catch (placeholderError) {
        console.warn('[VideoTool] Failed to persist queued placeholder', placeholderError);
    }

    onNavigateView?.('gallery');

    void (async () => {
      try {
        const requestedServerId = uiServerToTst(server) || (activeMode === 'video_ai' ? defaultVideoServerId : 'vip2');
        const requestedSpeedId = uiSpeedToTst(speed) || 'fast';
        const effectiveServerId = isGommoSelected
            ? undefined
            : activeMode === 'video_ai'
            ? (() => {
                const compatibleServers = getVideoCompatibleServers({
                    modelId: videoModel,
                    pricingEntries,
                    resolution: quality.toLowerCase(),
                    duration: duration.toLowerCase(),
                    speed: requestedSpeedId,
                    audio: effectiveVideoAudio
                });
                return compatibleServers.includes(requestedServerId) ? requestedServerId : (compatibleServers[0] || requestedServerId);
            })()
            : (() => {
                const compatibleServers = getMotionCompatibleServers({
                    modelId: motionModel,
                    pricingEntries,
                    resolution: quality.toLowerCase(),
                    speed: requestedSpeedId
                });
                return compatibleServers.includes(requestedServerId) ? requestedServerId : (compatibleServers[0] || requestedServerId);
            })();
        const effectiveSpeedId = isGommoSelected
            ? undefined
            : activeMode === 'video_ai'
            ? (() => {
                const compatibleSpeeds = getVideoCompatibleSpeeds({
                    modelId: videoModel,
                    pricingEntries,
                    serverId: effectiveServerId,
                    resolution: quality.toLowerCase(),
                    duration: duration.toLowerCase(),
                    audio: effectiveVideoAudio
                });
                return compatibleSpeeds.includes(requestedSpeedId) ? requestedSpeedId : (compatibleSpeeds[0] || requestedSpeedId);
            })()
            : (() => {
                const compatibleSpeeds = getMotionCompatibleSpeeds({
                    modelId: motionModel,
                    pricingEntries,
                    serverId: effectiveServerId,
                    resolution: quality.toLowerCase()
                });
                return compatibleSpeeds.includes(requestedSpeedId) ? requestedSpeedId : (compatibleSpeeds[0] || requestedSpeedId);
            })();

        const stagedKeyframeImage =
            activeMode === 'video_ai' && keyframeImage
                ? await tryStageInputToR2(keyframeImage, 'inputs/video-generate/keyframe')
                : null;
        const stagedCharacterImage =
            activeMode === 'motion_control'
                ? await tryStageInputToR2(characterImage!, 'inputs/motion-control')
                : null;
        const stagedMotionVideo =
            activeMode === 'motion_control'
                ? await tryStageInputToR2(motionVideoFile!, 'inputs/motion-control')
                : null;

        const queuePayload: VideoGenerateRecipePayload | MotionGenerateRecipePayload = activeMode === 'video_ai'
            ? {
                recipeType: 'video_generate_recipe_v1',
                modelId: videoModel,
                prompt: prompt || 'Create a cinematic video',
                duration: duration.toLowerCase(),
                resolution: isGommoVideoSelected ? gommoVideoPricingInput.resolution : quality.toLowerCase(),
                aspectRatio,
                speed: isGommoVideoSelected ? gommoVideoPricingInput.speed : effectiveSpeedId,
                serverId: effectiveServerId,
                providerMode: isGommoVideoSelected ? providerMode : undefined,
                pricingOptionId: isGommoVideoSelected ? gommoVideoPricing?.optionId : undefined,
                keyframeImage: stagedKeyframeImage,
                audio: isGommoVideoSelected ? gommoVideoPricingInput.audio : effectiveVideoAudio,
            }
            : {
                recipeType: 'motion_generate_recipe_v1',
                modelId: motionModel,
                prompt: effectiveMotionPrompt,
                resolution: isGommoMotionSelected
                  ? (selectedGommoMotionModel?.resolutions.length ? quality.toLowerCase() : providerMode === 'professional' ? '1080p' : '720p')
                  : quality.toLowerCase(),
                speed: isGommoMotionSelected ? undefined : effectiveSpeedId || 'fast',
                serverId: isGommoMotionSelected ? undefined : effectiveServerId,
                providerMode: isGommoMotionSelected ? providerMode : undefined,
                pricingOptionId: isGommoMotionSelected ? gommoMotionPricing?.optionId : undefined,
                backgroundSource: 'input_image',
                characterImage: stagedCharacterImage!,
                motionVideoDataUrl: stagedMotionVideo!,
                motionVideoDurationSeconds,
            };

        await enqueueServerJob({
            id: queuedId,
            prompt: queuedPrompt,
            toolId: effectiveToolId,
            toolName: effectiveToolName,
            engine: selectedModelName,
            assetType: 'video',
            costVcoin: cost,
            queueKind: activeMode === 'video_ai' ? 'video_generate' : 'motion_generate',
            clientPlatform: 'desktop',
            queuePayload,
        });

        window.dispatchEvent(new Event('balance_updated'));
        notify(lang === 'vi' ? 'Đã gửi job. Theo dõi tiến trình trong Lịch sử tạo.' : 'Job submitted. Track progress in History.', 'success');
      } catch (error) {
        console.error(error);
        const errorMsg = error instanceof Error ? error.message : (lang === 'vi' ? 'Tạo video thất bại' : 'Video generation failed');
        try {
          await saveImageToLocalCache({
            ...queuedVideo,
            status: 'failed',
            error: errorMsg,
            updatedAt: Date.now(),
            progress: 0,
          });
        } catch (persistError) {
          console.warn('[VideoTool] Failed to persist failed queued placeholder', persistError);
        }
        notify(errorMsg, 'error');
      } finally {
        setIsProcessing(false);
      }
    })();

    return;
  };

  const TipIcon = SMART_TIPS[currentTipIdx].icon;
  const activeSectionTips = activeMode === 'motion_control'
    ? VIDEO_GENERATION_TIPS.motionControl
    : VIDEO_GENERATION_TIPS.videoAi;

  return (
    <div className="w-full pb-12 animate-fade-in relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        accept={uploadTarget === 'motion' ? "video/*" : "image/*"} 
      />

      {/* 1. TOP CYBER CAPSULE HEADER */}
      <div className="w-full neu-card p-4 rounded-3xl mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div data-tour-id="desktop.video.mode" className="neu-inset-sm p-1.5 rounded-2xl flex gap-1.5 overflow-x-auto no-scrollbar max-w-full">
              <button
                  onClick={() => {
                    setActiveMode('video_ai');
                    onNavigateToFeature?.('video_ai_gen');
                  }}
                  className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                    activeMode === 'video_ai' ? 'neu-raised-sm text-[#FF007F] font-accent' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                  <Icons.Video className="w-4 h-4 text-[#FF007F]" />
                  {lang === 'vi' ? 'Tạo Video AI' : 'AI Video'}
              </button>
              <button
                  onClick={() => {
                    setActiveMode('motion_control');
                    onNavigateToFeature?.('motion_control_gen');
                  }}
                  className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${
                    activeMode === 'motion_control' ? 'neu-raised-sm text-[#00F2FE] font-accent' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
              >
                  <Icons.Activity className="w-4 h-4 text-[#00F2FE]" />
                  Motion Control
              </button>
          </div>

          <div className="flex items-center gap-2">
              <button
                  onClick={() => setShowGuide(true)}
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
        
        {/* BLOCK 1: UPLOAD KEYFRAME / MOTION (lg:col-span-7 xl:col-span-8) */}
        <div data-tour-id="desktop.video.upload" className="lg:col-span-7 xl:col-span-8 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                    <Icons.Upload className="w-4 h-4 text-[#00F2FE]" /> 1. UPLOAD KEYFRAME & CHUYỂN ĐỘNG (MOTION)
                </h3>
            </div>

            <div role="note" className="rounded-2xl border border-cyan-500/35 bg-cyan-500/5 px-4 py-3 text-[11px] font-semibold leading-relaxed text-slate-700 dark:bg-black/20 dark:text-slate-200">
              <span aria-hidden="true">💡</span>{' '}
              <strong className="text-slate-900 dark:text-white">{activeSectionTips.upload.title}:</strong>{' '}
              {activeSectionTips.upload.text}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeMode === 'video_ai' ? (
                <div className="neu-inset-sm p-4 rounded-2xl space-y-3 col-span-2">
                  <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800 dark:text-white font-accent">Ảnh Keyframe Đầu Tiên</span>
                  </div>
                  <div onClick={() => triggerUpload('keyframe')} className="w-full h-56 neu-card rounded-2xl border-2 border-dashed border-[#00F2FE]/40 hover:border-[#00F2FE] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center transition-all group/item">
                      {keyframeImage ? (
                          <>
                              <img src={keyframeImage} className="w-full h-full object-contain" alt="Keyframe" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                                  <span className="text-[10px] font-bold text-white neu-button px-3 py-1.5 rounded-xl">Đổi Ảnh</span>
                              </div>
                          </>
                      ) : (
                          <div className="flex flex-col items-center text-slate-400 group-hover/item:text-[#00F2FE] transition-colors p-2 text-center">
                              <Icons.Image className="w-8 h-8 mb-1 text-[#00F2FE]" />
                              <span className="text-[10px] uppercase font-bold tracking-wider">Tải Ảnh Keyframe (Bắt buộc)</span>
                          </div>
                      )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="neu-inset-sm p-4 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-800 dark:text-white font-accent">Ảnh Nhân Vật</span>
                    </div>
                    <div onClick={() => triggerUpload('character')} className="w-full h-48 neu-card rounded-2xl border-2 border-dashed border-[#FF007F]/40 hover:border-[#FF007F] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center transition-all">
                        {characterImage ? (
                            <img src={characterImage} className="w-full h-full object-contain" alt="Character" />
                        ) : (
                            <div className="flex flex-col items-center text-slate-400 p-2 text-center">
                                <Icons.User className="w-8 h-8 mb-1 text-[#FF007F]" />
                                <span className="text-[10px] uppercase font-bold">Tải Ảnh NV</span>
                            </div>
                        )}
                    </div>
                  </div>

                  <div className="neu-inset-sm p-4 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-800 dark:text-white font-accent">Video Motion Mẫu</span>
                    </div>
                    <div onClick={() => triggerUpload('motion')} className="w-full h-48 neu-card rounded-2xl border-2 border-dashed border-[#00F2FE]/40 hover:border-[#00F2FE] cursor-pointer relative overflow-hidden flex flex-col items-center justify-center transition-all">
                        {motionVideo ? (
                            <video src={motionVideo} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                        ) : (
                            <div className="flex flex-col items-center text-slate-400 p-2 text-center">
                                <Icons.Activity className="w-8 h-8 mb-1 text-[#00F2FE]" />
                                <span className="text-[10px] uppercase font-bold">Video Motion</span>
                            </div>
                        )}
                    </div>
                  </div>
                </>
              )}
            </div>
        </div>

        {/* BLOCK 2: KỊCH BẢN PROMPT (lg:col-span-5 xl:col-span-4) */}
        <div data-tour-id="desktop.video.prompt" className="lg:col-span-5 xl:col-span-4 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20 flex flex-col justify-between">
            <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                        <Icons.MessageCircle className="w-4 h-4 text-[#FF007F]" /> 2. KỊCH BẢN PROMPT
                    </h3>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => onNavigateView ? onNavigateView('prompt_library') : undefined} 
                        className="neu-button px-3 py-1 rounded-xl text-[10px] font-black text-[#FF007F] dark:text-[#FF007F] flex items-center gap-1 hover:scale-105 transition-all"
                      >
                        <Icons.Sparkles className="w-3 h-3 text-[#FF007F]" />
                        <span>Prompt Mẫu</span>
                      </button>
                      <button type="button" onClick={() => activeMode === 'video_ai' ? setPrompt('') : setMotionPrompt('')} className="neu-button px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-500 hover:text-red-500">Xóa</button>
                    </div>
                </div>
                
                <textarea 
                    value={activeMode === 'video_ai' ? prompt : motionPrompt}
                    onChange={(e) => activeMode === 'video_ai' ? setPrompt(e.target.value) : setMotionPrompt(e.target.value)}
                    placeholder={activeMode === 'video_ai' ? "Mô tả kịch bản ngắn: nhân vật bước ra từ khung ảnh, xoay người tạo dáng tự tin..." : "Mô tả bối cảnh phía sau nhân vật..."}
                    rows={6}
                    className="w-full neu-input rounded-2xl p-4 text-xs leading-relaxed focus:outline-none resize-y font-sans"
                />

                {activeMode === 'video_ai' && (
                  <div className="neu-inset-sm p-4 rounded-2xl space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-[#00A8C8] dark:text-[#00F2FE] flex items-center gap-1">
                          <Icons.Sparkles className="w-3.5 h-3.5" />
                          Đạo diễn kịch bản AI
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                Vertex AI phân tích keyframe và viết kịch bản chuyển động tối ưu cho model đã chọn.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateVideoScript}
                        disabled={isGeneratingScript || !keyframeImage}
                        className="neu-button px-4 py-2.5 rounded-xl text-[10px] font-black text-[#FF007F] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {isGeneratingScript ? 'Đang viết kịch bản...' : 'Tạo kịch bản chi tiết'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <OptionDropdown
                        label="Phong cách"
                        value={scriptStyle}
                        options={['Cinematic điện ảnh', 'Đời thường tự nhiên', 'Thời trang', 'Hành động', 'Lãng mạn'].map((item) => ({ label: item, value: item }))}
                        onChange={setScriptStyle}
                        icon={Icons.Image}
                      />
                      <OptionDropdown
                        label="Chủ đề"
                        value={scriptTheme}
                        options={['Tự động theo ảnh', 'Đời thường', 'Sân khấu', 'Đường phố'].map((item) => ({ label: item, value: item }))}
                        onChange={setScriptTheme}
                        icon={Icons.MessageCircle}
                      />
                      <OptionDropdown
                        label="Âm thanh"
                        value={scriptSoundMood}
                        options={['Phù hợp bối cảnh', 'Lãng mạn vui vẻ', 'Sôi động hành động', 'Sầu bi buồn bã', 'Vui tươi hài hước'].map((item) => ({ label: item, value: item }))}
                        onChange={setScriptSoundMood}
                        icon={Icons.Volume2}
                      />
                      <OptionDropdown
                        label="Model kịch bản"
                        value={scriptTargetModel || videoModel}
                        options={videoModelOptions.map((model) => ({ label: model.name, value: model.id }))}
                        onChange={setScriptTargetModel}
                        icon={Icons.Video}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { label: 'Trend Douyin/TikTok', active: scriptTrendEdit, toggle: () => setScriptTrendEdit((value) => !value) },
                        { label: 'Text trong video', active: scriptTextOverlay, toggle: () => setScriptTextOverlay((value) => !value) },
                        { label: 'Lời thoại giọng nói', active: scriptVoiceDialogue, toggle: () => setScriptVoiceDialogue((value) => !value) },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={item.toggle}
                          aria-pressed={item.active}
                          className={`rounded-xl px-3 py-2 text-[10px] font-black text-left transition-all ${
                            item.active ? 'neu-raised-sm text-[#FF007F] ring-2 ring-[#FF007F]/30' : 'neu-button text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.label}: {item.active ? 'Bật' : 'Tắt'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <div className="neu-inset-sm p-3 rounded-2xl text-[10px] text-slate-400 leading-relaxed">
                💡 AI Video hỗ trợ mô hình Kling chất lượng cực cao, nhịp dựng tự nhiên chuẩn điện ảnh.
            </div>
        </div>

        {/* BLOCK 3: MÔ HÌNH AI & CẤU HÌNH (lg:col-span-7 xl:col-span-8) */}
        <div data-tour-id="desktop.video.model" className="lg:col-span-7 xl:col-span-8 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                    <Icons.Settings className="w-4 h-4 text-[#00F2FE]" /> 3. MÔ HÌNH AI & THAM SỐ VIDEO
                </h3>
            </div>

            <div role="note" className="rounded-2xl border border-cyan-500/35 bg-cyan-500/5 px-4 py-3 text-[11px] font-semibold leading-relaxed text-slate-700 dark:bg-black/20 dark:text-slate-200">
              <span aria-hidden="true">💡</span>{' '}
              <strong className="text-slate-900 dark:text-white">{activeSectionTips.settings.title}:</strong>{' '}
              {activeSectionTips.settings.text}
            </div>

            {!isCatalogReady && (
              <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {catalogLoading
                  ? 'Đang đồng bộ catalog realtime theo API đã cấu hình...'
                  : isGommoSelected
                    ? 'Nguồn tạo video đang bảo trì, model đã tắt hoặc cấu hình này chưa có giá Vcoin.'
                    : (catalogError || 'Dịch vụ tạo video đang bảo trì hoặc không sẵn sàng.')}
              </div>
            )}

            <div className="space-y-5">
              {activeMode === 'video_ai' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {VIDEO_MODEL_FAMILY_ORDER.map((family) => {
                      const meta = VIDEO_MODEL_FAMILY_META[family];
                      const familyModels = getModelsByFamily(videoModelOptions, family);
                      const FamilyIcon = getVideoFamilyIcon(family);
                      const selected = videoModelFamily === family;
                      const familyLabel = family === 'other'
                        ? (familyModels.find((model) => model.id === videoModel)?.name || familyModels[0]?.name || meta.label)
                        : meta.label;
                      return (
                        <button
                          key={family}
                          type="button"
                          disabled={familyModels.length === 0}
                          onClick={() => selectVideoFamily(family)}
                          aria-pressed={selected}
                          className={`group min-h-[94px] p-3.5 rounded-2xl text-left transition-all duration-200 ${getVideoFamilyTheme(family, selected)} ${
                            familyModels.length === 0 ? 'opacity-35 cursor-not-allowed' : 'hover:-translate-y-0.5'
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              family === 'grok'
                                ? 'bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950'
                                : family === 'kling'
                                  ? 'bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950'
                                  : 'bg-gradient-to-br from-[#FF007F] to-[#9D00FF] text-white'
                            }`}>
                              <FamilyIcon className="w-4 h-4" />
                            </span>
                            <span className={`px-2 py-1 rounded-full text-[9px] font-black tracking-wide ${
                              family === 'grok'
                                ? 'bg-emerald-400/15 text-emerald-500 dark:text-emerald-300'
                                : family === 'kling'
                                  ? 'bg-amber-400/15 text-amber-600 dark:text-amber-300'
                                  : 'bg-[#FF007F]/15 text-[#FF007F]'
                            }`}>
                              #{meta.tag.replace(/\s+/g, '_')}
                            </span>
                          </span>
                          <span className="block mt-2 truncate text-sm font-black font-accent text-slate-900 dark:text-white" title={familyLabel}>{familyLabel}</span>
                          <span className="block mt-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">{getFamilyPriceLabel(familyModels)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    {getModelsByFamily(videoModelOptions, videoModelFamily).map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => selectVideoModel(model.id)}
                        aria-pressed={videoModel === model.id}
                        className={`w-full p-3.5 rounded-2xl text-left transition-all flex items-center gap-3 ${
                          videoModel === model.id
                            ? 'neu-inset-sm ring-2 ring-[#FF007F] bg-gradient-to-r from-[#FF007F]/10 via-transparent to-[#00F2FE]/5'
                            : 'neu-button hover:-translate-y-0.5'
                        }`}
                      >
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          videoModel === model.id
                            ? 'bg-gradient-to-br from-[#FF007F] to-[#9D00FF] text-white shadow-lg shadow-[#FF007F]/20'
                            : 'neu-inset-sm text-slate-500 dark:text-slate-300'
                        }`}>
                          {React.createElement(getVideoFamilyIcon(getVideoModelFamily(model)), { className: 'w-5 h-5' })}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black font-accent text-slate-900 dark:text-white">{model.name}</span>
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black ${model.price > 0 ? 'bg-amber-400/15 text-amber-600 dark:text-amber-300' : 'bg-rose-500/10 text-rose-500'}`}>
                              {model.price > 0 ? `TỪ ${model.price} VCOIN` : 'CHƯA CÓ GIÁ'}
                            </span>
                          </span>
                          <span className="block mt-1 text-[10px] font-semibold leading-relaxed text-slate-600 dark:text-slate-400">{getVideoModelRuntimeMeta(model).description}</span>
                          <span className="flex flex-wrap gap-1.5 mt-2">
                            <span className="px-2 py-0.5 rounded-md bg-violet-500/10 text-[8px] font-black text-violet-600 dark:text-violet-300">
                              {getVideoModelRuntimeMeta(model).server}
                            </span>
                            {getVideoModelRuntimeMeta(model).capabilities && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-[8px] font-black text-slate-500 dark:text-slate-300">
                                {getVideoModelRuntimeMeta(model).capabilities}
                              </span>
                            )}
                          </span>
                          <span className="flex flex-wrap gap-1.5 mt-2">
                            {getVideoModelTags(model).map((tag) => (
                              <span key={tag} className="px-2 py-0.5 rounded-md border border-[#00A8C8]/20 bg-[#00F2FE]/5 text-[8px] font-black text-[#0089A3] dark:text-[#00F2FE]">
                                {tag}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          videoModel === model.id ? 'border-[#FF007F]' : 'border-slate-400/50'
                        }`}>
                          {videoModel === model.id && <span className="w-2 h-2 rounded-full bg-[#FF007F]" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {motionModelOptions.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setMotionModel(model.id)}
                      aria-pressed={motionModel === model.id}
                      className={`p-3.5 rounded-2xl text-left transition-all flex items-center gap-3 ${
                        motionModel === model.id
                          ? 'neu-inset-sm ring-2 ring-[#00F2FE] bg-gradient-to-r from-[#00F2FE]/10 to-transparent'
                          : 'neu-button hover:-translate-y-0.5'
                      }`}
                    >
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F2FE] to-blue-600 text-white flex items-center justify-center shrink-0">
                        <Icons.Activity className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-xs font-black font-accent text-slate-900 dark:text-white block">{model.name}</span>
                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">Từ {model.price} Vcoin</span>
                        <span className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-[#00F2FE]/10 text-[8px] font-black text-[#0089A3] dark:text-[#00F2FE]">#MOTION_CONTROL</span>
                          <span className="px-2 py-0.5 rounded-md bg-[#FF007F]/10 text-[8px] font-black text-[#FF007F]">#NHÂN_VẬT</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pt-4 border-t border-slate-200/60 dark:border-slate-800">
                {modelOptions.showAspectRatio && modelOptions.aspectRatios.length > 0 && (
                  <OptionDropdown label="Tỉ lệ khung hình" value={aspectRatio} options={modelOptions.aspectRatios.map((value) => ({ label: value, value }))} onChange={setAspectRatio} icon={Icons.Monitor} />
                )}
                {modelOptions.qualities.length > 0 && (
                  <OptionDropdown label="Chất lượng" value={quality} options={modelOptions.qualities.map((value) => ({ label: value, value }))} onChange={setQuality} icon={Icons.Video} />
                )}
                {activeMode === 'video_ai' && modelOptions.durations.length > 0 && (
                  <OptionDropdown label="Thời lượng" value={duration} options={modelOptions.durations.map((value) => ({ label: value, value }))} onChange={setDuration} icon={Icons.Clock} />
                )}
                {isGommoSelected && (selectedGommoModel?.modes || []).length > 0 && (
                  <OptionDropdown
                    label="Máy chủ / chế độ · giá API"
                    value={providerMode}
                    options={(selectedGommoModel?.modes || []).map((option) => ({
                      label: option.name || option.type,
                      value: option.type,
                      description: [option.description || getGommoModeDescription(option.type), option.group || '', option.groupSubtitle || '']
                        .filter(Boolean).join(' · '),
                      meta: getGommoModePriceLabel(selectedGommoModel, option.type),
                    }))}
                    onChange={setProviderMode}
                    icon={Icons.Database}
                  />
                )}
                {speedOptions.length > 0 && (
                  <OptionDropdown label="Tốc độ xử lý" value={speed} options={speedOptions} onChange={setSpeed} icon={Icons.Zap} />
                )}
                {serverOptions.length > 0 && (
                  <OptionDropdown label="Máy chủ" value={server} options={serverOptions} onChange={setServer} icon={Icons.Database} />
                )}
              </div>

              {activeMode === 'video_ai' && !isGommoVideoSelected && modelOptions.supportsAudio && (
                <button
                  type="button"
                  onClick={() => setSound((value) => !value)}
                  aria-pressed={sound}
                  className={`w-full p-3 rounded-2xl flex items-center justify-between text-xs font-black ${sound ? 'neu-raised-sm text-[#FF007F]' : 'neu-button text-slate-600 dark:text-slate-300'}`}
                >
                  <span className="flex items-center gap-2">
                    {sound ? <Icons.Volume2 className="w-4 h-4" /> : <Icons.VolumeX className="w-4 h-4" />}
                    Âm thanh do model tạo
                  </span>
                  <span>{sound ? 'Bật' : 'Tắt'}</span>
                </button>
              )}
            </div>
        </div>

        {/* BLOCK 4: COST & LAUNCH (lg:col-span-5 xl:col-span-4) */}
        <div className="lg:col-span-5 xl:col-span-4 neu-card p-6 rounded-3xl space-y-4 shadow-xl border border-white/20 flex flex-col justify-between">
            <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm uppercase tracking-wider font-accent flex items-center gap-2">
                        <Icons.Zap className="w-4 h-4 text-amber-500" /> 4. XÁC NHẬN & RENDER VIDEO
                    </h3>
                </div>

                <div role="note" className="rounded-2xl border border-cyan-500/35 bg-cyan-500/5 px-4 py-3 text-[11px] font-semibold leading-relaxed text-slate-700 dark:bg-black/20 dark:text-slate-200">
                  <span aria-hidden="true">💡</span>{' '}
                  <strong className="text-slate-900 dark:text-white">{activeSectionTips.render.title}:</strong>{' '}
                  {activeSectionTips.render.text}
                </div>

                <div className="neu-inset-sm p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase">Chi Phí VCOIN:</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-amber-500 font-accent">
                          {activeMode === 'motion_control' && motionVideoDurationSeconds === null ? '--' : calculateCost()}
                        </span>
                        <span className="text-xs font-bold text-amber-500">VCOIN</span>
                    </div>
                </div>
                {perSecondCostLabel && motionVideoDurationSeconds !== null && (
                  <p className="text-[10px] font-mono text-slate-600 dark:text-slate-400 text-right">{perSecondCostLabel}</p>
                )}

                <div className="neu-inset-sm rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsConcurrencyExpanded((value) => !value)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                    aria-expanded={isConcurrencyExpanded}
                  >
                    <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Icons.Activity className="w-4 h-4 text-[#00A8C8] dark:text-[#00F2FE]" />
                      Luồng video
                    </span>
                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                      {queueStats.myVideoProcessing}/{CONCURRENCY_LIMITS.user.videoProcessing} · Chờ {queueStats.myQueued}/{CONCURRENCY_LIMITS.user.queued}
                    </span>
                  </button>
                  {isConcurrencyExpanded && (
                    <div className="px-4 pb-3 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-300 space-y-2">
                      <div className="flex justify-between"><span>Video hệ thống</span><span className="font-mono">{queueStats.systemVideoProcessing}/{CONCURRENCY_LIMITS.system.videoProcessing}</span></div>
                      <div className="flex justify-between"><span>Hàng chờ hệ thống</span><span className="font-mono">{queueStats.systemQueued}/{CONCURRENCY_LIMITS.system.queued}</span></div>
                    </div>
                  )}
                </div>
            </div>

            <button 
                data-tour-id="desktop.video.generate"
                onClick={handleGenerate}
                disabled={isProcessing || !isCatalogReady || !currentCostBreakdown.available || !hasRequiredInputs}
                className={`w-full py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-2xl ${
                    (isProcessing || !isCatalogReady || !currentCostBreakdown.available || !hasRequiredInputs)
                    ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-70 neu-inset-sm' 
                    : 'neu-button-primary'
                }`}
            >
                {isProcessing ? (
                    <>
                        <Icons.Loader className="w-5 h-5 animate-spin" />
                        <span>ĐANG RENDER VIDEO...</span>
                    </>
                ) : (
                    <>
                        <Icons.Sparkles className="w-5 h-5" />
                        <span>RENDER VIDEO 3D NGAY</span>
                    </>
                )}
            </button>
        </div>

      </div>

      {/* RESULT MODAL (Full screen overlay like GenerationTool) */}
      {stage === 'result' && resultVideo && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center animate-fade-in p-4 bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-4xl bg-[#090014] border border-white/10 rounded-3xl overflow-hidden shadow-2xl mx-auto flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5 shrink-0">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-bold text-sm text-white">Kết quả Video</span>
                      </div>
                      <button onClick={() => setStage('input')} className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">Đóng</button>
                  </div>
                  <div className="relative bg-black/50 flex-1 flex items-center justify-center p-4 min-h-0">
                      <video 
                        src={resultVideo} 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/5" 
                        controls 
                        autoPlay 
                        loop 
                        playsInline 
                      />
                  </div>
                  <div className="p-4 bg-[#12121a] flex flex-col gap-3 shrink-0">
                      <div className="flex gap-3">
                            <button
                              onClick={() => handleVideoDownload(resultVideo, `auditionai-video-${Date.now()}.mp4`)}
                              className="flex-1 px-4 py-3 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-audi-cyan transition-colors text-sm"
                            >
                              <Icons.Download className="w-5 h-5" /> Tải Về
                          </button>
                          <button onClick={() => setStage('input')} className="flex-1 px-4 py-3 bg-audi-yellow text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-yellow-400 transition-colors shadow-[0_0_15px_rgba(251,218,97,0.3)] text-sm">
                              <Icons.Video className="w-5 h-5" /> Tạo Tiếp
                          </button>
                      </div>
                      <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 animate-pulse">
                          <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-400 font-bold leading-relaxed">
                              LƯU Ý QUAN TRỌNG: Video trong lịch sử tạo sẽ tự động bị xóa sau 7 ngày. Vui lòng ấn nút "Tải Về" để lưu video xuống máy tính ngay bây giờ để tránh mất dữ liệu!
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* PROCESSING OVERLAY */}
      {stage === 'processing' && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center animate-fade-in p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-32 h-32 mb-8">
            <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-audi-yellow rounded-full border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Icons.Video className="w-8 h-8 text-audi-yellow animate-pulse" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2 animate-pulse">
            {lang === 'vi' ? 'Đang render video...' : 'Rendering video...'}
          </h3>
          <p className="text-slate-400 text-sm">
            {lang === 'vi' ? 'Vui lòng không đóng trình duyệt. Quá trình này có thể mất vài phút.' : 'Please do not close the browser. This may take a few minutes.'}
          </p>
        </div>
      )}

      {/* GUIDE MODAL */}
      {showGuide && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
              <div className="w-full max-w-2xl sm:max-w-3xl neu-card border border-slate-300 dark:border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 neu-inset-sm shrink-0">
                      <h3 className="font-black text-slate-950 dark:text-white flex items-center gap-2 font-accent text-sm sm:text-base uppercase tracking-wider">
                          <Icons.Info className="w-5 h-5 text-[#FF007F]" />
                          {activeMode === 'video_ai' ? 'HƯỚNG DẪN TẠO VIDEO AI' : 'HƯỚNG DẪN TẠO MOTION CONTROL'}
                      </h3>
                      <button onClick={() => setShowGuide(false)} className="neu-button p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-red-500 transition-colors">
                          <Icons.X className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 text-slate-800 dark:text-slate-200">
                      {activeMode === 'motion_control' ? (
                          <>
                              <div>
                                  <h4 className="text-base font-bold text-white mb-2">Video Tham Khảo</h4>
                                  <p className="text-sm text-slate-300 leading-relaxed mb-4">
                                      Chỉ cho phép một nhân vật (người thật hoặc có phần giống người) trong video rõ nét nửa người/toàn thân, với chuyển động liên tục và mượt mà (nếu không, nó sẽ bị cắt).
                                  </p>
                                  <div className="grid grid-cols-2 gap-3">
                                      <div className="aspect-square bg-black/50 rounded-xl border border-white/10 overflow-hidden">
                                          <img src="https://picsum.photos/seed/dance1/400/400" className="w-full h-full object-cover opacity-80" alt="Video ref 1" />
                                      </div>
                                      <div className="aspect-square bg-black/50 rounded-xl border border-white/10 overflow-hidden">
                                          <img src="https://picsum.photos/seed/dance2/400/400" className="w-full h-full object-cover opacity-80" alt="Video ref 2" />
                                      </div>
                                  </div>
                              </div>
                              <div>
                                  <h4 className="text-base font-bold text-white mb-2">Hình Ảnh</h4>
                                  <p className="text-sm text-slate-300 leading-relaxed mb-4">
                                      Chỉ cho phép hình ảnh rõ nét nửa người/toàn thân của một nhân vật. Khuyến nghị tỷ lệ phù hợp với video.
                                  </p>
                                  <div className="grid grid-cols-2 gap-3">
                                      <div className="aspect-[3/4] bg-black/50 rounded-xl border border-white/10 overflow-hidden">
                                          <img src="https://picsum.photos/seed/portrait3/400/533" className="w-full h-full object-cover opacity-80" alt="Image ref 1" />
                                      </div>
                                      <div className="aspect-[3/4] bg-black/50 rounded-xl border border-white/10 overflow-hidden">
                                          <img src="https://picsum.photos/seed/portrait4/400/533" className="w-full h-full object-cover opacity-80" alt="Image ref 2" />
                                      </div>
                                  </div>
                              </div>
                          </>
                      ) : (
                          <>
                              <div>
                                  <h4 className="text-base font-bold text-white mb-2">Mô tả (Prompt)</h4>
                                  <p className="text-sm text-slate-300 leading-relaxed mb-4">
                                      Viết mô tả chi tiết về hành động, bối cảnh, ánh sáng và góc máy. Càng chi tiết, video tạo ra càng sát với ý tưởng của bạn.
                                  </p>
                                  <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                                      <p className="text-xs text-audi-cyan font-mono">
                                          "Một phi hành gia đang đi bộ trên sao Hỏa, quay chậm, ánh sáng hoàng hôn rực rỡ, chất lượng điện ảnh, 4k"
                                      </p>
                                  </div>
                              </div>
                              <div>
                                  <h4 className="text-base font-bold text-white mb-2">Ảnh Mẫu (Tùy chọn)</h4>
                                  <p className="text-sm text-slate-300 leading-relaxed mb-4">
                                      Tải lên một bức ảnh để làm khung hình đầu tiên hoặc làm tham chiếu cho video. AI sẽ tạo chuyển động dựa trên bức ảnh này.
                                  </p>
                                  <div className="grid grid-cols-2 gap-3">
                                      <div className="aspect-video bg-black/50 rounded-xl border border-white/10 overflow-hidden relative">
                                          <img src="https://picsum.photos/seed/scene1/400/225" className="w-full h-full object-cover opacity-80" alt="Image ref 1" />
                                          <div className="absolute inset-0 flex items-center justify-center">
                                              <Icons.Image className="w-6 h-6 text-white/50" />
                                          </div>
                                      </div>
                                      <div className="aspect-video bg-black/50 rounded-xl border border-white/10 overflow-hidden relative flex items-center justify-center">
                                          <Icons.ChevronRight className="w-6 h-6 text-slate-500" />
                                      </div>
                                  </div>
                              </div>
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
