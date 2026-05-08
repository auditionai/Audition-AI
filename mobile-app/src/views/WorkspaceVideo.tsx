/**
 * WorkspaceVideo - Full Generation Tool (Mobile)
 * Functional parity with desktop VideoTool.tsx
 * Features: Video AI & Motion Control, TST catalog, queue submission
 */

import React, { useState, useRef, useEffect } from 'react';

import {
  Sparkles, ImagePlus, Coins,
  Film, User, Loader, AlertTriangle,
  Video, Music, VolumeX 
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/NotificationSystem';
import { getUserProfile, getModelPricing, getTstServerAvailabilityConfig } from '../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../services/concurrencyService';
import { enqueueServerJob } from '../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../services/storageService';
import { generateVideoScriptWithVertex } from '../services/videoScriptDirectorService';
import {
  fetchTstPricing, fetchTstModels,
  getMotionCompatibleServers, getMotionCompatibleSpeeds, getMotionCostBreakdown, getMotionModelSpecs,
  getVideoCompatibleDurations, getVideoCompatibleResolutions, getVideoCompatibleServers, getVideoCompatibleSpeeds, getVideoCostBreakdown, getVideoModelSpecs,
  applyServerAvailabilityToRuntimeModels, sanitizePricingEntriesWithRuntimeModels,
  uiSpeedToTst, uiServerToTst, tstServerToUi, tstSpeedToUi,
  type TstPricingEntry, type TstRuntimeModel, type AuditionPricingOverride
} from '../services/tstCatalog';
import type { ModelPricing } from '../services/economyService';
import type { GeneratedImage } from '../types';

type VideoMode = 'video_ai' | 'motion_control';
type Stage = 'input' | 'submitting';

interface AIModelOption {
  id: string;
  name: string;
  price: number;
}

const SMART_TIPS = [
  '🎥 MỚI: Hỗ trợ tạo video từ ảnh tĩnh với độ mượt mà cao.',
  '⚡ Tip: Mô hình Kling cho chuyển động chân thực và tự nhiên nhất.',
  '👑 Lưu ý: Video 10s sẽ tốn nhiều thời gian xử lý hơn video 5s.',
  '🎨 Mẹo: Mô tả chi tiết hành động (ví dụ: đang đi bộ, mỉm cười) để AI hiểu rõ.',
  '📸 Mẹo: Ảnh gốc rõ nét sẽ cho ra video chất lượng cao hơn.',
  '🏃 Tip: Motion Control giúp bạn điều khiển chuyển động nhân vật theo video mẫu.'
];

export function WorkspaceVideo() {
  const navigate = useNavigate();
  useAuth();
  const { notify } = useNotification();
  const { queueStats } = useConcurrency();

  // --- Core State ---
  const [stage, setStage] = useState<Stage>('input');
  const [activeMode, setActiveMode] = useState<VideoMode>('video_ai');

  // Video AI State
  const [prompt, setPrompt] = useState('');
  const [keyframeImage, setKeyframeImage] = useState<string | null>(null);
  const [videoModel, setVideoModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('5s');
  const [quality, setQuality] = useState('720p');
  const [sound, setSound] = useState(false);
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('VIP 1');

  // Motion Control State
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [motionVideoFile, setMotionVideoFile] = useState<File | null>(null);
  const [motionVideoUrl, setMotionVideoUrl] = useState<string | null>(null);
  const [motionVideoDurationSeconds, setMotionVideoDurationSeconds] = useState<number | null>(null);
  const [motionPrompt, setMotionPrompt] = useState('');
  const [motionModel, setMotionModel] = useState('');

  // --- TST Catalog State ---
  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [auditionPricing, setAuditionPricing] = useState<ModelPricing[]>([]);
  const [runtimeModels, setRuntimeModels] = useState<TstRuntimeModel[]>([]);
  const [videoModelOptions, setVideoModelOptions] = useState<AIModelOption[]>([]);
  const [motionModelOptions, setMotionModelOptions] = useState<AIModelOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [currentTipIdx, setCurrentTipIdx] = useState(0);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptStyle, setScriptStyle] = useState('Cinematic');
  const [scriptTheme, setScriptTheme] = useState('Tự động theo ảnh');
  const [scriptSoundMood, setScriptSoundMood] = useState('Phù hợp bối cảnh');
  const [scriptVoiceDialogue, setScriptVoiceDialogue] = useState(false);
  const [scriptTargetModel, setScriptTargetModel] = useState('');

  // --- Cooldown ---
  const [cooldownRemaining, setCooldownRemaining] = useState(() => {
    const saved = localStorage.getItem('video_gen_cooldown_end');
    if (saved) {
      const end = parseInt(saved, 10);
      const now = Date.now();
      if (end > now) return Math.ceil((end - now) / 1000);
    }
    return 0;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'keyframe' | 'character' | 'motion' | null>(null);

  // --- Load Catalog ---
  useEffect(() => {
    const loadCatalog = async (forceRefresh = false) => {
      try {
        const [pricing, models, pricingConfig, serverAvailabilityConfig] = await Promise.all([
          fetchTstPricing(forceRefresh),
          fetchTstModels(forceRefresh),
          getModelPricing(),
          getTstServerAvailabilityConfig()
        ]);
        const filteredModels = applyServerAvailabilityToRuntimeModels(models, serverAvailabilityConfig);
        const livePricing = sanitizePricingEntriesWithRuntimeModels(pricing, filteredModels, serverAvailabilityConfig);
        setPricingEntries(livePricing);
        setRuntimeModels(filteredModels);
        setAuditionPricing(pricingConfig || []);

        const overrideRows: AuditionPricingOverride[] = (pricingConfig || []).map((row) => ({
          modelId: row.model_id,
          optionId: row.option_id,
          auditionPriceVcoin: row.audition_price_vcoin,
        }));

        const liveVideoModels = getVideoModelSpecs(livePricing, models).map((spec: any) => ({
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

        const liveMotionModels = getMotionModelSpecs(livePricing, models).map((spec: any) => ({
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

        if (liveVideoModels.length > 0) {
          setVideoModelOptions(liveVideoModels);
          setVideoModel((current) => liveVideoModels.some((m: AIModelOption) => m.id === current) ? current : liveVideoModels[0].id);
        }
        if (liveMotionModels.length > 0) {
          setMotionModelOptions(liveMotionModels);
          setMotionModel((current) => liveMotionModels.some((m: AIModelOption) => m.id === current) ? current : liveMotionModels[0].id);
        }
        setCatalogError(null);
      } catch (error) {
        setCatalogError('TST đang bảo trì hoặc không sẵn sàng.');
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, []);

  // --- Derived Catalog Data ---
  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
    modelId: row.model_id, optionId: row.option_id, auditionPriceVcoin: row.audition_price_vcoin,
  }));

  const currentCostBreakdown = activeMode === 'motion_control'
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
        serverId: uiServerToTst(server) || 'fast',
        resolution: quality.toLowerCase(),
        duration: duration.toLowerCase(),
        speed: uiSpeedToTst(speed) || 'fast',
        audio: sound,
        pricingEntries,
        pricingOverrides
      });

  const getModelOptions = () => {
    if (activeMode === 'motion_control') {
      const motionSpec = getMotionModelSpecs(pricingEntries, runtimeModels).find((spec: any) => spec.modelId === motionModel);
      return {
        showAspectRatio: false,
        aspectRatios: [] as string[],
        qualities: ((motionSpec?.resolutions as string[]) || []).map((v: string) => v.toUpperCase()),
        durations: [] as string[],
        supportsAudio: false
      };
    }

    const videoSpec = getVideoModelSpecs(pricingEntries, runtimeModels).find((spec: any) => spec.modelId === videoModel);
    const compatibleResolutions = getVideoCompatibleResolutions({
      modelId: videoModel, pricingEntries, serverId: uiServerToTst(server),
      duration: duration.toLowerCase(), speed: uiSpeedToTst(speed) || 'fast', audio: sound
    });
    const compatibleDurations = getVideoCompatibleDurations({
      modelId: videoModel, pricingEntries, serverId: uiServerToTst(server),
      resolution: quality.toLowerCase(), speed: uiSpeedToTst(speed) || 'fast', audio: sound
    });
    return {
      showAspectRatio: ((videoSpec?.aspectRatios as string[]) || []).length > 0,
      aspectRatios: ((videoSpec?.aspectRatios as string[]) || []).map((v: string) => v.toUpperCase()),
      qualities: ((compatibleResolutions.length > 0 ? compatibleResolutions : (videoSpec?.resolutions || [])) as string[]).map((v) => v.toUpperCase()),
      durations: ((compatibleDurations.length > 0 ? compatibleDurations : (videoSpec?.durations || [])) as string[]).map((v) => v.toUpperCase()),
      supportsAudio: Boolean(videoSpec?.supportsAudio)
    };
  };

  const modelOptions = getModelOptions();

  const serverOptions = (activeMode === 'video_ai'
    ? getVideoCompatibleServers({
        modelId: videoModel, pricingEntries, resolution: quality.toLowerCase(),
        duration: duration.toLowerCase(), speed: uiSpeedToTst(speed) || 'fast', audio: sound
      })
    : getMotionCompatibleServers({
        modelId: motionModel, pricingEntries, resolution: quality.toLowerCase(), speed: uiSpeedToTst(speed) || 'fast'
      })
  ).map((serverId: string) => ({ label: tstServerToUi(serverId) || serverId, value: tstServerToUi(serverId) || serverId }));

  const speedOptions = activeMode === 'video_ai'
    ? getVideoCompatibleSpeeds({
        modelId: videoModel, pricingEntries, serverId: uiServerToTst(server),
        resolution: quality.toLowerCase(), duration: duration.toLowerCase(), audio: sound
      }).map((speedId: string) => ({ label: tstSpeedToUi(speedId), value: tstSpeedToUi(speedId) }))
    : getMotionCompatibleSpeeds({
        modelId: motionModel, pricingEntries, resolution: quality.toLowerCase()
      }).map((speedId: string) => ({ label: tstSpeedToUi(speedId), value: tstSpeedToUi(speedId) }));

  // --- Auto-adjust Options ---
  useEffect(() => {
    if (modelOptions.showAspectRatio && modelOptions.aspectRatios.length > 0 && !modelOptions.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(modelOptions.aspectRatios[0]);
    }
    if (modelOptions.qualities.length > 0 && !modelOptions.qualities.includes(quality)) {
      setQuality(modelOptions.qualities[0]);
    }
    if (activeMode === 'video_ai' && modelOptions.durations.length > 0 && !modelOptions.durations.includes(duration)) {
      setDuration(modelOptions.durations[0]);
    }
    if (serverOptions.length > 0 && !serverOptions.some((o: any) => o.value === server)) {
      setServer(serverOptions[0].value);
    }
    if (speedOptions.length > 0 && !speedOptions.some((o: any) => o.value === speed)) {
      setSpeed(speedOptions[0].value);
    }
    if (!modelOptions.supportsAudio && sound) {
      setSound(false);
    }
  }, [activeMode, aspectRatio, duration, modelOptions, quality, server, serverOptions, sound, speed, speedOptions]);

  // --- Cooldown & Tips ---
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) { localStorage.removeItem('video_gen_cooldown_end'); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownRemaining]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTipIdx((prev) => (prev + 1) % SMART_TIPS.length), 5000);
    return () => clearInterval(interval);
  }, []);

  // --- Validation ---
  const isCatalogReady = !catalogLoading && !catalogError && pricingEntries.length > 0 && runtimeModels.length > 0
    && (activeMode === 'video_ai' ? videoModelOptions.length > 0 : motionModelOptions.length > 0);

  const calculateCost = () => currentCostBreakdown.vcoin;

  const getVideoDurationSeconds = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = objectUrl;
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error('Failed read'));
      });
      return Number.isFinite(duration) ? duration : null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    if (uploadTarget === 'motion') {
      const [url, dur] = await Promise.all([
        Promise.resolve(URL.createObjectURL(file)),
        getVideoDurationSeconds(file),
      ]);
      setMotionVideoUrl(url);
      setMotionVideoFile(file);
      setMotionVideoDurationSeconds(dur);
      setUploadTarget(null);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (uploadTarget === 'keyframe') setKeyframeImage(result);
      if (uploadTarget === 'character') setCharacterImage(result);
      setUploadTarget(null);
      e.target.value = '';
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
    try {
      const script = await generateVideoScriptWithVertex({
        imageSource: keyframeImage,
        durationSeconds: parseInt(duration, 10) || 5,
        userPrompt: prompt,
        scriptOptions: {
          style: scriptStyle,
          theme: scriptTheme,
          soundMood: scriptSoundMood,
          voiceDialogue: scriptVoiceDialogue,
          targetModel: scriptTargetModel || videoModel,
        },
      });
      setPrompt(script);
      notify('Đã tạo kịch bản video bằng AI.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể tạo kịch bản video bằng Vertex AI.', 'error');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerate = async () => {
    if (stage === 'submitting') return;
    if (cooldownRemaining > 0) { notify(`Vui lòng đợi ${cooldownRemaining}s`, 'warning'); return; }
    if (!isCatalogReady) { notify('TST đang bảo trì.', 'error'); return; }
    if (!currentCostBreakdown.available) { notify('Cấu hình không khả dụng.', 'error'); return; }

    if (activeMode === 'video_ai' && !keyframeImage) {
      notify('Vui lòng tải ảnh keyframe trước khi gửi job tạo video lên TST.', 'error');
      return;
    }
    if (activeMode === 'motion_control' && (!characterImage || !motionVideoFile)) {
      notify('Vui lòng tải lên cả ảnh nhân vật và video chuyển động.', 'error');
      return;
    }
    if (activeMode === 'motion_control' && motionVideoDurationSeconds === null) {
      notify('Không thể đọc thời lượng video chuyển động. Vui lòng tải lại video mẫu từ 3 đến 30 giây.', 'error');
      return;
    }
    if (activeMode === 'motion_control' && motionVideoDurationSeconds !== null && (motionVideoDurationSeconds < 3 || motionVideoDurationSeconds > 30)) {
      notify('Video chuyển động phải dài từ 3 đến 30 giây.', 'error');
      return;
    }

    if (queueStats.myVideoProcessing >= CONCURRENCY_LIMITS.user.videoProcessing && queueStats.myQueued >= CONCURRENCY_LIMITS.user.queued) {
      notify('Bạn đã đạt giới hạn luồng video. Xin đợi.', 'warning');
      return;
    }
    if (queueStats.systemQueued >= CONCURRENCY_LIMITS.system.queued) {
      notify('Hệ thống đang quá tải. Thử lại sau.', 'error');
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
    const activeOptions = activeMode === 'video_ai' ? videoModelOptions : motionModelOptions;
    const selectedModelName = activeOptions.find((m) => m.id === (activeMode === 'video_ai' ? videoModel : motionModel))?.name || (activeMode === 'video_ai' ? videoModel : motionModel);
    const effectiveToolId = activeMode === 'motion_control' ? 'motion_control_gen' : 'video_ai_gen';
    const effectiveToolName = activeMode === 'motion_control' ? 'Motion Control' : 'Video AI';
    const effectiveMotionPrompt = motionPrompt.trim() || 'Animate the character naturally by following the motion reference video, preserve the original face, body, outfit, and identity.';
    const queuedPrompt = activeMode === 'video_ai' ? (prompt || 'Create a cinematic video') : effectiveMotionPrompt;

    const queuedVideo: GeneratedImage = {
      id: jobId, url: '', prompt: queuedPrompt, timestamp: Date.now(), updatedAt: Date.now(),
      assetType: 'video', toolId: effectiveToolId, toolName: effectiveToolName,
      engine: selectedModelName, status: 'queued', jobId, progress: 0, cost,
    };

    try { await saveImageToLocalCache(queuedVideo); } catch (e) { console.warn(e); }

    navigate('/gallery');

    void (async () => {
      try {
        const requestedServerId = uiServerToTst(server) || (activeMode === 'video_ai' ? 'fast' : 'vip2');
        const requestedSpeedId = uiSpeedToTst(speed) || 'fast';
        const effectiveServerId = activeMode === 'video_ai'
          ? (getVideoCompatibleServers({ modelId: videoModel, pricingEntries, resolution: quality.toLowerCase(), duration: duration.toLowerCase(), speed: requestedSpeedId, audio: sound }).includes(requestedServerId) ? requestedServerId : (getVideoCompatibleServers({ modelId: videoModel, pricingEntries, resolution: quality.toLowerCase(), duration: duration.toLowerCase(), speed: requestedSpeedId, audio: sound })[0] || requestedServerId))
          : (getMotionCompatibleServers({ modelId: motionModel, pricingEntries, resolution: quality.toLowerCase(), speed: requestedSpeedId }).includes(requestedServerId) ? requestedServerId : (getMotionCompatibleServers({ modelId: motionModel, pricingEntries, resolution: quality.toLowerCase(), speed: requestedSpeedId })[0] || requestedServerId));
        const effectiveSpeedId = activeMode === 'video_ai'
          ? (getVideoCompatibleSpeeds({ modelId: videoModel, pricingEntries, serverId: effectiveServerId, resolution: quality.toLowerCase(), duration: duration.toLowerCase(), audio: sound }).includes(requestedSpeedId) ? requestedSpeedId : (getVideoCompatibleSpeeds({ modelId: videoModel, pricingEntries, serverId: effectiveServerId, resolution: quality.toLowerCase(), duration: duration.toLowerCase(), audio: sound })[0] || requestedSpeedId))
          : (getMotionCompatibleSpeeds({ modelId: motionModel, pricingEntries, serverId: effectiveServerId, resolution: quality.toLowerCase() }).includes(requestedSpeedId) ? requestedSpeedId : (getMotionCompatibleSpeeds({ modelId: motionModel, pricingEntries, serverId: effectiveServerId, resolution: quality.toLowerCase() })[0] || requestedSpeedId));

        let stagedKeyframeImage = null;
        let stagedCharacterImage = null;
        let stagedMotionVideoUrl = null;

        if (activeMode === 'video_ai' && keyframeImage) {
          stagedKeyframeImage = await uploadFileToR2(keyframeImage, 'inputs/video-generate/keyframe');
        }
        if (activeMode === 'motion_control' && characterImage && motionVideoFile) {
          stagedCharacterImage = await uploadFileToR2(characterImage, 'inputs/motion-control');
          stagedMotionVideoUrl = await uploadFileToR2(motionVideoFile, 'inputs/motion-control');
        }

        const queuePayload = activeMode === 'video_ai'
          ? {
              recipeType: 'video_generate_recipe_v1', modelId: videoModel, prompt: queuedPrompt,
              duration: duration.toLowerCase(), resolution: quality.toLowerCase(), aspectRatio,
              speed: effectiveSpeedId, serverId: effectiveServerId, keyframeImage: stagedKeyframeImage, audio: sound,
            }
          : {
              recipeType: 'motion_generate_recipe_v1', modelId: motionModel, prompt: effectiveMotionPrompt,
              resolution: quality.toLowerCase(), speed: effectiveSpeedId, serverId: effectiveServerId,
              characterImage: stagedCharacterImage!, motionVideoDataUrl: stagedMotionVideoUrl!, motionVideoDurationSeconds,
            };

        await enqueueServerJob({
          id: jobId, prompt: queuedPrompt, toolId: effectiveToolId, toolName: effectiveToolName,
          engine: selectedModelName, assetType: 'video', costVcoin: cost,
          queueKind: activeMode === 'video_ai' ? 'video_generate' : 'motion_generate',
          clientPlatform: 'mobile',
          queuePayload,
        });

        window.dispatchEvent(new Event('balance_updated'));
        notify('Đã tạo job. Kết quả sẽ cập nhật trong Lịch sử.', 'success');
        localStorage.setItem('video_gen_cooldown_end', (Date.now() + 60000).toString());
        setCooldownRemaining(60);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
        try { await saveImageToLocalCache({ ...queuedVideo, status: 'failed', error: errorMsg, updatedAt: Date.now(), progress: 0 }); } catch (_) {}
        notify(errorMsg, 'error');
        setStage('input');
      }
    })();
  };

  const isGenerateDisabled = cooldownRemaining > 0 || !isCatalogReady || !currentCostBreakdown.available
    || (activeMode === 'video_ai' && !keyframeImage)
    || (activeMode === 'motion_control' && (!characterImage || !motionVideoFile));

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="flex-1 overflow-y-auto p-5 space-y-6 pb-40 hide-scrollbar">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white flex items-center justify-center gap-2">
            <Video className="w-4 h-4 text-purple-500" /> Tạo Video AI
          </h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
            {catalogLoading ? 'Đang tải catalog...' : catalogError || 'Trạm Sáng Tạo Video Engine'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1.5 bg-gray-100 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800">
          {(['video_ai', 'motion_control'] as VideoMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setActiveMode(mode)}
              className={`flex-1 py-2.5 rounded-[12px] text-sm font-medium transition-all ${
                activeMode === mode
                  ? 'bg-white dark:bg-[#18181B] text-gray-900 dark:text-white shadow-[0_2px_8px_rgb(0,0,0,0.06)]'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:text-zinc-200'
              }`}
            >
              {mode === 'video_ai' ? '🎬 Video AI' : '🚶 Motion Control'}
            </button>
          ))}
        </div>

        {activeMode === 'video_ai' ? (
          <div className="space-y-6">
            {/* Keyframe Upload */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Ảnh Gốc (Bắt Buộc)</h3>
              <button
                onClick={() => triggerUpload('keyframe')}
                className="w-full aspect-video rounded-[20px] border-2 border-dashed border-gray-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] flex flex-col items-center justify-center gap-2 overflow-hidden hover:border-purple-400 transition-colors relative"
              >
                {keyframeImage ? (
                  <>
                    <img src={keyframeImage} alt="Keyframe" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/10 transition-colors" />
                    <div className="absolute top-3 right-3 bg-black/50 text-white rounded-full p-2 backdrop-blur-md">
                      <ImagePlus className="w-4 h-4" />
                    </div>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-8 h-8 text-gray-300" />
                    <span className="text-sm font-medium text-gray-400 dark:text-zinc-500">Tải ảnh gốc lên để AI tạo video</span>
                  </>
                )}
              </button>
            </div>

            {/* Prompt */}
            <div className="relative group">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1 mb-2">Chuyển động mong muốn</h3>
              <div className="relative bg-white dark:bg-[#18181B] rounded-[20px] p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)] ring-1 ring-gray-100 dark:ring-zinc-800 focus-within:ring-2 focus-within:ring-purple-400">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="VD: Cô gái đang đi dạo trên bãi biển, tóc bay trong gió..."
                  className="w-full h-24 bg-transparent text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-gray-300 text-gray-800 dark:text-zinc-100"
                  disabled={stage === 'submitting'}
                />
              </div>
            </div>

            {/* Config Grids */}
            {modelOptions.showAspectRatio && modelOptions.aspectRatios.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Tỷ lệ khung hình</h3>
                <div className="grid grid-cols-2 gap-2">
                  {modelOptions.aspectRatios.map((ratio: string) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        aspectRatio === ratio ? 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 border border-fuchsia-200 dark:border-fuchsia-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Model</h3>
                <div className="flex flex-col gap-2">
                  {videoModelOptions.map((m: AIModelOption) => (
                    <button
                      key={m.id}
                      onClick={() => setVideoModel(m.id)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all text-left ${
                        videoModel === m.id ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 border border-purple-200 dark:border-purple-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Thời lượng</h3>
                <div className="flex flex-col gap-2">
                  {modelOptions.durations.map((d: string) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        duration === d ? 'bg-gray-900 text-white' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Độ phân giải</h3>
                <div className="flex flex-col gap-2">
                  {modelOptions.qualities.map((q: string) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        quality === q ? 'bg-gray-900 text-white' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Tốc độ xử lý</h3>
                <div className="flex flex-col gap-2">
                  {speedOptions.map((sp: any) => (
                    <button
                      key={sp.value}
                      onClick={() => setSpeed(sp.value)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        speed === sp.value ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 border border-orange-200 dark:border-orange-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Khung máy chủ</h3>
                <div className="flex flex-col gap-2">
                  {serverOptions.map((s: any) => (
                    <button
                      key={s.value}
                      onClick={() => setServer(s.value)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        server === s.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border border-blue-200 dark:border-blue-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    Tạo kịch bản AI
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-cyan-700/80 dark:text-cyan-100/80">
                    AI sẽ quét ảnh, viết kịch bản theo model/thời lượng đang chọn. Hãy đọc và chỉnh lại prompt trước khi tạo video.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateVideoScript}
                  disabled={isGeneratingScript || !keyframeImage}
                  className="shrink-0 rounded-full bg-cyan-500 px-3 py-2 text-[11px] font-black text-white disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {isGeneratingScript ? 'Đang viết...' : 'Tạo'}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <select value={scriptStyle} onChange={(e) => setScriptStyle(e.target.value)} className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-zinc-700 dark:bg-[#18181B] dark:text-zinc-100">
                  <option>Cinematic</option>
                  <option>Thời trang</option>
                  <option>Hành động</option>
                  <option>Lãng mạn</option>
                </select>
                <select value={scriptTheme} onChange={(e) => setScriptTheme(e.target.value)} className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-zinc-700 dark:bg-[#18181B] dark:text-zinc-100">
                  <option>Tự động theo ảnh</option>
                  <option>Đời thường</option>
                  <option>Sân khấu</option>
                  <option>Đường phố</option>
                </select>
                <select value={scriptSoundMood} onChange={(e) => setScriptSoundMood(e.target.value)} className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-zinc-700 dark:bg-[#18181B] dark:text-zinc-100">
                  <option>Phù hợp bối cảnh</option>
                  <option>Lãng mạn vui vẻ</option>
                  <option>Sôi động hành động</option>
                  <option>Sầu bi buồn bã</option>
                  <option>Vui tươi hài hước</option>
                </select>
                <select value={scriptTargetModel || videoModel} onChange={(e) => setScriptTargetModel(e.target.value)} className="rounded-2xl border border-white/70 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-zinc-700 dark:bg-[#18181B] dark:text-zinc-100">
                  {(videoModelOptions.length > 0 ? videoModelOptions : [{ id: videoModel, name: videoModel || 'Model hiện tại', price: 0 }]).map((model: AIModelOption) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setScriptVoiceDialogue((value) => !value)}
                className={`mt-3 w-full rounded-2xl px-3 py-2 text-xs font-black ${scriptVoiceDialogue ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 dark:bg-[#18181B] dark:text-zinc-300'}`}
              >
                {scriptVoiceDialogue ? 'Có lời thoại tiếng Việt chuẩn' : 'Không thêm lời thoại'}
              </button>
            </div>

            {/* Audio Toggle */}
            {modelOptions.supportsAudio && (
              <div className="flex items-center justify-between p-3.5 bg-white dark:bg-[#18181B] rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${sound ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600' : 'bg-gray-50 dark:bg-[#27272A] text-gray-400 dark:text-zinc-500'}`}>
                    {sound ? <Music className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-100">Âm thanh AI</h3>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">Tạo âm thanh nền tự động</p>
                  </div>
                </div>
                <button
                  onClick={() => setSound(!sound)}
                  className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${sound ? 'bg-purple-500' : 'bg-gray-200 dark:bg-zinc-700'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white dark:bg-[#18181B] shadow-sm transition-transform duration-300 ${sound ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Motion Uploads */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase text-center">Ảnh Nhân vật</h3>
                <button
                  onClick={() => triggerUpload('character')}
                  className="aspect-[3/4] w-full rounded-[20px] border-2 border-dashed border-gray-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] flex flex-col items-center justify-center gap-2 overflow-hidden hover:border-purple-400 transition-colors relative"
                >
                  {characterImage ? (
                    <img src={characterImage} alt="Character" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <User className="w-6 h-6 text-gray-300" />
                      <span className="text-[10px] text-gray-400 dark:text-zinc-500">Tải ảnh lên</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase text-center">Video Hành động</h3>
                <button
                  onClick={() => triggerUpload('motion')}
                  className="aspect-[3/4] w-full rounded-[20px] border-2 border-dashed border-gray-200 dark:border-zinc-700 bg-black/5 flex flex-col items-center justify-center gap-2 overflow-hidden relative"
                >
                  {motionVideoUrl ? (
                    <>
                      <video
                        key={motionVideoUrl}
                        src={motionVideoUrl}
                        className="absolute inset-0 h-full w-full object-cover opacity-85"
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedData={(event) => {
                          event.currentTarget.play().catch(() => undefined);
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                      <div className="absolute left-2 bottom-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
                        {motionVideoDurationSeconds !== null ? `${motionVideoDurationSeconds.toFixed(1)}s` : 'Video mẫu'}
                      </div>
                      <div className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white backdrop-blur-md">
                        <ImagePlus className="h-4 w-4" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Film className="w-6 h-6 text-gray-400 dark:text-zinc-500" />
                      <span className="text-[10px] text-gray-500 dark:text-zinc-400 font-medium px-2 text-center">Tải video (3-30s)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Setup Options for Motion */}
            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 dark:border-zinc-800 pt-5">
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Model</h3>
                <div className="flex flex-col gap-2">
                  {motionModelOptions.map((m: AIModelOption) => (
                    <button
                      key={m.id}
                      onClick={() => setMotionModel(m.id)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all text-left ${
                        motionModel === m.id ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 border border-purple-200 dark:border-purple-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Độ phân giải</h3>
                <div className="flex flex-col gap-2">
                  {modelOptions.qualities.map((q: string) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        quality === q ? 'bg-gray-900 text-white' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Tốc độ xử lý</h3>
                <div className="flex flex-col gap-2">
                  {speedOptions.map((sp: any) => (
                    <button
                      key={sp.value}
                      onClick={() => setSpeed(sp.value)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        speed === sp.value ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 border border-orange-200 dark:border-orange-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1">Khung máy chủ</h3>
                <div className="flex flex-col gap-2">
                  {serverOptions.map((s: any) => (
                    <button
                      key={s.value}
                      onClick={() => setServer(s.value)}
                      className={`text-xs p-2.5 rounded-[12px] font-medium transition-all ${
                        server === s.value ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border border-blue-200 dark:border-blue-500/30' : 'bg-white dark:bg-[#18181B] border border-gray-100 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="relative group">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider ml-1 mb-2">Prompt (Không bắt buộc)</h3>
              <div className="relative bg-white dark:bg-[#18181B] rounded-[20px] p-3 shadow-[0_4px_20px_rgb(0,0,0,0.04)] ring-1 ring-gray-100 dark:ring-zinc-800 focus-within:ring-2 focus-within:ring-purple-400">
                <textarea
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value)}
                  placeholder="Gợi ý thêm hành động..."
                  className="w-full h-16 bg-transparent text-[13px] leading-relaxed resize-none focus:outline-none placeholder:text-gray-300 text-gray-800 dark:text-zinc-100"
                  disabled={stage === 'submitting'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Smart Tip */}
        <div className="bg-purple-50 dark:bg-purple-500/10 rounded-[16px] p-3 flex items-start gap-2 border border-purple-100 dark:border-purple-500/30 mt-4">
          <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
          <p className="text-xs text-purple-800/80 leading-relaxed font-medium">{SMART_TIPS[currentTipIdx]}</p>
        </div>

        {catalogError && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/30 rounded-2xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{catalogError}</p>
          </div>
        )}
      </div>

      {/* Generate Button - Fixed Bottom */}
      <div className="fixed bottom-[70px] left-0 right-0 p-5 pt-8 bg-gradient-to-t from-[#fcfcfc] via-[#fcfcfc] dark:from-[#09090b] dark:via-[#09090b] to-transparent max-w-md mx-auto xl:absolute xl:bottom-0">
        {currentCostBreakdown.billingUnit === 'second' && (
          <div className="mb-2 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-center text-[11px] font-black text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-200">
            {currentCostBreakdown.unitVcoin || 0} Vcoin/s × {currentCostBreakdown.billedSeconds || 0}s
            {activeMode === 'motion_control' && motionVideoDurationSeconds !== null
              ? ` • video mẫu ${motionVideoDurationSeconds.toFixed(1)}s`
              : ''}
          </div>
        )}
        <Button
          size="lg"
          className="w-full shadow-[0_8px_30px_rgb(168,85,247,0.3)] flex items-center justify-center gap-3 bg-gradient-to-r from-purple-500 to-indigo-500 relative overflow-hidden group border-0 text-white rounded-[16px]"
          disabled={isGenerateDisabled || stage === 'submitting'}
          onClick={handleGenerate}
        >
          {stage === 'submitting' ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : cooldownRemaining > 0 ? (
            <span className="text-sm font-semibold">Đợi {cooldownRemaining}s</span>
          ) : (
            <>
              <Video className="w-5 h-5 text-white/90" />
              <span className="font-semibold text-[15px]">Tạo Video</span>
            </>
          )}

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-black/20 px-2.5 py-1 rounded-full backdrop-blur-md">
            <span className="text-[12px] font-bold text-white">{isCatalogReady ? calculateCost() : '...'}</span>
            <Coins className="w-3 h-3 text-yellow-300" />
          </div>
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}
