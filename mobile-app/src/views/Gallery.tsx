/**
 * Gallery.tsx — Mobile Gallery (Lịch sử tạo + Giao dịch Vcoin)
 * Ported from desktop Gallery.tsx with mobile-first UX.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Image, Video, Loader, Trash2, Download, AlertTriangle, CheckCircle, Clock,
  Filter, RefreshCw, Coins, ArrowUpCircle, ArrowDownCircle, Gift, Share2
} from 'lucide-react';
import { useNotification } from '../components/NotificationSystem';
import { getAllImagesFromStorage, deleteImageFromStorage, invalidateGalleryCache } from '../services/storageService';
import { getUnifiedHistory } from '../services/economyService';
import { QUEUE_SUBMITTED_EVENT } from '../services/serverQueueService';
import type { GeneratedImage, HistoryItem } from '../types';

type GalleryFilter = 'all' | 'completed' | 'failed' | 'processing';
type GalleryTab = 'generation' | 'transactions';

export const Gallery: React.FC = () => {
  const { notify, confirm } = useNotification();
  const [activeTab, setActiveTab] = useState<GalleryTab>('generation');

  // Generation History
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [filter, setFilter] = useState<GalleryFilter>('all');

  // Transaction History
  const [transactions, setTransactions] = useState<HistoryItem[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Detail view
  const [viewingImage, setViewingImage] = useState<GeneratedImage | null>(null);

  const hasActiveJobs = useMemo(
    () => images.some((img) => img.status === 'processing' || img.status === 'queued'),
    [images],
  );

  const loadImages = useCallback(async () => {
    try {
      const stored = await getAllImagesFromStorage();
      setImages(stored);
    } catch (e) {
      console.error('[Gallery] Load failed', e);
    }
  }, []);

  // Init
  useEffect(() => {
    (async () => {
      setLoadingImages(true);
      await loadImages();
      setLoadingImages(false);
    })();
  }, [loadImages]);

  // Polling for active jobs
  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(() => loadImages(), 10_000);
    return () => clearInterval(interval);
  }, [hasActiveJobs, loadImages]);

  // Listen for queue submissions → auto-refresh gallery (immediate + delayed)
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const handleQueueSubmitted = () => {
      invalidateGalleryCache();
      loadImages().catch(console.warn);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        invalidateGalleryCache();
        loadImages().catch(console.warn);
      }, 4500);
    };
    window.addEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
    };
  }, [loadImages]);

  // Load transactions when tab switches
  useEffect(() => {
    if (activeTab !== 'transactions') return;
    (async () => {
      setLoadingTransactions(true);
      try {
        const txs = await getUnifiedHistory();
        setTransactions(txs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingTransactions(false);
      }
    })();
  }, [activeTab]);

  // Sync detail viewer
  useEffect(() => {
    if (!viewingImage) return;
    const updated = images.find((img) => img.id === viewingImage.id);
    if (!updated) { setViewingImage(null); return; }
    if (updated.updatedAt !== viewingImage.updatedAt || updated.status !== viewingImage.status) {
      setViewingImage(updated);
    }
  }, [images, viewingImage]);

  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      if (filter === 'all') return true;
      if (filter === 'completed') return !img.status || img.status === 'completed';
      if (filter === 'failed') return img.status === 'failed';
      if (filter === 'processing') return img.status === 'processing' || img.status === 'queued';
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [images, filter]);

  const getAssetKind = (img: GeneratedImage): 'image' | 'video' => {
    if (img.assetType) return img.assetType;
    if (img.toolId?.includes('video') || img.toolId?.includes('motion')) return 'video';
    if ((img.engine || '').toLowerCase().includes('kling') || (img.engine || '').toLowerCase().includes('motion')) return 'video';
    if ((img.url || '').toLowerCase().endsWith('.mp4') || (img.url || '').toLowerCase().includes('.mp4?')) return 'video';
    return 'image';
  };

  const handleDelete = async (img: GeneratedImage) => {
    confirm({
      title: 'Xóa mục này?',
      message: 'Bạn có chắc muốn xóa vĩnh viễn?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        await deleteImageFromStorage(img.id);
        setImages((prev) => prev.filter((i) => i.id !== img.id));
        if (viewingImage?.id === img.id) setViewingImage(null);
        notify('Đã xóa.', 'info');
      },
    });
  };

  const handleDownload = async (img: GeneratedImage) => {
    if (!img.url) return;
    try {
      const a = document.createElement('a');
      a.href = img.url;
      a.download = `auditionai-${img.id}.${getAssetKind(img) === 'video' ? 'mp4' : 'png'}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      notify('Tải xuống thất bại.', 'error');
    }
  };

  const handleShare = async (img: GeneratedImage) => {
    if (!img.url) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Audition AI',
          text: img.prompt || 'Xem tác phẩm của tôi tạo bằng Audition AI!',
          url: img.url,
        });
      } else {
        await navigator.clipboard.writeText(img.url);
        notify('Đã copy link!', 'success');
      }
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  const handleRefresh = async () => {
    invalidateGalleryCache();
    setLoadingImages(true);
    await loadImages();
    setLoadingImages(false);
  };

  const formatDate = (timestamp: number | string) => {
    const d = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    return d.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (img: GeneratedImage) => {
    const isCompleted = !img.status || img.status === 'completed';
    const isFailed = img.status === 'failed';
    const isProcessing = img.status === 'processing' || img.status === 'queued';

    if (isCompleted) return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-50 dark:bg-green-500/10 text-green-600"><CheckCircle className="w-3 h-3" /> Xong</span>;
    if (isFailed) return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-50 dark:bg-red-500/10 text-red-500"><AlertTriangle className="w-3 h-3" /> Lỗi</span>;
    if (isProcessing) return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600"><Loader className="w-3 h-3 animate-spin" /> {Math.round(img.progress || 0)}%</span>;
    return null;
  };

  const getTxBadge = (type: string) => {
    switch (type) {
      case 'topup': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-50 dark:bg-green-500/10 text-green-600"><ArrowUpCircle className="w-3 h-3" /> NẠP</span>;
      case 'pending_topup': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600"><Clock className="w-3 h-3" /> CHỜ</span>;
      case 'usage': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600"><ArrowDownCircle className="w-3 h-3" /> DÙNG</span>;
      case 'reward': case 'giftcode': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-600"><Gift className="w-3 h-3" /> THƯỞNG</span>;
      case 'refund': return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600"><RefreshCw className="w-3 h-3" /> HOÀN</span>;
      default: return <span className="text-[10px] text-gray-400 dark:text-zinc-500">KHÁC</span>;
    }
  };

  // --- DETAIL MODAL ---
  const DetailModal = () => {
    if (!viewingImage) return null;
    const img = viewingImage;
    const isVideo = getAssetKind(img) === 'video';
    const isCompleted = !img.status || img.status === 'completed';

    return (
      <div className="fixed inset-0 z-[60] bg-white/95 dark:bg-black/95 backdrop-blur-sm flex flex-col" onClick={() => setViewingImage(null)}>
        {/* Top bar with close */}
        <div className="flex items-center justify-between p-4 shrink-0">
          <div className="flex items-center gap-2">
            {isVideo ? <Video className="w-4 h-4 text-purple-500" /> : <Image className="w-4 h-4 text-blue-500" />}
            <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase">{isVideo ? 'Video' : 'Image'}</span>
          </div>
          <button onClick={() => setViewingImage(null)} className="w-9 h-9 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
            ✕
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0" onClick={(e) => e.stopPropagation()}>
          {/* Preview */}
          <div className="w-full max-w-lg mx-auto px-4">
            <div className="relative bg-gray-100 dark:bg-zinc-900 rounded-2xl overflow-hidden aspect-[4/3]">
              {img.url ? (
                isVideo
                  ? <video src={img.url} className="w-full h-full object-contain" controls autoPlay muted playsInline />
                  : <img src={img.url} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {img.status === 'processing' || img.status === 'queued' ? (
                    <div className="text-center">
                      <Loader className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-zinc-400">Đang tạo... {Math.round(img.progress || 0)}%</p>
                      <div className="mt-2 w-48 h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden mx-auto">
                        <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${img.progress || 0}%` }} />
                      </div>
                    </div>
                  ) : img.status === 'failed' ? (
                    <div className="text-center px-6">
                      <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                      <p className="text-sm text-red-500 font-medium">Thất bại</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{img.error || 'Không có chi tiết lỗi'}</p>
                    </div>
                  ) : (
                    <Image className="w-10 h-10 text-gray-300 dark:text-zinc-600" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="w-full max-w-lg mx-auto px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isVideo ? <Video className="w-4 h-4 text-purple-500" /> : <Image className="w-4 h-4 text-blue-500" />}
                <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase">{isVideo ? 'Video' : 'Image'}</span>
              </div>
              {getStatusBadge(img)}
            </div>

            {img.prompt && <p className="text-sm text-gray-700 dark:text-zinc-200 line-clamp-3">{img.prompt}</p>}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 dark:bg-zinc-800/80 rounded-xl p-3">
                <span className="text-gray-400 dark:text-zinc-500">Thời gian</span>
                <p className="font-medium text-gray-700 dark:text-zinc-200 mt-0.5">{formatDate(img.timestamp)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-zinc-800/80 rounded-xl p-3">
                <span className="text-gray-400 dark:text-zinc-500">Chi phí</span>
                <p className="font-medium text-gray-700 dark:text-zinc-200 mt-0.5">{typeof img.cost === 'number' ? `${img.cost} Vcoin` : 'N/A'}</p>
              </div>
              <div className="bg-gray-50 dark:bg-zinc-800/80 rounded-xl p-3">
                <span className="text-gray-400 dark:text-zinc-500">Model</span>
                <p className="font-medium text-gray-700 dark:text-zinc-200 mt-0.5 truncate">{img.engine || img.toolName}</p>
              </div>
              <div className="bg-gray-50 dark:bg-zinc-800/80 rounded-xl p-3">
                <span className="text-gray-400 dark:text-zinc-500">ID</span>
                <p className="font-mono text-gray-500 dark:text-zinc-400 mt-0.5 truncate">{img.id.substring(0, 12)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons — fixed at bottom */}
        <div className="shrink-0 p-4 pb-6 bg-gradient-to-t from-white dark:from-black via-white/90 dark:via-black/90 to-transparent flex gap-2 max-w-lg mx-auto w-full" onClick={(e) => e.stopPropagation()}>
          {isCompleted && img.url && (
            <>
              <button onClick={() => handleDownload(img)} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl text-sm font-bold active:scale-95 transition-transform">
                <Download className="w-4 h-4" /> Tải xuống
              </button>
              <button onClick={() => handleShare(img)} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded-2xl text-sm font-bold active:scale-95 transition-transform">
                <Share2 className="w-4 h-4" /> Chia sẻ
              </button>
            </>
          )}
          <button onClick={() => { setViewingImage(null); handleDelete(img); }} className="flex items-center justify-center gap-2 px-5 py-3.5 bg-red-50 dark:bg-red-500/20 text-red-500 dark:text-red-400 rounded-2xl text-sm font-bold active:scale-95 transition-transform shrink-0">
            <Trash2 className="w-4 h-4" /> Xóa
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-28">
      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-white dark:bg-[#18181B]/80 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800 px-4 pt-3 pb-0">
        <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-2xl p-1 mb-3">
          <button
            onClick={() => setActiveTab('generation')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'generation' ? 'bg-white dark:bg-[#18181B] text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 dark:text-zinc-500'}`}
          >
            Lịch sử tạo
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'transactions' ? 'bg-white dark:bg-[#18181B] text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 dark:text-zinc-500'}`}
          >
            Giao dịch Vcoin
          </button>
        </div>

        {/* Filters (Generation tab only) */}
        {activeTab === 'generation' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 no-scrollbar">
            <Filter className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 shrink-0" />
            {([['all', 'Tất cả'], ['completed', 'Xong'], ['failed', 'Lỗi'], ['processing', 'Đang chờ']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${filter === key ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500'}`}
              >
                {label}
              </button>
            ))}
            <button onClick={handleRefresh} className="ml-auto p-1.5 rounded-full hover:bg-gray-100 dark:bg-zinc-800 transition">
              <RefreshCw className={`w-4 h-4 text-gray-400 dark:text-zinc-500 ${loadingImages ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        {activeTab === 'generation' ? (
          loadingImages ? (
            <div className="flex justify-center py-20"><Loader className="w-7 h-7 text-gray-300 animate-spin" /></div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-20">
              <Image className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Không có dữ liệu</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredImages.map((img) => {
                const isVideo = getAssetKind(img) === 'video';
                const isProcessing = img.status === 'processing' || img.status === 'queued';
                const isFailed = img.status === 'failed';

                return (
                  <div
                    key={img.id}
                    onClick={() => setViewingImage(img)}
                    className="bg-white dark:bg-[#18181B] rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-zinc-800 active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-square bg-gray-100 dark:bg-zinc-800">
                      {isProcessing ? (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <Loader className="w-6 h-6 text-purple-400 animate-spin mb-2" />
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500">{Math.round(img.progress || 0)}%</span>
                          <div className="w-16 h-1 bg-gray-200 dark:bg-zinc-700 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-purple-400 rounded-full" style={{ width: `${img.progress || 0}%` }} />
                          </div>
                        </div>
                      ) : isFailed ? (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <AlertTriangle className="w-6 h-6 text-red-300 mb-1" />
                          <span className="text-[10px] text-red-400">Thất bại</span>
                        </div>
                      ) : img.url ? (
                        isVideo
                          ? <video src={img.url} className="w-full h-full object-cover" muted playsInline />
                          : <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="w-6 h-6 text-gray-200" />
                        </div>
                      )}

                      {/* Type badge */}
                      <div className="absolute top-2 left-2">
                        {isVideo
                          ? <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-500/90 text-white text-[9px] font-bold rounded-md"><Video className="w-2.5 h-2.5" /> Video</span>
                          : <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-500/90 text-white text-[9px] font-bold rounded-md"><Image className="w-2.5 h-2.5" /> Ảnh</span>
                        }
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <p className="text-[11px] text-gray-700 dark:text-zinc-200 font-medium line-clamp-1">{img.prompt || img.toolName}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-gray-400 dark:text-zinc-500">{formatDate(img.timestamp).split(',')[0]}</span>
                        {getStatusBadge(img)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // --- TRANSACTIONS TAB ---
          loadingTransactions ? (
            <div className="flex justify-center py-20"><Loader className="w-7 h-7 text-gray-300 animate-spin" /></div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-20">
              <Coins className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">Chưa có giao dịch nào</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-white dark:bg-[#18181B] rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getTxBadge(tx.type)}
                        {tx.status === 'pending' && <span className="text-[10px] text-yellow-500 font-bold">PENDING</span>}
                        {tx.status === 'failed' && <span className="text-[10px] text-red-500 font-bold">FAILED</span>}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-zinc-200 line-clamp-1">{tx.description}</p>
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={`text-sm font-bold ${tx.vcoinChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {tx.vcoinChange >= 0 ? '+' : ''}{tx.vcoinChange} VC
                      </p>
                      {tx.amountVnd && (
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">{new Intl.NumberFormat('vi-VN').format(tx.amountVnd)}đ</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Detail Modal */}
      <DetailModal />
    </div>
  );
};
