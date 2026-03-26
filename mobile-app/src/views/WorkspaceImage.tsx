/**
 * WorkspaceImage - Full Generation Tool (Mobile)
 * Functional parity with desktop GenerationTool.tsx
 * Features: TST catalog, pricing, character upload, prompt, queue submission
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, ImagePlus, Coins,
  X, User, Zap, Crown, RefreshCw, Loader, AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import { APP_CONFIG } from '../constants';
import { getUserProfile, getStylePresets, getModelPricing } from '../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../services/concurrencyService';
import { enqueueServerJob } from '../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../services/storageService';
import {
  fetchTstPricing, fetchTstModels,
  getCompatibleGenerationResolutions, getCompatibleGenerationServers, getCompatibleGenerationSpeeds,
  getGenerationCostBreakdown, getGenerationModelId,
  applyServerAvailabilityToRuntimeModels, sanitizePricingEntriesWithRuntimeModels,
  uiSpeedToTst, uiServerToTst,
  type TstPricingEntry, type TstRuntimeModel, type AuditionPricingOverride, type TstResolution,
} from '../services/tstCatalog';
import type { ModelPricing } from '../services/economyService';
import type { GeneratedImage } from '../types';

type GenMode = 'single' | 'couple' | 'trio' | 'squad';
type Stage = 'input' | 'submitting';

interface CharacterInput {
  id: number;
  bodyImage: string | null;
  faceImage: string | null;
  gender: 'female' | 'male';
  isFaceLocked: boolean;
}

const SMART_TIPS = [
  'Tip: Ảnh khuôn mặt nên chụp cận, rõ nét để AI tái tạo chính xác.',
  'Tip: Nhập mô tả chi tiết màu sắc trang phục để AI vẽ đúng ý bạn.',
  'Tip: Tắt "Khóa Mặt" nếu muốn AI tự sáng tạo khuôn mặt mới.',
  'Tip: Ảnh mẫu (Ref) nên có góc chụp tương đồng với ý tưởng.',
];

const NEGATIVE_PROMPT = 'crowd, extra people, audience, bystanders, deformed, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, disgusting, poorly drawn hands, missing limb, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long neck, long body, mutated hands and fingers, out of frame, blender, doll, cropped, low-res, close-up, poorly-drawn face, out of frame double, two heads, blurred, ugly, disfigured, too many fingers, deformed, repetitive, black and white, grainy, extra limbs, bad anatomy, duplicate, photorealistic, realistic photo, sketch, cartoon, drawing, art, 2d';

const MODE_TO_FEATURE_ID: Record<GenMode, string> = {
  single: 'single_photo_gen',
  couple: 'couple_photo_gen',
  trio: 'group_3_gen',
  squad: 'group_4_gen',
};

export function WorkspaceImage() {
  const navigate = useNavigate();
  useAuth();
  const { notify } = useNotification();
  const { queueStats } = useConcurrency();

  // --- Core State ---
  const [stage, setStage] = useState<Stage>('input');
  const [activeMode, setActiveMode] = useState<GenMode>('single');
  const [characters, setCharacters] = useState<CharacterInput[]>([
    { id: 1, bodyImage: null, faceImage: null, gender: 'female', isFaceLocked: true },
  ]);
  const [activeCharTab, setActiveCharTab] = useState(1);

  const [prompt, setPrompt] = useState('');
  const [refImage, setRefImage] = useState<string | null>(null);

  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState<TstResolution>('1K');
  const [speed, setSpeed] = useState<'Nhanh' | 'Tiết Kiệm'>('Nhanh');
  const [server, setServer] = useState('VIP 1');
  const [aiModel, setAiModel] = useState<'flash' | 'pro'>('flash');

  // --- TST Catalog State ---
  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [runtimeModels, setRuntimeModels] = useState<TstRuntimeModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // --- Cooldown ---
  const [cooldownRemaining, setCooldownRemaining] = useState(() => {
    const saved = localStorage.getItem('gen_cooldown_end');
    if (saved) {
      const end = parseInt(saved, 10);
      const now = Date.now();
      if (end > now) return Math.ceil((end - now) / 1000);
    }
    return 0;
  });

  // --- Style Presets ---
  const [activeStylePreset, setActiveStylePreset] = useState<string | null>(null);
  const [availableStyles, setAvailableStyles] = useState<any[]>([]);

  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadType = useRef<{ charId?: number; type: 'body' | 'face' | 'ref' } | null>(null);

  // --- Pricing Overrides ---
  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
    modelId: row.model_id,
    optionId: row.option_id,
    auditionPriceVcoin: row.audition_price_vcoin,
  }));

  // --- Derived Catalog Data ---
  const generationSpeedId = uiSpeedToTst(speed) || 'fast';
  const generationServerId = uiServerToTst(server) || 'fast';
  const generationTier = aiModel === 'flash' ? 'flash' : 'pro';
  const availableResolutions = getCompatibleGenerationResolutions({
    tier: generationTier, pricingEntries, serverId: generationServerId, speed: generationSpeedId,
  });
  const availableServers = getCompatibleGenerationServers({
    tier: generationTier, pricingEntries, speed: generationSpeedId, resolution,
  });
  const availableSpeeds = getCompatibleGenerationSpeeds({
    tier: generationTier, pricingEntries, serverId: generationServerId, resolution,
  });
  const selectedCost = getGenerationCostBreakdown({
    tier: generationTier, resolution, speed: generationSpeedId,
    serverId: generationServerId, pricingEntries, pricingOverrides,
  });
  const activeFeature = APP_CONFIG.main_features.find((feature) => feature.id === MODE_TO_FEATURE_ID[activeMode]) ?? APP_CONFIG.main_features[0];
  const availableSpeedLabels = availableSpeeds.map((speedId) => (speedId === 'slow' ? 'Tiết Kiệm' : 'Nhanh'));

  const runtimeImageModelIds = new Set(
    runtimeModels.filter((m) => m.type === 'image').map((m) => m.model.trim().toLowerCase()),
  );
  const isFlashAvailable = runtimeImageModelIds.has(getGenerationModelId('flash'))
    && pricingEntries.some((e) => e.model.trim().toLowerCase() === getGenerationModelId('flash'));
  const isProAvailable = runtimeImageModelIds.has(getGenerationModelId('pro'))
    && pricingEntries.some((e) => e.model.trim().toLowerCase() === getGenerationModelId('pro'));
  const isCatalogReady = !catalogLoading && !catalogError && pricingEntries.length > 0 && runtimeModels.length > 0;
  const isGenerateDisabled = cooldownRemaining > 0 || !isCatalogReady || !selectedCost.available
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
        const [entries, models, pricingConfig] = await Promise.all([
          fetchTstPricing(),
          fetchTstModels(),
          getModelPricing(),
        ]);
        const filteredModels = applyServerAvailabilityToRuntimeModels(models);
        setPricingEntries(sanitizePricingEntriesWithRuntimeModels(entries, filteredModels));
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
    if (availableServers.length > 0 && !availableServers.includes(server)) {
      setServer(availableServers[0]);
    }
  }, [availableServers, server]);

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

  // --- Mode Change ---
  const handleModeChange = useCallback((mode: GenMode) => {
    setActiveMode(mode);
    setActiveCharTab(1);
    let count = 1;
    if (mode === 'couple') count = 2;
    if (mode === 'trio') count = 3;
    if (mode === 'squad') count = 4;
    
    setCharacters((prev) => {
      const newChars: CharacterInput[] = [];
      for (let i = 1; i <= count; i++) {
        const existing = prev.find((p) => p.id === i);
        newChars.push(
          existing || { id: i, bodyImage: null, faceImage: null, gender: i % 2 === 0 ? 'male' : 'female', isFaceLocked: true },
        );
      }
      return newChars;
    });
  }, []);

  // --- File Upload ---
  const handleUploadClick = (charId: number, type: 'body' | 'face') => {
    activeUploadType.current = { charId, type };
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
        setCharacters((prev) => prev.map((c) => c.id === currentType.charId ? { ...c, bodyImage: result } : c));
      } else if (currentType?.charId && currentType.type === 'face') {
        setCharacters((prev) => prev.map((c) => c.id === currentType.charId ? { ...c, faceImage: result, isFaceLocked: true } : c));
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

    // Concurrency check
    if (queueStats.myImageProcessing >= CONCURRENCY_LIMITS.user.imageProcessing
      && queueStats.myQueued >= CONCURRENCY_LIMITS.user.queued) {
      notify('Bạn đã đạt giới hạn. Vui lòng đợi job hiện tại hoàn thành.', 'warning');
      return;
    }
    if (queueStats.systemQueued >= CONCURRENCY_LIMITS.system.queued) {
      notify('Hệ thống đang quá tải. Thử lại sau.', 'error');
      return;
    }

    if (!prompt.trim()) { notify('Vui lòng nhập mô tả.', 'warning'); return; }

    const missingSlots = characters.filter((c) => !c.bodyImage && !c.faceImage).map((c) => c.id);
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
      cost,
    };

    try { await saveImageToLocalCache(queuedImage); } catch (e) { console.warn('Failed to persist queued placeholder', e); }

    // Navigate to gallery immediately (fire-and-forget submission)
    navigate('/gallery');

    void (async () => {
      try {
        const stagedCharacterGroups = await Promise.all(
          characters.map(async (char, idx) => {
            const references: { source: string; kind: string }[] = [];

            if (char.bodyImage) {
              const bodyStaged = await uploadFileToR2(char.bodyImage, `inputs/generation/${activeMode}/character-${idx + 1}/body`);
              references.push({ source: bodyStaged, kind: 'body' });
            }

            if (char.isFaceLocked && char.faceImage && char.faceImage !== char.bodyImage) {
              const faceStaged = await uploadFileToR2(char.faceImage, `inputs/generation/${activeMode}/character-${idx + 1}/face`);
              references.push({ source: faceStaged, kind: 'face' });
            } else if (!char.bodyImage && char.faceImage) {
              const faceStaged = await uploadFileToR2(char.faceImage, `inputs/generation/${activeMode}/character-${idx + 1}/face`);
              references.push({ source: faceStaged, kind: 'face' });
            }

            return { characterIndex: idx + 1, gender: char.gender, references };
          }),
        );

        const stagedCharacterImages = stagedCharacterGroups.flatMap((g) => g.references.map((r) => r.source));

        // Stage ref image
        let stagedSampleImage: string | null = null;
        if (refImage) {
          stagedSampleImage = await uploadFileToR2(refImage, `inputs/generation/${activeMode}/sample`);
        }

        // Stage style image
        let stagedStyleImage: string | null = null;
        if (activeStylePreset && activeStylePreset.startsWith('http')) {
          stagedStyleImage = activeStylePreset; // Already a URL
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

        const queuePayload = {
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

        await enqueueServerJob({
          id: jobId,
          prompt: basePrompt,
          toolId: activeFeature.id,
          toolName: activeFeature.name.en,
          engine: aiModel === 'flash' ? `Flash Engine ${resolution}` : `Pro Engine ${resolution}`,
          assetType: 'image',
          costVcoin: cost,
          queueKind: 'image_generate',
          queuePayload,
        });

        window.dispatchEvent(new Event('balance_updated'));
        notify('Đã tạo job. Kết quả sẽ cập nhật trong Lịch sử.', 'success');
        localStorage.setItem('gen_cooldown_end', (Date.now() + 60000).toString());
        setCooldownRemaining(60);
      } catch (error) {
        console.error(error);
        const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
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
            <Sparkles className="w-4 h-4 text-[var(--color-accent)]" /> Tạo Ảnh AI
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
              {mode === 'single' && '👤 Đơn'}
              {mode === 'couple' && '👥 Đôi'}
              {mode === 'trio' && '👨‍👩‍👧 3 Người'}
              {mode === 'squad' && '👨‍👩‍👧‍👦 4 Người'}
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
            {/* Gender Toggle */}
            <div className="flex gap-2 justify-center">
              {(['female', 'male'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setCharacters((prev) => prev.map((c) => c.id === char.id ? { ...c, gender: g } : c))}
                  className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${
                    char.gender === g ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1' : 'bg-white dark:bg-[#18181B] border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400'
                  }`}
                >
                  {g === 'female' ? '♀ Nữ' : '♂ Nam'}
                </button>
              ))}
            </div>

            {/* Single Unified Upload */}
            <button
              onClick={() => handleUploadClick(char.id, 'body')}
              className="w-full aspect-square md:aspect-video rounded-3xl border-2 border-dashed border-gray-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] flex flex-col items-center justify-center gap-3 overflow-hidden hover:border-gray-400 transition-colors relative shadow-sm"
            >
              {char.bodyImage ? (
                <>
                  <img src={char.bodyImage} alt="Body reference" className="w-full h-full object-cover" />
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
                    <span className="block text-xs text-gray-400 dark:text-zinc-500 mt-1">Gương mặt rõ nét, chụp thẳng</span>
                  </div>
                </>
              )}
            </button>

            <button
              onClick={() => handleUploadClick(char.id, 'face')}
              className="w-full rounded-3xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#18181B] flex items-center gap-4 p-4 transition-colors shadow-sm"
            >
              {char.faceImage ? (
                <img src={char.faceImage} alt="Face reference" className="w-16 h-16 rounded-2xl object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-[#27272A] flex items-center justify-center shrink-0">
                  <ImagePlus className="w-6 h-6 text-gray-300" />
                </div>
              )}
              <div className="text-left">
                <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">Ảnh mặt riêng</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                  {char.faceImage ? 'Đã thêm ảnh mặt để khóa nhận diện.' : 'Tùy chọn, nên dùng ảnh cận mặt sắc nét.'}
                </p>
              </div>
            </button>

            <button
              onClick={() => setCharacters((prev) => prev.map((item) => item.id === char.id ? { ...item, isFaceLocked: !item.isFaceLocked } : item))}
              className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 border transition-all ${char.isFaceLocked ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-200' : 'bg-white dark:bg-[#18181B] border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400'}`}
            >
              <div className="text-left">
                <p className="text-sm font-semibold">Khóa mặt</p>
                <p className="text-xs opacity-80">Bật để ưu tiên ảnh mặt riêng khi render.</p>
              </div>
              <div className={`w-11 h-6 rounded-full relative transition-colors ${char.isFaceLocked ? 'bg-amber-500' : 'bg-gray-200 dark:bg-zinc-700'}`}>
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${char.isFaceLocked ? 'translate-x-5' : ''}`} />
              </div>
            </button>
          </div>
        ))}

        {/* Prompt & Ref Image */}
        <div className="relative group space-y-3">
          {/* Ref Image (Above prompt) */}
          <div className="bg-white dark:bg-[#18181B] rounded-[24px] p-4 shadow-sm border border-gray-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">Ảnh mẫu (Kiểu dáng, phong cách)</h3>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Không bắt buộc</p>
            </div>
            
            {refImage ? (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden ring-2 ring-gray-100 dark:ring-zinc-800">
                <img src={refImage} alt="Ref" className="w-full h-full object-cover" />
                <button onClick={() => setRefImage(null)} className="absolute top-1 right-1 bg-black/60 rounded-full p-1 hover:bg-black transition-colors">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <button onClick={handleRefUploadClick} className="w-16 h-16 rounded-xl bg-gray-50 dark:bg-[#27272A] border-2 border-dashed border-gray-200 dark:border-zinc-700 flex items-center justify-center text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:text-white hover:border-[var(--color-primary)] transition-colors">
                <ImagePlus className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Textarea */}
          <div className="relative bg-white dark:bg-[#18181B] rounded-[24px] p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)] ring-1 ring-gray-100 dark:ring-zinc-800 focus-within:ring-2 focus-within:ring-[var(--color-primary)]">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Nhập mô tả ảnh bạn muốn tạo (Ví dụ: Một cô gái mặc áo dài trắng đứng bên hồ sen, cinematic lighing)..."
              className="w-full h-28 bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-gray-300 text-gray-800 dark:text-zinc-100"
              disabled={stage === 'submitting'}
            />
            <div className="flex items-center justify-end border-t border-gray-100 dark:border-zinc-800 pt-3">
              <span className="text-[10px] text-gray-300 font-mono font-bold">{prompt.length}/1000</span>
            </div>
          </div>
        </div>

        {availableStyles.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Style Preset</h3>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
              {availableStyles.map((style: any) => {
                const isSelected = activeStylePreset === style.image_url;
                return (
                  <button
                    key={style.id}
                    onClick={() => setActiveStylePreset(style.image_url)}
                    className={`min-w-[92px] rounded-2xl overflow-hidden border transition-all ${isSelected ? 'border-gray-900 dark:border-white shadow-md' : 'border-gray-100 dark:border-zinc-800'}`}
                  >
                    <div className="aspect-[3/4] bg-white dark:bg-[#18181B]">
                      <img src={style.image_url} alt={style.name} className="w-full h-full object-cover" />
                    </div>
                    <div className={`px-2 py-2 text-[11px] font-semibold truncate ${isSelected ? 'bg-gray-900 text-white' : 'bg-white dark:bg-[#18181B] text-gray-700 dark:text-zinc-200'}`}>
                      {style.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

        {/* Resolution Picker */}
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
        
        {/* Speed Picker */}
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

        {/* Server Picker */}
        {availableServers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 tracking-wider ml-1">MÁY CHỦ</h3>
            <div className="flex gap-2 flex-wrap">
              {availableServers.map((srv) => {
                const isSelected = uiServerToTst(server) === uiServerToTst(srv) || (srv === 'VIP 1' && server === 'VIP 1');
                return (
                  <button
                    key={srv}
                    onClick={() => setServer(srv)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex-grow ${
                      isSelected ? 'bg-red-50 dark:bg-red-500/10 text-red-700 border border-red-200 dark:border-red-500/30 shadow-sm' : 'bg-white dark:bg-[#18181B] text-gray-500 dark:text-zinc-400 border border-gray-100 dark:border-zinc-800'
                    }`}
                  >
                    {srv}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Smart Tip */}
        <div className="bg-gray-50 dark:bg-[#27272A] rounded-2xl p-3 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">{SMART_TIPS[currentTipIdx]}</p>
        </div>

        {/* Catalog Error */}
        {catalogError && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-2xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{catalogError}</p>
            <button onClick={() => { setCatalogLoading(true); setCatalogError(null); fetchTstPricing(true).then(() => setCatalogLoading(false)); }}>
              <RefreshCw className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}

        {/* Queue Status */}
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

      {/* Generate Button - Fixed Bottom */}
      <div className="fixed bottom-[70px] left-0 right-0 p-5 pt-8 bg-gradient-to-t from-[#fcfcfc] via-[#fcfcfc] dark:from-[#09090b] dark:via-[#09090b] to-transparent max-w-md mx-auto xl:absolute xl:bottom-0">
        <Button
          size="lg"
          className="w-full shadow-2xl shadow-black/10 flex items-center justify-center gap-3 bg-[var(--color-primary)] relative overflow-hidden group"
          disabled={isGenerateDisabled || !prompt.trim() || stage === 'submitting'}
          onClick={handleGenerate}
        >
          {stage === 'submitting' ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : cooldownRemaining > 0 ? (
            <span className="text-sm font-semibold">Đợi {cooldownRemaining}s</span>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-white/90" />
              <span className="font-semibold text-[15px]">Bắt đầu Sáng Tạo</span>
            </>
          )}

          {/* Cost Preview */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-md">
            <span className="text-[12px] font-bold text-white">{costDisplay}</span>
            <Coins className="w-3 h-3 text-[var(--color-accent)]" />
          </div>
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
