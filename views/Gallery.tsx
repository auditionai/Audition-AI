import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GeneratedImage, Language, HistoryItem } from '../types';
import type { QueueProgressLogEntry } from '../shared/queueRecipes';
import { checkR2Connection, getAllImagesFromStorage, deleteImageFromStorage, getHistoryRetentionDays, publishImageToShowcase, invalidateGalleryCache } from '../services/storageService';
import { getUnifiedHistory } from '../services/economyService';
import { downloadAssetToBrowser } from '../services/downloadService';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { QUEUE_SUBMITTED_EVENT } from '../services/serverQueueService';
import { sanitizeProviderDisplayText } from '../shared/providerDisplay';

interface GalleryProps {
  lang: Language;
}

const decodeLegacyUtf8 = (value?: string | null) => {
  if (!value || !/[ÃÂÄÆáºá»â]/.test(value)) return value || '';

  try {
    const bytes = Uint8Array.from(Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      if (code > 255) throw new Error('Text is not a legacy byte string');
      return code;
    }));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
};

export const Gallery: React.FC<GalleryProps> = ({ lang }) => {
  const { notify, confirm } = useNotification();
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
    if (!silent) setLoadingImages(true);
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
    } catch (error) {
      console.error("Failed to load gallery", error);
    } finally {
      if (!silent) setLoadingImages(false);
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
      if (!viewingImage || typeof document === 'undefined') return;

      const previousOverflow = document.body.style.overflow;
      const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return;
          if (showLogViewer) {
              setShowLogViewer(false);
          } else {
              setViewingImage(null);
          }
      };

      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);

      return () => {
          document.body.style.overflow = previousOverflow;
          document.removeEventListener('keydown', handleKeyDown);
      };
  }, [showLogViewer, viewingImage]);

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
      sanitizeProviderDisplayText(img.error?.trim()) || (lang === 'vi'
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
    <div className="w-full pb-24 animate-fade-in space-y-6">

        {/* 3D NEUMORPHIC HERO BANNER & STORAGE POLICY */}
        <div className="w-full neu-card p-6 sm:p-8 rounded-3xl shadow-2xl border border-white/20 relative overflow-hidden space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="inline-flex items-center gap-2 neu-inset-sm px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider text-[#FF007F] font-accent mb-2">
                        <Icons.Image className="w-3.5 h-3.5 text-[#FF007F]" />
                        AUDITION 3D CREATIVE VAULT
                    </div>
                    <h1 className="font-accent text-2xl sm:text-3xl font-black text-slate-800 dark:text-white uppercase tracking-wider">
                        THƯ VIỆN & LỊCH SỬ SÁNG TẠO
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Quản lý toàn bộ tác phẩm Ảnh & Video AI 3D, theo dõi trạng thái render realtime và lưu trữ tác phẩm lâu dài.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="neu-inset-sm px-4 py-2.5 rounded-2xl flex items-center gap-3">
                        <div className="w-9 h-9 neu-raised-sm rounded-xl flex items-center justify-center text-[#00F2FE]">
                            <Icons.Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Tổng Tác Phẩm</div>
                            <div className="text-base font-black font-accent text-slate-800 dark:text-white">{images.length} File</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* STORAGE POLICY WARNING BANNER */}
            <div className="neu-inset-sm p-4 rounded-2xl flex items-start gap-3 border border-red-500/20">
                <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-red-500 dark:text-red-400 uppercase font-accent">LƯU Ý QUAN TRỌNG: Chính sách lưu trữ lịch sử tạo</h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        Ảnh và video trong lịch sử tạo sẽ tự động bị xóa sau <b className="text-red-500 font-extrabold">{retentionDays} ngày</b> nếu chưa publish.
                        Giao dịch Vcoin vẫn được giữ lại. Tác phẩm đã publish sẽ được lưu trữ lâu dài và không bị xóa.
                    </p>
                </div>
            </div>
        </div>

        {/* 3D NEUMORPHIC GALLERY WORKSPACE */}
        <div data-tour-id="desktop.gallery.panel" className="w-full neu-card rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6">
            {/* Header / Tabs & Filter Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800">
                <div data-tour-id="desktop.gallery.tabs" className="flex neu-inset-sm p-1.5 rounded-2xl shrink-0">
                    <button
                        onClick={() => setActiveTab('generation')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all ${activeTab === 'generation' ? 'neu-raised-sm text-[#FF007F] font-accent' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                        {lang === 'vi' ? '🖼️ Lịch sử tạo' : 'Generation History'}
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all ${activeTab === 'transactions' ? 'neu-raised-sm text-[#00F2FE] font-accent' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                        {lang === 'vi' ? '💎 Giao dịch Vcoin' : 'Vcoin Transactions'}
                    </button>
                </div>

                {activeTab === 'generation' && (
                    <div data-tour-id="desktop.gallery.filters" className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">LỌC THEO:</span>
                        <div className="flex flex-wrap gap-1.5 neu-inset-sm p-1 rounded-2xl">
                            <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${filter === 'all' ? 'neu-raised-sm text-[#FF007F]' : 'text-slate-500 dark:text-slate-400'}`}>Tất cả ({images.length})</button>
                            <button onClick={() => setFilter('completed')} className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${filter === 'completed' ? 'neu-raised-sm text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>Hoàn thành</button>
                            <button onClick={() => setFilter('failed')} className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${filter === 'failed' ? 'neu-raised-sm text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Thất bại</button>
                            <button onClick={() => setFilter('rescuing')} className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${filter === 'rescuing' ? 'neu-raised-sm text-purple-500' : 'text-slate-500 dark:text-slate-400'}`}>Đang cứu</button>
                            <button onClick={() => setFilter('processing')} className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${filter === 'processing' || filter === 'queued' ? 'neu-raised-sm text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>Đang xử lý</button>
                        </div>
                        
                        {selectedIds.size > 0 && (
                            <button
                                data-tour-id="desktop.gallery.bulk_actions"
                                onClick={handleDeleteSelected}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold neu-button text-red-500 hover:scale-105 transition-all"
                            >
                                <Icons.Trash className="w-4 h-4" />
                                {lang === 'vi' ? `Xóa (${selectedIds.size})` : `Delete (${selectedIds.size})`}
                            </button>
                        )}
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
                                                        getAssetKind(img) === 'video'
                                                            ? (<video src={img.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />)
                                                            : (<img src={img.url} alt="preview" className="w-full h-full object-cover" loading="lazy" decoding="async" />)
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
                                                            <span className="line-clamp-2" title={sanitizeProviderDisplayText(getLatestQueueLog(img)?.message)}>
                                                                {sanitizeProviderDisplayText(getLatestQueueLog(img)?.message)}
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
                                    <td className="px-6 py-4 font-mono text-xs">{new Date(item.createdAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}</td>
                                    <td className="px-6 py-4 font-bold text-white max-w-[200px] truncate" title={decodeLegacyUtf8(item.description)}>
                                        {decodeLegacyUtf8(item.description)}
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
                                        <div className="font-bold leading-snug text-white">{decodeLegacyUtf8(item.description)}</div>
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

        {/* Job Details Modal */}
        {viewingImage && createPortal(
            <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6">
                <button
                    type="button"
                    className="absolute inset-0 cursor-default"
                    onClick={() => { setViewingImage(null); setShowLogViewer(false); }}
                    aria-label={lang === 'vi' ? 'Đóng chi tiết job' : 'Close job details'}
                />

                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="job-detail-title"
                    className="neu-card relative z-10 flex h-[min(83dvh,828px)] w-[min(94vw,1188px)] flex-col overflow-hidden rounded-[2rem] border border-slate-300/70 shadow-2xl dark:border-slate-700/70"
                >
                    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-300/60 px-5 py-4 dark:border-slate-700/70 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="neu-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[#FF007F]">
                                {getAssetKind(viewingImage) === 'video'
                                    ? <Icons.Video className="h-5 w-5" />
                                    : <Icons.Image className="h-5 w-5" />}
                            </span>
                            <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                    <span>{getAssetKind(viewingImage) === 'video' ? 'Video job' : 'Image job'}</span>
                                    <span className="h-1 w-1 rounded-full bg-[#00F2FE]" />
                                    <span className="font-mono">#{viewingImage.id.substring(0, 8)}</span>
                                </div>
                                <h2 id="job-detail-title" className="truncate font-accent text-lg font-black text-slate-950 dark:text-white sm:text-xl">
                                    {lang === 'vi' ? 'Chi tiết job sáng tạo' : 'Creative job details'}
                                </h2>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {(!viewingImage.status || viewingImage.status === 'completed') && (
                                <span className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500 sm:inline-flex">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> {lang === 'vi' ? 'Hoàn thành' : 'Completed'}
                                </span>
                            )}
                            {(viewingImage.displayStatus || viewingImage.status) === 'failed' && (
                                <span className="hidden items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-500 sm:inline-flex">
                                    <span className="h-2 w-2 rounded-full bg-red-500" /> {lang === 'vi' ? 'Thất bại' : 'Failed'}
                                </span>
                            )}
                            {['processing', 'queued', 'rescuing'].includes(viewingImage.displayStatus || viewingImage.status || '') && (
                                <span className="hidden items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-500 sm:inline-flex">
                                    <Icons.Loader className="h-3.5 w-3.5 animate-spin" /> {getProcessingStageLabel(viewingImage)}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => { setViewingImage(null); setShowLogViewer(false); }}
                                className="neu-button flex h-10 w-10 items-center justify-center rounded-2xl text-slate-700 hover:text-red-500 dark:text-slate-200"
                                aria-label={lang === 'vi' ? 'Đóng chi tiết job' : 'Close job details'}
                            >
                                <Icons.X className="h-5 w-5" />
                            </button>
                        </div>
                    </header>

                    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)]">
                        <div className="flex min-h-[340px] min-w-0 flex-col p-4 sm:p-6">
                            <div className="neu-inset-sm relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[1.75rem] p-3 sm:p-5">
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,242,254,0.08),transparent_42%),radial-gradient(circle_at_bottom,rgba(255,0,127,0.08),transparent_42%)]" />
                                {viewingImage.url ? (
                                    getAssetKind(viewingImage) === 'video'
                                        ? <video src={viewingImage.url} className="relative max-h-full max-w-full rounded-2xl object-contain shadow-2xl" controls autoPlay loop playsInline />
                                        : <img src={viewingImage.url} alt="Generated asset" className="relative max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
                                ) : (
                                    <div className="relative flex max-w-md flex-col items-center px-6 text-center">
                                        {(viewingImage.displayStatus || viewingImage.status) === 'failed'
                                            ? <Icons.AlertTriangle className="mb-5 h-16 w-16 text-red-500/60" />
                                            : ['processing', 'queued', 'rescuing'].includes(viewingImage.displayStatus || viewingImage.status || '')
                                                ? <Icons.Loader className="mb-5 h-16 w-16 animate-spin text-[#00F2FE]/60" />
                                                : <Icons.Image className="mb-5 h-16 w-16 text-slate-500/50" />}
                                        <h3 className="font-accent text-base font-black text-slate-900 dark:text-white">
                                            {(viewingImage.displayStatus || viewingImage.status) === 'failed'
                                                ? getFailedAssetTitle(viewingImage)
                                                : ['processing', 'queued', 'rescuing'].includes(viewingImage.displayStatus || viewingImage.status || '')
                                                    ? getProcessingAssetTitle(viewingImage)
                                                    : (lang === 'vi' ? 'Chưa có dữ liệu kết quả' : 'No result available')}
                                        </h3>
                                        {(viewingImage.displayStatus || viewingImage.status) === 'failed' && (
                                            <p className="mt-2 text-sm leading-relaxed text-red-400">{getFailedAssetMessage(viewingImage)}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>

                        <div className="custom-scrollbar min-h-0 overflow-y-auto border-t border-slate-300/60 p-4 dark:border-slate-700/70 sm:p-6 lg:border-l lg:border-t-0">
                            <div className="space-y-4">
                                <section className="neu-inset-sm rounded-2xl p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                            {lang === 'vi' ? 'Prompt người dùng' : 'User prompt'}
                                        </h3>
                                        {(viewingImage.userPrompt || viewingImage.prompt) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(viewingImage.userPrompt || viewingImage.prompt);
                                                    notify(lang === 'vi' ? 'Đã sao chép prompt!' : 'Prompt copied!', 'success');
                                                }}
                                                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#00BFD8] transition-colors hover:text-[#FF007F]"
                                            >
                                                <Icons.Copy className="h-3.5 w-3.5" />
                                                {lang === 'vi' ? 'Sao chép' : 'Copy'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="custom-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-700 dark:text-slate-200">
                                        {viewingImage.userPrompt || viewingImage.prompt || <span className="italic text-slate-500">{lang === 'vi' ? 'Không có prompt.' : 'No prompt provided.'}</span>}
                                    </div>
                                </section>

                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: 'ID', value: `#${viewingImage.id.substring(0, 8)}`, icon: Icons.Database, tone: 'text-violet-500', mono: true },
                                        { label: lang === 'vi' ? 'Thời gian' : 'Time', value: formatDate(viewingImage.timestamp), icon: Icons.Clock, tone: 'text-amber-500', mono: true },
                                        { label: lang === 'vi' ? 'Công cụ' : 'Tool', value: viewingImage.toolName || 'AI Studio', icon: Icons.Wand, tone: 'text-[#00BFD8]' },
                                        { label: lang === 'vi' ? 'Chi phí' : 'Cost', value: typeof viewingImage.cost === 'number' ? `${viewingImage.cost} Vcoin` : 'N/A', icon: Icons.Gem, tone: 'text-[#FF007F]' },
                                    ].map((meta) => {
                                        const MetaIcon = meta.icon;
                                        return (
                                            <div key={meta.label} className="neu-inset-sm min-w-0 rounded-2xl p-3.5">
                                                <div className="mb-2 flex items-center gap-2">
                                                    <MetaIcon className={`h-3.5 w-3.5 ${meta.tone}`} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{meta.label}</span>
                                                </div>
                                                <div className={`truncate text-xs font-black text-slate-900 dark:text-white ${meta.mono ? 'font-mono' : ''}`} title={meta.value}>{meta.value}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {getLatestQueueLog(viewingImage) && (
                                    <section className="neu-inset-sm rounded-2xl p-4">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                                                <Icons.Activity className="h-4 w-4 text-emerald-500" />
                                                {lang === 'vi' ? 'Cập nhật gần nhất' : 'Latest update'}
                                            </div>
                                            <span className="font-mono text-[9px] text-slate-500">{formatDate(new Date(getLatestQueueLog(viewingImage)!.at).getTime())}</span>
                                        </div>
                                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
                                            {getQueueStageDisplay(getLatestQueueLog(viewingImage)?.stage)}
                                        </div>
                                        <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">
                                            {sanitizeProviderDisplayText(getLatestQueueLog(viewingImage)?.message)}
                                        </p>
                                    </section>
                                )}

                                {(viewingImage.displayStatus || viewingImage.status) === 'failed' && viewingImage.error && (
                                    <section className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
                                        <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-red-500">
                                            <Icons.AlertTriangle className="h-4 w-4" />
                                            {lang === 'vi' ? 'Lý do thất bại' : 'Failure reason'}
                                        </div>
                                        <p className="text-sm leading-relaxed text-red-400">{getFailedAssetMessage(viewingImage)}</p>
                                    </section>
                                )}

                                {viewingImage.providerPrompt && (
                                    <details className="neu-inset-sm group rounded-2xl p-4">
                                        <summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 group-open:text-[#00BFD8]">
                                            {lang === 'vi' ? 'Dữ liệu kỹ thuật của provider' : 'Provider technical data'}
                                        </summary>
                                        <div className="custom-scrollbar mt-3 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/10 p-3 font-mono text-[10px] leading-relaxed text-slate-600 dark:bg-black/20 dark:text-slate-400">
                                            {sanitizeProviderDisplayText(viewingImage.providerPrompt)}
                                        </div>
                                    </details>
                                )}

                                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
                                    {viewingImage.url && (
                                        <button
                                            type="button"
                                            onClick={() => handleDownload(viewingImage.url, getDownloadFilename(viewingImage), getAssetKind(viewingImage))}
                                            className="neu-button-primary flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[10px] font-black"
                                        >
                                            <Icons.Download className="h-4 w-4" />
                                            {lang === 'vi' ? 'Tải xuống' : 'Download'}
                                        </button>
                                    )}
                                    {getAssetKind(viewingImage) === 'image' && viewingImage.status === 'completed' && (
                                        <button
                                            type="button"
                                            onClick={() => handlePublish(viewingImage)}
                                            disabled={!!viewingImage.isShared}
                                            className={`neu-button flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[10px] font-black ${
                                                viewingImage.isShared ? 'cursor-default text-emerald-500' : 'text-[#FF007F]'
                                            }`}
                                        >
                                            <Icons.Share className="h-4 w-4" />
                                            {viewingImage.isShared ? (lang === 'vi' ? 'Đã chia sẻ' : 'Published') : (lang === 'vi' ? 'Chia sẻ' : 'Share')}
                                        </button>
                                    )}
                                    {(viewingImage.queueLogs?.length || 0) > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowLogViewer(true)}
                                            className="neu-button flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[10px] font-black text-slate-800 dark:text-slate-100"
                                        >
                                            <Icons.Activity className="h-4 w-4 text-[#00BFD8]" />
                                            {lang === 'vi' ? 'Nhật ký' : 'Progress log'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            setViewingImage(null);
                                            setShowLogViewer(false);
                                            handleDelete(e, viewingImage.id, viewingImage.url, viewingImage.userId);
                                        }}
                                        className="neu-button flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black text-red-500 sm:col-span-3"
                                    >
                                        <Icons.Trash className="h-4 w-4" />
                                        {lang === 'vi' ? 'Xóa khỏi lịch sử' : 'Delete from history'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>,
            document.body
        )}
        {viewingImage && showLogViewer && createPortal(
            <div className="fixed inset-0 z-[5010] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md sm:p-6">
                <button type="button" className="absolute inset-0 cursor-default" onClick={() => setShowLogViewer(false)} aria-label={lang === 'vi' ? 'Đóng nhật ký tiến trình' : 'Close progress log'} />
                <section role="dialog" aria-modal="true" aria-labelledby="progress-log-title" className="neu-card relative z-10 flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-300/70 shadow-2xl dark:border-slate-700/70">
                    <header className="flex items-center justify-between border-b border-slate-300/60 px-5 py-4 dark:border-slate-700/70 sm:px-6">
                        <div className="flex items-center gap-3">
                            <span className="neu-inset-sm flex h-10 w-10 items-center justify-center rounded-2xl">
                                <Icons.Activity className="h-5 w-5 text-[#00BFD8]" />
                            </span>
                            <div>
                                <h3 id="progress-log-title" className="font-accent text-lg font-black text-slate-950 dark:text-white">
                                    {lang === 'vi' ? 'Nhật ký tiến trình' : 'Progress log'}
                                </h3>
                                <div className="mt-0.5 font-mono text-[10px] text-slate-500">JOB #{viewingImage.id.substring(0, 8)}</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowLogViewer(false)}
                            className="neu-button flex h-10 w-10 items-center justify-center rounded-2xl text-slate-700 hover:text-red-500 dark:text-slate-200"
                            aria-label={lang === 'vi' ? 'Đóng nhật ký tiến trình' : 'Close progress log'}
                        >
                            <Icons.X className="h-5 w-5" />
                        </button>
                    </header>
                    <div className="custom-scrollbar space-y-3 overflow-y-auto p-4 sm:p-6">
                        {getQueueLogs(viewingImage).length === 0 ? (
                            <div className="neu-inset-sm rounded-2xl px-5 py-12 text-center text-sm italic text-slate-500">
                                {lang === 'vi' ? 'Chưa có log tiến trình cho job này.' : 'No progress logs available for this job yet.'}
                            </div>
                        ) : getQueueLogs(viewingImage).map((entry, index) => (
                            <article key={`${entry.at}-${index}`} className="neu-inset-sm rounded-2xl p-4">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#00BFD8]">
                                        <span className={`h-2 w-2 rounded-full ${entry.level === 'error' ? 'bg-red-500' : entry.level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                        {getQueueStageDisplay(entry.stage)}
                                    </div>
                                    <div className="font-mono text-[9px] text-slate-500">
                                        {formatDate(new Date(entry.at).getTime())}
                                    </div>
                                </div>
                                <div className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">{sanitizeProviderDisplayText(entry.message)}</div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>,
            document.body
        )}
    </div>
  );
};

