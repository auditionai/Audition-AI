import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Image as ImageIcon, Loader, MessageSquare, Plus, Sparkles, Upload, X } from 'lucide-react';
import { useNotification } from '../../components/NotificationSystem';
import { getModelPricing, getUserProfile } from '../../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../../services/concurrencyService';
import { enqueueServerJob } from '../../services/serverQueueService';
import { saveImageToLocalCache, uploadFileToR2 } from '../../services/storageService';
import {
  fetchTstPricing,
  getCompatibleGenerationResolutions,
  getCompatibleGenerationServers,
  getCompatibleGenerationSpeeds,
  getGenerationCostBreakdown,
  getGenerationModelId,
  tstServerToUi,
  uiServerToTst,
  uiSpeedToTst,
  type TstGenerationTier,
  type TstPricingEntry,
  type TstResolution,
} from '../../services/tstCatalog';
import { optimizePayload } from '../../utils/imageProcessor';
import type { Feature, GeneratedImage, Language, ViewId } from '../../types';
import type { ModelPricing } from '../../services/economyService';
import type { PromptImageGenerateRecipePayload } from '../../shared/queueRecipes';

interface PromptImageToolProps {
  feature: Feature;
  lang: Language;
  onNavigateView?: (view: ViewId, data?: any) => void;
}

type Resolution = TstResolution;
type PromptImageSlot = string | null;

const MAX_REFERENCE_IMAGES = 4;
const ASPECT_RATIOS = ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2'];

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

export const PromptImageTool: React.FC<PromptImageToolProps> = ({ feature, lang, onNavigateView }) => {
  const { notify } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referenceImages, setReferenceImages] = useState<PromptImageSlot[]>([null]);
  const [activeUploadIndex, setActiveUploadIndex] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [aiModel, setAiModel] = useState<TstGenerationTier>('flash');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [speed, setSpeed] = useState('Nhanh');
  const [server, setServer] = useState('VIP 1');
  const [pricingEntries, setPricingEntries] = useState<TstPricingEntry[]>([]);
  const [pricingOverrides, setPricingOverrides] = useState<ModelPricing[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { queueStats } = useConcurrency();

  useEffect(() => {
    let alive = true;
    Promise.all([fetchTstPricing().catch(() => []), getModelPricing().catch(() => [])]).then(([tstPricing, adminPricing]) => {
      if (!alive) return;
      setPricingEntries(tstPricing);
      setPricingOverrides(adminPricing);
    });
    return () => {
      alive = false;
    };
  }, []);

  const generationSpeedId = uiSpeedToTst(speed) || 'fast';
  const generationServerId = uiServerToTst(server) || 'fast';

  const availableResolutions = useMemo(() => {
    const values = getCompatibleGenerationResolutions({
      tier: aiModel,
      pricingEntries,
      serverId: generationServerId,
      speed: generationSpeedId,
    });
    return values.length > 0 ? values : (['1K', '2K', '4K'] as Resolution[]);
  }, [aiModel, generationServerId, generationSpeedId, pricingEntries]);

  const availableServers = useMemo(() => {
    const values = getCompatibleGenerationServers({
      tier: aiModel,
      pricingEntries,
      speed: generationSpeedId,
      resolution,
    });
    return values.length > 0 ? values : ['fast'];
  }, [aiModel, generationSpeedId, pricingEntries, resolution]);

  const availableSpeeds = useMemo(() => {
    const values = getCompatibleGenerationSpeeds({
      tier: aiModel,
      pricingEntries,
      serverId: generationServerId,
      resolution,
    });
    return values.length > 0 ? values : ['fast'];
  }, [aiModel, generationServerId, pricingEntries, resolution]);

  useEffect(() => {
    if (!availableResolutions.includes(resolution)) {
      setResolution(availableResolutions[0] || '1K');
    }
  }, [availableResolutions, resolution]);

  useEffect(() => {
    if (!availableServers.includes(generationServerId)) {
      setServer(tstServerToUi(availableServers[0] || 'fast'));
    }
    if (!availableSpeeds.includes(generationSpeedId as any)) {
      setSpeed((availableSpeeds[0] || 'fast') === 'slow' ? 'Chậm' : 'Nhanh');
    }
  }, [availableServers, availableSpeeds, generationServerId, generationSpeedId]);

  const selectedCost = getGenerationCostBreakdown({
    tier: aiModel,
    resolution,
    speed: generationSpeedId,
    serverId: generationServerId,
    pricingEntries,
    pricingOverrides: pricingOverrides as any,
  });

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

    const effectiveCost = selectedCost.available ? selectedCost.vcoin : 0;
    if (!selectedCost.available || effectiveCost <= 0) {
      notify('Cấu hình giá cho model này chưa khả dụng. Vui lòng kiểm tra bảng giá admin/TST.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await getUserProfile({ force: true });
      if ((profile.vcoin_balance || 0) < effectiveCost) {
        notify(`Bạn cần ${effectiveCost} Vcoin để tạo ảnh.`, 'error');
        return;
      }

      const localImages = referenceImages.filter((value): value is string => Boolean(value));
      const stagedImages = await Promise.all(localImages.map((value, index) => stageReferenceImage(value, index)));
      const queuedJobId = crypto.randomUUID();
      const queuePayload: PromptImageGenerateRecipePayload = {
        recipeType: 'prompt_image_generate_recipe_v1',
        modelId: getGenerationModelId(aiModel),
        prompt: userPrompt,
        referenceImages: stagedImages,
        resolution,
        aspectRatio,
        speed: generationSpeedId,
        serverId: generationServerId,
      };

      const queuedImage: GeneratedImage = {
        id: queuedJobId,
        url: localImages[0] || '',
        prompt: userPrompt,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        toolId: feature.id,
        toolName: feature.name.en,
        engine: `${aiModel === 'flash' ? 'Flash' : 'Pro'} Prompt Image ${resolution}`,
        status: 'queued',
        displayStatus: 'queued',
        assetType: 'image',
        queueKind: 'image_generate',
        jobId: queuedJobId,
        progress: 0,
        cost: effectiveCost,
      };

      await saveImageToLocalCache(queuedImage);
      await enqueueServerJob({
        id: queuedJobId,
        prompt: userPrompt,
        toolId: feature.id,
        toolName: feature.name.en,
        engine: queuedImage.engine,
        assetType: 'image',
        costVcoin: effectiveCost,
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
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 pb-24">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />

      <div className="space-y-5">
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          <div className="font-bold text-white mb-1">Tạo Ảnh AI thuần prompt</div>
          <p className="text-cyan-100/80">
            Chức năng này chỉ gửi prompt người dùng và ảnh tham chiếu lên TST. Không chèn prompt hệ thống Audition, không dùng role identity/composition/style.
          </p>
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-audi-pink" />
              1. Upload ảnh tham chiếu
            </h3>
            <span className="text-xs text-slate-400">{referenceImages.length}/{MAX_REFERENCE_IMAGES} ảnh</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {referenceImages.map((image, index) => (
              <div key={index} className="relative rounded-2xl border border-white/10 bg-[#11121a] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold text-white">Ảnh {index + 1}</span>
                  {referenceImages.length > 1 && (
                    <button type="button" onClick={() => removeImageSlot(index)} className="p-1 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/10">
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
                      <ImageIcon className="w-10 h-10 mb-2" />
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
                className="min-h-[260px] rounded-2xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 flex flex-col items-center justify-center gap-3 transition-colors"
              >
                <Plus className="w-8 h-8" />
                <span className="text-sm font-bold">Thêm ảnh</span>
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#11121a] p-4">
          <h3 className="text-lg font-black text-white mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-cyan-300" />
            2. Prompt
          </h3>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={9999}
            placeholder="Nhập prompt tạo ảnh giống Gemini/ChatGPT. Ví dụ: tạo ảnh thời trang 3D cinematic từ các ảnh tham chiếu đã tải lên..."
            className="w-full min-h-[180px] rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white outline-none focus:border-audi-pink resize-none"
          />
          <div className="mt-2 text-right text-xs text-slate-500">{prompt.length}/9999</div>
        </section>
      </div>

      <aside className="h-fit rounded-3xl border border-white/10 bg-[#11121a] p-5 sticky top-4">
        <h3 className="text-xl font-black text-white flex items-center gap-2 mb-5">
          <Cpu className="w-5 h-5 text-slate-400" />
          3. Cấu hình
        </h3>

        <div className="space-y-5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Mô hình AI</label>
            <div className="grid grid-cols-2 gap-2 mt-2 rounded-xl bg-black/40 p-1">
              {(['flash', 'pro'] as TstGenerationTier[]).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setAiModel(tier)}
                  className={`py-3 rounded-lg text-sm font-black transition-all ${aiModel === tier ? 'bg-audi-purple text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {tier === 'flash' ? 'Flash' : 'Pro'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Tỷ lệ khung hình</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`py-2 rounded-lg text-xs font-bold ${aspectRatio === ratio ? 'bg-audi-purple text-white' : 'bg-black/40 text-slate-400 hover:text-white'}`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Độ phân giải</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {availableResolutions.map((value) => (
                <button
                  key={value}
                  onClick={() => setResolution(value)}
                  className={`py-3 rounded-lg text-xs font-black ${resolution === value ? 'bg-audi-purple text-white' : 'bg-black/40 text-slate-400 hover:text-white'}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Tốc độ</label>
              <select value={speed} onChange={(event) => setSpeed(event.target.value)} className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 p-3 text-sm text-white outline-none">
                <option>Nhanh</option>
                <option>Chậm</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Server</label>
              <select value={server} onChange={(event) => setServer(event.target.value)} className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 p-3 text-sm text-white outline-none">
                {availableServers.map((value) => (
                  <option key={value}>{tstServerToUi(value)}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-gradient-to-r from-audi-pink to-audi-purple py-4 text-white font-black shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {isSubmitting ? 'Đang gửi job...' : `Tạo ảnh ${selectedCost.available ? `${selectedCost.vcoin} Vcoin` : ''}`}
          </button>
        </div>
      </aside>
    </div>
  );
};
