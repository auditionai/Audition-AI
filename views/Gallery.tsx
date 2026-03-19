import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GeneratedImage, Language, HistoryItem } from '../types';
import { getAllImagesFromStorage, deleteImageFromStorage, cleanupExpiredImages } from '../services/storageService';
import { getUnifiedHistory } from '../services/economyService';
import { useConcurrency } from '../services/concurrencyService';
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
    
    const interval = setInterval(() => {
        loadImages(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const loadImages = async (silent = false) => {
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
    } catch (error) {
      console.error("Failed to load gallery", error);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    confirm({
        title: lang === 'vi' ? 'Xóa ảnh?' : 'Delete Image?',
        message: lang === 'vi' ? 'Bạn có chắc chắn muốn xóa vĩnh viễn hình ảnh này không?' : 'Are you sure you want to permanently delete this image?',
        confirmText: lang === 'vi' ? 'Xóa ngay' : 'Delete',
        cancelText: lang === 'vi' ? 'Hủy' : 'Cancel',
        isDanger: true,
        onConfirm: async () => {
            await deleteImageFromStorage(id);
            triggerPoll();
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
                  await deleteImageFromStorage(id);
              }
              triggerPoll();
              setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
              setSelectedIds(new Set());
              notify(lang === 'vi' ? 'Đã xóa các mục đã chọn.' : 'Selected items deleted.', 'info');
          }
      });
  };

  const handleDownload = async (imageUrl: string, filename: string) => {
      if (!imageUrl || imageUrl.startsWith('blob:')) return;
      notify(lang === 'vi' ? 'Đang xử lý tải xuống...' : 'Processing download...', 'info');
      
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
          
          notify(lang === 'vi' ? 'Đã lưu ảnh thành công!' : 'Download successful!', 'success');
      } catch (e) {
          console.error("Download failed completely", e);
          window.open(imageUrl, '_blank');
          notify(lang === 'vi' ? 'Lỗi tải file. Đã mở ảnh trong tab mới.' : 'Download failed. Image opened in new tab.', 'warning');
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

  return (
    <div className="pb-32 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* STORAGE POLICY WARNING BANNER */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 mb-6 shrink-0">
            <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
                <h4 className="text-sm font-bold text-red-400">LƯU Ý QUAN TRỌNG: Chính sách lưu trữ ảnh</h4>
                <p className="text-xs text-red-400/80 leading-relaxed">
                    Ảnh trong lịch sử sẽ tự động bị xóa sau <b className="text-red-500">1 ngày</b> hoặc khi bạn tắt trình duyệt/ứng dụng. 
                    Vui lòng tải ảnh xuống máy tính ngay bây giờ để tránh mất dữ liệu!
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
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">LỌC THEO:</span>
                        <div className="flex gap-2">
                            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'all' ? 'bg-audi-cyan/20 border-audi-cyan/50 text-audi-cyan' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Tất cả</button>
                            <button onClick={() => setFilter('completed')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'completed' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Hoàn thành</button>
                            <button onClick={() => setFilter('failed')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'failed' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Thất bại</button>
                            <button onClick={() => setFilter('processing')} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${filter === 'processing' || filter === 'queued' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>Đang chờ</button>
                        </div>
                        <div className="w-px h-6 bg-white/10 mx-2 hidden md:block"></div>
                        <button 
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
                                                <div className="w-12 h-12 rounded-lg bg-black/50 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                                                    {img.url ? (
                                                        <img src={img.url} alt="preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Icons.Image className="w-5 h-5 text-slate-600" />
                                                    )}
                                                </div>
                                                <div className="max-w-[200px] md:max-w-[300px]">
                                                    <div className="font-bold text-white truncate" title={img.prompt}>{img.prompt || img.toolName}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">ID: #{img.id.substring(0, 8)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                <Icons.Image className="w-3 h-3" /> Image
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">{formatDate(img.timestamp)}</td>
                                        <td className="px-6 py-4 font-bold text-white">
                                            {/* Assuming a fixed cost or fetching from somewhere. For now, placeholder or engine based */}
                                            {img.engine === 'tramsangtao' ? '-12 Vcoin' : '-25 Vcoin'}
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
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                    <Icons.Loader className="w-3 h-3 animate-spin" /> Đang chờ
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isCompleted && img.url && (
                                                    <button 
                                                        onClick={() => handleDownload(img.url, `auditionai-${img.id}.png`)}
                                                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                        title="Tải xuống"
                                                    >
                                                        <Icons.Download className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => handleDelete(e, img.id)}
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
                    <table className="w-full text-left text-sm text-slate-400">
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
                            <img src={viewingImage.url} alt="Generated" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-500">
                                {viewingImage.status === 'failed' ? (
                                    <Icons.AlertTriangle className="w-16 h-16 mb-4 text-red-500/50" />
                                ) : viewingImage.status === 'processing' || viewingImage.status === 'queued' ? (
                                    <Icons.Loader className="w-16 h-16 mb-4 animate-spin text-audi-cyan/50" />
                                ) : (
                                    <Icons.Image className="w-16 h-16 mb-4 opacity-50" />
                                )}
                                <p>{viewingImage.status === 'failed' ? (lang === 'vi' ? 'Tạo ảnh thất bại' : 'Image generation failed') : viewingImage.status === 'processing' || viewingImage.status === 'queued' ? (lang === 'vi' ? 'Đang tạo ảnh...' : 'Image is generating...') : (lang === 'vi' ? 'Không có ảnh' : 'No image available')}</p>
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
                                    onClick={() => handleDownload(viewingImage.url, `auditionai-${viewingImage.id}.png`)}
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
                            <Icons.Image className="w-6 h-6 text-audi-cyan" />
                            {lang === 'vi' ? 'Chi tiết ảnh' : 'Image Details'}
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
                                                notify(lang === 'vi' ? 'Đã sao chép prompt!' : 'Prompt copied!', 'success');
                                            }}
                                            className="text-[10px] font-bold text-audi-cyan uppercase tracking-wider hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            <Icons.Copy className="w-3 h-3" />
                                            {lang === 'vi' ? 'Sao chép' : 'Copy'}
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
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Thời gian' : 'Time'}</div>
                                    <div className="font-mono text-xs text-white">{formatDate(viewingImage.timestamp)}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Công cụ' : 'Tool'}</div>
                                    <div className="text-sm font-bold text-audi-cyan truncate" title={viewingImage.toolName}>{viewingImage.toolName}</div>
                                </div>
                                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{lang === 'vi' ? 'Chi phí' : 'Cost'}</div>
                                    <div className="text-sm font-bold text-audi-pink">{viewingImage.engine === 'tramsangtao' ? '12 Vcoin' : '25 Vcoin'}</div>
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
                                    {viewingImage.status === 'failed' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold uppercase tracking-wider">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Thất bại
                                        </span>
                                    )}
                                    {(viewingImage.status === 'processing' || viewingImage.status === 'queued') && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold uppercase tracking-wider">
                                            <Icons.Loader className="w-3 h-3 animate-spin" /> Đang chờ
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Error Message if failed */}
                            {viewingImage.status === 'failed' && viewingImage.error && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Error Details</div>
                                    <div className="text-sm text-red-300">{viewingImage.error}</div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="pt-4 border-t border-white/10 flex gap-3">
                                {viewingImage.url && (
                                    <button 
                                        onClick={() => handleDownload(viewingImage.url, `auditionai-${viewingImage.id}.png`)}
                                        className="flex-1 py-3 rounded-xl bg-audi-cyan/10 text-audi-cyan border border-audi-cyan/20 font-bold text-sm uppercase hover:bg-audi-cyan/20 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Icons.Download className="w-4 h-4" />
                                        {lang === 'vi' ? 'Tải xuống' : 'Download'}
                                    </button>
                                )}
                                <button 
                                    onClick={(e) => {
                                        setViewingImage(null);
                                        handleDelete(e, viewingImage.id);
                                    }}
                                    className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold text-sm uppercase hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Icons.Trash className="w-4 h-4" />
                                    {lang === 'vi' ? 'Xóa ảnh' : 'Delete'}
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
