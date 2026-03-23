import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GeneratedImage, Language, HistoryItem } from '../types';
import { getAllImagesFromStorage, deleteImageFromStorage, cleanupExpiredImages, getHistoryRetentionDays, publishImageToShowcase } from '../services/storageService';
import { getUnifiedHistory } from '../services/economyService';
import { useConcurrency } from '../services/concurrencyService';
import { supabase } from '../services/supabaseClient';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';

interface GalleryProps {
  lang: Language;
}

export const Gallery: React.FC<GalleryProps> = ({ lang }) => {
  const { notify, confirm } = useNotification();
  const { triggerPoll } = useConcurrency();
  const [activeTab, setActiveTab] = useState<'generation' | 'transactions'>('generation');

  // Generation History State
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'processing' | 'queued'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingImage, setViewingImage] = useState<GeneratedImage | null>(null);

  // Transaction History State
  const [transactions, setTransactions] = useState<HistoryItem[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const retentionDays = getHistoryRetentionDays();
  const hasActiveJobs = useMemo(
    () => images.some((img) => img.status === 'processing' || img.status === 'queued'),
    [images],
  );

  const loadImages = useCallback(async (silent = false) => {
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
    } catch (error) {
      console.error("Failed to load gallery", error);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
        setLoadingImages(true);
        try {
            const deletedCount = await cleanupExpiredImages();
            if (deletedCount > 0) {
                console.log(`[Gallery] Auto-cleaned ${deletedCount} expired images.`);
            }
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
      if (!supabase) return;

      let channel: any = null;
      let cancelled = false;

      const subscribe = async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || cancelled) return;

          channel = supabase
              .channel(`gallery_generated_images_${user.id}`)
              .on(
                  'postgres_changes',
                  {
                      event: '*',
                      schema: 'public',
                      table: 'generated_images',
                      filter: `user_id=eq.${user.id}`
                  },
                  () => {
                      loadImages(true);
                  }
              )
              .subscribe();
      };

      subscribe().catch((error) => {
          console.warn('[Gallery] Failed to subscribe generated_images realtime:', error);
      });

      return () => {
          cancelled = true;
          if (channel) {
              supabase.removeChannel(channel);
          }
      };
  }, []);

  useEffect(() => {
      if (!hasActiveJobs) return;
      const interval = setInterval(() => {
          loadImages(true);
      }, 15000);
      return () => clearInterval(interval);
  }, [hasActiveJobs, loadImages]);

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
        title: lang === 'vi' ? 'XÃ³a áº£nh?' : 'Delete Image?',
        message: lang === 'vi' ? 'Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a vÄ©nh viá»…n hÃ¬nh áº£nh nÃ y khÃ´ng?' : 'Are you sure you want to permanently delete this image?',
        confirmText: lang === 'vi' ? 'XÃ³a ngay' : 'Delete',
        cancelText: lang === 'vi' ? 'Há»§y' : 'Cancel',
        isDanger: true,
        onConfirm: async () => {
            await deleteImageFromStorage(id, userId, imageUrl);
            triggerPoll();
            setImages(prev => prev.filter(img => img.id !== id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
            notify(lang === 'vi' ? 'ÄÃ£ xÃ³a áº£nh.' : 'Image deleted.', 'info');
        }
    });
  };

  const handleDeleteSelected = () => {
      if (selectedIds.size === 0) return;
      confirm({
          title: lang === 'vi' ? 'XÃ³a cÃ¡c má»¥c Ä‘Ã£ chá»n?' : 'Delete selected items?',
          message: lang === 'vi' ? `Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a ${selectedIds.size} má»¥c nÃ y khÃ´ng?` : `Are you sure you want to delete these ${selectedIds.size} items?`,
          confirmText: lang === 'vi' ? 'XÃ³a ngay' : 'Delete',
          cancelText: lang === 'vi' ? 'Há»§y' : 'Cancel',
          isDanger: true,
          onConfirm: async () => {
              for (const id of Array.from(selectedIds)) {
                  const image = images.find((img) => img.id === id);
                  await deleteImageFromStorage(id, image?.userId, image?.url);
              }
              triggerPoll();
              setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
              setSelectedIds(new Set());
              notify(lang === 'vi' ? 'ÄÃ£ xÃ³a cÃ¡c má»¥c Ä‘Ã£ chá»n.' : 'Selected items deleted.', 'info');
          }
      });
  };

  const handleDownload = async (imageUrl: string, filename: string, assetKind: 'image' | 'video' = 'image') => {
      if (!imageUrl || imageUrl.startsWith('blob:')) return;
      notify(lang === 'vi' ? 'Äang xá»­ lÃ½ táº£i xuá»‘ng...' : 'Processing download...', 'info');

      try {
          let blob: Blob;
          if (imageUrl.startsWith('data:')) {
              const arr = imageUrl.split(',');
              const mime = arr[0].match(/:(.*?);/)?.[1];
              const bstr = atob(arr[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) u8arr[n] = bstr.charCodeAt(n);
              blob = new Blob([u8arr], { type: mime });
          } else {
              try {
                  const response = await fetch(imageUrl, { mode: 'cors' });
                  if (!response.ok) throw new Error('Direct fetch failed');
                  blob = await response.blob();
              } catch (directError) {
                  if (assetKind === 'video') {
                      throw directError;
                  }
                  try {
                      const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&output=png`;
                      const proxyResponse = await fetch(proxyUrl);
                      if (!proxyResponse.ok) throw new Error('Proxy download failed');
                      blob = await proxyResponse.blob();
                  } catch (proxyError) {
                      const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
                      const proxyResponse2 = await fetch(proxyUrl2);
                      if (!proxyResponse2.ok) throw new Error('All proxies failed');
                      blob = await proxyResponse2.blob();
                  }
              }
          }

          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);

          notify(lang === 'vi' ? 'ÄÃ£ lÆ°u áº£nh thÃ nh cÃ´ng!' : 'Download successful!', 'success');
      } catch (e) {
          console.error("Download failed completely", e);
          window.open(imageUrl, '_blank');
          notify(lang === 'vi' ? 'Lá»—i táº£i file. ÄÃ£ má»Ÿ áº£nh trong tab má»›i.' : 'Download failed. Image opened in new tab.', 'warning');
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
          if (filter === 'completed') return !img.status || img.status === 'completed';
          if (filter === 'failed') return img.status === 'failed';
          if (filter === 'processing' || filter === 'queued') return img.status === 'processing' || img.status === 'queued';
          return true;
      }).sort((a, b) => b.timestamp - a.timestamp);
  }, [images, filter]);

  const getAssetKind = (img: GeneratedImage) => {
      if (img.assetType) return img.assetType;
      if (img.toolId?.includes('video') || img.toolId?.includes('motion')) return 'video';
      if ((img.engine || '').toLowerCase().includes('kling') || (img.engine || '').toLowerCase().includes('motion')) return 'video';
      if ((img.url || '').toLowerCase().endsWith('.mp4') || (img.url || '').toLowerCase().includes('.mp4?')) return 'video';
      return 'image';
  };

  const getDownloadFilename = (img: GeneratedImage) => {
      const ext = getAssetKind(img) === 'video' ? 'mp4' : 'png';
      return `auditionai-${img.id}.${ext}`;
  };

  const getFailedAssetTitle = (img: GeneratedImage) =>
      getAssetKind(img) === 'video'
          ? (lang === 'vi' ? 'Táº¡o video tháº¥t báº¡i' : 'Video generation failed')
          : (lang === 'vi' ? 'Táº¡o áº£nh tháº¥t báº¡i' : 'Image generation failed');

  const getProcessingAssetTitle = (img: GeneratedImage) =>
      getAssetKind(img) === 'video'
          ? (lang === 'vi' ? 'Äang táº¡o video...' : 'Video is generating...')
          : (lang === 'vi' ? 'Äang táº¡o áº£nh...' : 'Image is generating...');

  const getFailedAssetMessage = (img: GeneratedImage) =>
      img.error?.trim() || (lang === 'vi'
          ? 'Tiáº¿n trÃ¬nh Ä‘Ã£ tháº¥t báº¡i nhÆ°ng chÆ°a cÃ³ mÃ´ táº£ lá»—i chi tiáº¿t.'
          : 'The generation failed without a detailed error message.');

  const getProcessingStageLabel = (img: GeneratedImage) => {
      const queueProgress = Math.max(0, Math.min(100, img.progress || 0));

      if (img.status === 'failed') return lang === 'vi' ? 'Thất bại' : 'Failed';
      if (!img.status || img.status === 'completed') return lang === 'vi' ? 'Hoàn thành' : 'Completed';
      if (img.jobId) return lang === 'vi' ? 'Đang tạo ảnh' : 'Generating';

      if (queueProgress >= 40) {
          return lang === 'vi' ? 'Đang tổng hợp' : 'Synthesizing';
      }

      if (queueProgress >= 10) {
          return lang === 'vi' ? 'Đang xử lý' : 'Processing';
      }

      if (img.status === 'queued') {
          return lang === 'vi' ? 'Đang chuẩn bị' : 'Preparing';
      }

      return lang === 'vi' ? 'Đang chuẩn bị' : 'Preparing';
  }; 

  const handlePublish = async (image: GeneratedImage) => {
      try {
          const updatedImage = await publishImageToShowcase(image);
          setImages((prev) => prev.map((item) => item.id === updatedImage.id ? updatedImage : item));
          setViewingImage(updatedImage);
          notify(lang === 'vi' ? 'ÄÃ£ chia sáº» áº£nh lÃªn trang chá»§ vÃ  lÆ°u trá»¯ lÃ¢u dÃ i.' : 'Image published to showcase and stored long-term.', 'success');
      } catch (error) {
          console.error('Publish failed', error);
          notify(error instanceof Error ? error.message : (lang === 'vi' ? 'Chia sáº» áº£nh tháº¥t báº¡i.' : 'Failed to publish image.'), 'error');
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
          case 'usage': return 'Sá»¬ Dá»¤NG';
          case 'topup': return 'Náº P TIá»€N';
          case 'pending_topup': return 'CHá»œ DUYá»†T';
          case 'reward': return 'THÆ¯á»žNG';
          case 'giftcode': return 'GIFTCODE';
          case 'refund': return 'HOÃ€N TIá»€N';
          default: return 'KHÃC';
      }
  }

  return (
    <div className="pb-32 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* STORAGE POLICY WARNING BANNER */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 mb-6 shrink-0">
            <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
                <h4 className="text-sm font-bold text-red-400">LÆ¯U Ã QUAN TRá»ŒNG: ChÃ­nh sÃ¡ch lÆ°u trá»¯ lá»‹ch sá»­ táº¡o</h4>
                <p className="text-xs text-red-400/80 leading-relaxed">
                    áº¢nh vÃ  video trong lá»‹ch sá»­ táº¡o sáº½ tá»± Ä‘á»™ng bá»‹ xÃ³a sau <b className="text-red-500">{retentionDays} ngÃ y</b> náº¿u chÆ°a publish.
                    Giao dá»‹ch Vcoin váº«n Ä‘Æ°á»£c giá»¯ láº¡i. áº¢nh Ä‘Ã£ publish sáº½ Ä‘Æ°á»£c lÆ°u trá»¯ lÃ¢u dÃ i vÃ  khÃ´ng bá»‹ xÃ³a theo má»‘c nÃ y.
                </p>
            </div>
        </div>

        <div className="bg-[#12121a] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Header / Tabs */}
            <div className="flex flex-col md:flex-row items-center justify-between p-6 border-b border-white/10 gap-4">
                <div className="flex bg-black/50 p-1 rounded-xl border border-white/5">
                    <button
                        onClick={() => setActiveTab('generation')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'generation' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {lang === 'vi' ? 'Lá»‹ch sá»­ táº¡o' : 'Generation History'}
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'transactions' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        {lang === 'vi' ? 'Giao dá»‹ch Vcoin' : 'Vcoin Transactions'}
                    </button>
                </div>

                {activeTab === 'generation' && (
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Lá»ŒC THEO:</span>
                        <div className="flex gap-2">
                            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'all' ? 'bg-audi-cyan/20 border-audi-cyan/50 text-audi-cyan' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Táº¥t cáº£</button>
                            <button onClick={() => setFilter('completed')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'completed' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>HoÃ n thÃ nh</button>
                            <button onClick={() => setFilter('failed')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'failed' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Tháº¥t báº¡i</button>
                            <button onClick={() => setFilter('processing')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'processing' || filter === 'queued' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Äang chá»</button>
                        </div>
                        <div className="w-px h-6 bg-white/10 mx-2 hidden md:block"></div>
                        <button
                            onClick={handleDeleteSelected}
                            disabled={selectedIds.size === 0}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${selectedIds.size > 0 ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-600 cursor-not-allowed'}`}
                        >
                            <Icons.Trash className="w-4 h-4" />
                            {lang === 'vi' ? 'XÃ³a trang nÃ y' : 'Delete selected'}
                        </button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="overflow-x-auto">
                {activeTab === 'generation' ? (
                    <table className="w-full text-left text-sm text-slate-400">
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
                                <th className="px-6 py-4">LOáº I</th>
                                <th className="px-6 py-4">THá»œI GIAN</th>
                                <th className="px-6 py-4">CHI PHÃ</th>
                                <th className="px-6 py-4">TRáº NG THÃI</th>
                                <th className="px-6 py-4 text-right">HÃ€NH Äá»˜NG</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loadingImages ? (
                                <tr><td colSpan={7} className="text-center py-12"><Icons.Loader className="w-6 h-6 animate-spin mx-auto text-audi-cyan" /></td></tr>
                            ) : filteredImages.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-12 text-slate-500 italic">KhÃ´ng cÃ³ dá»¯ liá»‡u</td></tr>
                            ) : filteredImages.map(img => {
                                const isCompleted = !img.status || img.status === 'completed';
                                const isFailed = img.status === 'failed';
                                const isProcessing = img.status === 'processing' || img.status === 'queued';

                                return (
                                    <tr
                                        key={img.id}
                                        className="hover:bg-white/[0.05] transition-colors group cursor-pointer"
                                        onClick={() => setViewingImage(img)}
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
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> HoÃ n thÃ nh
                                                </span>
                                            )}
                                            {isFailed && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Tháº¥t báº¡i
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
                                                            <div className={`h-full rounded-full transition-all duration-500 ${img.status === 'queued' ? 'bg-yellow-400' : 'bg-audi-cyan'}`} style={{ width: `${Math.max(0, Math.min(100, img.progress || 0))}%` }} />
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 mt-1">
                                                            {getProcessingStageLabel(img)} â€¢ {Math.max(0, Math.min(100, img.progress || 0))}% {img.jobId ? `â€¢ ${img.jobId.slice(0, 10)}` : ''}
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
                                                        title="Táº£i xuá»‘ng"
                                                    >
                                                        <Icons.Download className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleDelete(e, img.id, img.url, img.userId)}
                                                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="XÃ³a"
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
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="text-xs uppercase bg-black/20 text-slate-500 font-bold tracking-wider border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4">THá»œI GIAN</th>
                                <th className="px-6 py-4">Ná»˜I DUNG</th>
                                <th className="px-6 py-4">LOáº I GD</th>
                                <th className="px-6 py-4">VCOIN</th>
                                <th className="px-6 py-4 text-right">TRáº NG THÃI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loadingTransactions ? (
                                <tr><td colSpan={5} className="text-center py-12"><Icons.Loader className="w-6 h-6 animate-spin mx-auto text-audi-cyan" /></td></tr>
                            ) : transactions.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-12 text-slate-500 italic">ChÆ°a cÃ³ giao dá»‹ch nÃ o</td></tr>
                            ) : transactions.map(item => (
                                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-4 font-mono text-xs">{new Date(item.createdAt).toLocaleString()}</td>
                                    <td className="px-6 py-4 font-bold text-white max-w-[200px] truncate" title={item.description}>
                                        {item.description}
                                        {item.code && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.code}</div>}
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
                                                    <Icons.Check className="w-3 h-3" /> ThÃ nh cÃ´ng
                                                </span>
                                            ) : item.status === 'pending' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <Icons.Loader className="w-3 h-3 animate-spin" /> Äang chá»
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <Icons.X className="w-3 h-3" /> Tháº¥t báº¡i
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer / Pagination info */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-500">
                <div>
                    Hiá»ƒn thá»‹ <span className="font-bold text-white">1-{activeTab === 'generation' ? filteredImages.length : transactions.length}</span> trong <span className="font-bold text-white">{activeTab === 'generation' ? filteredImages.length : transactions.length}</span> káº¿t quáº£
                </div>
            </div>
        </div>

        {/* Image Details Modal */}
        {viewingImage && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setViewingImage(null)}></div>
                <div className="relative w-full max-w-4xl bg-[#12121a] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                    {/* Close Button */}
                    <button
                        onClick={() => setViewingImage(null)}
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
                                {viewingImage.status === 'failed' ? (
                                    <Icons.AlertTriangle className="w-16 h-16 mb-4 text-red-500/50" />
                                ) : viewingImage.status === 'processing' || viewingImage.status === 'queued' ? (
                                    <Icons.Loader className="w-16 h-16 mb-4 animate-spin text-audi-cyan/50" />
                                ) : (
                                    <Icons.Image className="w-16 h-16 mb-4 opacity-50" />
                                )}
                                <p>{viewingImage.status === 'failed' ? (lang === 'vi' ? 'Táº¡o áº£nh tháº¥t báº¡i' : 'Image generation failed') : viewingImage.status === 'processing' || viewingImage.status === 'queued' ? getProcessingStageLabel(viewingImage) : (lang === 'vi' ? 'KhÃ´ng cÃ³ áº£nh' : 'No image available')}</p>
                                {viewingImage.status === 'failed' && (
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
                                    {lang === 'vi' ? 'Táº£i xuá»‘ng' : 'Download'}
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
                            {getAssetKind(viewingImage) === 'video' ? (lang === 'vi' ? 'Chi tiáº¿t video' : 'Video Details') : (lang === 'vi' ? 'Chi tiáº¿t áº£nh' : 'Image Details')}
                        </h3>

                        <div className="space-y-6">
                            {/* Prompt */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prompt</div>
                                    {viewingImage.prompt && (
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(viewingImage.prompt);
                                                notify(lang === 'vi' ? 'ÄÃ£ sao chÃ©p prompt!' : 'Prompt copied!', 'success');
                                            }}
                                            className="text-[10px] font-bold text-audi-cyan uppercase tracking-wider hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            <Icons.Copy className="w-3 h-3" />
                                            {lang === 'vi' ? 'Sao chÃ©p' : 'Copy'}
                                        </button>
                                    )}
                                </div>
                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-slate-300 leading-relaxed break-words line-clamp-3" title={viewingImage.prompt}>
                                    {viewingImage.prompt || <span className="italic text-slate-600">No prompt provided</span>}
                                </div>
                            </div>

                            {/* Meta Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">ID</div>
                                    <div className="font-mono text-xs text-white truncate">#{viewingImage.id.substring(0, 8)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Thá»i gian' : 'Time'}</div>
                                    <div className="font-mono text-xs text-white">{formatDate(viewingImage.timestamp)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'CÃ´ng cá»¥' : 'Tool'}</div>
                                    <div className="text-sm font-bold text-audi-cyan truncate" title={viewingImage.toolName}>{viewingImage.toolName}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Chi phÃ­' : 'Cost'}</div>
                                    <div className="text-sm font-bold text-audi-pink">
                                        {typeof viewingImage.cost === 'number' ? `${viewingImage.cost} Vcoin` : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{lang === 'vi' ? 'Tráº¡ng thÃ¡i' : 'Status'}</div>
                                <div>
                                    {(!viewingImage.status || viewingImage.status === 'completed') && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold uppercase tracking-wider">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> HoÃ n thÃ nh
                                        </span>
                                    )}
                                    {viewingImage.status === 'failed' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold uppercase tracking-wider">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Tháº¥t báº¡i
                                        </span>
                                    )}
                                    {(viewingImage.status === 'processing' || viewingImage.status === 'queued') && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold uppercase tracking-wider">
                                            <Icons.Loader className="w-3 h-3 animate-spin" /> {getProcessingStageLabel(viewingImage)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Error Message if failed */}
                            {viewingImage.status === 'failed' && viewingImage.error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">
                                        {lang === 'vi' ? 'LÃ½ do tháº¥t báº¡i' : 'Failure reason'}
                                    </div>
                                    <div className="text-sm text-red-300 leading-relaxed">{getFailedAssetMessage(viewingImage)}</div>
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
                                                <span className="block text-sm font-extrabold tracking-wide">{lang === 'vi' ? 'Táº£i xuá»‘ng' : 'Download'}</span>
                                                <span className="block text-[10px] text-audi-cyan/70">{lang === 'vi' ? 'LÆ°u file gá»‘c vá» thiáº¿t bá»‹' : 'Save original file to your device'}</span>
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
                                                    {viewingImage.isShared ? (lang === 'vi' ? 'ÄÃ£ publish' : 'Published') : (lang === 'vi' ? 'Chia sáº»' : 'Share')}
                                                </span>
                                                <span className={`block text-[10px] ${viewingImage.isShared ? 'text-emerald-300/70' : 'text-audi-pink/70'}`}>
                                                    {viewingImage.isShared ? (lang === 'vi' ? 'Hiá»ƒn thá»‹ trÃªn trang chá»§ vÃ  lÆ°u dÃ i háº¡n' : 'Visible on home and stored long-term') : (lang === 'vi' ? 'ÄÆ°a áº£nh lÃªn trang chá»§ vÃ  lÆ°u lÃ¢u dÃ i' : 'Publish to home and store long-term')}
                                                </span>
                                            </span>
                                        </span>
                                        <Icons.ChevronRight className={`w-4 h-4 shrink-0 ${viewingImage.isShared ? 'text-emerald-300/70' : 'text-audi-pink/70'}`} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        setViewingImage(null);
                                        handleDelete(e, viewingImage.id, viewingImage.url, viewingImage.userId);
                                    }}
                                    className="w-full px-4 py-3 rounded-2xl bg-gradient-to-br from-red-500/16 via-red-500/10 to-transparent text-red-400 border border-red-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_rgba(239,68,68,0.1)] hover:from-red-500/22 hover:via-red-500/14 hover:to-red-500/5 transition-all flex items-center justify-between text-left"
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-black/25 border border-red-500/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                            <Icons.Trash className="w-4 h-4" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-extrabold tracking-wide">{lang === 'vi' ? (getAssetKind(viewingImage) === 'video' ? 'XÃ³a video' : 'XÃ³a áº£nh') : 'Delete'}</span>
                                            <span className="block text-[10px] text-red-300/70">{lang === 'vi' ? 'Gá»¡ khá»i lá»‹ch sá»­ táº¡o cá»§a báº¡n' : 'Remove this item from your history'}</span>
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
    </div>
  );
};

