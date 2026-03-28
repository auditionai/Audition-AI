/**
 * WorkspaceImage - Full Generation Tool (Mobile)
 * Functional parity with desktop GenerationTool.tsx
 * Features: TST catalog, pricing, character upload, prompt, queue submission
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, ImagePlus, Coins,
  X, User, Zap, Crown, RefreshCw, Loader, AlertTriangle, Wand2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import { APP_CONFIG } from '../constants';
import { getUserProfile, getStylePresets, getModelPricing, getTstServerAvailabilityConfig } from '../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../services/concurrencyService';
import { enqueueServerJob } from '../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../services/storageService';
import {
  fetchTstPricing, fetchTstModels,
  getCompatibleGenerationResolutions, getCompatibleGenerationServers, getCompatibleGenerationSpeeds,
  getGenerationCostBreakdown, getGenerationModelId,
  applyServerAvailabilityToRuntimeModels, sanitizePricingEntriesWithRuntimeModels,
  uiSpeedToTst, uiServerToTst, tstServerToUi,
  type TstPricingEntry, type TstRuntimeModel, type AuditionPricingOverride, type TstResolution,
} from '../services/tstCatalog';
import type { ModelPricing } from '../services/economyService';
import type { GeneratedImage } from '../types';
import { caulenhauClient } from '../services/supabaseClient';
import type { CharacterReferenceGroup, ImageGenerateRecipePayload } from '../../../shared/queueRecipes';
import { createSolidFence, createStyleOnlyReference, optimizePayload } from '../../../utils/imageProcessor';

type GenMode = 'single' | 'couple' | 'trio' | 'squad';
type Stage = 'input' | 'submitting';

interface CharacterInput {
  id: number;
  bodyImage: string | null;
  gender: 'female' | 'male';
}

interface SamplePrompt {
  id: string;
  image_url: string;
  prompt: string;
  category?: string;
}

const SMART_TIPS = [
  'Mẹo: Ảnh nhân vật nên rõ khuôn mặt, chụp thẳng và thấy trang phục đầy đủ.',
  'Mẹo: Ảnh mẫu nên gần với bố cục bạn muốn để AI bám đúng tư thế và khung hình.',
  'Mẹo: Dùng Prompt mẫu khi bí ý tưởng, sau đó sửa lại vài chi tiết theo ý bạn.',
  'Lưu ý: 4K rất nét nhưng thường chậm hơn 1K hoặc 2K.',
];

const NEGATIVE_PROMPT = 'crowd, extra people, audience, bystanders, deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, disgusting, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long neck, long body, mutated hands and fingers, out of frame, blender, doll, cropped, low-res, close-up, poorly-drawn face, out of frame double, two heads, blurred, ugly, disfigured, too many fingers, deformed, repetitive, black and white, grainy, extra limbs, bad anatomy, duplicate, photorealistic, realistic photo, sketch, cartoon, drawing, art, 2d';

const MODE_TO_FEATURE_ID: Record<GenMode, string> = {
  single: 'single_photo_gen',
  couple: 'couple_photo_gen',
  trio: 'group_3_gen',
  squad: 'group_4_gen',
};

const MODE_META: Record<GenMode, { label: string; sampleCategoryId: number; sampleCategoryName: string }> = {
  single: { label: 'Đơn', sampleCategoryId: 2, sampleCategoryName: 'Ảnh nam nữ' },
  couple: { label: 'Đôi', sampleCategoryId: 3, sampleCategoryName: 'Ảnh couple' },
  trio: { label: 'Nhóm 3', sampleCategoryId: 4, sampleCategoryName: 'Ảnh nhóm' },
  squad: { label: 'Nhóm 4', sampleCategoryId: 4, sampleCategoryName: 'Ảnh nhóm' },
};

const MODE_TO_CHARACTER_COUNT: Record<GenMode, number> = {
  single: 1,
  couple: 2,
  trio: 3,
  squad: 4,
};

const FEATURE_ID_TO_MODE: Record<string, GenMode> = {
  single_photo_gen: 'single',
  couple_photo_gen: 'couple',
  group_3_gen: 'trio',
  group_4_gen: 'squad',
};

const SAMPLES_PER_PAGE = 20;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const tryStageGenerationInput = async (source: string, folder: string) => {
  if (!source) return null;
  if (source.startsWith('http')) return source;

  try {
    const optimizedSource = await optimizePayload(source, 2048);
    return await uploadFileToR2(optimizedSource, folder);
  } catch (error) {
    console.warn('[WorkspaceImage] Failed to stage generation input.', error);
    throw new Error('Không thể tải ảnh nhân vật lên vùng đệm. Vui lòng thử lại.');
  }
};

const tryStageSampleReferenceInput = async (source: string, folder: string, aspectRatio: string) => {
  if (!source) return null;

  try {
    const poseOnlyReference = await createSolidFence(source, aspectRatio, true);
    const optimizedSource = await optimizePayload(poseOnlyReference, 2048);
    return await uploadFileToR2(optimizedSource, folder);
  } catch (error) {
    console.warn('[WorkspaceImage] Failed to stage sample reference.', error);
    throw new Error('Không thể chuẩn hóa ảnh mẫu trước khi tạo ảnh. Vui lòng thử lại.');
  }
};

const tryStageStyleReferenceInput = async (source: string, folder: string) => {
  if (!source) return null;

  try {
    const styleOnlyReference = await createStyleOnlyReference(source);
    const optimizedSource = await optimizePayload(styleOnlyReference, 1536);
    return await uploadFileToR2(optimizedSource, folder);
  } catch (error) {
    console.warn('[WorkspaceImage] Failed to stage style reference.', error);
    throw new Error('Không thể chuẩn hóa style nội bộ trước khi tạo ảnh.');
  }
};

export function WorkspaceImage() {
  const navigate = useNavigate();
  const location = useLocation();
  useAuth();
  const { notify } = useNotification();
  const { queueStats } = useConcurrency();

  const [stage, setStage] = useState<Stage>('input');
  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([
    { id: 1, bodyImage: null, gender: 'female' },
  ]);
  const [activeCharTab, setActiveCharTab] = useState(1);

  const [prompt, setPrompt] = useState('');
  const [refImage, setRefImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState<TstResolution>('1K');
  const [speed, setSpeed] = useState<'Nhanh' | 'Tiết kiệm'>('Nhanh');
  const [server, setServer] = useState('VIP 1');
  const [aiModel, setAiModel] = useState<'flash' | 'pro'>('flash');

  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [runtimeModels, setRuntimeModels] = useState<TstRuntimeModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [cooldownRemaining, setCooldownRemaining] = useState(() => {
    const saved = localStorage.getItem('gen_cooldown_end');
    if (saved) {
      const end = parseInt(saved, 10);
      const now = Date.now();
      if (end > now) return Math.ceil((end - now) / 1000);
    }
    return 0;
  });

  const [activeStylePreset, setActiveStylePreset] = useState<string | null>(null);
  const [availableStyles, setAvailableStyles] = useState<any[]>([]);
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [samplePrompts, setSamplePrompts] = useState<SamplePrompt[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [samplePage, setSamplePage] = useState(0);
  const [hasMoreSamples, setHasMoreSamples] = useState(true);
  const [currentCategoryName, setCurrentCategoryName] = useState('');
  const [submissionLogs, setSubmissionLogs] = useState<string[]>([]);
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [estimatedSeconds, setEstimatedSeconds] = useState(24);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId?: number; type: 'body' | 'ref' } | null>(null);

  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
    modelId: row.model_id,
    optionId: row.option_id,
    auditionPriceVcoin: row.audition_price_vcoin,
  }));

  const generationSpeedId = uiSpeedToTst(speed) || 'fast';
  const generationServerId = uiServerToTst(server) || 'fast';
  const generationTier = aiModel === 'flash' ? 'flash' : 'pro';
  const availableResolutions = getCompatibleGenerationResolutions({
    tier: generationTier, pricingEntries, serverId: generationServerId, speed: generationSpeedId,
  });
  const speedCandidateServers = getCompatibleGenerationServers({
    tier: generationTier,
    pricingEntries,
    resolution,
  });
  const availableServers = getCompatibleGenerationServers({
    tier: generationTier, pricingEntries, speed: generationSpeedId, resolution,
  });
  const availableSpeeds = Array.from(new Set(
    (speedCandidateServers.length > 0 ? speedCandidateServers : [generationServerId]).flatMap((serverId) =>
      getCompatibleGenerationSpeeds({
        tier: generationTier,
        pricingEntries,
        serverId,
        resolution,
      }),
    ),
  ));
  const selectedCost = getGenerationCostBreakdown({
    tier: generationTier, resolution, speed: generationSpeedId,
    serverId: generationServerId, pricingEntries, pricingOverrides,
  });
  const activeFeature = APP_CONFIG.main_features.find((feature) => feature.id === MODE_TO_FEATURE_ID[activeMode]) ?? APP_CONFIG.main_features[0];
  const availableSpeedLabels = availableSpeeds.map((speedId) => (speedId === 'slow' ? 'Tiết kiệm' : 'Nhanh'));
  const availableServerLabels = availableServers.map((serverId) => ({ id: serverId, label: tstServerToUi(serverId) || serverId.toUpperCase() }));

  const runtimeImageModelIds = new Set(
    runtimeModels.filter((m) => m.type === 'image').map((m) => m.model.trim().toLowerCase()),
  );
  const isFlashAvailable = runtimeImageModelIds.has(getGenerationModelId('flash'))
    && pricingEntries.some((e) => e.model.trim().toLowerCase() === getGenerationModelId('flash'));
  const isProAvailable = runtimeImageModelIds.has(getGenerationModelId('pro'))
    && pricingEntries.some((e) => e.model.trim().toLowerCase() === getGenerationModelId('pro'));
  const isCatalogReady = !catalogLoading && !catalogError && pricingEntries.length > 0 && runtimeModels.length > 0;
  const isGenerateDisabled = cooldownRemaining > 0 || !isCatalogReady || !selectedCost.available
    || !prompt.trim()
    || characters.some((char) => !char.bodyImage)
    || (aiModel === 'flash' ? !isFlashAvailable : !isProAvailable);

  const calculateCost = () => {
    const baseCost = selectedCost.vcoin;
    let modeMultiplier = 1;
    if (activeMode === 'couple') modeMultiplier = 2;
    if (activeMode === 'trio') modeMultiplier = 3;
    if (activeMode === 'squad') modeMultiplier = 4;
    return baseCost * modeMultiplier;
  };

  // --- Load TST Catalog on mount ---
  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [entries, models, pricingConfig, serverAvailabilityConfig] = await Promise.all([
          fetchTstPricing(),
          fetchTstModels(),
          getModelPricing(),
          getTstServerAvailabilityConfig(),
        ]);
        const filteredModels = applyServerAvailabilityToRuntimeModels(models, serverAvailabilityConfig);
        setPricingEntries(sanitizePricingEntriesWithRuntimeModels(entries, filteredModels, serverAvailabilityConfig));
        setRuntimeModels(filteredModels);
        setAuditionPricing(pricingConfig || []);
        setCatalogError(null);
      } catch (error) {
        console.warn('[WorkspaceImage] Failed to load TST catalog', error);
        setCatalogError('TST đang bảo trì hoặc không sẵn sàng.');
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();

    const loadStyles = async () => {
      const presets = await getStylePresets();
      setAvailableStyles(presets || []);
      const def = presets?.find((p: any) => p.is_default);
      if (def) setActiveStylePreset(def.image_url);
    };
    loadStyles();
  }, []);

  // --- Cooldown Timer ---
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) { localStorage.removeItem('gen_cooldown_end'); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  // --- Auto-adjust model availability ---
  useEffect(() => {
    if (aiModel === 'flash' && !isFlashAvailable && isProAvailable) setAiModel('pro');
    else if (aiModel === 'pro' && !isProAvailable && isFlashAvailable) setAiModel('flash');
  }, [aiModel, isFlashAvailable, isProAvailable]);

  // --- Auto-adjust resolution ---
  useEffect(() => {
    if (availableResolutions.length > 0 && !availableResolutions.includes(resolution)) {
      setResolution(availableResolutions[0]);
    }
  }, [availableResolutions, resolution]);

  useEffect(() => {
    if (availableServerLabels.length > 0 && !availableServerLabels.some((item) => item.label === server)) {
      setServer(availableServerLabels[0].label);
    }
  }, [availableServerLabels, server]);

  useEffect(() => {
    if (availableSpeedLabels.length > 0 && !availableSpeedLabels.includes(speed)) {
      setSpeed(availableSpeedLabels[0]);
    }
  }, [availableSpeedLabels, speed]);

  // --- Rotating tips ---
  useEffect(() => {
    const interval = setInterval(() => setCurrentTipIdx((prev) => (prev + 1) % SMART_TIPS.length), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (stage !== 'submitting') {
      setElapsedSeconds(0);
      return undefined;
    }

    const timer = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [stage]);

  const addSubmissionLog = useCallback((message: string) => {
    setSubmissionLogs((prev) => [...prev, message]);
    setSubmissionMessage(message);
  }, []);

  const fetchSamplePrompts = useCallback(async (loadMore = false) => {
    if (!caulenhauClient) {
      notify('Chưa kết nối được thư viện Prompt mẫu.', 'error');
      return;
    }

    setLoadingSamples(true);
    try {
      const modeMeta = MODE_META[activeMode];
      const pageToFetch = loadMore ? samplePage + 1 : 0;
      const from = pageToFetch * SAMPLES_PER_PAGE;
      const to = from + SAMPLES_PER_PAGE - 1;
      setCurrentCategoryName(modeMeta.sampleCategoryName);

      const { data, error } = await caulenhauClient
        .from('images')
        .select('id, image_url, prompt, image_categories!inner(category_id)')
        .eq('image_categories.category_id', modeMeta.sampleCategoryId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const newSamples = (data || []).map((item: any) => ({
        id: item.id,
        image_url: item.image_url,
        prompt: item.prompt,
        category: modeMeta.sampleCategoryName,
      }));

      if (loadMore) {
        setSamplePrompts((prev) => [...prev, ...newSamples]);
        setSamplePage(pageToFetch);
      } else {
        setSamplePrompts(newSamples);
        setSamplePage(0);
      }

      setHasMoreSamples(newSamples.length === SAMPLES_PER_PAGE);
    } catch (error: any) {
      console.error('[WorkspaceImage] Failed to fetch sample prompts', error);
      notify(`Không thể tải Prompt mẫu: ${error?.message || 'Lỗi không xác định'}`, 'error');
      if (!loadMore) setSamplePrompts([]);
      setHasMoreSamples(false);
    } finally {
      setLoadingSamples(false);
    }
  }, [activeMode, notify, samplePage]);

  const handleOpenSamples = () => {
    setShowSampleModal(true);
    void fetchSamplePrompts(false);
  };

  const handleSelectSample = (sample: SamplePrompt) => {
    if (!sample.prompt?.trim()) {
      notify('Prompt mẫu này hiện chưa có nội dung.', 'warning');
      return;
    }

    setPrompt(sample.prompt.trim());
    setShowSampleModal(false);
    notify('Đã áp dụng Prompt mẫu.', 'success');
  };

  // --- Mode Change ---
  const handleModeChange = useCallback((mode: GenMode) => {
    setActiveMode(mode);
    setActiveCharTab(1);
    let count = 1;
    if (mode === 'couple') count = 2;
    if (mode === 'trio') count = 3;
    if (mode === 'squad') count = 4;

    setCharacters((prev) => {
      const nextChars: CharacterInput[] = [];
      for (let i = 1; i <= count; i += 1) {
        const existing = prev.find((item) => item.id === i);
        nextChars.push(existing || { id: i, bodyImage: null, gender: i % 2 === 0 ? 'male' : 'female' });
      }
      return nextChars;
    });
  }, []);

  useEffect(() => {
    const expectedCount = MODE_TO_CHARACTER_COUNT[activeMode];
    setCharacters((prev) => {
      if (prev.length === expectedCount) {
        return prev;
      }

      const nextChars: CharacterInput[] = [];
      for (let i = 1; i <= expectedCount; i += 1) {
        const existing = prev.find((item) => item.id === i);
        nextChars.push(existing || { id: i, bodyImage: null, gender: i % 2 === 0 ? 'male' : 'female' });
      }
      return nextChars;
    });

    setActiveCharTab((prev) => Math.min(prev, expectedCount) || 1);
  }, [activeMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const toolId = params.get('tool');
    if (!toolId) return;

    const nextMode = FEATURE_ID_TO_MODE[toolId];
    if (nextMode && nextMode !== activeMode) {
      handleModeChange(nextMode);
    }
  }, [activeMode, handleModeChange, location.search]);

  // --- File Upload ---
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
        setCharacters((prev) => prev.map((c) => (c.id === currentType.charId ? { ...c, bodyImage: result } : c)));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --- GENERATE ---
  const handleGenerate = async () => {
    if (stage === 'submitting') return;
    if (cooldownRemaining > 0) { notify(`Vui lòng đợi ${cooldownRemaining}s`, 'warning'); return; }
    if (!isCatalogReady) { notify('TST đang bảo trì.', 'error'); return; }
    if (!selectedCost.available) { notify('Cấu hình không khả dụng.', 'error'); return; }

    if (queueStats.myImageProcessing >= CONCURRENCY_LIMITS.user.imageProcessing
      && queueStats.myQueued >= CONCURRENCY_LIMITS.user.queued) {
      notify('Bạn đã đạt giới hạn tạo ảnh. Vui lòng đợi job hiện tại hoàn thành.', 'warning');
      return;
    }
    if (queueStats.systemQueued >= CONCURRENCY_LIMITS.system.queued) {
      notify('Hệ thống đang quá tải. Thử lại sau.', 'error');
      return;
    }

    if (!prompt.trim()) { notify('Vui lòng nhập mô tả.', 'warning'); return; }

    const expectedCharacterCount = MODE_TO_CHARACTER_COUNT[activeMode];
    if (characters.length !== expectedCharacterCount) {
      notify('Trạng thái công cụ đang lệch số lượng nhân vật. Mình đã đồng bộ lại, vui lòng bấm tạo lại.', 'warning');
      handleModeChange(activeMode);
      setStage('input');
      return;
    }

    const missingSlots = characters.filter((c) => !c.bodyImage).map((c) => c.id);
    if (missingSlots.length > 0) {
      notify(`Thiếu ảnh tham chiếu cho nhân vật ${missingSlots.join(', ')}.`, 'warning');
      return;
    }

    const cost = calculateCost();
    const profile = await getUserProfile();
    if ((profile.vcoin_balance || 0) < cost) {
      notify('Số dư không đủ!', 'error');
      return;
    }

    setStage('submitting');
    setSubmissionLogs([]);
    setSubmissionMessage('Đang khởi tạo job...');
    setEstimatedSeconds(activeMode === 'single' ? 22 : activeMode === 'couple' ? 28 : 34);
    addSubmissionLog('Đã kiểm tra cấu hình và số dư.');

    const jobId = crypto.randomUUID();
    const basePrompt = `${activeFeature.defaultPrompt || ''}${prompt.trim()}`.trim();
    const queuedImage: GeneratedImage = {
      id: jobId,
      url: '',
      prompt: basePrompt,
      timestamp: Date.now(),
      updatedAt: Date.now(),
      assetType: 'image',
      toolId: activeFeature.id,
      toolName: activeFeature.name.en,
      engine: aiModel === 'flash' ? `Flash Engine ${resolution}` : `Pro Engine ${resolution}`,
      status: 'queued',
      jobId,
      progress: 0,
      queueKind: 'image_generate',
      cost,
    };

    try { await saveImageToLocalCache(queuedImage); } catch (e) { console.warn('Failed to persist queued placeholder', e); }

    void (async () => {
      try {
        addSubmissionLog('Đang chuẩn hóa ảnh nhân vật và ảnh mẫu.');

        const stagedCharacterGroups = await Promise.all(
          characters.map(async (char, idx) => {
            const references: CharacterReferenceGroup['references'] = [];

            if (char.bodyImage) {
              addSubmissionLog(`Đang tải ảnh nhân vật ${idx + 1} lên vùng đệm.`);
              const bodyStaged = await tryStageGenerationInput(char.bodyImage, `inputs/generation/${activeMode}/character-${idx + 1}/body`);
              if (bodyStaged) references.push({ source: bodyStaged, kind: 'body' });
            }

            return { characterIndex: idx + 1, gender: char.gender, references };
          }),
        );

        const stagedCharacterImages = stagedCharacterGroups.flatMap((g) => g.references.map((r) => r.source));

        let stagedSampleImage: string | null = null;
        if (refImage) {
          addSubmissionLog('Đang chuẩn hóa ảnh mẫu để giữ bố cục và tư thế.');
          stagedSampleImage = await tryStageSampleReferenceInput(refImage, `inputs/generation/${activeMode}/sample`, aspectRatio);
        }

        let stagedStyleImage: string | null = null;
        if (activeStylePreset) {
          stagedStyleImage = await tryStageStyleReferenceInput(activeStylePreset, `inputs/generation/${activeMode}/style`);
        }

        const styleMetadata = availableStyles.find((s: any) => s.image_url === activeStylePreset);
        const effectiveServerId = availableServers.includes(generationServerId) ? generationServerId : (availableServers[0] || generationServerId);
        const compatibleSpeeds = getCompatibleGenerationSpeeds({
          tier: generationTier,
          pricingEntries,
          serverId: effectiveServerId,
          resolution,
        });
        const effectiveSpeedId = compatibleSpeeds.includes(generationSpeedId) ? generationSpeedId : (compatibleSpeeds[0] || generationSpeedId);

        const queuePayload: ImageGenerateRecipePayload = {
          recipeType: 'image_generate_recipe_v1',
          modelId: getGenerationModelId(aiModel),
          prompt: basePrompt,
          negativePrompt: NEGATIVE_PROMPT,
          characterCount: characters.length,
          resolution,
          aspectRatio,
          speed: effectiveSpeedId,
          serverId: effectiveServerId,
          characterReferenceGroups: stagedCharacterGroups,
          characterImages: stagedCharacterImages,
          sampleImage: stagedSampleImage,
          styleImage: stagedStyleImage,
          stylePrompt: styleMetadata?.trigger_prompt || styleMetadata?.name || null,
        };

        addSubmissionLog('Đang gửi job tới hàng đợi xử lý.');
        await enqueueServerJob({
          id: jobId,
          prompt: basePrompt,
          toolId: activeFeature.id,
          toolName: activeFeature.name.en,
          engine: aiModel === 'flash' ? `Flash Engine ${resolution}` : `Pro Engine ${resolution}`,
          assetType: 'image',
          costVcoin: cost,
          queueKind: 'image_generate',
          clientPlatform: 'mobile',
          queuePayload,
        });

        window.dispatchEvent(new Event('balance_updated'));
        addSubmissionLog('Đã tạo job. Đang chuyển sang Thư viện.');
        notify('Đã tạo job. Kết quả sẽ cập nhật trong Lịch sử.', 'success');
        localStorage.setItem('gen_cooldown_end', (Date.now() + 60000).toString());
        setCooldownRemaining(60);
        navigate('/gallery');
      } catch (error) {
        console.error(error);
        const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
        addSubmissionLog(`Lỗi: ${errorMsg}`);
        try {
          await saveImageToLocalCache({ ...queuedImage, status: 'failed', error: errorMsg, updatedAt: Date.now(), progress: 0 });
        } catch (_) {}
        notify(errorMsg, 'error');
        setStage('input');
      }
    })();
  };

  const costDisplay = isCatalogReady ? calculateCost() : '...';

  const ratios = ['1:1', '3:4', '4:3', '9:16', '16:9'];

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-40 hide-scrollbar">

        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-accent)]" /> Tạo ảnh AI
          </h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
            {catalogLoading ? 'Đang tải catalog...' : catalogError || `${aiModel === 'flash' ? 'Flash' : 'Pro'} Engine • ${resolution}`}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          {(['single', 'couple', 'trio', 'squad'] as GenMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`flex-1 py-2.5 rounded-2xl text-[11px] font-bold transition-all ${
                activeMode === mode
                  ? 'bg-gray-900 text-white shadow-md'
                  : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
              }`}
            >
              {MODE_META[mode].label}
            </button>
          ))}
        </div>

        {/* Character Tabs */}
        {activeMode !== 'single' && (
          <div className="flex gap-2">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => setActiveCharTab(char.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                  activeCharTab === char.id ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border border-blue-200 dark:border-blue-500/30' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                }`}
              >
                Nhân vật {char.id}
              </button>
            ))}
          </div>
        )}

        {/* Character Upload Cards */}
        {characters.filter((c) => c.id === activeCharTab).map((char) => (
          <div key={char.id} className="space-y-3">
            <div className="flex gap-2 justify-center">
              {(['female', 'male'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setCharacters((prev) => prev.map((c) => c.id === char.id ? { ...c, gender: g } : c))}
                  className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${
                    char.gender === g ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1' : 'bg-white dark:bg-[#18181B] border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400'
                  }`}
                >
                  {g === 'female' ? 'Nữ' : 'Nam'}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleUploadClick(char.id)}
              className="w-full aspect-square md:aspect-video rounded-3xl border-2 border-dashed border-gray-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] flex flex-col items-center justify-center gap-3 overflow-hidden hover:border-gray-400 transition-colors relative shadow-sm"
            >
              {char.bodyImage ? (
                <>
                  <img src={char.bodyImage} alt="Ảnh nhân vật" className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-3 right-3 bg-black/60 rounded-xl px-3 py-2 text-white text-xs font-bold backdrop-blur-md">
                    Ảnh nhân vật {char.id}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-gray-50 dark:bg-[#27272A] rounded-full flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-300" />
                  </div>
                  <div className="text-center">
                    <span className="block text-sm font-bold text-gray-700 dark:text-zinc-200">Tải ảnh nhân vật lên</span>
                    <span className="block text-xs text-gray-400 dark:text-zinc-500 mt-1">Dùng 1 ảnh đủ mặt và trang phục, không cần ảnh mặt riêng.</span>
                  </div>
                </>
              )}
            </button>
          </div>
        ))}

        {/* Prompt & Ref Image */}
        <div className="relative group space-y-3">
          <div className="bg-white dark:bg-[#18181B] rounded-[24px] p-4 shadow-sm border border-gray-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">Ảnh mẫu bố cục</h3>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Tùy chọn, dùng để giữ pose hoặc khung hình</p>
            </div>
            {refImage ? (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden ring-2 ring-gray-100 dark:ring-zinc-800">
                <img src={refImage} alt="Ảnh mẫu" className="w-full h-full object-cover" />
                <button onClick={() => setRefImage(null)} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 hover:bg-black transition-colors">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <button onClick={handleRefUploadClick} className="w-16 h-16 rounded-xl bg-gray-50 dark:bg-[#27272A] border-2 border-dashed border-gray-200 dark:border-zinc-700 flex items-center justify-center text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white hover:border-[var(--color-primary)] transition-colors">
                <ImagePlus className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="relative bg-white dark:bg-[#18181B] rounded-[24px] p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)] ring-1 ring-gray-100 dark:ring-zinc-800 focus-within:ring-2 focus-within:ring-[var(--color-primary)]">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              placeholder="Nhập mô tả ảnh bạn muốn tạo. Ví dụ: Một cô gái mặc áo dài trắng đứng bên hồ sen, cinematic lighting..."
              className="w-full h-28 bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-gray-300 text-gray-800 dark:text-zinc-100"
              disabled={stage === 'submitting'}
            />
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-zinc-800 pt-3">
              <button
                type="button"
                onClick={handleOpenSamples}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
              >
                <Wand2 className="w-3.5 h-3.5" /> Sử dụng Prompt mẫu
              </button>
              <span className="text-[10px] text-gray-300 font-mono font-bold">{prompt.length}/2000</span>
            </div>
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Khung hình</h3>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {ratios.map((r) => (
              <button
                key={r}
                onClick={() => setAspectRatio(r)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all ${
                  aspectRatio === r ? 'bg-gray-900 text-white shadow-md' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Model Toggle */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Model AI</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => isFlashAvailable && setAiModel('flash')}
              disabled={!isFlashAvailable}
              className={`py-3 rounded-2xl text-sm font-medium transition-all ${
                aiModel === 'flash' ? 'bg-gray-900 text-white shadow-md' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
              } ${!isFlashAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Zap className="w-4 h-4 mx-auto mb-1" /> Flash
            </button>
            <button
              onClick={() => isProAvailable && setAiModel('pro')}
              disabled={!isProAvailable}
              className={`py-3 rounded-2xl text-sm font-medium transition-all ${
                aiModel === 'pro' ? 'bg-gray-900 text-white shadow-md' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
              } ${!isProAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Crown className="w-4 h-4 mx-auto mb-1" /> Pro
            </button>
          </div>
        </div>

        {availableResolutions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 tracking-wider ml-1">ĐỘ PHÂN GIẢI</h3>
            <div className="flex gap-2">
              {availableResolutions.map((res) => (
                <button
                  key={res}
                  onClick={() => setResolution(res as TstResolution)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    resolution === res ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 border border-indigo-200 dark:border-indigo-500/30 shadow-sm' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 tracking-wider ml-1">TỐC ĐỘ XỬ LÝ</h3>
          <div className="flex gap-2">
            {availableSpeedLabels.map((spd) => (
              <button
                key={spd}
                onClick={() => setSpeed(spd)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  speed === spd ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 border border-orange-200 dark:border-orange-500/30 shadow-sm' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
                }`}
              >
                {spd}
              </button>
            ))}
          </div>
        </div>

        {availableServerLabels.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 tracking-wider ml-1">MÁY CHỦ</h3>
            <div className="flex gap-2 flex-wrap">
              {availableServerLabels.map((srv) => (
                <button
                  key={srv.id}
                  onClick={() => setServer(srv.label)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex-grow ${
                    server === srv.label ? 'bg-red-50 dark:bg-red-500/10 text-red-700 border border-red-200 dark:border-red-500/30 shadow-sm' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
                  }`}
                >
                  {srv.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#18181B]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">Luồng xử lý</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-400 dark:text-zinc-500">Mobile đang dùng cùng queue recipe với desktop: chuẩn hóa input, stage ảnh, dựng payload, rồi gửi sang worker hiện tại của hệ thống.</p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-3 py-2 text-right dark:bg-[#27272A]">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">Chi phí</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-sm font-bold text-gray-900 dark:text-white">
                {costDisplay}
                <Coins className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-gray-50 p-3 dark:bg-[#27272A]"><p className="text-gray-400 dark:text-zinc-500">Model</p><p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{aiModel === 'flash' ? 'Flash' : 'Pro'}</p></div>
            <div className="rounded-2xl bg-gray-50 p-3 dark:bg-[#27272A]"><p className="text-gray-400 dark:text-zinc-500">Queue</p><p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{queueStats.myImageProcessing} đang xử lý • {queueStats.myQueued} chờ</p></div>
            <div className="rounded-2xl bg-gray-50 p-3 dark:bg-[#27272A]"><p className="text-gray-400 dark:text-zinc-500">Server</p><p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{server}</p></div>
            <div className="rounded-2xl bg-gray-50 p-3 dark:bg-[#27272A]"><p className="text-gray-400 dark:text-zinc-500">Output</p><p className="mt-1 font-semibold text-gray-700 dark:text-zinc-200">{resolution} • {aspectRatio}</p></div>
          </div>
        </div>

        {(stage === 'submitting' || submissionLogs.length > 0) && (
          <div className="rounded-[24px] border border-purple-200 bg-purple-50/70 p-4 shadow-sm dark:border-purple-500/20 dark:bg-purple-500/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-purple-800 dark:text-purple-200">Đang tạo và đưa job vào hàng đợi</h3>
                <p className="mt-1 text-xs text-purple-600 dark:text-purple-300">{formatTime(elapsedSeconds)} / ~{formatTime(estimatedSeconds)}</p>
              </div>
              <Loader className="w-5 h-5 animate-spin text-purple-500" />
            </div>
            <p className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-black/20 dark:text-zinc-100">{submissionMessage || 'Đang chuẩn bị job...'}</p>
            <div className="mt-3 space-y-2">
              {submissionLogs.map((log, idx) => (
                <div key={`${log}-${idx}`} className="flex items-start gap-2 rounded-2xl bg-white/70 px-3 py-2 text-xs text-gray-600 dark:bg-black/20 dark:text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gray-50 dark:bg-[#27272A] rounded-2xl p-3 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">{SMART_TIPS[currentTipIdx]}</p>
        </div>

        {catalogError && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-2xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{catalogError}</p>
            <button onClick={() => { setCatalogLoading(true); setCatalogError(null); fetchTstPricing(true).then(() => setCatalogLoading(false)); }}>
              <RefreshCw className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}

        {(queueStats.myImageProcessing > 0 || queueStats.myQueued > 0) && (
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-2xl p-3 flex items-center gap-2">
            <Loader className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            <p className="text-xs text-blue-700">
              {queueStats.myImageProcessing > 0 && `${queueStats.myImageProcessing} ảnh đang xử lý`}
              {queueStats.myImageProcessing > 0 && queueStats.myQueued > 0 && ' • '}
              {queueStats.myQueued > 0 && `${queueStats.myQueued} đang chờ`}
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-[70px] left-0 right-0 p-5 pt-8 bg-gradient-to-t from-[#fcfcfc] via-[#fcfcfc] dark:from-[#09090b] dark:via-[#09090b] to-transparent max-w-md mx-auto xl:absolute xl:bottom-0">
        <Button
          size="lg"
          className="w-full shadow-2xl shadow-black/10 flex items-center justify-center gap-3 bg-[var(--color-primary)] relative overflow-hidden group"
          disabled={isGenerateDisabled || stage === 'submitting'}
          onClick={handleGenerate}
        >
          {stage === 'submitting' ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              <span className="text-sm font-semibold">Đang gửi job...</span>
            </>
          ) : cooldownRemaining > 0 ? (
            <span className="text-sm font-semibold">Đợi {cooldownRemaining}s</span>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-white/90" />
              <span className="font-semibold text-[15px]">Bắt đầu sáng tạo</span>
            </>
          )}

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-md">
            <span className="text-[12px] font-bold text-white">{costDisplay}</span>
            <Coins className="w-3 h-3 text-[var(--color-accent)]" />
          </div>
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {showSampleModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setShowSampleModal(false)}>
          <div className="flex h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-[32px] border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#12121A]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 dark:border-white/10">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Thư viện Prompt mẫu</h3>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{currentCategoryName || MODE_META[activeMode].sampleCategoryName}</p>
              </div>
              <button onClick={() => setShowSampleModal(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50/70 p-4 dark:bg-black/10 hide-scrollbar">
              {loadingSamples && samplePrompts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <Loader className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm text-gray-500 dark:text-zinc-400">Đang tải Prompt mẫu...</p>
                </div>
              ) : samplePrompts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-gray-500 dark:text-zinc-400">
                  <Wand2 className="w-12 h-12 opacity-30" />
                  <p>Hiện chưa có Prompt mẫu cho chế độ này.</p>
                  <button onClick={() => void fetchSamplePrompts(false)} className="rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-black">
                    Tải lại
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {samplePrompts.map((sample) => (
                    <button key={sample.id} type="button" onClick={() => handleSelectSample(sample)} className="overflow-hidden rounded-[24px] border border-gray-100 bg-white text-left shadow-sm transition-transform hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#18181B]">
                      <div className="aspect-[3/4] bg-gray-100 dark:bg-zinc-900">
                        <img src={sample.image_url} alt="Prompt mẫu" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <div className="space-y-2 p-3">
                        <p className="line-clamp-3 text-xs leading-relaxed text-gray-600 dark:text-zinc-300">{sample.prompt}</p>
                        <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Sử dụng Prompt này</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {hasMoreSamples && !loadingSamples && samplePrompts.length > 0 && (
                <div className="mt-6 flex justify-center pb-2">
                  <button onClick={() => void fetchSamplePrompts(true)} className="rounded-full bg-indigo-50 px-5 py-2 text-sm font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    Xem thêm
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






