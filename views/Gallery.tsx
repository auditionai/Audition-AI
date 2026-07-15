import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GeneratedImage, Language, HistoryItem } from '../types';
import type { QueueProgressLogEntry } from '../shared/queueRecipes';
import { checkR2Connection, getAllImagesFromStorage, deleteImageFromStorage, getHistoryRetentionDays, publishImageToShowcase, subscribeToGeneratedImagesRealtime, invalidateGalleryCache } from '../services/storageService';
import { getUnifiedHistory } from '../services/economyService';
import { downloadAssetToBrowser } from '../services/downloadService';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { QUEUE_SUBMITTED_EVENT } from '../services/serverQueueService';
import { getSupabaseUser } from '../services/supabaseClient';

interface GalleryProps {
  lang: Language;
}

export const Gallery: React.FC<GalleryProps> = ({ lang }) => {
  const { notify, confirm } = useNotification();
  const lastRealtimeRefreshAtRef = React.useRef(0);
  const [activeTab, setActiveTab] = useState<'generation' | 'transactions'>('generation');

  // Generation History State
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'processing' | 'queued' | 'rescuing'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingImage, setViewingImage] = useState<GeneratedImage | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);

  // Transaction History State
  const [transactions, setTransactions] = useState<HistoryItem[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const retentionDays = getHistoryRetentionDays();
  const loadImages = useCallback(async (silent = false) => {
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
    } catch (error) {
      console.error("Failed to load gallery", error);
    }
  }, []);
  const hasActiveGenerationJobs = useMemo(() => {
      return images.some((image) => {
          const status = image.displayStatus || image.status;
          return status === 'queued' || status === 'processing' || status === 'rescuing';
      });
  }, [images]);

  useEffect(() => {
    const init = async () => {
        setLoadingImages(true);
        try {
            await loadImages();
        } catch (e) {
            console.error("Gallery Init Error", e);
        } finally {
            setLoadingImages(false);
        }
    };
    init();
  }, [loadImages]);

  useEffect(() => {
      if (typeof window === 'undefined') return;

      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      const handleQueueSubmitted = () => {
          if (refreshTimer) {
              clearTimeout(refreshTimer);
          }

          refreshTimer = setTimeout(() => {
              if (Date.now() - lastRealtimeRefreshAtRef.current < 7000) {
                  return;
              }

              loadImages(true).catch((error) => {
                  console.warn('[Gallery] Fallback refresh after queue submit failed', error);
              });
          }, 5000);
      };

      window.addEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
      return () => {
          if (refreshTimer) {
              clearTimeout(refreshTimer);
          }
          window.removeEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
      };
  }, [loadImages]);

  useEffect(() => {
      let isMounted = true;
      let unsubscribe = () => {};
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;

      const scheduleRefresh = () => {
          if (refreshTimer) {
              clearTimeout(refreshTimer);
          }

          lastRealtimeRefreshAtRef.current = Date.now();
          refreshTimer = setTimeout(() => {
              if (!isMounted) return;
              loadImages(true).catch((error) => {
                  console.warn('[Gallery] Realtime refresh failed', error);
              });
          }, 1000);
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
          if (refreshTimer) {
              clearTimeout(refreshTimer);
          }
          unsubscribe();
      };
  }, [loadImages]);

  useEffect(() => {
      if (activeTab !== 'generation' || !hasActiveGenerationJobs) return;

      const interval = setInterval(() => {
          invalidateGalleryCache();
          loadImages(true).catch((error) => {
              console.warn('[Gallery] Active job refresh failed', error);
          });
      }, 20_000);

      return () => clearInterval(interval);
  }, [activeTab, hasActiveGenerationJobs, loadImages]);

  useEffect(() => {
      if (!viewingImage) return;
      const updatedImage = images.find((img) => img.id === viewingImage.id);
      if (!updatedImage) {
          setViewingImage(null);
          setShowLogViewer(false);
          return;
      }
      if (
          updatedImage.updatedAt !== viewingImage.updatedAt ||
          updatedImage.status !== viewingImage.status ||
          updatedImage.progress !== viewingImage.progress ||
          updatedImage.error !== viewingImage.error ||
          (updatedImage.queueLogs?.length || 0) !== (viewingImage.queueLogs?.length || 0)
      ) {
          setViewingImage(updatedImage);
      }
  }, [images, viewingImage]);

  useEffect(() => {
      if (activeTab === 'transactions') {
          const fetchHistory = async () => {
              setLoadingTransactions(true);
              try {
                  const txs = await getUnifiedHistory();
                  setTransactions(txs);
              } catch (e) {
                  console.error(e);
              } finally {
                  setLoadingTransactions(false);
              }
          };
          fetchHistory();
      }
  }, [activeTab]);

  const handleDelete = (e: React.MouseEvent, id: string, imageUrl?: string, userId?: string) => {
    e.stopPropagation();
    confirm({
        title: lang === 'vi' ? 'Xóa ảnh?' : 'Delete Image?',
        message: lang === 'vi' ? 'Bạn có chắc chắn muốn xóa vĩnh viễn hình ảnh này không?' : 'Are you sure you want to permanently delete this image?',
        confirmText: lang === 'vi' ? 'Xóa ngay' : 'Delete',
        cancelText: lang === 'vi' ? 'Hủy' : 'Cancel',
        isDanger: true,
        onConfirm: async () => {
            await deleteImageFromStorage(id, userId, imageUrl);
            setImages(prev => prev.filter(img => img.id !== id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
            notify(lang === 'vi' ? 'Đã xóa ảnh.' : 'Image deleted.', 'info');
        }
    });
  };

  const handleDeleteSelected = () => {
      if (selectedIds.size === 0) return;
      confirm({
          title: lang === 'vi' ? 'Xóa các mục đã chọn?' : 'Delete selected items?',
          message: lang === 'vi' ? `Bạn có chắc chắn muốn xóa ${selectedIds.size} mục này không?` : `Are you sure you want to delete these ${selectedIds.size} items?`,
          confirmText: lang === 'vi' ? 'Xóa ngay' : 'Delete',
          cancelText: lang === 'vi' ? 'Hủy' : 'Cancel',
          isDanger: true,
          onConfirm: async () => {
              for (const id of Array.from(selectedIds)) {
                  const image = images.find((img) => img.id === id);
                  await deleteImageFromStorage(id, image?.userId, image?.url);
              }
              setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
              setSelectedIds(new Set());
              notify(lang === 'vi' ? 'Đã xóa các mục đã chọn.' : 'Selected items deleted.', 'info');
          }
      });
  };

  const handleDownload = async (imageUrl: string, filename: string, assetKind: 'image' | 'video' = 'image') => {
      if (!imageUrl) return;
      notify(lang === 'vi' ? 'Đang xử lý tải xuống...' : 'Processing download...', 'info');

      try {
          await downloadAssetToBrowser(imageUrl, filename);
          notify(
              assetKind === 'video'
                  ? (lang === 'vi' ? 'Đã lưu video thành công!' : 'Video downloaded successfully!')
                  : (lang === 'vi' ? 'Đã lưu ảnh thành công!' : 'Image downloaded successfully!'),
              'success'
          );
      } catch (e) {
          console.error("Download failed completely", e);
          notify(
              assetKind === 'video'
                  ? (lang === 'vi' ? 'Tải video thất bại.' : 'Video download failed.')
                  : (lang === 'vi' ? 'Tải ảnh thất bại.' : 'Image download failed.'),
              'error'
          );
      }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const filteredImages = useMemo(() => {
      return images.filter(img => {
          if (filter === 'all') return true;
          const status = img.displayStatus || img.status;
          if (filter === 'completed') return !status || status === 'completed';
          if (filter === 'failed') return status === 'failed';
          if (filter === 'rescuing') return status === 'rescuing';
          if (filter === 'processing' || filter === 'queued') return status === 'processing' || status === 'queued' || status === 'rescuing';
          return true;
      }).sort((a, b) => b.timestamp - a.timestamp);
  }, [images, filter]);

  const getAssetKind = (img: GeneratedImage) => {
      if (img.assetType) return img.assetType;
      if (img.queueKind?.includes('video') || img.queueKind?.includes('motion')) return 'video';
      if (img.toolId?.includes('video') || img.toolId?.includes('motion')) return 'video';
      if ((img.toolName || '').toLowerCase().includes('video') || (img.toolName || '').toLowerCase().includes('motion')) return 'video';
      if ((img.engine || '').toLowerCase().includes('kling') || (img.engine || '').toLowerCase().includes('motion') || (img.engine || '').toLowerCase().includes('video')) return 'video';
      if ((img.url || '').toLowerCase().endsWith('.mp4') || (img.url || '').toLowerCase().includes('.mp4?')) return 'video';
      return 'image';
  };

  const getDownloadFilename = (img: GeneratedImage) => {
      const ext = getAssetKind(img) === 'video' ? 'mp4' : 'png';
      return `auditionai-${img.id}.${ext}`;
  };

  const getFailedAssetTitle = (img: GeneratedImage) =>
      getAssetKind(img) === 'video'
          ? (lang === 'vi' ? 'Tạo video thất bại' : 'Video generation failed')
          : (lang === 'vi' ? 'Tạo ảnh thất bại' : 'Image generation failed');

  const getProcessingAssetTitle = (img: GeneratedImage) =>
      getAssetKind(img) === 'video'
          ? (lang === 'vi' ? 'Đang tạo video...' : 'Video is generating...')
          : (lang === 'vi' ? 'Đang tạo ảnh...' : 'Image is generating...');

  const getFailedAssetMessage = (img: GeneratedImage) =>
      img.error?.trim() || (lang === 'vi'
          ? 'Tiến trình đã thất bại nhưng chưa có mô tả lỗi chi tiết.'
          : 'The generation failed without a detailed error message.');

  const getProcessingStageLabel = (img: GeneratedImage) => {
      const assetKind = getAssetKind(img);
      const generatingLabel = assetKind === 'video'
          ? (lang === 'vi' ? 'Đang tạo video' : 'Generating video')
          : (lang === 'vi' ? 'Đang tạo ảnh' : 'Generating image');
      const queueProgress = Math.max(0, Math.min(100, img.progress || 0));

      const status = img.displayStatus || img.status;
      if (status === 'rescuing') return lang === 'vi' ? 'Đang cứu kết quả' : 'Rescuing result';
      if (status === 'failed') return lang === 'vi' ? 'Thất bại' : 'Failed';
      if (!status || status === 'completed') return lang === 'vi' ? 'Hoàn thành' : 'Completed';
      if (img.jobId) return generatingLabel;
      if (img.queueStage === 'uploading_refs') return lang === 'vi' ? 'Đang xử lý' : 'Processing';
      if (img.queueStage === 'synthesizing_prompt' || img.queueStage === 'building_payload') {
          return lang === 'vi' ? 'Đang tổng hợp' : 'Synthesizing';
      }

      if (queueProgress >= 40) {
          return lang === 'vi' ? 'Đang tổng hợp' : 'Synthesizing';
      }

      if (queueProgress >= 10) {
          return lang === 'vi' ? 'Đang xử lý' : 'Processing';
      }

      if (status === 'queued') {
          return lang === 'vi' ? 'Đang chuẩn bị' : 'Preparing';
      }

      return lang === 'vi' ? 'Đang chuẩn bị' : 'Preparing';
  }; 

  const getQueueLogs = (img: GeneratedImage | null | undefined) => img?.queueLogs || [];

  const getLatestQueueLog = (img: GeneratedImage | null | undefined): QueueProgressLogEntry | null => {
      const logs = getQueueLogs(img);
      return logs.length > 0 ? logs[logs.length - 1] : null;
  };

  const getQueueStageDisplay = (stage?: string) => {
      switch (stage) {
          case 'queued': return lang === 'vi' ? 'Đã vào hàng đợi' : 'Queued';
          case 'rescuing': return lang === 'vi' ? 'Đang cứu kết quả' : 'Rescuing result';
          case 'preparing': return lang === 'vi' ? 'Đang chuẩn bị' : 'Preparing';
          case 'uploading_refs': return lang === 'vi' ? 'Đang tải ảnh tham chiếu' : 'Uploading references';
          case 'synthesizing_prompt': return lang === 'vi' ? 'Đang xử lý prompt text + role metadata' : 'Processing prompt text + role metadata';
          case 'building_payload': return lang === 'vi' ? 'Đang dựng payload' : 'Building payload';
          case 'dispatching': return lang === 'vi' ? 'Đang gửi provider' : 'Dispatching';
          case 'submitted': return lang === 'vi' ? 'Provider đã nhận job' : 'Submitted';
          case 'polling': return lang === 'vi' ? 'Đang chờ provider' : 'Polling provider';
          case 'completed': return lang === 'vi' ? 'Hoàn thành' : 'Completed';
          case 'failed': return lang === 'vi' ? 'Thất bại' : 'Failed';
          default: return lang === 'vi' ? 'Tiến trình' : 'Progress';
      }
  };

  const getQueueLogLevelStyle = (level?: string) => {
      switch (level) {
          case 'success': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
          case 'warning': return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
          case 'error': return 'bg-red-500/10 text-red-300 border-red-500/20';
          default: return 'bg-white/5 text-slate-300 border-white/10';
      }
  };

  const handlePublish = async (image: GeneratedImage) => {
      try {
          const r2Ready = await checkR2Connection();
          if (!r2Ready) {
              notify(
                  lang === 'vi'
                      ? 'R2 Cloudflare chưa được cấu hình nên chưa thể publish ảnh công khai.'
                      : 'Cloudflare R2 is not configured, so the image cannot be published yet.',
                  'error',
              );
              return;
          }
          const updatedImage = await publishImageToShowcase(image);
          setImages((prev) => prev.map((item) => item.id === updatedImage.id ? updatedImage : item));
          setViewingImage(updatedImage);
          notify(lang === 'vi' ? 'Đã chia sẻ ảnh lên trang chủ và lưu trữ lâu dài.' : 'Image published to showcase and stored long-term.', 'success');
      } catch (error) {
          console.error('Publish failed', error);
          notify(error instanceof Error ? error.message : (lang === 'vi' ? 'Chia sẻ ảnh thất bại.' : 'Failed to publish image.'), 'error');
      }
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === filteredImages.length && filteredImages.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredImages.map(img => img.id)));
      }
  };

  const toggleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const getBadgeStyle = (type: string) => {
      switch(type) {
          case 'usage': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
          case 'topup': return 'bg-green-500/20 text-green-400 border-green-500/50';
          case 'pending_topup': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
          case 'reward': return 'bg-audi-pink/20 text-audi-pink border-audi-pink/50';
          case 'giftcode': return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
          case 'refund': return 'bg-audi-cyan/20 text-audi-cyan border-audi-cyan/50';
          default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
      }
  }

  const getBadgeLabel = (type: string) => {
      switch(type) {
          case 'usage': return 'SỬ DỤNG';
          case 'topup': return 'NẠP TIỀN';
          case 'pending_topup': return 'CHỜ DUYỆT';
          case 'reward': return 'THƯỞNG';
          case 'giftcode': return 'GIFTCODE';
          case 'refund': return 'HOÀN TIỀN';
          default: return 'KHÁC';
      }
  }

  const getTopupGiftcodeLabel = (giftcode?: string | null) => {
      const clean = String(giftcode || '').trim().toUpperCase();
      return clean || null;
  };

  return (
    <div className="pb-32 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* STORAGE POLICY WARNING BANNER */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 mb-6 shrink-0">
            <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
                <h4 className="text-sm font-bold text-red-400">LƯU Ý QUAN TRỌNG: Chính sách lưu trữ lịch sử tạo</h4>
                <p className="text-xs text-red-400/80 leading-relaxed">
                    Ảnh và video trong lịch sử tạo sẽ tự động bị xóa sau <b className="text-red-500">{retentionDays} ngày</b> nếu chưa publish.
                    Giao dịch Vcoin vẫn được giữ lại. Ảnh đã publish sẽ được lưu trữ lâu dài và không bị xóa theo mốc này.
                </p>
            </div>
        </div>

        <div data-tour-id="desktop.gallery.panel" className="bg-[#12121a] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Header / Tabs */}
            <div className="flex flex-col md:flex-row items-center justify-between p-6 border-b border-white/10 gap-4">
                <div data-tour-id="desktop.gallery.tabs" className="flex bg-black/50 p-1 rounded-xl border border-white/5">
                    <button
                        onClick={() => setActiveTab('generation')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'generation' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {lang === 'vi' ? 'Lịch sử tạo' : 'Generation History'}
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'transactions' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {lang === 'vi' ? 'Giao dịch Vcoin' : 'Vcoin Transactions'}
                    </button>
                </div>

                {activeTab === 'generation' && (
                    <div data-tour-id="desktop.gallery.filters" className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">LỌC THEO:</span>
                        <div className="flex gap-2">
                            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'all' ? 'bg-audi-cyan/20 border-audi-cyan/50 text-audi-cyan' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Tất cả</button>
                            <button onClick={() => setFilter('completed')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'completed' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Hoàn thành</button>
                            <button onClick={() => setFilter('failed')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'failed' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Thất bại</button>
                            <button onClick={() => setFilter('rescuing')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'rescuing' ? 'bg-violet-500/20 border-violet-500/50 text-violet-300' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Đang cứu</button>
                            <button onClick={() => setFilter('processing')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'processing' || filter === 'queued' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Đang chờ</button>
                        </div>
                        <div className="w-px h-6 bg-white/10 mx-2 hidden md:block"></div>
                        <button
                            data-tour-id="desktop.gallery.bulk_actions"
                            onClick={handleDeleteSelected}
                            disabled={selectedIds.size === 0}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${selectedIds.size > 0 ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-600 cursor-not-allowed'}`}
                        >
                            <Icons.Trash className="w-4 h-4" />
                            {lang === 'vi' ? 'Xóa trang này' : 'Delete selected'}
                        </button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="overflow-x-auto">
                {activeTab === 'generation' ? (
                    <table data-tour-id="desktop.gallery.grid" className="w-full text-left text-sm text-slate-400">
                        <thead className="text-xs uppercase bg-black/20 text-slate-500 font-bold tracking-wider border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-white/20 bg-black/50 text-audi-cyan focus:ring-audi-cyan focus:ring-offset-black"
                                        checked={selectedIds.size === filteredImages.length && filteredImages.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="px-6 py-4">ASSET PREVIEW</th>
                                <th className="px-6 py-4">LOẠI</th>
                                <th className="px-6 py-4">THỜI GIAN</th>
                                <th className="px-6 py-4">CHI PHÍ</th>
                                <th className="px-6 py-4">TRẠNG THÁI</th>
                                <th className="px-6 py-4 text-right">HÀNH ĐỘNG</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loadingImages ? (
                                <tr><td colSpan={7} className="text-center py-12"><Icons.Loader className="w-6 h-6 animate-spin mx-auto text-audi-cyan" /></td></tr>
                            ) : filteredImages.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-12 text-slate-500 italic">Không có dữ liệu</td></tr>
                            ) : filteredImages.map(img => {
                                const displayStatus = img.displayStatus || img.status;
                                const isCompleted = !displayStatus || displayStatus === 'completed';
                                const isFailed = displayStatus === 'failed';
                                const isProcessing = displayStatus === 'processing' || displayStatus === 'queued' || displayStatus === 'rescuing';

                                return (
                                    <tr
                                        key={img.id}
                                        data-tour-id="desktop.gallery.item"
                                        className="hover:bg-white/[0.05] transition-colors group cursor-pointer"
                                        onClick={() => {
                                            setViewingImage(img);
                                            setShowLogViewer(false);
                                        }}
                                    >
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-white/20 bg-black/50 text-audi-cyan focus:ring-audi-cyan focus:ring-offset-black"
                                                checked={selectedIds.has(img.id)}
                                                onChange={() => toggleSelect(img.id)}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-lg bg-black/50 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                    {isProcessing ? (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                                            <Icons.Loader className="w-5 h-5 text-audi-cyan animate-spin" />
                                                        </div>
                                                    ) : img.url ? (
                                                        getAssetKind(img) === 'video' ? (<video src={img.url} className="w-full h-full object-cover" muted playsInline />) : (<img src={img.url} alt="preview" className="w-full h-full object-cover" />)
                                                    ) : (
                                                        <Icons.Image className="w-5 h-5 text-slate-600" />
                                                    )}
                                                </div>
                                                <div className="max-w-[200px] md:max-w-[300px]">
                                                    <div className="font-bold text-white truncate" title={img.prompt}>{img.prompt || img.toolName}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: #{img.id.substring(0, 8)}</div>
                                                    {isFailed && (
                                                        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-300 leading-relaxed max-w-[220px] md:max-w-[320px]">
                                                            <Icons.AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-400" />
                                                            <span className="line-clamp-2" title={getFailedAssetMessage(img)}>
                                                                {getFailedAssetMessage(img)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {isProcessing && getLatestQueueLog(img) && (
                                                        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-audi-cyan/80 leading-relaxed max-w-[220px] md:max-w-[320px]">
                                                            <Icons.Activity className="w-3.5 h-3.5 mt-0.5 shrink-0 text-audi-cyan" />
                                                            <span className="line-clamp-2" title={getLatestQueueLog(img)?.message}>
                                                                {getLatestQueueLog(img)?.message}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                {getAssetKind(img) === 'video' ? <Icons.Video className="w-3 h-3" /> : <Icons.Image className="w-3 h-3" />}
                                                {getAssetKind(img) === 'video' ? 'Video' : 'Image'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">{formatDate(img.timestamp)}</td>
                                        <td className="px-6 py-4 font-bold text-white">
                                            {typeof img.cost === 'number' ? `-${img.cost} Vcoin` : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {isCompleted && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Hoàn thành
                                                </span>
                                            )}
                                            {isFailed && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Thất bại
                                                </span>
                                            )}
                                            {isProcessing && (
                                                <div className="min-w-[160px]">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                        <Icons.Loader className="w-3 h-3 animate-spin" />
                                                        {getProcessingStageLabel(img)}
                                                    </span>
                                                    <div className="mt-2">
                                                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all duration-500 ${(img.displayStatus || img.status) === 'queued' ? 'bg-yellow-400' : (img.displayStatus || img.status) === 'rescuing' ? 'bg-violet-400' : 'bg-audi-cyan'}`} style={{ width: `${Math.max(0, Math.min(100, img.progress || 0))}%` }} />
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 mt-1">
                                                            {getProcessingStageLabel(img)} · {Math.max(0, Math.min(100, img.progress || 0))}% {img.jobId ? `· ${img.jobId.slice(0, 10)}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isCompleted && img.url && (
                                                    <button
                                                        onClick={() => handleDownload(img.url, getDownloadFilename(img), getAssetKind(img))}
                                                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                        title="Tải xuống"
                                                    >
                                                        <Icons.Download className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {(img.queueLogs?.length || 0) > 0 && (
                                                    <button
                                                        onClick={() => {
                                                            setViewingImage(img);
                                                            setShowLogViewer(true);
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-audi-cyan hover:bg-audi-cyan/10 rounded-lg transition-colors"
                                                        title={lang === 'vi' ? 'Xem log tiến trình' : 'View progress log'}
                                                    >
                                                        <Icons.Activity className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleDelete(e, img.id, img.url, img.userId)}
                                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Xóa"
                                                >
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div>
                    <table className="hidden w-full text-left text-sm text-slate-400 md:table">
                        <thead className="text-xs uppercase bg-black/20 text-slate-500 font-bold tracking-wider border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4">THỜI GIAN</th>
                                <th className="px-6 py-4">NỘI DUNG</th>
                                <th className="px-6 py-4">LOẠI GD</th>
                                <th className="px-6 py-4">VCOIN</th>
                                <th className="px-6 py-4 text-right">TRẠNG THÁI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loadingTransactions ? (
                                <tr><td colSpan={5} className="text-center py-12"><Icons.Loader className="w-6 h-6 animate-spin mx-auto text-audi-cyan" /></td></tr>
                            ) : transactions.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-12 text-slate-500 italic">Chưa có giao dịch nào</td></tr>
                            ) : transactions.map(item => (
                                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-4 font-mono text-xs">{new Date(item.createdAt).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-bold text-white max-w-[200px] truncate" title={item.description}>
                                        {item.description}
                                        {item.code && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.code}</div>}
                                        {getTopupGiftcodeLabel(item.topupGiftcode) && (
                                            <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg border border-audi-cyan/20 bg-audi-cyan/10 px-2 py-1 text-[10px] font-bold text-audi-cyan">
                                                <Icons.Gift className="h-3 w-3 shrink-0" />
                                                <span className="truncate font-mono">Đang áp dụng {getTopupGiftcodeLabel(item.topupGiftcode)}</span>
                                            </div>
                                        )}
                                        {Number(item.discountAmount || 0) > 0 && (
                                            <div className="mt-1 text-[10px] font-bold text-emerald-300">
                                                Giảm {Number(item.discountAmount || 0).toLocaleString('vi-VN')}đ
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded border text-[10px] font-bold ${getBadgeStyle(item.type)}`}>
                                            {getBadgeLabel(item.type)}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 font-bold text-base ${item.vcoinChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {item.vcoinChange > 0 ? '+' : ''}{item.vcoinChange}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end">
                                            {item.status === 'success' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <Icons.Check className="w-3 h-3" /> Thành công
                                                </span>
                                            ) : item.status === 'pending' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <Icons.Loader className="w-3 h-3 animate-spin" /> Đang chờ
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <Icons.X className="w-3 h-3" /> Thất bại
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="space-y-3 p-3 md:hidden">
                        {loadingTransactions ? (
                            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-10">
                                <Icons.Loader className="h-6 w-6 animate-spin text-audi-cyan" />
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-sm italic text-slate-500">
                                Chưa có giao dịch nào
                            </div>
                        ) : transactions.map(item => {
                            const topupGiftcode = getTopupGiftcodeLabel(item.topupGiftcode);
                            return (
                                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-lg">
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Thời gian</div>
                                            <div className="mt-1 font-mono text-xs text-slate-300">{new Date(item.createdAt).toLocaleString('vi-VN')}</div>
                                        </div>
                                        <span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-bold ${getBadgeStyle(item.type)}`}>
                                            {getBadgeLabel(item.type)}
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="font-bold leading-snug text-white">{item.description}</div>
                                        {item.code && (
                                            <div className="break-all text-[11px] text-slate-500">
                                                Mã đơn: <span className="font-mono text-slate-300">{item.code}</span>
                                            </div>
                                        )}
                                        {topupGiftcode && (
                                            <div className="rounded-xl border border-audi-cyan/20 bg-audi-cyan/10 p-3">
                                                <div className="flex items-center gap-2 text-xs font-bold text-audi-cyan">
                                                    <Icons.Gift className="h-4 w-4 shrink-0" />
                                                    <span>Giftcode đang áp dụng</span>
                                                </div>
                                                <div className="mt-1 break-all font-mono text-sm font-black text-white">{topupGiftcode}</div>
                                                {Number(item.discountAmount || 0) > 0 && (
                                                    <div className="mt-1 text-xs font-bold text-emerald-300">
                                                        Giảm {Number(item.discountAmount || 0).toLocaleString('vi-VN')}đ
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vcoin</div>
                                            <div className={`mt-1 text-base font-black ${item.vcoinChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {item.vcoinChange > 0 ? '+' : ''}{item.vcoinChange}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Trạng thái</div>
                                            <div className="mt-1 flex justify-end">
                                                {item.status === 'success' ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green-400">
                                                        <Icons.Check className="h-3 w-3" /> Thành công
                                                    </span>
                                                ) : item.status === 'pending' ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                                                        <Icons.Loader className="h-3 w-3 animate-spin" /> Đang chờ
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                                                        <Icons.X className="h-3 w-3" /> Thất bại
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    </div>
                )}
            </div>

            {/* Footer / Pagination info */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-500">
                <div>
                    Hiển thị <span className="font-bold text-white">1-{activeTab === 'generation' ? filteredImages.length : transactions.length}</span> trong <span className="font-bold text-white">{activeTab === 'generation' ? filteredImages.length : transactions.length}</span> kết quả
                </div>
            </div>
        </div>

        {/* Image Details Modal */}
        {viewingImage && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setViewingImage(null); setShowLogViewer(false); }}></div>
                <div className="relative w-full max-w-4xl bg-[#12121a] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                    {/* Close Button */}
                    <button
                        onClick={() => { setViewingImage(null); setShowLogViewer(false); }}
                        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                    >
                        <Icons.X className="w-5 h-5" />
                    </button>

                    {/* Left: Image Preview */}
                    <div className="w-full md:w-3/5 bg-black/50 flex items-center justify-center p-6 relative group min-h-[300px]">
                        {viewingImage.url ? (
                            getAssetKind(viewingImage) === 'video' ? (<video src={viewingImage.url} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" controls autoPlay loop playsInline />) : (<img src={viewingImage.url} alt="Generated" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />)
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-500">
                                {(viewingImage.displayStatus || viewingImage.status) === 'failed' ? (
                                    <Icons.AlertTriangle className="w-16 h-16 mb-4 text-red-500/50" />
                                ) : (viewingImage.displayStatus || viewingImage.status) === 'processing' || (viewingImage.displayStatus || viewingImage.status) === 'queued' || (viewingImage.displayStatus || viewingImage.status) === 'rescuing' ? (
                                    <Icons.Loader className="w-16 h-16 mb-4 animate-spin text-audi-cyan/50" />
                                ) : (
                                    <Icons.Image className="w-16 h-16 mb-4 opacity-50" />
                                )}
                                <p>{(viewingImage.displayStatus || viewingImage.status) === 'failed' ? (lang === 'vi' ? 'Tạo ảnh thất bại' : 'Image generation failed') : (viewingImage.displayStatus || viewingImage.status) === 'processing' || (viewingImage.displayStatus || viewingImage.status) === 'queued' || (viewingImage.displayStatus || viewingImage.status) === 'rescuing' ? getProcessingStageLabel(viewingImage) : (lang === 'vi' ? 'Không có ảnh' : 'No image available')}</p>
                                {(viewingImage.displayStatus || viewingImage.status) === 'failed' && (
                                    <p className="mt-2 max-w-[320px] text-center text-sm text-red-300 leading-relaxed">
                                        {getFailedAssetMessage(viewingImage)}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Image Actions Overlay */}
                        {viewingImage.url && (
                            <div className="absolute bottom-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => window.open(viewingImage.url, '_blank')}
                                    className="bg-black/70 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-white/20 transition-colors shadow-lg"
                                >
                                    <Icons.ExternalLink className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDownload(viewingImage.url, getDownloadFilename(viewingImage), getAssetKind(viewingImage))}
                                    className="bg-black/70 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-white/20 transition-colors shadow-lg"
                                >
                                    <Icons.Download className="w-4 h-4" />
                                    {lang === 'vi' ? 'Tải xuống' : 'Download'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right: Details */}
                    <div className="w-full md:w-2/5 p-6 md:p-8 overflow-y-auto custom-scrollbar border-t md:border-t-0 md:border-l border-white/10 bg-gradient-to-b from-white/[0.02] to-transparent">
                        <h3 className="text-2xl font-game font-bold text-white mb-6 flex items-center gap-3">
                            {getAssetKind(viewingImage) === 'video' ? (
                                <Icons.Video className="w-6 h-6 text-audi-cyan" />
                            ) : (
                                <Icons.Image className="w-6 h-6 text-audi-cyan" />
                            )}
                            {getAssetKind(viewingImage) === 'video' ? (lang === 'vi' ? 'Chi tiết video' : 'Video Details') : (lang === 'vi' ? 'Chi tiết ảnh' : 'Image Details')}
                        </h3>

                        <div className="space-y-6">
                            {/* Prompt */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{lang === 'vi' ? 'Prompt người dùng' : 'User Prompt'}</div>
                                    {(viewingImage.userPrompt || viewingImage.prompt) && (
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(viewingImage.userPrompt || viewingImage.prompt);
                                                notify(lang === 'vi' ? 'Đã sao chép prompt!' : 'Prompt copied!', 'success');
                                            }}
                                            className="text-[10px] font-bold text-audi-cyan uppercase tracking-wider hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            <Icons.Copy className="w-3 h-3" />
                                            {lang === 'vi' ? 'Sao chép' : 'Copy'}
                                        </button>
                                    )}
                                </div>
                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-slate-300 leading-relaxed break-words whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar" title={viewingImage.userPrompt || viewingImage.prompt}>
                                    {viewingImage.userPrompt || viewingImage.prompt || <span className="italic text-slate-600">No prompt provided</span>}
                                </div>
                            </div>

                            {viewingImage.providerPrompt && (
                                <details className="group rounded-xl border border-white/5 bg-black/20 p-4">
                                    <summary className="cursor-pointer select-none text-xs font-bold uppercase tracking-wider text-slate-500 group-open:text-audi-cyan">
                                        {lang === 'vi' ? 'Prompt nội bộ / provider' : 'Internal / Provider Prompt'}
                                    </summary>
                                    <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-slate-400 custom-scrollbar">
                                        {viewingImage.providerPrompt}
                                    </div>
                                </details>
                            )}

                            {/* Meta Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">ID</div>
                                    <div className="font-mono text-xs text-white truncate">#{viewingImage.id.substring(0, 8)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Thời gian' : 'Time'}</div>
                                    <div className="font-mono text-xs text-white">{formatDate(viewingImage.timestamp)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Công cụ' : 'Tool'}</div>
                                    <div className="text-sm font-bold text-audi-cyan truncate" title={viewingImage.toolName}>{viewingImage.toolName}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Chi phí' : 'Cost'}</div>
                                    <div className="text-sm font-bold text-audi-pink">
                                        {typeof viewingImage.cost === 'number' ? `${viewingImage.cost} Vcoin` : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{lang === 'vi' ? 'Trạng thái' : 'Status'}</div>
                                <div>
                                    {(!viewingImage.status || viewingImage.status === 'completed') && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold uppercase tracking-wider">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Hoàn thành
                                        </span>
                                    )}
                                    {(viewingImage.displayStatus || viewingImage.status) === 'failed' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold uppercase tracking-wider">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Thất bại
                                        </span>
                                    )}
                                    {((viewingImage.displayStatus || viewingImage.status) === 'processing' || (viewingImage.displayStatus || viewingImage.status) === 'queued' || (viewingImage.displayStatus || viewingImage.status) === 'rescuing') && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold uppercase tracking-wider">
                                            <Icons.Loader className="w-3 h-3 animate-spin" /> {getProcessingStageLabel(viewingImage)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Error Message if failed */}
                            {(viewingImage.displayStatus || viewingImage.status) === 'failed' && viewingImage.error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">
                                        {lang === 'vi' ? 'Lý do thất bại' : 'Failure reason'}
                                    </div>
                                    <div className="text-sm text-red-300 leading-relaxed">{getFailedAssetMessage(viewingImage)}</div>
                                </div>
                            )}

                            {getLatestQueueLog(viewingImage) && (
                                <div className={`rounded-xl p-4 border ${getQueueLogLevelStyle(getLatestQueueLog(viewingImage)?.level)}`}>
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="text-xs font-bold uppercase tracking-wider">
                                            {lang === 'vi' ? 'Bước gần nhất' : 'Latest step'}
                                        </div>
                                        <div className="text-[10px] font-mono opacity-70">
                                            {formatDate(new Date(getLatestQueueLog(viewingImage)!.at).getTime())}
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider mb-1 opacity-80">
                                        {getQueueStageDisplay(getLatestQueueLog(viewingImage)?.stage)}
                                    </div>
                                    <div className="text-sm leading-relaxed">
                                        {getLatestQueueLog(viewingImage)?.message}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="pt-4 border-t border-white/10 space-y-2.5">
                                {viewingImage.url && (
                                    <button
                                        onClick={() => handleDownload(viewingImage.url, getDownloadFilename(viewingImage), getAssetKind(viewingImage))}
                                        className="w-full px-4 py-3 rounded-2xl bg-gradient-to-br from-audi-cyan/20 via-audi-cyan/10 to-transparent text-audi-cyan border border-audi-cyan/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(34,211,238,0.12)] hover:from-audi-cyan/25 hover:via-audi-cyan/15 hover:to-audi-cyan/5 transition-all flex items-center justify-between text-left"
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className="w-9 h-9 rounded-xl bg-black/30 border border-audi-cyan/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                                <Icons.Download className="w-4 h-4" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-extrabold tracking-wide">{lang === 'vi' ? 'Tải xuống' : 'Download'}</span>
                                                <span className="block text-[10px] text-audi-cyan/70">{lang === 'vi' ? 'Lưu file gốc về thiết bị' : 'Save original file to your device'}</span>
                                            </span>
                                        </span>
                                        <Icons.ChevronRight className="w-4 h-4 text-audi-cyan/70 shrink-0" />
                                    </button>
                                )}
                                {getAssetKind(viewingImage) === 'image' && viewingImage.status === 'completed' && (
                                    <button
                                        onClick={() => handlePublish(viewingImage)}
                                        disabled={!!viewingImage.isShared}
                                        className={`w-full px-4 py-3 rounded-2xl transition-all flex items-center justify-between text-left ${
                                            viewingImage.isShared
                                                ? 'bg-gradient-to-br from-emerald-500/18 via-emerald-500/10 to-transparent text-emerald-400 border border-emerald-500/20 cursor-default shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(16,185,129,0.12)]'
                                                : 'bg-gradient-to-br from-audi-pink/18 via-audi-pink/10 to-transparent text-audi-pink border border-audi-pink/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(236,72,153,0.12)] hover:from-audi-pink/25 hover:via-audi-pink/15 hover:to-audi-pink/5'
                                        }`}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${viewingImage.isShared ? 'bg-black/25 border border-emerald-500/20' : 'bg-black/25 border border-audi-pink/20'}`}>
                                                <Icons.Share className="w-4 h-4" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-extrabold tracking-wide">
                                                    {viewingImage.isShared ? (lang === 'vi' ? 'Đã publish' : 'Published') : (lang === 'vi' ? 'Chia sẻ' : 'Share')}
                                                </span>
                                                <span className={`block text-[10px] ${viewingImage.isShared ? 'text-emerald-300/70' : 'text-audi-pink/70'}`}>
                                                    {viewingImage.isShared ? (lang === 'vi' ? 'Hiển thị trên trang chủ và lưu dài hạn' : 'Visible on home and stored long-term') : (lang === 'vi' ? 'Đưa ảnh lên trang chủ và lưu lâu dài' : 'Publish to home and store long-term')}
                                                </span>
                                            </span>
                                        </span>
                                        <Icons.ChevronRight className={`w-4 h-4 shrink-0 ${viewingImage.isShared ? 'text-emerald-300/70' : 'text-audi-pink/70'}`} />
                                    </button>
                                )}
                                {(viewingImage.queueLogs?.length || 0) > 0 && (
                                    <button
                                        onClick={() => setShowLogViewer(true)}
                                        className="w-full px-4 py-3 rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-transparent text-white border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(255,255,255,0.06)] hover:from-white/15 hover:via-white/8 hover:to-white/5 transition-all flex items-center justify-between text-left"
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className="w-9 h-9 rounded-xl bg-black/25 border border-white/10 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                                <Icons.Activity className="w-4 h-4" />
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-extrabold tracking-wide">{lang === 'vi' ? 'Xem log tiến trình' : 'View progress log'}</span>
                                                <span className="block text-[10px] text-slate-300/70">{lang === 'vi' ? 'Kiểm tra job đang chạy tới đâu hoặc dừng ở bước nào' : 'Inspect the current step and where the job stopped'}</span>
                                            </span>
                                        </span>
                                        <Icons.ChevronRight className="w-4 h-4 text-slate-300/70 shrink-0" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        setViewingImage(null);
                                        setShowLogViewer(false);
                                        handleDelete(e, viewingImage.id, viewingImage.url, viewingImage.userId);
                                    }}
                                    className="w-full px-4 py-3 rounded-2xl bg-gradient-to-br from-red-500/16 via-red-500/10 to-transparent text-red-400 border border-red-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(239,68,68,0.1)] hover:from-red-500/22 hover:via-red-500/14 hover:to-red-500/5 transition-all flex items-center justify-between text-left"
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-black/25 border border-red-500/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                            <Icons.Trash className="w-4 h-4" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-extrabold tracking-wide">{lang === 'vi' ? (getAssetKind(viewingImage) === 'video' ? 'Xóa video' : 'Xóa ảnh') : 'Delete'}</span>
                                            <span className="block text-[10px] text-red-300/70">{lang === 'vi' ? 'Gỡ khỏi lịch sử tạo của bạn' : 'Remove this item from your history'}</span>
                                        </span>
                                    </span>
                                    <Icons.ChevronRight className="w-4 h-4 text-red-300/70 shrink-0" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )}
        {viewingImage && showLogViewer && createPortal(
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setShowLogViewer(false)}></div>
                <div className="relative w-full max-w-2xl bg-[#12121a] rounded-3xl border border-white/10 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                        <div>
                            <h3 className="text-xl font-game font-bold text-white flex items-center gap-3">
                                <Icons.Activity className="w-5 h-5 text-audi-cyan" />
                                {lang === 'vi' ? 'Nhật ký tiến trình' : 'Progress log'}
                            </h3>
                            <div className="mt-1 text-xs text-slate-400 font-mono">#{viewingImage.id.substring(0, 8)}</div>
                        </div>
                        <button
                            onClick={() => setShowLogViewer(false)}
                            className="w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                        >
                            <Icons.X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6 overflow-y-auto custom-scrollbar space-y-3">
                        {getQueueLogs(viewingImage).length === 0 ? (
                            <div className="text-sm text-slate-400 italic">
                                {lang === 'vi' ? 'Chưa có log tiến trình cho job này.' : 'No progress logs available for this job yet.'}
                            </div>
                        ) : getQueueLogs(viewingImage).map((entry, index) => (
                            <div key={`${entry.at}-${index}`} className={`rounded-2xl border p-4 ${getQueueLogLevelStyle(entry.level)}`}>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider">
                                        {getQueueStageDisplay(entry.stage)}
                                    </div>
                                    <div className="text-[10px] font-mono opacity-70">
                                        {formatDate(new Date(entry.at).getTime())}
                                    </div>
                                </div>
                                <div className="text-sm leading-relaxed">{entry.message}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>,
            document.body
        )}
    </div>
  );
};

