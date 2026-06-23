
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Feature, Language, GeneratedImage, ViewId } from '../../types';
import { Icons } from '../../components/Icons';
import {
  getUserProfile,
  getStylePresets,
  getTutorialVideo,
  getModelPricing,
  getTstServerAvailabilityConfig,
  getGenerationGuideImages,
  type ModelPricing,
  type GenerationGuideImagesConfig,
} from '../../services/economyService';
import { useNotification } from '../../components/NotificationSystem';
import { caulenhauClient } from '../../services/supabaseClient';
import { CONCURRENCY_LIMITS, useConcurrency } from '../../services/concurrencyService';
import { enqueueServerJob } from '../../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../../services/storageService';
import { downloadAssetToBrowser } from '../../services/downloadService';
import { analyzeCharacterAppearanceProfile } from '../../utils/imageProcessor';
import { APP_CONFIG } from '../../constants';
import { buildAuditionKoreaMmoStylePrompt, DEFAULT_IMAGE_NEGATIVE_PROMPT } from '../../shared/imagePromptDefaults';
import {
  type AuditionPricingOverride,
  fetchTstModels,
  fetchTstPricing,
  getCompatibleGenerationServers,
  getCompatibleGenerationResolutions,
  getCompatibleGenerationSpeeds,
  getGenerationCostBreakdown,
  getVertexEditToolCostBreakdown,
  getGenerationModelId,
  getResolutionCostMap,
  resolveGenerationSelection,
  applyServerAvailabilityToRuntimeModels,
  sanitizePricingEntriesWithRuntimeModels,
  tstServerToUi,
  uiServerToTst,
  uiSpeedToTst,
  type TstGenerationTier,
  type TstPricingEntry,
  type TstRuntimeModel,
} from '../../services/tstCatalog';
import type { CharacterReferenceGroup, ImageGenerateRecipePayload } from '../../shared/queueRecipes';
import {
  CHARACTER_ASSISTANT_RESOLUTION,
  runCharacterAssistantAction,
  type CharacterAssistantToolId,
} from '../../services/characterImageAssistService';

interface GenerationToolProps {
  feature: Feature;
  lang: Language;
  onNavigateToFeature?: (featureId: string) => void;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

type GenMode = 'single' | 'couple' | 'group3' | 'group4' | 'group5';
type Stage = 'input' | 'processing' | 'result';
type Resolution = '1K' | '2K' | '4K';

const IMAGE_MODEL_OPTIONS: Array<{
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
    icon: Icons.Sparkles,
    accent: 'from-fuchsia-500 via-violet-500 to-cyan-400',
  },
  {
    tier: 'flash',
    label: 'Flash',
    tag: 'GIÁ RẺ',
    title: 'Nano Banana 2',
    description: 'Gemini Flash, tốc độ nhanh và tiết kiệm, phù hợp ảnh cơ bản/chất lượng trung bình.',
    icon: Icons.Zap,
    accent: 'from-cyan-400 via-sky-500 to-blue-500',
  },
  {
    tier: 'pro',
    label: 'Pro',
    tag: 'HOT',
    title: 'Nano Banana Pro',
    description: 'Gemini Pro thông minh hơn Flash, ảnh chi tiết hơn, hỗ trợ hoàn thiện cao và 4K.',
    icon: Icons.Crown,
    accent: 'from-amber-300 via-orange-500 to-fuchsia-500',
  },
];

const MODE_TO_FEATURE_ID: Record<GenMode, string> = {
    single: 'single_photo_gen',
    couple: 'couple_photo_gen',
    group3: 'group_3_gen',
    group4: 'group_4_gen',
    group5: 'group_5_gen',
};

interface CharacterInput {
  id: number;
  bodyImage: string | null;
  gender: 'female' | 'male';
}

const SMART_TIPS = [
    { icon: Icons.Sparkles, text: "Ảnh nhân vật được gửi nguyên bản để giữ đầy đủ khuôn mặt, trang phục, phụ kiện và bố cục ảnh tải lên." },
    { icon: Icons.Zap, text: "Tip: Chọn ảnh nhân vật rõ nét, đủ sáng và không bị che khuất để kết quả nhận diện ổn định hơn." },
    { icon: Icons.Crown, text: "Lưu ý: Model Pro 4K mang lại độ chi tiết trang phục chân thực nhất." },
    { icon: Icons.Palette, text: "Mẹo: Nhập mô tả màu sắc trang phục cụ thể, ví dụ váy đỏ hoặc giày trắng, để AI vẽ đúng ý." },
    { icon: Icons.Lock, text: "Mỗi nhân vật sử dụng đúng một ảnh tham chiếu, không tạo thêm ảnh cắt khuôn mặt chiếm slot." },
    { icon: Icons.Image, text: "Mẹo: Ảnh mẫu (Ref) nên có góc chụp tương đồng với ý tưởng bạn muốn tạo." },
    { icon: Icons.MessageCircle, text: "Tip: Bí ý tưởng? Dùng nút 'Sử dụng Prompt Mẫu' để lấy ý tưởng từ cộng đồng." },
    { icon: Icons.Monitor, text: "Lưu ý: Độ phân giải 4K rất nét, thích hợp in ấn nhưng sẽ tốn thời gian xử lý hơn." },
    { icon: Icons.ExternalLink, text: "Mẹo: Truy cập AuMix3D.com để mix đồ và chụp ảnh nhân vật tách nền cực nét làm nguyên liệu cho AI." }
];

const SAMPLE_IMAGE_PROMPT_LOCK = 'Giữ nguyên 100% quần áo, trang phục, kiểu tóc, gương mặt, lớp hoá trang makeup trên gương mặt, biểu cảm trên gương mặt, phụ kiện như kính, khuyên tai trên mũ tóc, giày dép của ảnh tham chiếu nam và nữ tải lên. Không sử dụng quần áo, trang phục, kiểu tóc, gương mặt, lớp hoá trang makeup, biểu cảm, phụ kiện, giày dép của ảnh mẫu. Không được tự động xoá các chi tiết trên người của ảnh tham chiếu nam và nữ tải lên, không được tự động sáng tạo gương mặt và biểu cảm.';

const TUTORIAL_VIDEO_ID = "ba2WR8txe_c";

interface SamplePrompt {
    id: string;
    image_url: string;
    prompt: string;
    category?: string;
}

const tryStageGenerationInput = async (source: string, folder: string) => {
    if (!source) return null;
    if (source.startsWith('http')) return source;

    try {
        return await uploadFileToR2(source, folder);
    } catch (error) {
        console.warn('[GenerationTool] Failed to stage generation input to storage.', error);
        throw new Error('Không thể tải ảnh tham chiếu lên vùng đệm. Vui lòng thử lại.');
    }
};

export const GenerationTool: React.FC<GenerationToolProps> = ({ feature, lang, onNavigateToFeature, onNavigateView }) => {
  const { notify } = useNotification();
  const { userId, queueStats, triggerPoll } = useConcurrency();
  const [stage, setStage] = useState<Stage>('input');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([{ id: 1, bodyImage: null, gender: 'female' }]);
  const [activeCharTab, setActiveCharTab] = useState<number>(1);

  const [refImage, setRefImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  const [showSampleModal, setShowSampleModal] = useState(false);
  const [samplePrompts, setSamplePrompts] = useState<SamplePrompt[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [currentCategoryName, setCurrentCategoryName] = useState('');

  // Pagination State
  const SAMPLES_PER_PAGE = 20;
  const [samplePage, setSamplePage] = useState(0);
  const [hasMoreSamples, setHasMoreSamples] = useState(true);

  // Default Resolution 1K
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('VIP 1');
  const [gptQuality, setGptQuality] = useState<'low' | 'medium' | 'high'>('high');
  const [aiModel, setAiModel] = useState<TstGenerationTier>('flash');

  const [guideTopic, setGuideTopic] = useState<'chars' | 'settings' | null>(null);
  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState<string | null>(null);
  const [guideImages, setGuideImages] = useState<GenerationGuideImagesConfig>({ characterUrl: '', sampleUrl: '' });
  const [hoveredGuidePreview, setHoveredGuidePreview] = useState<'character' | 'sample' | null>(null);
  const [guidePreviewCacheKey] = useState(() => Date.now());

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [assistLoadingByCharId, setAssistLoadingByCharId] = useState<Record<number, CharacterAssistantToolId | null>>({});
  const [assistantErrorByCharId, setAssistantErrorByCharId] = useState<Record<number, string | null>>({});
  const [guideImageMeta, setGuideImageMeta] = useState<Record<'character' | 'sample', { width: number; height: number } | null>>({
      character: null,
      sample: null,
  });
  const guidePreviewUrls = useMemo(() => ({
      character: guideImages.characterUrl
          ? `${guideImages.characterUrl}${guideImages.characterUrl.includes('?') ? '&' : '?'}guide_preview=${guidePreviewCacheKey}`
          : '',
      sample: guideImages.sampleUrl
          ? `${guideImages.sampleUrl}${guideImages.sampleUrl.includes('?') ? '&' : '?'}guide_preview=${guidePreviewCacheKey}`
          : '',
  }), [guideImages.characterUrl, guideImages.sampleUrl, guidePreviewCacheKey]);

  // --- NEW: COOLDOWN STATE ---
  const [cooldownRemaining, setCooldownRemaining] = useState(() => {
      const saved = localStorage.getItem('gen_cooldown_end');
      if (saved) {
          const end = parseInt(saved, 10);
          const now = Date.now();
          if (end > now) {
              return Math.ceil((end - now) / 1000);
          }
      }
      return 0;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId?: number, type: 'body' | 'ref' } | null>(null);

  // --- NEW: STYLE PRESET STATE ---
  const [activeStylePreset, setActiveStylePreset] = useState<string | null>(null);
  const [availableStyles, setAvailableStyles] = useState<any[]>([]);

  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [runtimeModels, setRuntimeModels] = useState<TstRuntimeModel[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConcurrencyExpanded, setIsConcurrencyExpanded] = useState(false);
  const activeFeature = APP_CONFIG.main_features.find((entry) => entry.id === MODE_TO_FEATURE_ID[activeMode]) || feature;

  useEffect(() => {
      if (!refImage) return;

      setPrompt((previous) => {
          const normalized = previous.trim();
          if (normalized.includes(SAMPLE_IMAGE_PROMPT_LOCK)) {
              return previous;
          }

          return normalized
              ? `${SAMPLE_IMAGE_PROMPT_LOCK}\n\n${normalized}`
              : SAMPLE_IMAGE_PROMPT_LOCK;
      });
  }, [refImage]);

  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
      modelId: row.model_id,
      optionId: row.option_id,
      auditionPriceVcoin: row.audition_price_vcoin,
  }));

  const generationSpeedId = uiSpeedToTst(speed) || 'fast';
  const generationServerId = uiServerToTst(server) || 'fast';
  const generationTier = aiModel;
  const availableResolutions = getCompatibleGenerationResolutions({
      tier: generationTier,
      pricingEntries,
      serverId: generationServerId,
      speed: generationSpeedId,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
  });
  const availableSpeeds = getCompatibleGenerationSpeeds({
      tier: generationTier,
      pricingEntries,
      resolution,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
  });
  const availableServers = getCompatibleGenerationServers({
      tier: generationTier,
      pricingEntries,
      speed: generationSpeedId,
      resolution,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
  });
  const selectedGenerationCost = getGenerationCostBreakdown({
      tier: generationTier,
      resolution,
      quality: aiModel === 'gpt' ? gptQuality : undefined,
      speed: generationSpeedId,
      serverId: generationServerId,
      pricingEntries,
      pricingOverrides
  });
  const flashResolutionCosts = getResolutionCostMap({
      tier: 'flash',
      speed: generationSpeedId,
      serverId: generationServerId,
      pricingEntries,
      pricingOverrides
  });
  const proResolutionCosts = getResolutionCostMap({
      tier: 'pro',
      speed: generationSpeedId,
      serverId: generationServerId,
      pricingEntries,
      pricingOverrides
  });
  const gptResolutionCosts = getResolutionCostMap({
      tier: 'gpt',
      quality: gptQuality,
      speed: generationSpeedId,
      serverId: generationServerId,
      pricingEntries,
      pricingOverrides
  });
  const prices = {
      flash_1k: flashResolutionCosts['1K'].vcoin,
      flash_2k: flashResolutionCosts['2K'].vcoin,
      flash_4k: flashResolutionCosts['4K'].vcoin,
      pro_1k: proResolutionCosts['1K'].vcoin,
      pro_2k: proResolutionCosts['2K'].vcoin,
      pro_4k: proResolutionCosts['4K'].vcoin,
      gpt_1k: gptResolutionCosts['1K'].vcoin,
      gpt_2k: gptResolutionCosts['2K'].vcoin,
      gpt_4k: gptResolutionCosts['4K'].vcoin,
  };
  const runtimeImageModelIds = new Set(
      runtimeModels
          .filter((model) => model.type === 'image')
          .map((model) => model.model.trim().toLowerCase())
  );
  const isFlashAvailable =
      runtimeImageModelIds.has(getGenerationModelId('flash')) &&
      pricingEntries.some((entry) => entry.model.trim().toLowerCase() === getGenerationModelId('flash'));
  const isProAvailable =
      runtimeImageModelIds.has(getGenerationModelId('pro')) &&
      pricingEntries.some((entry) => entry.model.trim().toLowerCase() === getGenerationModelId('pro'));
  const isGptAvailable =
      runtimeImageModelIds.has(getGenerationModelId('gpt')) &&
      pricingEntries.some((entry) => entry.model.trim().toLowerCase() === getGenerationModelId('gpt'));
  const imageModelAvailability: Record<TstGenerationTier, boolean> = {
      flash: isFlashAvailable,
      pro: isProAvailable,
      gpt: isGptAvailable,
  };
  const isCatalogReady = !catalogLoading && !catalogError && pricingEntries.length > 0 && runtimeModels.length > 0;
  const hasCharacterImagesReady = characters.every((char) => !!char.bodyImage);
  const isAnyCharacterAssistRunning = characters.some((char) => !!assistLoadingByCharId[char.id]);
  const isGenerateDisabled =
      cooldownRemaining > 0 ||
      !isCatalogReady ||
      !selectedGenerationCost.available ||
      !prompt.trim() ||
      !hasCharacterImagesReady ||
      isAnyCharacterAssistRunning ||
      (aiModel === 'flash' ? !isFlashAvailable : aiModel === 'pro' ? !isProAvailable : !isGptAvailable);
  const availableSpeedLabels = availableSpeeds.map((speedId) => speedId === 'slow' ? 'Tiết Kiệm' : 'Nhanh');
  const availableServerLabels = availableServers.map((serverId) => tstServerToUi(serverId));
  const removeBgCost = getVertexEditToolCostBreakdown({
      toolId: 'remove_bg_pro',
      tier: 'flash',
      resolution: CHARACTER_ASSISTANT_RESOLUTION,
      pricingOverrides,
  });
  const sharpenCost = getVertexEditToolCostBreakdown({
      toolId: 'sharpen_upscale',
      tier: 'flash',
      resolution: CHARACTER_ASSISTANT_RESOLUTION,
      pricingOverrides,
  });

  useEffect(() => {
      // Load Default Style Preset
      const loadStyle = async () => {
          const presets = await getStylePresets();
          setAvailableStyles(presets || []);

          const def = presets.find((p: any) => p.is_default);
          if (def) {
              setActiveStylePreset(def.image_url);
              console.log("Loaded Master Style:", def.name);
          }
      };
      loadStyle();

      const loadCatalog = async (forceRefresh = false) => {
          try {
              const [entries, models, pricingConfig, serverAvailabilityConfig] = await Promise.all([
                  fetchTstPricing(forceRefresh),
                  fetchTstModels(forceRefresh),
                  getModelPricing(),
                  getTstServerAvailabilityConfig()
              ]);
              const filteredModels = applyServerAvailabilityToRuntimeModels(models, serverAvailabilityConfig);
              setPricingEntries(sanitizePricingEntriesWithRuntimeModels(entries, filteredModels, serverAvailabilityConfig));
              setRuntimeModels(filteredModels);
              setAuditionPricing(pricingConfig || []);
              setCatalogError(null);
          } catch (error) {
              console.warn("Failed to load live TST catalog for generation tool", error);
              setPricingEntries([]);
              setRuntimeModels([]);
              setCatalogError(lang === 'vi' ? 'TST đang bảo trì hoặc không sẵn sàng.' : 'TST is unavailable.');
          } finally {
              setCatalogLoading(false);
          }
      };
      loadCatalog();

      const loadTutorialVideo = async () => {
          const videoConfig = await getTutorialVideo();
          if (videoConfig && videoConfig.isActive && videoConfig.url) {
              let videoId = TUTORIAL_VIDEO_ID;
              try {
                  const urlStr = videoConfig.url.trim();
                  // Check if it's just an 11-character ID
                  if (/^[a-zA-Z0-9_-]{11}$/.test(urlStr)) {
                      videoId = urlStr;
                  } else {
                      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|live\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                      const match = urlStr.match(regExp);
                      if (match && match[2].length === 11) {
                          videoId = match[2];
                      }
                  }
              } catch (e) {
                  console.warn("Invalid video URL format", e);
              }
              setTutorialVideoUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`);
          } else {
              setTutorialVideoUrl(null);
          }
      };
      loadTutorialVideo();

      const loadGuideImages = async () => {
          const config = await getGenerationGuideImages();
          setGuideImages(config);
      };
      loadGuideImages();
  }, []);

  useEffect(() => {
      const entries: Array<['character' | 'sample', string]> = [
          ['character', guidePreviewUrls.character],
          ['sample', guidePreviewUrls.sample],
      ];

      entries.forEach(([key, source]) => {
          if (!source) {
              setGuideImageMeta((prev) => ({ ...prev, [key]: null }));
              return;
          }

          const image = new Image();
          image.onload = () => {
              setGuideImageMeta((prev) => ({
                  ...prev,
                  [key]: { width: image.naturalWidth, height: image.naturalHeight },
              }));
          };
          image.onerror = () => {
              setGuideImageMeta((prev) => ({ ...prev, [key]: null }));
          };
          image.src = source;
      });
  }, [guidePreviewUrls.character, guidePreviewUrls.sample]);
  // -------------------------------

  // --- COOLDOWN TIMER EFFECT ---
  useEffect(() => {
      if (cooldownRemaining > 0) {
          const timer = setInterval(() => {
              setCooldownRemaining(prev => {
                  if (prev <= 1) {
                      localStorage.removeItem('gen_cooldown_end');
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
          return () => clearInterval(timer);
      }
  }, [cooldownRemaining]);

  // Helper to start cooldown
  const startCooldown = (seconds: number) => {
      setCooldownRemaining(seconds);
      localStorage.setItem('gen_cooldown_end', (Date.now() + seconds * 1000).toString());
  };

  useEffect(() => {
      const interval = setInterval(() => {
          setCurrentTipIdx(prev => (prev + 1) % SMART_TIPS.length);
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feature.id.includes('couple')) handleModeChange('couple');
    else if (feature.id.includes('group_3')) handleModeChange('group3');
    else if (feature.id.includes('group_4')) handleModeChange('group4');
    else if (feature.id.includes('group_5')) handleModeChange('group5');
    else handleModeChange('single');
  }, [feature]);

  useEffect(() => {
      let interval: any;
      if (stage === 'processing') {
          interval = setInterval(() => {
              setElapsedSeconds(prev => prev + 1);
          }, 1000);
      } else {
          setElapsedSeconds(0);
      }
      return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
      if (aiModel === 'flash' && !isFlashAvailable && isProAvailable) {
          setAiModel('pro');
      } else if (aiModel === 'pro' && !isProAvailable && isFlashAvailable) {
          setAiModel('flash');
      } else if (aiModel === 'gpt' && !isGptAvailable && isProAvailable) {
          setAiModel('pro');
      }
  }, [aiModel, isFlashAvailable, isGptAvailable, isProAvailable]);

  useEffect(() => {
      const requestedSpeedId = uiSpeedToTst(speed) || 'fast';
      const requestedServerId = uiServerToTst(server) || 'fast';
      const nextSelection = resolveGenerationSelection({
          tier: aiModel,
          pricingEntries,
          resolution,
          quality: aiModel === 'gpt' ? gptQuality : undefined,
          speed: requestedSpeedId,
          serverId: requestedServerId,
      });
      if (!nextSelection.available) {
          return;
      }
      if (nextSelection.resolution !== resolution) {
          setResolution(nextSelection.resolution as Resolution);
          return;
      }
      const nextServerLabel = tstServerToUi(nextSelection.serverId);
      if (nextServerLabel !== server) {
          setServer(nextServerLabel);
          return;
      }
      const nextSpeedLabel = nextSelection.speed === 'slow' ? 'Tiết Kiệm' : 'Nhanh';
      if (nextSpeedLabel !== speed) {
          setSpeed(nextSpeedLabel);
      }
  }, [aiModel, gptQuality, pricingEntries, resolution, server, speed]);

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleModeChange = (mode: GenMode) => {
      setActiveMode(mode);
      setActiveCharTab(1);
      let count = 1;
      if (mode === 'couple') count = 2;
      if (mode === 'group3') count = 3;
      if (mode === 'group4') count = 4;
      if (mode === 'group5') count = 5;

      setCharacters(prev => {
          const newChars = [];
          for (let i = 1; i <= count; i++) {
              const existing = prev.find(p => p.id === i);
              newChars.push(existing || { id: i, bodyImage: null, gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female' });
          }
          return newChars;
      });
  };

  const fetchSamplePrompts = async (isLoadMore = false) => {
      if (!caulenhauClient) {
          notify("Chưa kết nối database mẫu.", "error");
          return;
      }
      setLoadingSamples(true);

      try {
          let targetCategoryId = 2;
          let catName = "Ảnh Nam Nữ";

          if (activeMode === 'single') {
              targetCategoryId = 2;
              catName = "Ảnh Nam Nữ";
          } else if (activeMode === 'couple') {
              targetCategoryId = 3;
              catName = "Ảnh Couple";
          } else if (activeMode.startsWith('group')) {
              targetCategoryId = 4;
              catName = "Ảnh Nhóm";
          }
          setCurrentCategoryName(catName);

          const pageToFetch = isLoadMore ? samplePage + 1 : 0;
          const from = pageToFetch * SAMPLES_PER_PAGE;
          const to = from + SAMPLES_PER_PAGE - 1;

          const { data, error } = await caulenhauClient
              .from('images')
              .select(`id, image_url, prompt, image_categories!inner(category_id)`)
              .eq('image_categories.category_id', targetCategoryId)
              .order('created_at', { ascending: false })
              .range(from, to);

          if (error) throw error;

          if (data) {
              const newSamples = data.map((item: any) => ({
                  id: item.id,
                  image_url: item.image_url,
                  prompt: item.prompt,
                  category: catName
              }));

              if (isLoadMore) {
                  setSamplePrompts(prev => [...prev, ...newSamples]);
                  setSamplePage(pageToFetch);
              } else {
                  setSamplePrompts(newSamples);
                  setSamplePage(0);
              }

              setHasMoreSamples(data.length === SAMPLES_PER_PAGE);
          } else {
              if (!isLoadMore) setSamplePrompts([]);
              setHasMoreSamples(false);
          }
      } catch (e: any) {
          console.error("Fetch samples error", e);
          notify(`Lỗi tải dữ liệu: ${e.message}`, 'error');
          if (!isLoadMore) setSamplePrompts([]);
      } finally {
          setLoadingSamples(false);
      }
  };

  const handleOpenSamples = () => {
      setShowSampleModal(true);
      fetchSamplePrompts(false);
  };

  const handleSelectSample = (sample: SamplePrompt) => {
      if (sample.prompt) {
          setPrompt(sample.prompt);
          setShowSampleModal(false);
          notify("Đã áp dụng Prompt mẫu!", "success");
      } else {
          notify("Mẫu này không có prompt.", "warning");
      }
  };

  const handleUploadClick = (charId: number) => {
      activeUploadType.current = { charId, type: 'body' };
      fileInputRef.current?.click();
  };

  const handleRefUploadClick = () => {
      activeUploadType.current = { type: 'ref' };
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeUploadType.current) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const result = reader.result as string;
          const currentType = activeUploadType.current;

          if (currentType?.type === 'ref') {
             setRefImage(result);
          } else if (currentType?.charId && currentType.type === 'body') {
              setCharacters(prev => prev.map(c => c.id === currentType.charId ? { ...c, bodyImage: result } : c));
              setAssistantErrorByCharId((prev) => ({ ...prev, [currentType.charId!]: null }));
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const toggleGender = (charId: number, gender: 'male' | 'female') => {
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, gender } : c));
  }

  const handleForceDownload = async (url: string, filename: string) => {
      if (!url) return;
      notify(lang === 'vi' ? 'Đang tải xuống...' : 'Downloading...', 'info');

      try {
          await downloadAssetToBrowser(url, filename);
          notify('Đã lưu ảnh về máy!', 'success');
      } catch (e) {
          console.error("Download failed", e);
          notify(lang === 'vi' ? 'Tải ảnh thất bại.' : 'Image download failed.', 'error');
      }
  };

  const calculateCost = () => {
      const baseCost = selectedGenerationCost.vcoin;

      const modeMultiplier = activeMode === 'single'
          ? 1
          : activeMode === 'couple'
              ? 2
              : activeMode === 'group3'
                  ? 3
                  : activeMode === 'group4'
                      ? 4
                      : 5;

      return baseCost * modeMultiplier;
  };

  const addLog = (msg: string) => {
      setProgressLogs(prev => [...prev, msg]);
      setProgressMsg(msg);
  };

  const handleCharacterAssistant = async (charId: number, toolId: CharacterAssistantToolId) => {
      const character = characters.find((item) => item.id === charId);
      if (!character?.bodyImage) {
          notify('Vui lòng tải ảnh nhân vật trước.', 'warning');
          return;
      }

      const pricing = toolId === 'remove_bg_pro' ? removeBgCost : sharpenCost;
      if (!pricing.available) {
          notify('Công cụ này hiện chưa khả dụng.', 'error');
          return;
      }

      const user = await getUserProfile();
      if ((user.vcoin_balance || 0) < pricing.vcoin) {
          notify(`Số dư không đủ, cần ${pricing.vcoin} Vcoin.`, 'error');
          return;
      }

      setAssistLoadingByCharId((prev) => ({ ...prev, [charId]: toolId }));
      setAssistantErrorByCharId((prev) => ({ ...prev, [charId]: null }));
      try {
          const result = await runCharacterAssistantAction({
              sourceImage: character.bodyImage,
              toolId,
              costVcoin: pricing.vcoin,
              storageFolder: `inputs/character-assist/${toolId}/character-${charId}`,
              showInGenerationHistory: false,
          });

          if (!result.imageUrl) {
              throw new Error('Vertex AI không trả về ảnh kết quả.');
          }

          const refreshedUrl = result.imageUrl.includes('?')
              ? `${result.imageUrl}&t=${Date.now()}`
              : `${result.imageUrl}?t=${Date.now()}`;
          setCharacters((prev) => prev.map((item) => (
              item.id === charId
                  ? { ...item, bodyImage: refreshedUrl || item.bodyImage }
                  : item
          )));
          window.dispatchEvent(new Event('balance_updated'));
          notify(
              toolId === 'remove_bg_pro'
                  ? 'Đã tách nền xong cho ảnh nhân vật.'
                  : 'Đã làm nét xong cho ảnh nhân vật.',
              'success',
          );
      } catch (error) {
          console.error('[GenerationTool] Character assistant failed', error);
          setAssistantErrorByCharId((prev) => ({
              ...prev,
              [charId]: error instanceof Error ? error.message : 'Không thể xử lý ảnh lúc này.',
          }));
          notify(error instanceof Error ? error.message : 'Không thể xử lý ảnh lúc này.', 'error');
      } finally {
          setAssistLoadingByCharId((prev) => ({ ...prev, [charId]: null }));
      }
  };

  const handleGenerate = async () => {
    if (isSubmitting) {
        return;
    }

    if (cooldownRemaining > 0) {
        notify(`Vui lòng đợi ${cooldownRemaining} giây trước khi tạo ảnh tiếp theo.`, 'warning');
        return;
    }

    if (!isCatalogReady) {
        notify(lang === 'vi' ? 'TST đang bảo trì hoặc không sẵn sàng.' : 'TST is unavailable.', 'error');
        return;
    }

    if (!selectedGenerationCost.available) {
        notify(lang === 'vi' ? 'Cấu hình đang chọn không còn khả dụng trên TST.' : 'Selected configuration is not available on TST.', 'error');
        return;
    }

    try {
        if (queueStats.myImageProcessing >= CONCURRENCY_LIMITS.user.imageProcessing && queueStats.myQueued >= CONCURRENCY_LIMITS.user.queued) {
            notify(lang === 'vi' ? 'Bạn đã đạt giới hạn 1 luồng tạo ảnh và 1 hàng chờ. Vui lòng đợi.' : 'You have reached the limit of 1 image processing slot and 1 queued job. Please wait.', 'warning');
            return;
        }

        if (queueStats.systemQueued >= CONCURRENCY_LIMITS.system.queued) {
            notify(lang === 'vi' ? 'Hệ thống đang quá tải (Hàng chờ đầy). Vui lòng thử lại sau ít phút.' : 'System is overloaded (Queue full). Please try again later.', 'error');
            return;
        }
    } catch (error) {
        console.error('Failed to check concurrency limit', error);
    }

    if (!prompt.trim()) {
        notify(lang === 'vi' ? 'Vui lòng nhập mô tả' : 'Please enter a prompt', 'warning');
        return;
    }

    const missingCharacterSlots = characters
        .filter((char) => !char.bodyImage)
        .map((char) => char.id);

    if (missingCharacterSlots.length > 0) {
        notify(
            lang === 'vi'
                ? `Thiếu ảnh tham chiếu cho nhân vật ${missingCharacterSlots.join(', ')}. Vui lòng tải đủ tất cả nhân vật trước khi tạo ảnh.`
                : `Missing reference images for character slot(s): ${missingCharacterSlots.join(', ')}.`,
            'warning',
        );
        return;
    }

    const characterBodySources = characters.map((char) => char.bodyImage).filter((value): value is string => Boolean(value));
    if (new Set(characterBodySources).size !== characterBodySources.length) {
        notify(
            lang === 'vi'
                ? 'Có ít nhất 2 slot nhân vật đang dùng cùng một ảnh. Vui lòng kiểm tra lại ảnh NV1/NV2 trước khi tạo.'
                : 'At least 2 character slots are using the same image. Please check the uploaded characters.',
            'error',
        );
        return;
    }

    const cost = calculateCost();
    const user = await getUserProfile();

    if ((user.vcoin_balance || 0) < cost) {
        notify(lang === 'vi' ? 'Số dư không đủ!' : 'Insufficient balance!', 'error');
        return;
    }

    addLog(lang === 'vi' ? 'Hệ thống đang khởi động...' : 'System starting...');
    setIsSubmitting(true);
    const queuedJobId = crypto.randomUUID();

    const styleMetadata = availableStyles.find((style: any) => style.image_url === activeStylePreset);
    const styleDirectivePrompt = buildAuditionKoreaMmoStylePrompt(styleMetadata?.trigger_prompt || styleMetadata?.name || null);
    const basePrompt = `${activeFeature.defaultPrompt || ''}${prompt}`.trim();
    const requestedSpeedId = uiSpeedToTst(speed) || 'fast';
    const requestedServerId = uiServerToTst(server) || 'fast';
    const compatibleServers = getCompatibleGenerationServers({
        tier: aiModel,
        pricingEntries,
        speed: requestedSpeedId,
        resolution,
        quality: aiModel === 'gpt' ? gptQuality : undefined,
    });
    const effectiveServerId = compatibleServers.includes(requestedServerId)
        ? requestedServerId
        : (compatibleServers[0] || requestedServerId);
    const compatibleSpeeds = getCompatibleGenerationSpeeds({
        tier: aiModel,
        pricingEntries,
        serverId: effectiveServerId,
        resolution,
        quality: aiModel === 'gpt' ? gptQuality : undefined,
    });
    const effectiveSpeedId = compatibleSpeeds.includes(requestedSpeedId)
        ? requestedSpeedId
        : (compatibleSpeeds[0] || requestedSpeedId);
    const queuedImage: GeneratedImage = {
        id: queuedJobId,
        url: '',
        prompt: basePrompt,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        assetType: 'image',
        toolId: activeFeature.id,
        toolName: activeFeature.name['en'],
        engine: aiModel === 'flash' ? `Flash Engine ${resolution}` : aiModel === 'pro' ? `Pro Engine ${resolution}` : `GPT Engine ${resolution}`,
        status: 'queued',
        jobId: queuedJobId,
        progress: 0,
        cost,
    };

    try {
        await saveImageToLocalCache(queuedImage);
    } catch (placeholderError) {
        console.warn('[GenerationTool] Failed to persist queued placeholder', placeholderError);
    }

    onNavigateView?.('gallery');

    void (async () => {
        try {
            const stagedCharacterGroups = (
                await Promise.all(
                    characters.map(async (char, charIndex) => {
                        const references: CharacterReferenceGroup['references'] = [];
                        let appearanceProfile: CharacterReferenceGroup['appearanceProfile'];

                        if (char.bodyImage) {
                            appearanceProfile = await analyzeCharacterAppearanceProfile(char.bodyImage);
                            const stagedBody = await tryStageGenerationInput(
                                char.bodyImage,
                                `inputs/generation/${activeMode}/character-${charIndex + 1}/body`,
                            );
                            if (stagedBody) {
                                references.push({ source: stagedBody, kind: 'body' });
                            }
                        }

                        return {
                            characterIndex: charIndex + 1,
                            gender: char.gender,
                            appearanceProfile,
                            references,
                        } satisfies CharacterReferenceGroup;
                    })
                )
            ).filter((group) => group.references.length > 0);

            if (stagedCharacterGroups.length !== characters.length) {
                throw new Error(`CRITICAL FAILURE: Expected ${characters.length} character reference groups but only prepared ${stagedCharacterGroups.length}.`);
            }

            const stagedCharacterImages = stagedCharacterGroups.flatMap((group) => group.references.map((reference) => reference.source));

            const stagedSampleImage = refImage
                ? await tryStageGenerationInput(refImage, `inputs/generation/${activeMode}/sample`)
                : null;
            const notifyInputMedia = [
                ...(stagedSampleImage
                    ? [{
                        url: stagedSampleImage,
                        role: 'sample' as const,
                        kind: 'image' as const,
                        userProvided: true,
                    }]
                    : []),
                ...stagedCharacterGroups.flatMap((group) => {
                    return group.references.map((reference) => ({
                        url: reference.source,
                        role: 'character' as const,
                        kind: 'image' as const,
                        userProvided: true,
                    }));
                }),
            ];

            const queuePayload: ImageGenerateRecipePayload = {
                recipeType: 'image_generate_recipe_v1',
                modelId: getGenerationModelId(aiModel),
                prompt: basePrompt,
                userPromptInput: prompt.trim(),
                systemPromptPrefix: activeFeature.defaultPrompt || '',
                characterCount: characters.length,
                resolution,
                aspectRatio,
                quality: aiModel === 'gpt' ? gptQuality : undefined,
                speed: effectiveSpeedId,
                serverId: effectiveServerId,
                negativePrompt: DEFAULT_IMAGE_NEGATIVE_PROMPT,
                characterReferenceGroups: stagedCharacterGroups,
                characterImages: stagedCharacterImages,
                sampleImage: stagedSampleImage || null,
                sampleAnalysisImage: stagedSampleImage || null,
                styleImage: null,
                styleAnalysisImage: null,
                stylePrompt: styleDirectivePrompt,
                __notifyInputMedia: notifyInputMedia,
            };

            await enqueueServerJob({
                id: queuedJobId,
                prompt: basePrompt,
                toolId: activeFeature.id,
                toolName: activeFeature.name['en'],
                engine: aiModel === 'flash' ? `Flash Engine ${resolution}` : aiModel === 'pro' ? `Pro Engine ${resolution}` : `GPT Engine ${resolution}`,
                assetType: 'image',
                costVcoin: cost,
                queueKind: 'image_generate',
                clientPlatform: 'desktop',
                queuePayload,
            });

            window.dispatchEvent(new Event('balance_updated'));
            notify(
                lang === 'vi'
                    ? 'Đã tạo job. Kết quả sẽ được cập nhật realtime trong Lịch sử.'
                    : 'Job submitted. Progress will update in History in realtime.',
                'success'
            );
            startCooldown(60);
        } catch (error) {
            console.error(error);
            const errorMsg = error instanceof Error ? error.message : (lang === 'vi' ? 'Lỗi không xác định' : 'Unknown Error');
            try {
                await saveImageToLocalCache({
                    ...queuedImage,
                    status: 'failed',
                    error: errorMsg,
                    updatedAt: Date.now(),
                    progress: 0,
                });
            } catch (persistError) {
                console.warn('[GenerationTool] Failed to persist failed queued placeholder', persistError);
            }
            notify(errorMsg, 'error');
            setIsSubmitting(false);
        }
    })();

    return;
  };

  const ratios = [
      { id: '1:1', label: '1:1', desc: 'Vuông' },
      { id: '9:16', label: '9:16', desc: 'Story' },
      { id: '16:9', label: '16:9', desc: 'Cinema' },
      { id: '3:4', label: '3:4', desc: 'Dọc' },
      { id: '4:3', label: '4:3', desc: 'Ngang' },
  ];

  const renderGuideContent = () => {
      switch(guideTopic) {
          case 'chars':
              return (
                  <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                      <h3 className="text-xl font-bold text-audi-yellow flex items-center gap-2 border-b border-white/10 pb-2 sticky top-0 bg-[#12121a] z-10">
                          <Icons.BookOpen className="w-6 h-6" /> Hướng Dẫn Tạo Ảnh Chi Tiết
                      </h3>

                      {/* Chuẩn bị nguyên liệu */}
                      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                              <span className="bg-audi-cyan text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase">Bước 1</span>
                              <span className="text-sm font-bold text-audi-cyan">Chuẩn Bị Nguyên Liệu</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                              Để AI vẽ chính xác, ảnh nhân vật của bạn phải đạt chuẩn:
                          </p>
                          <ul className="text-xs text-slate-300 space-y-2 list-disc pl-4">
                              <li>
                                  <b>Phải tách nền:</b> Ảnh nhân vật cần được tách nền sạch sẽ (phông nền trong suốt hoặc đen/trắng trơn).
                                  <br/><span className="text-slate-400 italic">Nếu ảnh chưa tách nền, hãy dùng công cụ <b className="text-audi-cyan">Tách Nền</b> trước.</span>
                              </li>
                              <li>
                                  <b>Phải sắc nét:</b> Khuôn mặt và trang phục phải rõ nét, không bị mờ nhòe.
                                  <br/><span className="text-slate-400 italic">Nếu ảnh mờ, hãy dùng công cụ <b className="text-audi-pink">Làm Nét</b> để nâng cấp chất lượng.</span>
                              </li>
                          </ul>

                          <div className="mt-3 p-3 bg-audi-cyan/10 border border-audi-cyan/30 rounded-lg flex items-start gap-3">
                              <Icons.Sparkles className="w-5 h-5 text-audi-cyan shrink-0 mt-0.5" />
                              <div>
                                  <h4 className="text-xs font-bold text-audi-cyan mb-1">Mẹo: Lấy nguyên liệu cực nhanh</h4>
                                  <p className="text-[11px] text-slate-300">
                                      Bạn chưa có ảnh nhân vật? Hãy truy cập ngay <a href="https://aumix3d.com/" target="_blank" rel="noopener noreferrer" className="text-white font-bold underline hover:text-audi-cyan transition-colors">AuMix3D.com</a> để tự do mix đồ từ hàng ngàn item và chụp ảnh tách nền chất lượng cao chỉ trong 1 nốt nhạc!
                                  </p>
                              </div>
                          </div>
                      </div>

                      {/* Các bước tạo ảnh */}
                      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                              <span className="bg-audi-pink text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Bước 2</span>
                              <span className="text-sm font-bold text-audi-pink">Thiết Lập Tạo Ảnh</span>
                          </div>

                          <div className="space-y-3">
                              <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                  <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1"><Icons.User className="w-3 h-3 text-audi-cyan"/> 1. Tải Ảnh Nhân Vật</h4>
                                  <p className="text-[11px] text-slate-400">Tải bức ảnh đã chuẩn bị ở Bước 1 lên. AI sẽ dùng ảnh này để học khuôn mặt, kiểu tóc, trang phục và phụ kiện của nhân vật.</p>
                              </div>

                              <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                  <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1"><Icons.Image className="w-3 h-3 text-audi-yellow"/> 2. Ảnh Mẫu (Reference)</h4>
                                  <p className="text-[11px] text-slate-400">Ảnh mẫu dùng để AI học <b>Tư thế (Pose)</b>, <b>Góc máy</b> và <b>Bối cảnh (Background)</b>. AI sẽ KHÔNG lấy khuôn mặt hay quần áo từ ảnh mẫu này.</p>
                              </div>

                              <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                  <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1"><Icons.MessageSquare className="w-3 h-3 text-green-400"/> 3. Viết Prompt (Câu lệnh)</h4>
                                  <p className="text-[11px] text-slate-400 mb-2">Prompt dùng để miêu tả phong cách, ánh sáng, chất lượng ảnh. Nếu bạn có dùng Ảnh Mẫu, <b>BẮT BUỘC</b> thêm đoạn prompt sau để AI không bị nhầm lẫn:</p>
                                  <div className="bg-black/50 p-2 rounded border border-green-500/30 text-[10px] text-green-300 font-mono">
                                      "Sử dụng quần áo, trang phục, kiểu tóc, gương mặt, lớp hoá trang makeup, biểu cảm, phụ kiện, giày dép của ảnh tham chiếu nam và nữ tải lên. Không sử dụng quần áo, trang phục, kiểu tóc, gương mặt, lớp hoá trang makeup, biểu cảm, phụ kiện, giày dép của ảnh mẫu."
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Chọn Model */}
                      <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                              <span className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase">Bước 3</span>
                              <span className="text-sm font-bold text-white">Chọn Mô Hình AI</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                              <div className="bg-black/30 p-3 rounded-lg border border-audi-cyan/30">
                                  <h4 className="text-xs font-bold text-audi-cyan mb-1">Mô hình Flash (Nhanh, Rẻ)</h4>
                                  <p className="text-[10px] text-slate-400">Tốc độ tạo ảnh cực nhanh, chi phí thấp. Phù hợp để test prompt hoặc tạo ảnh nháp. Chất lượng chi tiết và độ khối 3D ở mức khá.</p>
                              </div>
                              <div className="bg-black/30 p-3 rounded-lg border border-audi-pink/30">
                                  <h4 className="text-xs font-bold text-audi-pink mb-1">Mô hình Pro (Chất lượng cao)</h4>
                                  <p className="text-[10px] text-slate-400">Chất lượng hình ảnh xuất sắc, chi tiết sắc nét, độ khối 3D chân thực, hiểu lệnh prompt cực tốt. Phù hợp để tạo ảnh thành phẩm cuối cùng.</p>
                              </div>
                          </div>
                      </div>
                  </div>
              );
          case 'settings':
              return (
                  <div className="space-y-4">
                      <h3 className="text-xl font-bold text-audi-yellow flex items-center gap-2 border-b border-white/10 pb-2">
                          <Icons.Settings className="w-6 h-6" /> Cấu hình Nâng cao
                      </h3>

                      <div className="space-y-3">
                          <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                              <div className="p-2 bg-audi-cyan/20 rounded-lg text-audi-cyan">
                                  <Icons.Cpu className="w-5 h-5" />
                              </div>
                              <div>
                                  <h4 className="text-sm font-bold text-white">Model 3 Pro</h4>
                                  <p className="text-xs text-slate-400 mt-1">Sử dụng mô hình Pro mới nhất. Hiểu lệnh tốt hơn, chi tiết trang phục sắc nét hơn bản Flash.</p>
                              </div>
                          </div>

                          <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                              <div className="p-2 bg-white/10 rounded-lg text-white">
                                  <Icons.Monitor className="w-5 h-5" />
                              </div>
                              <div>
                                  <h4 className="text-sm font-bold text-white">Độ phân giải (Resolution)</h4>
                                  <div className="flex gap-2 mt-2">
                                      <span className="text-[10px] px-2 py-1 bg-black rounded border border-slate-600 text-slate-300">2K (Khuyên dùng)</span>
                                      <span className="text-[10px] px-2 py-1 bg-black rounded border border-audi-purple text-audi-purple">4K (In ấn)</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              );
          default: return null;
      }
  }

  if (stage === 'processing') {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in w-full max-w-md mx-auto">
              <div className="relative w-24 h-24 mb-8">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-audi-pink border-r-audi-purple border-b-transparent border-l-transparent animate-spin"></div>
                  <div className="absolute inset-4 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                      <Icons.Sparkles className="w-10 h-10 text-white" />
                  </div>
              </div>
              <h2 className="font-game text-2xl font-bold text-white mb-2 tracking-widest animate-neon-flash">
                  {lang === 'vi' ? 'AI ĐANG VẼ...' : 'GENERATING...'}
              </h2>
              <div className="text-4xl font-mono font-bold text-audi-yellow mb-4 animate-pulse">
                  {formatTime(elapsedSeconds)} <span className="text-sm text-slate-500">/ ~{formatTime(estimatedSeconds)}</span>
              </div>
              <p className="text-audi-cyan font-mono text-sm max-w-xs mx-auto mb-4 animate-pulse font-bold">
                  {progressMsg}
              </p>
              <div className="w-full bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-6 flex items-start gap-3 animate-pulse text-left">
                  <Icons.AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-400 font-bold leading-relaxed">
                      {lang === 'vi' ? 'Quá trình tạo ảnh thường mất từ 5-10 phút. Vui lòng chờ đợi quá trình tạo ảnh hoàn tất, không tải lại trang!' : 'Image generation usually takes 5-10 minutes. Please wait for the process to complete, do not reload the page!'}
                  </p>
              </div>
              <div className="w-full bg-[#12121a] border border-white/10 rounded-2xl p-4 space-y-2 shadow-2xl text-left h-48 overflow-y-auto custom-scrollbar">
                  {progressLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs font-mono border-b border-white/5 pb-1 last:border-0 animate-fade-in">
                          <span className="text-audi-pink"> &gt; </span>
                          <span className={idx === progressLogs.length - 1 ? 'text-white font-bold' : 'text-slate-400'}>{log}</span>
                      </div>
                  ))}
              </div>
              <button
                  onClick={() => {
                      setStage('input');
                      notify("Đã hủy tạo ảnh.", "info");
                  }}
                  className="mt-4 px-6 py-2 bg-white/10 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-full text-xs font-bold transition-all border border-white/5 hover:border-red-500/30 flex items-center gap-2"
              >
                  <Icons.X className="w-4 h-4" /> Hủy bỏ (Cancel)
              </button>
          </div>
      );
  }

  if (stage === 'result' && resultImage) {
      return (
          <div className="flex flex-col items-center animate-fade-in pb-20 w-full">
              <div className="w-full max-w-xl bg-[#090014] border border-white/10 rounded-3xl overflow-hidden shadow-2xl mx-auto">
                  <div className="flex justify-between items-center p-3 border-b border-white/10 bg-white/5">
                      <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-bold text-xs text-white">Kết quả (Pro Engine)</span>
                      </div>
                      <button onClick={() => setStage('input')} className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10">X</button>
                  </div>
                  <div className="relative bg-black/50 min-h-[300px] flex items-center justify-center p-4">
                      <img src={resultImage} alt="Result" className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/5" />
                  </div>
                  <div className="p-4 bg-[#12121a] flex flex-col gap-3">
                      <div className="flex gap-2">
                          <button
                            onClick={() => handleForceDownload(resultImage, `auditionai-image-${Date.now()}.png`)}
                            className="flex-1 px-4 py-2.5 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-audi-cyan transition-colors text-sm"
                          >
                              <Icons.Download className="w-4 h-4" /> Tải Về
                          </button>
                          <button onClick={() => setStage('input')} className="flex-1 px-4 py-2.5 bg-audi-pink text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors shadow-[0_0_15px_#FF0099] text-sm">
                              <Icons.Wand className="w-4 h-4" /> Tạo Tiếp
                          </button>
                      </div>
                      <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 animate-pulse">
                          <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-400 font-bold leading-relaxed">
                              LƯU Ý QUAN TRỌNG: Ảnh trong lịch sử tạo sẽ tự động bị xóa sau 7 ngày nếu chưa publish. Vui lòng ấn nút "Tải Về" để lưu ảnh xuống máy tính ngay bây giờ để tránh mất dữ liệu!
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  const TipIcon = SMART_TIPS[currentTipIdx].icon;

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto pb-12 animate-fade-in relative">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

        {showVideo && (
            <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-24 animate-fade-in" onClick={() => setShowVideo(false)}>
                <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.1)]" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => setShowVideo(false)}
                        className="absolute -top-10 right-0 md:top-4 md:right-4 bg-white/10 hover:bg-red-600 text-white p-2 rounded-full transition-colors z-50 backdrop-blur-md"
                    >
                        <Icons.X className="w-6 h-6" />
                    </button>
                    <iframe
                        className="w-full h-full"
                        src={tutorialVideoUrl || `https://www.youtube.com/embed/${TUTORIAL_VIDEO_ID}?autoplay=1&rel=0&playsinline=1`}
                        title="Hướng dẫn sử dụng"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                    ></iframe>
                </div>
            </div>
        )}

        {guideTopic && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-32 animate-fade-in" onClick={() => setGuideTopic(null)}>
                <div className="bg-[#12121a] w-full max-w-md p-6 rounded-2xl border border-audi-yellow/50 shadow-[0_0_30px_rgba(251,218,97,0.2)] relative" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setGuideTopic(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                        <Icons.X className="w-6 h-6" />
                    </button>
                    {renderGuideContent()}
                    <div className="mt-6 pt-4 border-t border-white/10 text-center">
                        <button onClick={() => setGuideTopic(null)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-colors">
                            Đã Hiểu
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showSampleModal && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowSampleModal(false)}>
                <div className="bg-[#12121a] w-full max-w-xl h-[500px] rounded-[2rem] border border-audi-purple/50 shadow-[0_0_50px_rgba(183,33,255,0.2)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                        <div className="flex items-center gap-2">
                            <Icons.Image className="w-5 h-5 text-audi-purple" />
                            <h3 className="font-bold text-white text-lg">Thư viện Prompt Mẫu</h3>
                            <span className="text-xs bg-audi-purple/20 text-audi-purple px-2 py-0.5 rounded border border-audi-purple/30 truncate max-w-[150px]">
                                {currentCategoryName || activeMode.toUpperCase()}
                            </span>
                        </div>
                        <button onClick={() => setShowSampleModal(false)} className="p-2 hover:bg-white/10 rounded-full text-white">
                            <Icons.X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/10">
                        {loadingSamples ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                                <Icons.Loader className="w-10 h-10 text-audi-purple animate-spin" />
                                <span className="text-slate-400 text-sm">Đang tải dữ liệu từ caulenhau.io.vn...</span>
                            </div>
                        ) : samplePrompts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                                <div className="p-4 bg-white/5 rounded-full">
                                    <Icons.Image className="w-12 h-12 opacity-30" />
                                </div>
                                <p>Chưa có mẫu nào cho chế độ này.</p>
                                <button
                                    onClick={() => fetchSamplePrompts(false)}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-white transition-colors"
                                >
                                    Thử lại
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {samplePrompts.map((sample) => (
                                    <div
                                        key={sample.id}
                                        onClick={() => handleSelectSample(sample)}
                                        className="group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border border-white/10 hover:border-audi-purple transition-all hover:scale-[1.02]"
                                    >
                                        <img src={sample.image_url} alt="Sample" className="w-full h-full object-cover" loading="lazy" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                            <span className="text-xs font-bold text-white text-center bg-audi-purple px-3 py-1 rounded-full shadow-lg">
                                                Sử dụng
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {hasMoreSamples && !loadingSamples && samplePrompts.length > 0 && (
                            <div className="w-full flex justify-center mt-6 pb-4">
                                <button
                                    onClick={() => fetchSamplePrompts(true)}
                                    className="px-6 py-2 bg-audi-purple/20 hover:bg-audi-purple/40 border border-audi-purple/50 rounded-full text-sm font-bold text-white transition-all flex items-center gap-2"
                                >
                                    Xem thêm
                                    <Icons.ArrowDown className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {loadingSamples && samplePrompts.length > 0 && (
                            <div className="w-full flex justify-center mt-6 pb-4">
                                <div className="px-6 py-2 bg-audi-purple/20 border border-audi-purple/50 rounded-full text-sm font-bold text-white flex items-center gap-2 opacity-70">
                                    <Icons.Loader className="w-4 h-4 animate-spin" />
                                    Đang tải...
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-3 border-t border-white/10 bg-black/20 text-center text-[10px] text-slate-500">
                        Dữ liệu được cung cấp bởi caulenhau.io.vn
                    </div>
                </div>
            </div>
        )}

        <div className="w-full flex justify-center mb-4">
            <div className="bg-[#12121a] p-1.5 rounded-2xl border border-white/10 flex gap-1 shadow-lg overflow-x-auto no-scrollbar max-w-full">
                {[
                    { id: 'single', label: { vi: 'Đơn', en: 'Single' }, icon: Icons.User },
                    { id: 'couple', label: { vi: 'Đôi', en: 'Couple' }, icon: Icons.Heart },
                    { id: 'group3', label: { vi: 'Nhóm 3', en: 'Group 3' }, icon: Icons.User },
                    { id: 'group4', label: { vi: 'Nhóm 4', en: 'Group 4' }, icon: Icons.User },
                    { id: 'group5', label: { vi: 'Nhóm 5', en: 'Group 5' }, icon: Icons.User },
                ].map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => handleModeChange(mode.id as GenMode)}
                        className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeMode === mode.id ? 'bg-white text-black shadow-md' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                    >
                        {mode.id === 'group4' || mode.id === 'group5' ? <div className="flex -space-x-1"><Icons.User className="w-3 h-3"/><Icons.User className="w-3 h-3"/></div> : <mode.icon className="w-3 h-3 md:w-4 md:h-4" />}
                        {mode.label[lang === 'vi' ? 'vi' : 'en']}
                    </button>
                ))}
            </div>
        </div>

        <div className="w-full bg-gradient-to-r from-orange-500/10 via-yellow-500/10 to-orange-500/10 border-y border-white/5 md:border md:rounded-xl md:mb-6 p-2 md:p-3 flex items-center justify-center gap-3 backdrop-blur-md overflow-hidden relative min-h-[40px]">
            <div key={currentTipIdx} className="flex items-center gap-2 animate-fade-in transition-all duration-500">
                <TipIcon className="w-4 h-4 md:w-5 md:h-5 text-audi-yellow shrink-0 animate-bounce-slow" />
                <span className="text-[10px] md:text-xs font-medium text-slate-200 line-clamp-2 md:line-clamp-1 text-center md:text-left">
                    {SMART_TIPS[currentTipIdx].text}
                </span>
            </div>
            <div className="absolute bottom-1 md:right-3 flex gap-1 justify-center w-full md:w-auto">
                {SMART_TIPS.map((_, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full transition-all ${i === currentTipIdx ? 'bg-audi-yellow w-3' : 'bg-white/10'}`}></div>
                ))}
            </div>
        </div>

        {/* MOVED NOTIFICATION BANNER */}
        <div className="w-full mb-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 flex items-center gap-3 animate-fade-in hover:bg-yellow-500/10 transition-colors">
            <div className="shrink-0 p-1.5 bg-yellow-500/10 rounded-full">
                <Icons.Flame className="w-4 h-4 text-yellow-500 animate-pulse" />
            </div>
            <p className="text-[10px] md:text-xs text-yellow-200/80 font-medium leading-relaxed">
                <strong className="text-yellow-500">Lưu ý:</strong> Mô hình <span className="text-audi-cyan font-bold">Flash</span> có tốc độ nhanh nhưng chất lượng ảnh thấp hơn, chi tiết nhân vật và độ khối 3D kém hơn. Hãy chọn <span className="text-audi-pink font-bold">Pro</span> để có những bức ảnh đẹp nhất, sắc nét và sống động.
            </p>
        </div>

        {/* NEW HORIZONTAL AUMIX3D PROMO BANNER */}
        <a
            href="https://aumix3d.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full mb-4 md:mb-6 bg-gradient-to-r from-[#001a2c] to-[#000a14] border border-audi-cyan/30 rounded-xl p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4 animate-fade-in hover:border-audi-cyan transition-all shadow-[0_0_20px_rgba(33,212,253,0.1)] group relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-audi-cyan/10 blur-[40px] rounded-full group-hover:bg-audi-cyan/20 transition-all"></div>
            <div className="relative z-10 flex items-center gap-3 md:gap-4 w-full md:w-auto">
                <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-audi-cyan/10 flex items-center justify-center border border-audi-cyan/30 group-hover:scale-110 transition-transform">
                    <Icons.Sparkles className="w-5 h-5 md:w-6 md:h-6 text-audi-cyan" />
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase animate-pulse">MỚI</span>
                        <h4 className="text-white font-bold text-xs md:text-sm uppercase tracking-wider group-hover:text-audi-cyan transition-colors">Mix Đồ 3D Audition</h4>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 leading-relaxed">
                        Bạn chưa có ảnh nhân vật? Mix đồ và chụp ảnh tách nền cực nét ngay trên web mà không cần vào game.
                    </p>
                </div>
            </div>
            <div className="relative z-10 shrink-0 w-full md:w-auto mt-1 md:mt-0">
                <div className="w-full md:w-auto px-4 py-2 bg-audi-cyan/20 hover:bg-audi-cyan/30 border border-audi-cyan/50 rounded-lg flex items-center justify-center gap-2 transition-all group-hover:shadow-[0_0_15px_rgba(33,212,253,0.4)]">
                    <span className="text-[10px] md:text-xs font-bold text-audi-cyan uppercase">Mở AuMix3D</span>
                    <Icons.ExternalLink className="w-3 h-3 md:w-4 md:h-4 text-audi-cyan" />
                </div>
            </div>
        </a>

        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 md:mt-0">
            <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-white text-sm uppercase flex items-center gap-2">
                        <Icons.User className="w-4 h-4 text-audi-pink" /> 1. Upload Nhân Vật
                    </h3>
                    <div className="relative flex gap-2 flex-wrap justify-end">
                        <button
                            onMouseEnter={() => setHoveredGuidePreview('character')}
                            onMouseLeave={() => setHoveredGuidePreview((prev) => prev === 'character' ? null : prev)}
                            onFocus={() => setHoveredGuidePreview('character')}
                            onBlur={() => setHoveredGuidePreview((prev) => prev === 'character' ? null : prev)}
                            className={`flex items-center gap-1 text-[10px] font-bold text-white hover:scale-105 transition-transform px-3 py-1 rounded-full border ${
                                guideImages.characterUrl
                                    ? 'bg-audi-cyan/20 border-audi-cyan/50'
                                    : 'bg-white/5 border-white/10 opacity-60'
                            }`}
                        >
                            <Icons.Image className="w-3 h-3 text-audi-cyan" /> VD Ảnh NV
                        </button>
                        <button
                            onMouseEnter={() => setHoveredGuidePreview('sample')}
                            onMouseLeave={() => setHoveredGuidePreview((prev) => prev === 'sample' ? null : prev)}
                            onFocus={() => setHoveredGuidePreview('sample')}
                            onBlur={() => setHoveredGuidePreview((prev) => prev === 'sample' ? null : prev)}
                            className={`flex items-center gap-1 text-[10px] font-bold text-white hover:scale-105 transition-transform px-3 py-1 rounded-full border ${
                                guideImages.sampleUrl
                                    ? 'bg-audi-pink/20 border-audi-pink/50'
                                    : 'bg-white/5 border-white/10 opacity-60'
                            }`}
                        >
                            <Icons.Image className="w-3 h-3 text-audi-pink" /> VD Ảnh Mẫu
                        </button>
                        {tutorialVideoUrl && (
                            <button
                                onClick={() => setShowVideo(true)}
                                className="flex items-center gap-1 text-[10px] font-bold text-white hover:scale-105 transition-transform bg-red-600 px-3 py-1 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)] border border-red-400 group"
                            >
                                <Icons.Play className="w-3 h-3 fill-white group-hover:animate-pulse" />
                                Video HD
                            </button>
                        )}
                        <button
                            onClick={() => setGuideTopic('chars')}
                            className="flex items-center gap-1 text-[10px] font-bold text-audi-yellow hover:text-white transition-colors bg-audi-yellow/10 px-2 py-1 rounded-full border border-audi-yellow/30"
                        >
                            <Icons.Info className="w-3 h-3" /> Hướng dẫn
                        </button>
                        {hoveredGuidePreview && (
                            <div
                                className="absolute top-full right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-[#0b0b14] p-3 shadow-[0_0_30px_rgba(0,0,0,0.45)] z-20"
                                onMouseEnter={() => setHoveredGuidePreview(hoveredGuidePreview)}
                                onMouseLeave={() => setHoveredGuidePreview(null)}
                            >
                                {((hoveredGuidePreview === 'character' && guideImages.characterUrl) || (hoveredGuidePreview === 'sample' && guideImages.sampleUrl)) ? (
                                    <>
                                        <div className="w-full h-80 rounded-xl border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
                                            <img
                                                src={hoveredGuidePreview === 'character' ? guidePreviewUrls.character : guidePreviewUrls.sample}
                                                alt={hoveredGuidePreview === 'character' ? 'Ví dụ ảnh nhân vật' : 'Ví dụ ảnh mẫu'}
                                                className="max-w-full max-h-full object-contain rounded-xl"
                                            />
                                        </div>
                                        <p className="mt-2 text-[10px] text-slate-300 leading-relaxed">
                                            {hoveredGuidePreview === 'character'
                                                ? 'Ảnh nhân vật đạt chuẩn: rõ mặt, rõ đồ, tách nền sạch.'
                                                : 'Ảnh mẫu nên rõ bố cục, góc máy và tư thế.'}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-[10px] text-slate-400 leading-relaxed">
                                        Chưa có ảnh ví dụ trong phần cài đặt admin.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {characters.length > 1 && (
                    <div className="flex md:hidden overflow-x-auto gap-2 pb-2 no-scrollbar">
                        {characters.map((char) => (
                            <button
                                key={char.id}
                                onClick={() => setActiveCharTab(char.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                    activeCharTab === char.id
                                    ? 'bg-audi-pink text-white border-audi-pink shadow-lg'
                                    : 'bg-[#12121a] text-slate-400 border-white/10 hover:border-white/30'
                                }`}
                            >
                                {lang === 'vi' ? `Nhân vật ${char.id}` : `Char ${char.id}`}
                                {char.bodyImage && <span className="ml-1 text-green-400">✓</span>}
                            </button>
                        ))}
                    </div>
                )}

                <div data-tour-id="desktop.generation.characters" className="flex flex-wrap justify-center gap-4 w-full">
                    {characters.map((char) => {
                        const assistantError = assistantErrorByCharId[char.id];
                        const activeAssist = assistLoadingByCharId[char.id];
                        const isAssistRunning = !!activeAssist;

                        return (
                            <div
                                key={char.id}
                                className={`w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors relative group shrink-0 shadow-lg ${
                                    char.id === activeCharTab ? 'block' : 'hidden md:block'
                                }`}
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded">NV {char.id}</span>
                                    <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                                        <button onClick={() => toggleGender(char.id, 'female')} className={`px-2 py-0.5 rounded text-[9px] font-bold ${char.gender === 'female' ? 'bg-audi-pink text-white' : 'text-slate-500'}`}>Nữ</button>
                                        <button onClick={() => toggleGender(char.id, 'male')} className={`px-2 py-0.5 rounded text-[9px] font-bold ${char.gender === 'male' ? 'bg-blue-500 text-white' : 'text-slate-500'}`}>Nam</button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div onClick={() => handleUploadClick(char.id)} className="w-full h-64 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-pink cursor-pointer relative overflow-hidden group/item transition-all flex flex-col items-center justify-center">
                                        {char.bodyImage ? (
                                            <img src={char.bodyImage} className="w-full h-full object-contain" alt="Body" />
                                        ) : (
                                            <div className="flex flex-col items-center text-slate-500 group-hover/item:text-audi-pink transition-colors">
                                                <Icons.User className="w-8 h-8 mb-1" />
                                                <span className="text-[10px] uppercase font-bold">Ảnh Nhân Vật</span>
                                            </div>
                                        )}
                                    </div>

                                    {char.bodyImage && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isAssistRunning) return;
                                                    void handleCharacterAssistant(char.id, 'remove_bg_pro');
                                                }}
                                                aria-disabled={isAssistRunning}
                                                className={`px-2 py-2 rounded-xl text-[10px] font-bold border border-audi-cyan/40 bg-audi-cyan/10 text-audi-cyan flex flex-col items-center gap-1 min-h-[76px] relative z-10 pointer-events-auto ${
                                                    isAssistRunning ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-audi-cyan/15'
                                                }`}
                                            >
                                                {activeAssist === 'remove_bg_pro' ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" /> : <Icons.Scissors className="w-3.5 h-3.5" />}
                                                <span>{activeAssist === 'remove_bg_pro' ? 'Đang Tách...' : 'Tách Nền'}</span>
                                                <span className="flex items-center gap-1 text-[9px] text-white/80">
                                                    {activeAssist === 'remove_bg_pro'
                                                        ? 'Vertex AI đang xử lý'
                                                        : <>{CHARACTER_ASSISTANT_RESOLUTION} <Icons.Gem className="w-3 h-3 text-audi-yellow" /> {removeBgCost.vcoin}</>}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isAssistRunning) return;
                                                    void handleCharacterAssistant(char.id, 'sharpen_upscale');
                                                }}
                                                aria-disabled={isAssistRunning}
                                                className={`px-2 py-2 rounded-xl text-[10px] font-bold border border-audi-pink/40 bg-audi-pink/10 text-audi-pink flex flex-col items-center gap-1 min-h-[76px] relative z-10 pointer-events-auto ${
                                                    isAssistRunning ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-audi-pink/15'
                                                }`}
                                            >
                                                {activeAssist === 'sharpen_upscale' ? <Icons.Loader className="w-3.5 h-3.5 animate-spin" /> : <Icons.Sparkles className="w-3.5 h-3.5" />}
                                                <span>{activeAssist === 'sharpen_upscale' ? 'Đang Nét...' : 'Làm Nét'}</span>
                                                <span className="flex items-center gap-1 text-[9px] text-white/80">
                                                    {activeAssist === 'sharpen_upscale'
                                                        ? 'Vertex AI đang xử lý'
                                                        : <>{CHARACTER_ASSISTANT_RESOLUTION} <Icons.Gem className="w-3 h-3 text-audi-yellow" /> {sharpenCost.vcoin}</>}
                                                </span>
                                            </button>
                                        </div>
                                    )}
                                    {assistantError && (
                                        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 flex items-start gap-2">
                                            <Icons.AlertTriangle className="w-3.5 h-3.5 text-orange-300 shrink-0 mt-0.5" />
                                            <p className="text-[10px] leading-relaxed text-orange-200">Lỗi xử lý ảnh: {assistantError}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-center w-full">
                    <div className="w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 shadow-lg">
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                <Icons.Image className="w-4 h-4" /> 2. Ảnh mẫu bố cục
                            </label>
                            {refImage && (
                                <button
                                    type="button"
                                    onClick={() => setRefImage(null)}
                                    className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-full border border-white/10"
                                >
                                    Xóa ảnh mẫu
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={handleRefUploadClick}
                            className="w-full h-64 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-purple cursor-pointer relative overflow-hidden group flex flex-col items-center justify-center transition-all"
                        >
                            {refImage ? (
                                <>
                                    <img src={refImage} className="w-full h-full object-contain opacity-90 bg-black/30" alt="Ref" />
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs font-bold text-white uppercase tracking-wider">Thay ảnh mẫu</span>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 bg-audi-purple/80 text-white text-[10px] font-bold text-center py-2">
                                        POSE REF
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center text-slate-500 p-4 text-center">
                                    <Icons.Image className="w-8 h-8 mb-2" />
                                    <span className="text-[10px] font-bold uppercase leading-tight">Ảnh mẫu<br/>(Pose)</span>
                                </div>
                            )}
                        </button>
                    </div>
                </div>

                <div data-tour-id="desktop.generation.prompt" className="bg-[#12121a] border border-white/10 rounded-2xl p-4 shadow-lg">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                            <Icons.MessageCircle className="w-4 h-4" /> 3. Mô tả
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={handleOpenSamples}
                                className="text-[10px] font-bold text-audi-yellow hover:text-white flex items-center gap-1 bg-audi-yellow/10 px-3 py-1.5 rounded-full border border-audi-yellow/30 animate-pulse transition-all hover:bg-audi-yellow/20"
                            >
                                <Icons.Image className="w-3 h-3" /> Sử dụng Prompt Mẫu
                            </button>
                        </div>
                    </div>

                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={lang === 'vi' ? "Mô tả chi tiết: trang phục, bối cảnh, ánh sáng..." : "Detailed prompt: clothes, scene, lighting..."}
                        rows={12}
                        className="block w-full min-h-[340px] max-h-[760px] bg-black/20 border border-white/5 rounded-xl p-4 text-sm leading-relaxed text-white focus:border-audi-purple outline-none resize-y overflow-auto placeholder:text-slate-500"
                    />
                </div>

            </div>

            <div className="lg:col-span-1 space-y-6">

                <div data-tour-id="desktop.generation.settings" className="bg-[#12121a] border border-white/10 rounded-2xl p-5 flex flex-col gap-5 shadow-lg h-full">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Icons.Settings className="w-5 h-5 text-slate-400" />
                            4. Cấu Hình
                        </h3>
                        <button
                            onClick={() => setGuideTopic('settings')}
                            className="text-audi-yellow hover:text-white transition-colors animate-pulse"
                        >
                            <Icons.Info className="w-4 h-4" />
                        </button>
                    </div>

                    {!isCatalogReady && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-200">
                            {catalogLoading
                                ? 'Đang đồng bộ catalog live từ TST...'
                                : (catalogError || 'TST đang bảo trì hoặc không sẵn sàng.')}
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mô hình AI</label>
                        <div className="grid gap-2">
                            {IMAGE_MODEL_OPTIONS.map((model) => {
                                const Icon = model.icon;
                                const available = imageModelAvailability[model.tier];
                                const selected = aiModel === model.tier;
                                return (
                                    <button
                                        key={model.tier}
                                        type="button"
                                        onClick={() => available && setAiModel(model.tier)}
                                        disabled={!available}
                                        className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition-all ${
                                            selected
                                                ? 'border-audi-cyan/80 bg-audi-cyan/10 shadow-[0_0_22px_rgba(34,211,238,0.18)]'
                                                : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.04]'
                                        } ${!available ? 'cursor-not-allowed opacity-40' : ''}`}
                                    >
                                        <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${model.accent}`} />
                                        <div className="flex items-start gap-3">
                                            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${model.accent} text-white shadow-lg`}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-black text-white">{model.label}</span>
                                                    <span className={`rounded-full bg-gradient-to-r ${model.accent} px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm`}>
                                                        {model.tag}
                                                    </span>
                                                    {selected && <Icons.Check className="h-3.5 w-3.5 text-audi-cyan" />}
                                                </div>
                                                <p className="mt-0.5 text-[10px] font-bold text-slate-300">{model.title}</p>
                                                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{model.description}</p>
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
                            {ratios.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => setAspectRatio(r.id)}
                                    className={`flex-1 py-3 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center ${aspectRatio === r.id ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={`${availableResolutions.length === 0 ? 'hidden ' : ''}space-y-3 animate-fade-in`}>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Độ phân giải</label>
                        <div className={`flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5`}>
                            {availableResolutions.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setResolution(r as any)}
                                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${resolution === r ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    {r}
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
                                        onClick={() => setGptQuality(quality)}
                                        className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                            gptQuality === quality
                                                ? 'bg-audi-purple text-white shadow-lg'
                                                : 'text-slate-500 hover:text-white hover:bg-white/5'
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
                            <Icons.Zap className="w-3 h-3" />
                            Tốc độ xử lý
                        </label>
                        <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                            {availableSpeedLabels.map(s => (
                                <button
                                    key={s}
                                    onClick={() => setSpeed(s)}
                                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                                        speed === s
                                            ? 'bg-audi-purple text-white shadow-lg'
                                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={`${availableServerLabels.length === 0 ? 'hidden ' : ''}space-y-3 animate-fade-in`}>
                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            <Icons.Database className="w-3 h-3" />
                            Server
                        </label>
                        <div className="flex gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                            {availableServerLabels.map(s => (
                                <button
                                    key={s}
                                    onClick={() => setServer(s)}
                                    className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                                        server === s
                                            ? 'bg-audi-cyan text-black shadow-lg'
                                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* NEW CONCURRENCY UI */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <div
                            className="cursor-pointer hover:bg-white/5 p-3 rounded-xl transition-colors border border-white/5 bg-[#0a0a0f]"
                            onClick={() => setIsConcurrencyExpanded(!isConcurrencyExpanded)}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                    <Icons.Activity className="w-3 h-3 text-audi-cyan" />
                                    Luồng xử lý
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); triggerPoll(); }} className="text-slate-500 hover:text-white transition-colors">
                                        <Icons.RefreshCw className="w-3 h-3" />
                                    </button>
                                    {isConcurrencyExpanded ? <Icons.ChevronUp className="w-4 h-4 text-slate-500" /> : <Icons.ChevronDown className="w-4 h-4 text-slate-500" />}
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

                            {isConcurrencyExpanded && (
                                <div className="pt-3 mt-2 border-t border-white/5 space-y-4 animate-fade-in">
                                    {/* User Concurrency */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Của bạn</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-300">Đang xử lý</span>
                                                <span className="font-mono text-audi-cyan bg-audi-cyan/10 px-2 py-0.5 rounded-md">
                                                    {queueStats.myImageProcessing}/{CONCURRENCY_LIMITS.user.imageProcessing}
                                                </span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-audi-cyan h-full transition-all duration-500 ease-out"
                                                    style={{ width: `${Math.min(100, (queueStats.myImageProcessing / CONCURRENCY_LIMITS.user.imageProcessing) * 100)}%` }}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-1">
                                                <span className="text-slate-300">Hàng chờ</span>
                                                <span className="font-mono text-audi-yellow bg-audi-yellow/10 px-2 py-0.5 rounded-md">
                                                    {queueStats.myQueued}/{CONCURRENCY_LIMITS.user.queued}
                                                </span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-audi-yellow h-full transition-all duration-500 ease-out"
                                                    style={{ width: `${Math.min(100, (queueStats.myQueued / CONCURRENCY_LIMITS.user.queued) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-white/5 w-full" />

                                    {/* System Concurrency */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Hệ thống</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-300">Ảnh</span>
                                                <span className="font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">
                                                    {queueStats.systemImageProcessing}/{CONCURRENCY_LIMITS.system.imageProcessing}
                                                </span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-slate-400 h-full transition-all duration-500 ease-out"
                                                    style={{ width: `${Math.min(100, (queueStats.systemImageProcessing / CONCURRENCY_LIMITS.system.imageProcessing) * 100)}%` }}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-1">
                                                <span className="text-slate-300">Video</span>
                                                <span className="font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">
                                                    {queueStats.systemVideoProcessing}/{CONCURRENCY_LIMITS.system.videoProcessing}
                                                </span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-slate-400 h-full transition-all duration-500 ease-out"
                                                    style={{ width: `${Math.min(100, (queueStats.systemVideoProcessing / CONCURRENCY_LIMITS.system.videoProcessing) * 100)}%` }}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-1">
                                                <span className="text-slate-300">Hàng chờ chung</span>
                                                <span className="font-mono text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-md">
                                                    {queueStats.systemQueued}/{CONCURRENCY_LIMITS.system.queued}
                                                </span>
                                            </div>
                                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-orange-400 h-full transition-all duration-500 ease-out"
                                                    style={{ width: `${Math.min(100, (queueStats.systemQueued / CONCURRENCY_LIMITS.system.queued) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Redesigned Pricing Display */}
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-audi-purple/20 to-audi-pink/20 border border-white/10 p-3 mt-4">
                        <div className="flex justify-between items-center relative z-10">
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Giá hiện tại</span>
                            <div className="flex items-end gap-1">
                                <span className="text-xl font-black text-white font-game drop-shadow-md">
                                    {calculateCost()}
                                </span>
                                <span className="text-[10px] font-bold text-audi-yellow mb-1">VCOIN</span>
                            </div>
                        </div>
                        {aiModel === 'pro' ? (
                            <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-white/5 pt-2">
                                <span className={resolution === '1K' ? 'text-white font-bold' : ''}>1K: {prices.pro_1k}VC</span>
                                <span className={resolution === '2K' ? 'text-white font-bold' : ''}>2K: {prices.pro_2k}VC</span>
                                <span className={resolution === '4K' ? 'text-white font-bold' : ''}>4K: {prices.pro_4k}VC</span>
                            </div>
                        ) : aiModel === 'gpt' ? (
                            <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-white/5 pt-2">
                                <span className={resolution === '1K' ? 'text-white font-bold' : ''}>1K: {prices.gpt_1k}VC</span>
                                <span className={resolution === '2K' ? 'text-white font-bold' : ''}>2K: {prices.gpt_2k}VC</span>
                                <span className={resolution === '4K' ? 'text-white font-bold' : ''}>4K: {prices.gpt_4k}VC</span>
                            </div>
                        ) : (
                            <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-white/5 pt-2">
                                <span className={resolution === '1K' ? 'text-white font-bold' : ''}>1K: {prices.flash_1k}VC</span>
                                <span className={resolution === '2K' ? 'text-white font-bold' : ''}>2K: {prices.flash_2k}VC</span>
                                <span className={resolution === '4K' ? 'text-white font-bold' : ''}>4K: {prices.flash_4k}VC</span>
                            </div>
                        )}
                    </div>

                    <button
                        data-tour-id="desktop.generation.generate"
                        onClick={handleGenerate}
                        disabled={isGenerateDisabled || isSubmitting}
                        className={`w-full py-3.5 mt-auto rounded-xl font-bold text-white shadow-[0_0_20px_rgba(255,0,153,0.4)] transition-all flex items-center justify-center gap-2 ${
                            (isGenerateDisabled || isSubmitting)
                            ? 'bg-slate-600 cursor-not-allowed opacity-70 shadow-none'
                            : 'bg-gradient-to-r from-audi-pink to-audi-purple hover:scale-[1.02]'
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Icons.Loader className="w-5 h-5 animate-spin" />
                                <span>{lang === 'vi' ? 'ĐANG GỬI JOB...' : 'SUBMITTING...'}</span>
                            </>
                        ) : cooldownRemaining > 0 ? (
                            <>
                                <Icons.Clock className="w-5 h-5 animate-spin-slow" />
                                <span>{lang === 'vi' ? `ĐỢI ${cooldownRemaining}s` : `WAIT ${cooldownRemaining}s`}</span>
                            </>
                        ) : (
                            <>
                                <Icons.Wand className="w-5 h-5" />
                                <span>{lang === 'vi' ? 'TẠO ẢNH NGAY' : 'GENERATE'}</span>
                            </>
                        )}
                    </button>

                </div>
            </div>

        </div>
    </div>
  );
};
