import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock3,
  Coins,
  Download,
  Filter,
  Gift,
  Image as ImageIcon,
  Loader,
  PlayCircle,
  RefreshCw,
  Share2,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useNotification } from '../components/NotificationSystem';
import { getUnifiedHistory } from '../services/economyService';
import { QUEUE_SUBMITTED_EVENT } from '../services/serverQueueService';
import { deleteImageFromStorage, getAllImagesFromStorage, invalidateGalleryCache, publishImageToShowcase, checkR2Connection, subscribeToGeneratedImagesRealtime } from '../services/storageService';
import { downloadAssetToBrowser } from '../../../services/downloadService';
import type { GeneratedImage, HistoryItem } from '../types';
import { getSupabaseUser } from '../services/supabaseClient';

type GalleryFilter = 'all' | 'completed' | 'failed' | 'processing';
type GalleryMediaFilter = 'all' | 'image' | 'video';
type GalleryTab = 'generation' | 'transactions';

const getImageStatus = (image: GeneratedImage) => image.displayStatus || image.status;

const getAssetKind = (image: GeneratedImage): 'image' | 'video' => {
  if (image.assetType) return image.assetType;
  if (image.queueKind?.includes('video') || image.queueKind?.includes('motion')) return 'video';
  if (image.toolId?.includes('video') || image.toolId?.includes('motion')) return 'video';

  const normalizedEngine = (image.engine || '').toLowerCase();
  const normalizedToolName = (image.toolName || '').toLowerCase();
  const normalizedUrl = (image.url || '').toLowerCase();
  if (
    normalizedEngine.includes('kling') ||
    normalizedEngine.includes('motion') ||
    normalizedEngine.includes('video') ||
    normalizedToolName.includes('video') ||
    normalizedToolName.includes('motion') ||
    normalizedUrl.endsWith('.mp4') ||
    normalizedUrl.includes('.mp4?') ||
    normalizedUrl.includes('/video/')
  ) {
    return 'video';
  }

  return 'image';
};

const formatDate = (timestamp: number | string) => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleDateString('vi-VN', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const summarizePrompt = (prompt?: string | null, maxLength = 220) => {
  if (!prompt) return '';
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const getDownloadFilename = (image: GeneratedImage) =>
  `auditionai-${image.id}.${getAssetKind(image) === 'video' ? 'mp4' : 'png'}`;

const getTransactionStatusLabel = (status: HistoryItem['status']) => {
  switch (status) {
    case 'pending':
      return 'CHỜ DUYỆT';
    case 'failed':
      return 'THẤT BẠI';
    default:
      return 'THÀNH CÔNG';
  }
};

export const Gallery: React.FC = () => {
  const { notify, confirm } = useNotification();
  const lastRealtimeRefreshAtRef = React.useRef(0);
  const [activeTab, setActiveTab] = useState<GalleryTab>('generation');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [mediaFilter, setMediaFilter] = useState<GalleryMediaFilter>('all');
  const [transactions, setTransactions] = useState<HistoryItem[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [viewingImage, setViewingImage] = useState<GeneratedImage | null>(null);

  const mediaCounts = useMemo(
    () => ({
      image: images.filter((image) => getAssetKind(image) === 'image').length,
      video: images.filter((image) => getAssetKind(image) === 'video').length,
    }),
    [images],
  );

  const loadImages = useCallback(async () => {
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
    } catch (error) {
      console.error('[Gallery] Load failed', error);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingImages(true);
      await loadImages();
      setLoadingImages(false);
    })();
  }, [loadImages]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const handleQueueSubmitted = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (Date.now() - lastRealtimeRefreshAtRef.current < 3500) {
          return;
        }
        invalidateGalleryCache();
        void loadImages();
      }, 2500);
    };

    window.addEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
    };
  }, [loadImages]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      lastRealtimeRefreshAtRef.current = Date.now();
      refreshTimer = setTimeout(() => {
        if (!isMounted) return;
        invalidateGalleryCache();
        void loadImages();
      }, 250);
    };

    void (async () => {
      try {
        const user = await getSupabaseUser();
        if (!isMounted || !user?.id) return;
        unsubscribe = subscribeToGeneratedImagesRealtime({
          userId: user.id,
          onEvent: scheduleRefresh,
        });
      } catch (error) {
        console.warn('[Gallery] Failed to start realtime subscription', error);
      }
    })();

    return () => {
      isMounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [loadImages]);

  useEffect(() => {
    if (activeTab !== 'transactions') return;

    (async () => {
      setLoadingTransactions(true);
      try {
        const history = await getUnifiedHistory();
        setTransactions(history);
      } catch (error) {
        console.error('[Gallery] Transaction load failed', error);
      } finally {
        setLoadingTransactions(false);
      }
    })();
  }, [activeTab]);

  useEffect(() => {
    if (!viewingImage) return;
    const updated = images.find((image) => image.id === viewingImage.id);
    if (!updated) {
      setViewingImage(null);
      return;
    }
    if (
      updated.updatedAt !== viewingImage.updatedAt ||
      updated.status !== viewingImage.status ||
      updated.displayStatus !== viewingImage.displayStatus ||
      updated.progress !== viewingImage.progress ||
      updated.error !== viewingImage.error
    ) {
      setViewingImage(updated);
    }
  }, [images, viewingImage]);

  const filteredImages = useMemo(() => {
    return images
      .filter((image) => {
        const status = getImageStatus(image);
        const kind = getAssetKind(image);

        if (mediaFilter !== 'all' && kind !== mediaFilter) return false;
        if (filter === 'all') return true;
        if (filter === 'completed') return !status || status === 'completed';
        if (filter === 'failed') return status === 'failed';
        if (filter === 'processing') {
          return status === 'processing' || status === 'queued' || status === 'rescuing';
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [filter, images, mediaFilter]);

  const handleRefresh = async () => {
    invalidateGalleryCache();
    setLoadingImages(true);
    await loadImages();
    setLoadingImages(false);
  };

  const handleDelete = (image: GeneratedImage) => {
    confirm({
      title: 'Xóa mục này?',
      message: 'Bạn có chắc muốn xóa vĩnh viễn mục này khỏi lịch sử tạo?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        await deleteImageFromStorage(image.id);
        setImages((current) => current.filter((item) => item.id !== image.id));
        if (viewingImage?.id === image.id) setViewingImage(null);
        notify('Đã xóa thành công.', 'info');
      },
    });
  };

  const handleDownload = async (image: GeneratedImage) => {
    if (!image.url) return;
    try {
      notify('Đang xử lý tải xuống...', 'info');
      await downloadAssetToBrowser(image.url, getDownloadFilename(image));
      notify(getAssetKind(image) === 'video' ? 'Đã lưu video thành công!' : 'Đã lưu ảnh thành công!', 'success');
    } catch (error) {
      console.error('[Gallery] Download failed', error);
      notify('Tải xuống thất bại.', 'error');
    }
  };

  const handleShare = async (image: GeneratedImage) => {
    if (!image.url || getAssetKind(image) !== 'image') return;
    try {
      if (image.isShared) {
        notify('Ảnh này đã được publish trước đó.', 'info');
        return;
      }

      const r2Ready = await checkR2Connection();
      if (!r2Ready) {
        notify('Cloudflare R2 chưa được cấu hình nên chưa thể publish ảnh công khai.', 'error');
        return;
      }

      const updatedImage = await publishImageToShowcase(image);
      setImages((current) => current.map((entry) => (entry.id === updatedImage.id ? updatedImage : entry)));
      if (viewingImage?.id === updatedImage.id) {
        setViewingImage(updatedImage);
      }
      notify('Đã chia sẻ ảnh lên trang chủ và lưu trữ lâu dài.', 'success');
    } catch (error) {
      console.error('[Gallery] Share failed', error);
      notify(error instanceof Error ? error.message : 'Chia sẻ ảnh thất bại.', 'error');
    }
  };

  const getStatusBadge = (image: GeneratedImage) => {
    const status = getImageStatus(image);
    const isCompleted = !status || status === 'completed';
    const isFailed = status === 'failed';
    const isProcessing = status === 'processing' || status === 'queued' || status === 'rescuing';

    if (isCompleted) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Xong
        </span>
      );
    }

    if (isFailed) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-500 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-3 w-3" />
          Lỗi
        </span>
      );
    }

    if (isProcessing) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
          <Loader className="h-3 w-3 animate-spin" />
          {Math.round(image.progress || 0)}%
        </span>
      );
    }

    return null;
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'topup':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><ArrowUpCircle className="h-3 w-3" /> Nạp</span>;
      case 'pending_topup':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"><Clock3 className="h-3 w-3" /> Chờ</span>;
      case 'usage':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><ArrowDownCircle className="h-3 w-3" /> Dùng</span>;
      case 'refund':
        return <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300"><RefreshCw className="h-3 w-3" /> Hoàn</span>;
      case 'reward':
      case 'giftcode':
        return <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-500/10 dark:text-purple-300"><Gift className="h-3 w-3" /> Thưởng</span>;
      default:
        return <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500">Khác</span>;
    }
  };

  const DetailModal = () => {
    if (!viewingImage) return null;

    const image = viewingImage;
    const assetKind = getAssetKind(image);
    const status = getImageStatus(image);
    const isVideo = assetKind === 'video';
    const isCompleted = !status || status === 'completed';

    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-white/95 backdrop-blur-sm dark:bg-black/95" onClick={() => setViewingImage(null)}>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            {isVideo ? <Video className="h-4 w-4 text-purple-500" /> : <ImageIcon className="h-4 w-4 text-blue-500" />}
            <span className="text-xs font-bold uppercase text-gray-400 dark:text-zinc-500">{isVideo ? 'Video' : 'Ảnh'}</span>
          </div>
          <button onClick={() => setViewingImage(null)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto w-full max-w-lg px-4">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-gray-100 dark:bg-zinc-900">
              {image.url ? (
                isVideo ? (
                  <video src={image.url} className="h-full w-full object-contain" controls autoPlay muted playsInline preload="metadata" />
                ) : (
                  <img src={image.url} alt="" className="h-full w-full object-contain" />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {status === 'processing' || status === 'queued' || status === 'rescuing' ? (
                    <div className="text-center">
                      <Loader className="mx-auto mb-3 h-10 w-10 animate-spin text-purple-500" />
                      <p className="text-sm text-gray-500 dark:text-zinc-400">Đang tạo... {Math.round(image.progress || 0)}%</p>
                      <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
                        <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${image.progress || 0}%` }} />
                      </div>
                    </div>
                  ) : status === 'failed' ? (
                    <div className="px-6 text-center">
                      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
                      <p className="text-sm font-semibold text-red-500">Thất bại</p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">{image.error || 'Không có chi tiết lỗi'}</p>
                    </div>
                  ) : isVideo ? (
                    <Video className="h-10 w-10 text-gray-300 dark:text-zinc-700" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-gray-300 dark:text-zinc-700" />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isVideo ? <Video className="h-4 w-4 text-purple-500" /> : <ImageIcon className="h-4 w-4 text-blue-500" />}
                <span className="text-xs font-bold uppercase text-gray-400 dark:text-zinc-500">{isVideo ? 'Video' : 'Ảnh'}</span>
              </div>
              {getStatusBadge(image)}
            </div>

            {(image.userPrompt || image.prompt) ? (
              <p className="line-clamp-5 text-sm leading-relaxed text-gray-700 dark:text-zinc-200">
                {summarizePrompt(image.userPrompt || image.prompt)}
              </p>
            ) : null}

            {image.providerPrompt ? (
              <details className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/80">
                <summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                  Prompt nội bộ / provider
                </summary>
                <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-gray-500 dark:text-zinc-400">
                  {image.providerPrompt}
                </p>
              </details>
            ) : null}

            {image.queueStage || (image.queueLogs?.length || 0) > 0 ? (
              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-3 dark:border-purple-500/20 dark:bg-purple-500/10">
                <p className="text-[11px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300">
                  Luồng xử lý
                </p>
                {image.queueStage ? (
                  <p className="mt-1 text-xs font-semibold text-gray-700 dark:text-zinc-200">{image.queueStage}</p>
                ) : null}
                {(image.queueLogs?.length || 0) > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {image.queueLogs!.slice(-3).map((entry, index) => (
                      <div key={`${entry.at}-${index}`} className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-zinc-400">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                        <span>{entry.message}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-zinc-800/80"><span className="text-gray-400 dark:text-zinc-500">Thời gian</span><p className="mt-0.5 font-medium text-gray-700 dark:text-zinc-200">{formatDate(image.timestamp)}</p></div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-zinc-800/80"><span className="text-gray-400 dark:text-zinc-500">Chi phí</span><p className="mt-0.5 font-medium text-gray-700 dark:text-zinc-200">{typeof image.cost === 'number' ? `${image.cost} Vcoin` : 'Không có'}</p></div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-zinc-800/80"><span className="text-gray-400 dark:text-zinc-500">Công cụ</span><p className="mt-0.5 truncate font-medium text-gray-700 dark:text-zinc-200">{image.toolName || image.engine}</p></div>
              <div className="rounded-2xl bg-gray-50 p-3 dark:bg-zinc-800/80"><span className="text-gray-400 dark:text-zinc-500">ID</span><p className="mt-0.5 truncate font-mono text-gray-500 dark:text-zinc-400">{image.id.substring(0, 12)}</p></div>
            </div>

            {status === 'failed' && image.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{image.error}</div> : null}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-lg gap-2 bg-gradient-to-t from-white via-white/95 to-transparent p-4 pb-6 dark:from-black dark:via-black/95" onClick={(event) => event.stopPropagation()}>
          {isCompleted && image.url ? (
            <>
              <button onClick={() => void handleDownload(image)} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-3.5 text-sm font-bold text-white transition-transform active:scale-95 dark:bg-white dark:text-black"><Download className="h-4 w-4" />Tải xuống</button>
              {getAssetKind(image) === 'image' ? (
                <button
                  onClick={() => void handleShare(image)}
                  disabled={Boolean(image.isShared)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold transition-transform active:scale-95 ${
                    image.isShared
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300'
                  }`}
                >
                  <Share2 className="h-4 w-4" />
                  {image.isShared ? 'Đã publish' : 'Chia sẻ'}
                </button>
              ) : null}
            </>
          ) : null}
          <button onClick={() => { setViewingImage(null); handleDelete(image); }} className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-red-50 px-5 py-3.5 text-sm font-bold text-red-500 transition-transform active:scale-95 dark:bg-red-500/20 dark:text-red-300"><Trash2 className="h-4 w-4" />Xóa</button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-28 dark:bg-[#09090B]">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 px-4 pb-0 pt-3 backdrop-blur-xl dark:border-zinc-800 dark:bg-[#18181B]/85">
        <div className="mb-3 flex rounded-2xl bg-gray-100 p-1 dark:bg-zinc-800">
          <button onClick={() => setActiveTab('generation')} className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${activeTab === 'generation' ? 'bg-white text-gray-900 shadow-sm dark:bg-[#18181B] dark:text-white' : 'text-gray-400 dark:text-zinc-500'}`}>Lịch sử tạo</button>
          <button onClick={() => setActiveTab('transactions')} className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${activeTab === 'transactions' ? 'bg-white text-gray-900 shadow-sm dark:bg-[#18181B] dark:text-white' : 'text-gray-400 dark:text-zinc-500'}`}>Giao dịch Vcoin</button>
        </div>

        {activeTab === 'generation' ? (
          <div className="space-y-2 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <Filter className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-zinc-500" />
              {([
                ['all', 'Tất cả'],
                ['completed', 'Xong'],
                ['failed', 'Lỗi'],
                ['processing', 'Đang chờ'],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all ${filter === key ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>{label}</button>
              ))}
              <button onClick={() => void handleRefresh()} className="ml-auto rounded-full p-1.5 transition hover:bg-gray-100 dark:bg-zinc-800"><RefreshCw className={`h-4 w-4 text-gray-400 dark:text-zinc-500 ${loadingImages ? 'animate-spin' : ''}`} /></button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {([
                ['all', `Tất cả ${images.length}`],
                ['image', `Ảnh ${mediaCounts.image}`],
                ['video', `Video ${mediaCounts.video}`],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setMediaFilter(key)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${mediaFilter === key ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>{label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4">
        {activeTab === 'generation' ? (
          loadingImages ? (
            <div className="flex justify-center py-20"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
          ) : filteredImages.length === 0 ? (
            <div className="py-20 text-center">
              {mediaFilter === 'video' ? <Video className="mx-auto mb-3 h-12 w-12 text-gray-200" /> : <ImageIcon className="mx-auto mb-3 h-12 w-12 text-gray-200" />}
              <p className="text-sm text-gray-400 dark:text-zinc-500">Không có dữ liệu phù hợp.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredImages.map((image) => {
                const assetKind = getAssetKind(image);
                const isVideo = assetKind === 'video';
                const status = getImageStatus(image);
                const isProcessing = status === 'processing' || status === 'queued' || status === 'rescuing';
                const isFailed = status === 'failed';

                return (
                  <button key={image.id} onClick={() => setViewingImage(image)} className="overflow-hidden rounded-[26px] border border-gray-100 bg-white text-left shadow-sm transition-transform active:scale-[0.985] dark:border-zinc-800 dark:bg-[#18181B]">
                    <div className="relative aspect-square bg-gray-100 dark:bg-zinc-800">
                      {isProcessing ? (
                        <div className="flex h-full w-full flex-col items-center justify-center">
                          <Loader className="mb-2 h-6 w-6 animate-spin text-purple-400" />
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500">{Math.round(image.progress || 0)}%</span>
                          <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700"><div className="h-full rounded-full bg-purple-400" style={{ width: `${image.progress || 0}%` }} /></div>
                        </div>
                      ) : isFailed ? (
                        <div className="flex h-full w-full flex-col items-center justify-center"><AlertTriangle className="mb-1 h-6 w-6 text-red-300" /><span className="text-[10px] text-red-400">Thất bại</span></div>
                      ) : image.url ? (
                        isVideo ? (
                          <>
                            <video src={image.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                            <div className="absolute bottom-2 right-2 rounded-full bg-white/90 p-1.5 text-purple-600 shadow-lg"><PlayCircle className="h-4 w-4" /></div>
                          </>
                        ) : (
                          <img src={image.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">{isVideo ? <Video className="h-6 w-6 text-gray-300 dark:text-zinc-600" /> : <ImageIcon className="h-6 w-6 text-gray-300 dark:text-zinc-600" />}</div>
                      )}

                      <div className="absolute left-2 top-2">
                        {isVideo ? (
                          <span className="flex items-center gap-1 rounded-md bg-purple-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white"><Video className="h-2.5 w-2.5" />Video</span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-md bg-blue-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white"><ImageIcon className="h-2.5 w-2.5" />Ảnh</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 p-2.5">
                      <p className="line-clamp-2 min-h-[2.5rem] text-[11px] font-medium text-gray-700 dark:text-zinc-200">{image.userPrompt || image.prompt || image.toolName || (isVideo ? 'Video AI' : 'Ảnh AI')}</p>
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] text-gray-400 dark:text-zinc-500">{formatDate(image.timestamp).split(',')[0]}</span>{getStatusBadge(image)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : loadingTransactions ? (
          <div className="flex justify-center py-20"><Loader className="h-7 w-7 animate-spin text-gray-300" /></div>
        ) : transactions.length === 0 ? (
          <div className="py-20 text-center"><Coins className="mx-auto mb-3 h-12 w-12 text-gray-200" /><p className="text-sm text-gray-400 dark:text-zinc-500">Chưa có giao dịch nào.</p></div>
        ) : (
          <div className="space-y-2.5">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="rounded-[26px] border border-gray-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#18181B]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      {getTransactionBadge(transaction.type)}
                      {transaction.status !== 'success' ? <span className={`text-[10px] font-bold ${transaction.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}>{getTransactionStatusLabel(transaction.status)}</span> : null}
                    </div>
                    <p className="line-clamp-1 text-sm text-gray-700 dark:text-zinc-200">{transaction.description}</p>
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-zinc-500">{formatDate(transaction.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${transaction.vcoinChange >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'}`}>{transaction.vcoinChange >= 0 ? '+' : ''}{transaction.vcoinChange} VC</p>
                    {transaction.amountVnd ? <p className="text-[10px] text-gray-400 dark:text-zinc-500">{new Intl.NumberFormat('vi-VN').format(transaction.amountVnd)}đ</p> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DetailModal />
    </div>
  );
};
