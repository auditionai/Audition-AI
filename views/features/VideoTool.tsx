import React, { useState, useRef, useEffect } from 'react';
import { Feature, Language, GeneratedImage, ViewId } from '../../types';
import { Icons } from '../../components/Icons';
import { useNotification } from '../../components/NotificationSystem';
import { getUserProfile, getModelPricing, getTstServerAvailabilityConfig, type ModelPricing } from '../../services/economyService';
import { CONCURRENCY_LIMITS, useConcurrency } from '../../services/concurrencyService';
import { enqueueServerJob } from '../../services/serverQueueService';
import { prepareTramsangtaoMotionJob, prepareTramsangtaoVideoJob } from '../../services/tstVideoService';
import { saveImageToLocalCache, uploadFileToR2 } from '../../services/storageService';
import { downloadAssetToBrowser } from '../../services/downloadService';
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
            <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                {Icon && <Icon className="w-3 h-3" />}
                {label}
            </label>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between bg-[#1a1a24] border border-white/5 rounded-xl px-3 py-2.5 text-xs font-bold text-white hover:border-white/10 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {options.find((o: any) => o.value === value)?.label || value}
                </div>
                <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                        {options.map((opt: any) => (
                            <button
                                key={opt.value}
                                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2.5 text-xs font-bold transition-colors hover:bg-white/5 ${value === opt.value ? 'text-audi-purple bg-audi-purple/10' : 'text-slate-300'}`}
                            >
                                {opt.label}
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
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('5s');
  const [quality, setQuality] = useState('720P');
  const [sound, setSound] = useState(false);
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('VIP 1');

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
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const pricingOverrides: AuditionPricingOverride[] = auditionPricing.map((row) => ({
      modelId: row.model_id,
      optionId: row.option_id,
      auditionPriceVcoin: row.audition_price_vcoin,
  }));

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

              const liveVideoModels = getVideoModelSpecs(livePricing, models).map((spec) => ({
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
              const liveMotionModels = getMotionModelSpecs(livePricing, models).map((spec) => ({
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
                  setVideoModel((current) => liveVideoModels.some((model) => model.id === current) ? current : liveVideoModels[0].id);
              }
              if (liveMotionModels.length > 0) {
                  setMotionModelOptions(liveMotionModels);
                  setMotionModel((current) => liveMotionModels.some((model) => model.id === current) ? current : liveMotionModels[0].id);
              }
              setCatalogError(null);
          } catch (error) {
              console.warn('Failed to load live TST catalog for video tool', error);
              setPricingEntries([]);
              setRuntimeModels([]);
              setVideoModelOptions([]);
              setMotionModelOptions([]);
              setCatalogError(lang === 'vi' ? 'TST đang bảo trì hoặc không sẵn sàng.' : 'TST is unavailable.');
          } finally {
              setCatalogLoading(false);
          }
      };
      loadCatalog();
  }, [lang]);

  const [isConcurrencyExpanded, setIsConcurrencyExpanded] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const isCatalogReady =
      !catalogLoading &&
      !catalogError &&
      pricingEntries.length > 0 &&
      runtimeModels.length > 0 &&
      (activeMode === 'video_ai' ? videoModelOptions.length > 0 : motionModelOptions.length > 0);
  const lastAutoSelectedVideoModelRef = useRef<string | null>(null);

  const currentCostBreakdown = activeMode === 'motion_control'
      ? getMotionCostBreakdown({
          modelId: motionModel,
          serverId: uiServerToTst(server) || 'vip2',
          resolution: quality.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
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

  const calculateCost = () => {
      return currentCostBreakdown.vcoin;
  };

  const getModelOptions = () => {
      if (activeMode === 'motion_control') {
          const motionSpec = getMotionModelSpecs(pricingEntries, runtimeModels).find((spec) => spec.modelId === motionModel);
          return {
              showAspectRatio: false,
              aspectRatios: [] as string[],
              qualities: (motionSpec?.resolutions || []).map((value) => value.toUpperCase()),
              durations: [] as string[],
              supportsAudio: false
          };
      }

      const videoSpec = getVideoModelSpecs(pricingEntries, runtimeModels).find((spec) => spec.modelId === videoModel);
      const compatibleResolutions = getVideoCompatibleResolutions({
          modelId: videoModel,
          pricingEntries,
          serverId: uiServerToTst(server),
          duration: duration.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: sound
      });
      const compatibleDurations = getVideoCompatibleDurations({
          modelId: videoModel,
          pricingEntries,
          serverId: uiServerToTst(server),
          resolution: quality.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: sound
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
          audio: sound
      });

      if (compatibleServers.length === 0) return null;

      const preferredServerOrder = ['fast', 'vip1', 'vip2', 'cheap'];
      const rankedServers = [...compatibleServers].sort((a, b) => {
          const resolutionsA = getVideoCompatibleResolutions({
              modelId: videoModel,
              pricingEntries,
              serverId: a,
              duration: duration.toLowerCase(),
              speed: uiSpeedToTst(speed) || 'fast',
              audio: sound
          }).length;
          const resolutionsB = getVideoCompatibleResolutions({
              modelId: videoModel,
              pricingEntries,
              serverId: b,
              duration: duration.toLowerCase(),
              speed: uiSpeedToTst(speed) || 'fast',
              audio: sound
          }).length;

          if (resolutionsA !== resolutionsB) {
              return resolutionsB - resolutionsA;
          }

          const durationsA = getVideoCompatibleDurations({
              modelId: videoModel,
              pricingEntries,
              serverId: a,
              speed: uiSpeedToTst(speed) || 'fast',
              audio: sound
          }).length;
          const durationsB = getVideoCompatibleDurations({
              modelId: videoModel,
              pricingEntries,
              serverId: b,
              speed: uiSpeedToTst(speed) || 'fast',
              audio: sound
          }).length;

          if (durationsA !== durationsB) {
              return durationsB - durationsA;
          }

          return preferredServerOrder.indexOf(a) - preferredServerOrder.indexOf(b);
      });

      return rankedServers[0] || compatibleServers[0];
  };

  const modelOptions = getModelOptions();
  const serverOptions = (activeMode === 'video_ai'
      ? getVideoCompatibleServers({
          modelId: videoModel,
          pricingEntries,
          resolution: quality.toLowerCase(),
          duration: duration.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast',
          audio: sound
        })
      : getMotionCompatibleServers({
          modelId: motionModel,
          pricingEntries,
          resolution: quality.toLowerCase(),
          speed: uiSpeedToTst(speed) || 'fast'
        })
  ).map((serverId) => ({ label: tstServerToUi(serverId), value: tstServerToUi(serverId) }));
  const speedOptions = activeMode === 'video_ai'
      ? getVideoCompatibleSpeeds({
          modelId: videoModel,
          pricingEntries,
          serverId: uiServerToTst(server),
          resolution: quality.toLowerCase(),
          duration: duration.toLowerCase(),
          audio: sound
        }).map((speedId) => ({ label: tstSpeedToUi(speedId), value: tstSpeedToUi(speedId) }))
      : getMotionCompatibleSpeeds({
          modelId: motionModel,
          pricingEntries,
          resolution: quality.toLowerCase()
        }).map((speedId) => ({ label: tstSpeedToUi(speedId), value: tstSpeedToUi(speedId) }));

  useEffect(() => {
      if (activeMode !== 'video_ai' || !videoModel) return;

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
  }, [activeMode, videoModel, pricingEntries, server, serverOptions]);

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
  }, [activeMode, aspectRatio, duration, modelOptions, quality, server, serverOptions, speed, speedOptions]);

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

  const handleGenerate = async () => {
    if (!isCatalogReady) {
      notify(lang === 'vi' ? 'TST đang bảo trì hoặc không sẵn sàng.' : 'TST is unavailable.', 'error');
      return;
    }

    if (!currentCostBreakdown.available) {
      notify(lang === 'vi' ? 'Cấu hình đang chọn không còn khả dụng trên TST.' : 'Selected configuration is not available on TST.', 'error');
      return;
    }

    if (activeMode === 'video_ai' && !keyframeImage) {
      notify(
        lang === 'vi'
          ? 'Video AI hiện yêu cầu ảnh keyframe rõ nét để hệ thống kiểm duyệt trước khi gửi lên TST.'
          : 'Video AI now requires a clear keyframe image so the server can review it before sending to TST.',
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
          ? 'Video chuyển động phải dài từ 3 đến 30 giây theo yêu cầu của TST.'
          : 'Motion video must be between 3 and 30 seconds according to TST requirements.',
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
    const user = await getUserProfile();
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
        const requestedServerId = uiServerToTst(server) || (activeMode === 'video_ai' ? 'fast' : 'vip2');
        const requestedSpeedId = uiSpeedToTst(speed) || 'fast';
        const effectiveServerId = activeMode === 'video_ai'
            ? (() => {
                const compatibleServers = getVideoCompatibleServers({
                    modelId: videoModel,
                    pricingEntries,
                    resolution: quality.toLowerCase(),
                    duration: duration.toLowerCase(),
                    speed: requestedSpeedId,
                    audio: sound
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
        const effectiveSpeedId = activeMode === 'video_ai'
            ? (() => {
                const compatibleSpeeds = getVideoCompatibleSpeeds({
                    modelId: videoModel,
                    pricingEntries,
                    serverId: effectiveServerId,
                    resolution: quality.toLowerCase(),
                    duration: duration.toLowerCase(),
                    audio: sound
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
                resolution: quality.toLowerCase(),
                aspectRatio,
                speed: effectiveSpeedId || 'fast',
                serverId: effectiveServerId,
                keyframeImage: stagedKeyframeImage,
                audio: sound,
            }
            : {
                recipeType: 'motion_generate_recipe_v1',
                modelId: motionModel,
                prompt: effectiveMotionPrompt,
                resolution: quality.toLowerCase(),
                speed: effectiveSpeedId || 'fast',
                serverId: effectiveServerId,
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

    try {
        const requestedServerId = uiServerToTst(server) || (activeMode === 'video_ai' ? 'fast' : 'vip2');
        const requestedSpeedId = uiSpeedToTst(speed) || 'fast';
        const effectiveServerId = activeMode === 'video_ai'
            ? (() => {
                const compatibleServers = getVideoCompatibleServers({
                    modelId: videoModel,
                    pricingEntries,
                    resolution: quality.toLowerCase(),
                    duration: duration.toLowerCase(),
                    speed: requestedSpeedId,
                    audio: sound
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
        const effectiveSpeedId = activeMode === 'video_ai'
            ? (() => {
                const compatibleSpeeds = getVideoCompatibleSpeeds({
                    modelId: videoModel,
                    pricingEntries,
                    serverId: effectiveServerId,
                    resolution: quality.toLowerCase(),
                    duration: duration.toLowerCase(),
                    audio: sound
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

        const queuePayload = activeMode === 'video_ai'
            ? await prepareTramsangtaoVideoJob({
                prompt: prompt || 'Create a cinematic video',
                modelId: videoModel,
                duration: duration.toLowerCase(),
                resolution: quality.toLowerCase(),
                aspectRatio,
                speed: effectiveSpeedId || 'fast',
                serverId: effectiveServerId,
                keyframe: keyframeImage,
                audio: sound,
                onLog: (message) => console.log('[VideoTool]', message)
            })
            : await prepareTramsangtaoMotionJob({
                modelId: motionModel,
                characterImage: characterImage!,
                motionVideo: motionVideoFile!,
                prompt: motionPrompt,
                resolution: quality.toLowerCase(),
                speed: effectiveSpeedId || 'fast',
                serverId: effectiveServerId,
                onLog: (message) => console.log('[MotionTool]', message)
            });

        await enqueueServerJob({
            id: queuedId,
            prompt: activeMode === 'video_ai' ? (prompt || 'Create a cinematic video') : (motionPrompt || 'Motion Control'),
            toolId: feature.id,
            toolName: feature.name['en'],
            engine: selectedModelName,
            assetType: 'video',
            costVcoin: cost,
            queueKind: activeMode === 'video_ai' ? 'video_generate' : 'motion_generate',
            queuePayload,
        });

        window.dispatchEvent(new Event('balance_updated'));
        setStage('input');
        setResultVideo(null);
        notify(lang === 'vi' ? 'Đã gửi job. Theo dõi tiến trình trong Lịch sử tạo.' : 'Job submitted. Track progress in History.', 'success');
        onNavigateView?.('gallery');
    } catch (error: any) {
        console.error(error);
        notify(error instanceof Error ? error.message : (lang === 'vi' ? 'Tạo video thất bại' : 'Video generation failed'), 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  const TipIcon = SMART_TIPS[currentTipIdx].icon;

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto pb-12 animate-fade-in relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        accept={uploadTarget === 'motion' ? "video/*" : "image/*"} 
      />

      <div className="w-full flex justify-center mb-4">
          <div className="bg-[#12121a] p-1.5 rounded-2xl border border-white/10 flex gap-1 shadow-lg overflow-x-auto no-scrollbar max-w-full">
              <button
                  onClick={() => setActiveMode('video_ai')}
                  className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeMode === 'video_ai' ? 'bg-white text-black shadow-md' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                  <Icons.Video className="w-3 h-3 md:w-4 md:h-4" />
                  {lang === 'vi' ? 'Tạo Video AI' : 'AI Video'}
              </button>
              <button
                  onClick={() => setActiveMode('motion_control')}
                  className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeMode === 'motion_control' ? 'bg-white text-black shadow-md' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
              >
                  <Icons.Activity className="w-3 h-3 md:w-4 md:h-4" />
                  Motion Control
              </button>
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

      <div className="w-full mb-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 flex items-center gap-3 animate-fade-in hover:bg-yellow-500/10 transition-colors">
          <div className="shrink-0 p-1.5 bg-yellow-500/10 rounded-full">
              <Icons.Flame className="w-4 h-4 text-yellow-500 animate-pulse" />
          </div>
          <p className="text-[10px] md:text-xs text-yellow-200/80 font-medium leading-relaxed">
              <strong className="text-yellow-500">Lưu ý:</strong> Mô hình <span className="text-audi-cyan font-bold">Kling</span> có tốc độ nhanh và chuyển động tự nhiên. Các phiên bản mới nhất mang lại video chất lượng điện ảnh, sắc nét và sống động.
          </p>
      </div>

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
        {/* LEFT PANEL: CONFIGURATION */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
              <h3 className="font-bold text-white text-sm uppercase flex items-center gap-2">
                  <Icons.Upload className="w-4 h-4 text-audi-pink" /> 1. Upload Dữ Liệu
              </h3>
              <div className="flex gap-2 flex-wrap justify-end">
                  <button 
                      onClick={() => setShowGuide(true)}
                      className="flex items-center gap-1 text-[10px] font-bold text-audi-yellow hover:text-white transition-colors bg-audi-yellow/10 px-2 py-1 rounded-full border border-audi-yellow/30"
                  >
                      <Icons.Info className="w-3 h-3" /> Hướng dẫn
                  </button>
              </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 w-full">
            {activeMode === 'video_ai' ? (
              <div className="w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors relative group shrink-0 shadow-lg block">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded">Ảnh Mẫu</span>
                </div>
                <div className="space-y-3">
                    <div onClick={() => triggerUpload('keyframe')} className="w-full h-64 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-audi-pink cursor-pointer relative overflow-hidden group/item transition-all flex flex-col items-center justify-center">
                        {keyframeImage ? (
                            <>
                                <img src={keyframeImage} className="w-full h-full object-contain opacity-80 group-hover/item:opacity-40 transition-opacity" alt="Keyframe" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Đổi Ảnh</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center text-slate-500 group-hover/item:text-audi-pink transition-colors">
                                <Icons.Image className="w-8 h-8 mb-1" />
                                <span className="text-[10px] uppercase font-bold">Ảnh mẫu (Tùy chọn)</span>
                            </div>
                        )}
                    </div>
                </div>
              </div>
            ) : (
              <>
                <div className="w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors relative group shrink-0 shadow-lg block">
                  <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded">Nhân Vật</span>
                  </div>
                  <div className="space-y-3">
                      <div onClick={() => triggerUpload('character')} className="w-full h-64 bg-black/40 rounded-xl border-2 border-dashed border-slate-700 hover:border-slate-500 cursor-pointer relative overflow-hidden group/item transition-all flex flex-col items-center justify-center">
                          {characterImage ? (
                              <>
                                  <img src={characterImage} className="w-full h-full object-contain opacity-80 group-hover/item:opacity-40 transition-opacity" alt="Character" />
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                                      <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Đổi Ảnh</span>
                                  </div>
                              </>
                          ) : (
                              <div className="flex flex-col items-center text-slate-500 group-hover/item:text-slate-400 transition-colors">
                                  <Icons.User className="w-8 h-8 mb-2" />
                                  <span className="text-[10px] uppercase font-bold">Ảnh Nhân Vật</span>
                              </div>
                          )}
                      </div>
                  </div>
                </div>

                <div className="w-full md:w-[220px] bg-[#12121a] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors relative group shrink-0 shadow-lg block">
                  <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-white bg-white/10 px-2 py-1 rounded">Chuyển Động</span>
                  </div>
                  <div className="space-y-3">
                      <div onClick={() => triggerUpload('motion')} className="w-full h-64 bg-black/40 rounded-xl border-2 border-dashed border-audi-pink hover:border-pink-400 cursor-pointer relative overflow-hidden group/item transition-all flex flex-col items-center justify-center">
                          {motionVideo ? (
                              <>
                                  <video src={motionVideo} className="w-full h-full object-contain opacity-80 group-hover/item:opacity-40 transition-opacity" autoPlay loop muted playsInline />
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                                      <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Đổi Video</span>
                                  </div>
                              </>
                          ) : (
                              <div className="flex flex-col items-center text-audi-pink group-hover/item:text-pink-400 transition-colors">
                                  <Icons.Activity className="w-8 h-8 mb-2" />
                                  <span className="text-[10px] uppercase font-bold">Video Motion</span>
                              </div>
                          )}
                      </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-4 shadow-lg">
              <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                      <Icons.MessageCircle className="w-4 h-4" /> 2. Mô tả
                  </label>
                  <div className="flex gap-2">
                      <button onClick={() => activeMode === 'video_ai' ? setPrompt('') : setMotionPrompt('')} className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors bg-white/5 px-2 py-1 rounded border border-white/10">Xóa</button>
                  </div>
              </div>
              
              <div className="flex flex-col md:flex-row gap-4">
                  <textarea 
                      value={activeMode === 'video_ai' ? prompt : motionPrompt}
                      onChange={(e) => activeMode === 'video_ai' ? setPrompt(e.target.value) : setMotionPrompt(e.target.value)}
                      placeholder={activeMode === 'video_ai' ? (lang === 'vi' ? "Mô tả chi tiết video bạn muốn tạo..." : "Describe the video you want to generate...") : (lang === 'vi' ? "Mô tả bối cảnh phía sau nhân vật (Tùy chọn)..." : "Describe the background behind the character (Optional)...")}
                      className="flex-1 bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white focus:border-audi-purple outline-none resize-none min-h-[100px]"
                  />
              </div>
          </div>
        </div>

        {/* RIGHT PANEL: SETTINGS & GENERATE */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-5 flex flex-col gap-5 shadow-lg h-full relative z-10">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Icons.Settings className="w-5 h-5 text-slate-400" />
                    3. Cấu Hình
                </h3>
            </div>

            {!isCatalogReady && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-200">
                {catalogLoading
                  ? 'Đang đồng bộ catalog live từ TST...'
                  : (catalogError || 'TST đang bảo trì hoặc không sẵn sàng.')}
              </div>
            )}

            {/* Settings Grid */}
            <div className="flex flex-col gap-6">
              <div className={`space-y-3 relative ${isModelDropdownOpen ? 'z-50' : 'z-10'}`}>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Mô hình AI
                </label>
                <button 
                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    disabled={(activeMode === 'video_ai' ? videoModelOptions.length === 0 : motionModelOptions.length === 0)}
                    className="w-full flex items-center justify-between bg-[#1a1a24] border border-audi-cyan/30 rounded-xl px-4 py-3 text-sm font-bold text-white hover:border-audi-cyan transition-colors"
                >
                    {activeMode === 'video_ai' 
                        ? (videoModelOptions.find(m => m.id === videoModel)?.name || 'TST unavailable')
                        : (motionModelOptions.find(m => m.id === motionModel)?.name || 'TST unavailable')}
                    <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isModelDropdownOpen && (
                    <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden max-h-[350px] overflow-y-auto custom-scrollbar">
                        {(activeMode === 'video_ai' ? videoModelOptions : motionModelOptions).map(model => (
                            <button
                                key={model.id}
                                onClick={() => {
                                    if (activeMode === 'video_ai') setVideoModel(model.id);
                                    else setMotionModel(model.id);
                                    setIsModelDropdownOpen(false);
                                }}
                                className={`flex flex-col p-3 transition-colors border-b border-white/5 last:border-0 ${
                                    (activeMode === 'video_ai' ? videoModel === model.id : motionModel === model.id)
                                    ? 'bg-audi-cyan/10'
                                    : 'hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center justify-between w-full mb-1.5">
                                    <span className="font-bold text-sm text-white flex items-center gap-2">
                                        {model.name}
                                        {(activeMode === 'video_ai' ? videoModel === model.id : motionModel === model.id) && (
                                            <Icons.Check className="w-4 h-4 text-audi-cyan" />
                                        )}
                                    </span>
                                    <div className="flex items-center gap-1 text-xs font-bold text-audi-cyan whitespace-nowrap">
                                        Từ {model.price} VC <Icons.Gem className="w-3 h-3" />
                                    </div>
                                </div>
                                
                                {model.badges && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {model.badges.map((badge, idx) => (
                                            <span key={idx} className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                                badge.type === 'blue' ? 'bg-blue-500/20 text-blue-400 font-bold' :
                                                badge.type === 'server' ? 'bg-white/5 text-slate-400 border border-white/10' :
                                                badge.type === 'speed' ? 'bg-audi-cyan/10 text-audi-cyan border border-audi-cyan/20' :
                                                'bg-white/5 text-slate-400 border border-white/10'
                                            }`}>
                                                {badge.type === 'speed' && <Icons.Zap className="w-3 h-3" />}
                                                {badge.text}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                    </>
                )}
              </div>
              
              {modelOptions.showAspectRatio && modelOptions.aspectRatios.length > 0 && (
                <OptionDropdown
                  label={lang === 'vi' ? 'Tỉ lệ khung hình' : 'Aspect Ratio'}
                  value={aspectRatio}
                  options={modelOptions.aspectRatios?.map(r => ({ label: r, value: r })) || []}
                  onChange={setAspectRatio}
                  icon={Icons.Monitor}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                {modelOptions.qualities.length > 0 ? (
                <OptionDropdown
                  label={lang === 'vi' ? 'Chất lượng' : 'Quality'}
                  value={quality}
                  options={modelOptions.qualities.map(q => ({ label: q, value: q }))}
                  onChange={setQuality}
                  icon={Icons.Video}
                />
                ) : (
                  <div />
                )}

                {activeMode === 'video_ai' && modelOptions.durations.length > 0 ? (
                <OptionDropdown
                  label={lang === 'vi' ? 'Thời lượng' : 'Duration'}
                  value={duration}
                  options={modelOptions.durations.map(d => ({ label: d, value: d }))}
                  onChange={setDuration}
                  icon={Icons.Clock}
                />
                ) : (
                  <div />
                )}
              </div>

              {activeMode === 'video_ai' && modelOptions.supportsAudio && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Icons.Volume2 className="w-3 h-3" />
                    {lang === 'vi' ? 'Âm thanh' : 'Sound'}
                  </label>
                  <div className="flex bg-black/30 p-1.5 rounded-xl border border-white/5">
                    <button
                      onClick={() => setSound(!sound)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${sound ? 'bg-audi-purple text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                    >
                      {sound ? <Icons.Volume2 className="w-3 h-3" /> : <Icons.VolumeX className="w-3 h-3" />}
                      {sound ? 'Bật' : 'Tắt'}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-3">
                {speedOptions.length > 0 ? (
                <OptionDropdown
                  label={lang === 'vi' ? 'Tốc độ xử lý' : 'Processing speed'}
                  value={speed}
                  options={speedOptions}
                  onChange={setSpeed}
                  icon={Icons.Zap}
                />
                ) : (
                  <div />
                )}

                {serverOptions.length > 0 ? (
                <OptionDropdown
                  label="Server"
                  value={server}
                  options={serverOptions}
                  onChange={setServer}
                  icon={Icons.Database}
                />
                ) : (
                  <div />
                )}
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
                              {isConcurrencyExpanded ? <Icons.ChevronUp className="w-4 h-4 text-slate-500" /> : <Icons.ChevronDown className="w-4 h-4 text-slate-500" />}
                          </div>
                      </div>
                      
                      {!isConcurrencyExpanded && (
                          <div className="space-y-3 text-[10px] text-slate-400 mt-2">
                              <div>
                                  <div className="font-bold text-audi-cyan mb-1">Luồng Của Bạn</div>
                                  <div className="flex gap-1.5">
                                      <span>Video <span className="text-white font-mono">{queueStats.myVideoProcessing}/{CONCURRENCY_LIMITS.user.videoProcessing}</span></span>
                                      <span>- Hàng Chờ <span className="text-white font-mono">{queueStats.myQueued}/{CONCURRENCY_LIMITS.user.queued}</span></span>
                                  </div>
                              </div>
                              <div>
                                  <div className="font-bold text-slate-300 mb-1">Luồng Hệ Thống</div>
                                  <div className="flex gap-1.5">
                                      <span>Video <span className="text-white font-mono">{queueStats.systemVideoProcessing}/{CONCURRENCY_LIMITS.system.videoProcessing}</span></span>
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
                                              {queueStats.myVideoProcessing}/{CONCURRENCY_LIMITS.user.videoProcessing}
                                          </span>
                                      </div>
                                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                          <div 
                                              className="bg-audi-cyan h-full transition-all duration-500 ease-out" 
                                              style={{ width: `${Math.min(100, (queueStats.myVideoProcessing / CONCURRENCY_LIMITS.user.videoProcessing) * 100)}%` }}
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

                              {/* System Concurrency */}
                              <div className="space-y-2 pt-3 border-t border-white/5">
                                  <div className="flex justify-between items-center">
                                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Hệ thống</span>
                                  </div>
                                  <div className="space-y-2">
                                      <div className="flex items-center justify-between text-xs">
                                          <span className="text-slate-300">Đang xử lý</span>
                                          <span className="font-mono text-audi-cyan bg-audi-cyan/10 px-2 py-0.5 rounded-md">
                                              {queueStats.systemVideoProcessing}/{CONCURRENCY_LIMITS.system.videoProcessing}
                                          </span>
                                      </div>
                                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                          <div 
                                              className="bg-audi-cyan h-full transition-all duration-500 ease-out" 
                                              style={{ width: `${Math.min(100, (queueStats.systemVideoProcessing / CONCURRENCY_LIMITS.system.videoProcessing) * 100)}%` }}
                                          />
                                      </div>
                                      
                                      <div className="flex items-center justify-between text-xs pt-1">
                                          <span className="text-slate-300">Hàng chờ</span>
                                          <span className="font-mono text-audi-yellow bg-audi-yellow/10 px-2 py-0.5 rounded-md">
                                              {queueStats.systemQueued}/{CONCURRENCY_LIMITS.system.queued}
                                          </span>
                                      </div>
                                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                          <div 
                                              className="bg-audi-yellow h-full transition-all duration-500 ease-out" 
                                              style={{ width: `${Math.min(100, (queueStats.systemQueued / CONCURRENCY_LIMITS.system.queued) * 100)}%` }}
                                          />
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-audi-yellow/20 to-orange-500/20 border border-white/10 p-3">
                  <div className="flex justify-between items-center relative z-10">
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Giá hiện tại</span>
                      <div className="flex items-end gap-1">
                          <span className="text-xl font-black text-white font-game drop-shadow-md">
                              {calculateCost()}
                          </span>
                          <span className="text-[10px] font-bold text-audi-yellow mb-1">VCOIN</span>
                      </div>
                  </div>
                  {activeMode === 'video_ai' && modelOptions.durations.length > 0 ? (
                      <div className="flex justify-between text-[9px] text-slate-500 mt-2 font-mono border-t border-white/5 pt-2">
                          {modelOptions.durations.map(d => {
                              const durationPrice = getVideoCostBreakdown({
                                  modelId: videoModel,
                                  serverId: uiServerToTst(server) || 'fast',
                                  resolution: quality.toLowerCase(),
                                  duration: d.toLowerCase(),
                                  speed: uiSpeedToTst(speed) || 'fast',
                                  pricingEntries
                                }).vcoin;
                          return (
                              <span key={d} className={duration === d ? 'text-white font-bold' : ''}>{d}: {durationPrice}VC</span>
                          );
                      })}
                  </div>
                  ) : null}
              </div>

              <button 
                  onClick={handleGenerate}
                  disabled={isProcessing || !isCatalogReady || !currentCostBreakdown.available}
                  className={`w-full py-3.5 mt-auto rounded-xl font-bold text-white shadow-[0_0_20px_rgba(251,218,97,0.4)] transition-all flex items-center justify-center gap-2 ${
                      (isProcessing || !isCatalogReady || !currentCostBreakdown.available)
                      ? 'bg-slate-600 cursor-not-allowed opacity-70 shadow-none' 
                      : 'bg-gradient-to-r from-audi-yellow to-orange-500 hover:scale-[1.02] text-black'
                  }`}
              >
                  {isProcessing ? (
                      <>
                          <Icons.Loader className="w-5 h-5 animate-spin" />
                          {lang === 'vi' ? 'Đang xử lý...' : 'Processing...'}
                      </>
                  ) : (
                      <>
                          <Icons.Sparkles className="w-5 h-5" />
                          {lang === 'vi' ? 'Tạo Video' : 'Generate Video'}
                      </>
                  )}
              </button>

            </div>
          </div>
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
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-md bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/20 shrink-0">
                      <h3 className="font-bold text-white flex items-center gap-2">
                          <Icons.Info className="w-5 h-5 text-audi-cyan" />
                          {activeMode === 'video_ai' ? 'Hướng dẫn tạo Video AI' : 'Hướng dẫn tạo Motion Control'}
                      </h3>
                      <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-white transition-colors">
                          <Icons.X className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-6">
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
