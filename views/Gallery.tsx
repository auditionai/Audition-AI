
import React, { useEffect, useState, useMemo } from 'react';
import { GeneratedImage, Language } from '../types';
import { getAllImagesFromStorage, deleteImageFromStorage, shareImageToShowcase, cleanupExpiredImages } from '../services/storageService';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';

interface GalleryProps {
  lang: Language;
}

export const Gallery: React.FC<GalleryProps> = ({ lang }) => {
  const { notify, confirm } = useNotification();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        try {
            // Auto-cleanup expired images on visit
            const deletedCount = await cleanupExpiredImages();
            if (deletedCount > 0) {
                console.log(`[Gallery] Auto-cleaned ${deletedCount} expired images.`);
            }
            await loadImages();
        } catch (e) {
            console.error("Gallery Init Error", e);
        } finally {
            setLoading(false);
        }
    };
    init();
    
    // Poll for updates if there are processing images
    const interval = setInterval(() => {
        loadImages(true); // silent load
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadImages = async (silent = false) => {
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
      if (!silent && storedImages.length > 0 && !selectedImage) {
          setSelectedImage(storedImages[0]);
      }
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
            setImages(prev => prev.filter(img => img.id !== id));
            if (selectedImage?.id === id) setSelectedImage(null);
            notify(lang === 'vi' ? 'Đã xóa ảnh.' : 'Image deleted.', 'info');
        }
    });
  };

  const handleShare = async () => {
      if (!selectedImage) return;
      setSharing(true);
      try {
          const newStatus = !selectedImage.isShared;
          const success = await shareImageToShowcase(selectedImage.id, newStatus);
          
          if (success) {
              const msg = newStatus 
                ? (lang === 'vi' ? 'Đã chia sẻ (Lưu vĩnh viễn)!' : 'Shared (Saved Forever)!')
                : (lang === 'vi' ? 'Đã gỡ (Sẽ bị xóa sau 1 ngày)!' : 'Unshared (Will expire)!');
              
              notify(msg, 'success');
              
              const updatedImg = { ...selectedImage, isShared: newStatus };
              setSelectedImage(updatedImg);
              setImages(prev => prev.map(img => img.id === updatedImg.id ? updatedImg : img));
          } else {
              notify(lang === 'vi' ? 'Có lỗi xảy ra.' : 'Error occurred.', 'error');
          }
      } catch (e) {
          console.error(e);
      } finally {
          setSharing(false);
      }
  };

  // --- ROBUST DOWNLOAD LOGIC (V3 - PROXY SUPPORTED) ---
  const handleDownload = async (imageUrl: string, filename: string) => {
      if (!imageUrl || imageUrl.startsWith('blob:')) return;
      notify(lang === 'vi' ? 'Đang xử lý tải xuống...' : 'Processing download...', 'info');
      
      try {
          let blob: Blob;

          // 1. Local Base64 Case
          if (imageUrl.startsWith('data:')) {
              const arr = imageUrl.split(',');
              const mime = arr[0].match(/:(.*?);/)?.[1];
              const bstr = atob(arr[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) u8arr[n] = bstr.charCodeAt(n);
              blob = new Blob([u8arr], { type: mime });
          } 
          // 2. Remote URL Case (Fetch & Blob)
          else {
              try {
                  // Attempt 1: Direct Fetch (Fastest)
                  const response = await fetch(imageUrl, { mode: 'cors' });
                  if (!response.ok) throw new Error('Direct fetch failed');
                  blob = await response.blob();
              } catch (directError) {
                  console.warn("Direct download failed (CORS), switching to Proxy...", directError);
                  // Attempt 2: WSRV.NL Proxy (Adds CORS headers)
                  try {
                      const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&output=png`;
                      const proxyResponse = await fetch(proxyUrl);
                      if (!proxyResponse.ok) throw new Error('Proxy download failed');
                      blob = await proxyResponse.blob();
                  } catch (proxyError) {
                      // Attempt 3: CorsProxy.io
                      const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
                      const proxyResponse2 = await fetch(proxyUrl2);
                      if (!proxyResponse2.ok) throw new Error('All proxies failed');
                      blob = await proxyResponse2.blob();
                  }
              }
          }

          // Create Object URL & Trigger Download
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          
          // Cleanup
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          notify(lang === 'vi' ? 'Đã lưu ảnh thành công!' : 'Download successful!', 'success');

      } catch (e) {
          console.error("Download failed completely", e);
          // Absolute last resort: Open in new tab so user doesn't lose the image
          window.open(imageUrl, '_blank');
          notify(lang === 'vi' ? 'Lỗi tải file. Đã mở ảnh trong tab mới.' : 'Download failed. Image opened in new tab.', 'warning');
      }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // --- EXPIRATION CALCULATION HELPERS ---
  const getExpirationStatus = (timestamp: number, isShared: boolean | undefined) => {
      if (isShared) return { type: 'saved', label: 'Vĩnh viễn', color: 'bg-green-500' };
      
      const EXPIRATION_DAYS = 1;
      const msPerDay = 1000 * 60 * 60 * 24;
      const diffTime = Math.abs(Date.now() - timestamp);
      const diffDays = Math.ceil(diffTime / msPerDay);
      const daysLeft = EXPIRATION_DAYS - diffDays; // Use diffDays which is approximate days passed.
      
      // More precise: 
      const expiryDate = timestamp + (EXPIRATION_DAYS * msPerDay);
      const timeLeft = expiryDate - Date.now();
      const preciseDaysLeft = Math.ceil(timeLeft / msPerDay);

      if (preciseDaysLeft <= 0) {
          return { type: 'expired', label: 'Sắp xóa', color: 'bg-red-500 animate-pulse' };
      }
      
      return { type: 'warning', label: `< 1 ngày`, color: 'bg-orange-500' };
  };

  const renderedImages = useMemo(() => {
      return images.map((img) => {
            const status = getExpirationStatus(img.timestamp, img.isShared);
            
            return (
                <div 
                  key={img.id} 
                  onClick={() => setSelectedImage(img)}
                  className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border shadow-sm hover:shadow-xl transition-all hover:scale-[1.02] ${
                      selectedImage?.id === img.id ? 'border-brand-500 ring-2 ring-brand-500/50' : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  {img.url ? (
                      <img 
                        src={img.url} 
                        alt={img.toolName} 
                        className={`w-full h-full object-cover ${img.status === 'failed' ? 'grayscale opacity-50' : ''}`} 
                        loading="lazy"
                      />
                  ) : (
                      <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center p-4 text-center">
                          {img.status === 'processing' && <Icons.Loader className="w-8 h-8 animate-spin text-blue-500 mb-2" />}
                          {img.status === 'queued' && <Icons.Clock className="w-8 h-8 text-yellow-500 mb-2" />}
                          {img.status === 'failed' && <Icons.AlertTriangle className="w-8 h-8 text-red-500 mb-2" />}
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              {img.status === 'processing' ? 'Đang xử lý...' : 
                               img.status === 'queued' ? 'Đang chờ...' : 
                               img.status === 'failed' ? 'Lỗi' : 'Đang tải...'}
                          </span>
                      </div>
                  )}
                  
                  {/* JOB STATUS BADGE */}
                  {img.status && img.status !== 'completed' && (
                      <div className={`absolute top-2 left-2 z-10 px-2 py-1 text-[10px] font-bold text-white rounded-md shadow-md flex items-center gap-1 ${
                          img.status === 'processing' ? 'bg-blue-500 animate-pulse' :
                          img.status === 'queued' ? 'bg-yellow-500' :
                          'bg-red-500'
                      }`}>
                          {img.status === 'processing' && 'ĐANG XỬ LÝ'}
                          {img.status === 'queued' && 'HÀNG CHỜ'}
                          {img.status === 'failed' && 'LỖI (ĐÃ HOÀN TIỀN)'}
                      </div>
                  )}

                  {/* EXPIRATION / SHARED BADGE */}
                  {(!img.status || img.status === 'completed') && (
                      <div className={`absolute top-2 right-2 z-10 px-2 py-1 text-[9px] font-bold text-white rounded-md shadow-md flex items-center gap-1 ${status.color}`}>
                          {status.type === 'saved' ? <Icons.Lock className="w-3 h-3" /> : <Icons.Clock className="w-3 h-3" />}
                          {status.label}
                      </div>
                  )}

                  {img.isShared && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-audi-pink text-white text-[9px] font-bold rounded-full shadow-lg border border-white/20">
                          SHARED
                      </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                    <span className="text-white text-xs font-bold truncate">{img.toolName}</span>
                    <span className="text-white/70 text-[10px]">{formatDate(img.timestamp)}</span>
                    <button 
                      onClick={(e) => handleDelete(e, img.id)}
                      className="absolute top-2 right-2 p-2 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                       <Icons.X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
            );
      });
  }, [images, lang, selectedImage]);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col animate-fade-in pb-6">
      
      {/* STORAGE POLICY WARNING BANNER */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 mb-4 shrink-0">
          <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
              <h4 className="text-sm font-bold text-red-400">LƯU Ý QUAN TRỌNG: Chính sách lưu trữ ảnh</h4>
              <p className="text-xs text-red-400/80 leading-relaxed">
                  Ảnh trong thư viện sẽ tự động bị xóa sau <b className="text-red-500">1 ngày</b> hoặc khi bạn tắt trình duyệt/ứng dụng. 
                  Vui lòng tải ảnh xuống máy tính ngay bây giờ để tránh mất dữ liệu!
              </p>
          </div>
      </div>

      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {lang === 'vi' ? 'Thư viện của tôi' : 'My Gallery'}
          </h2>
          <p className="text-sm text-slate-500">
            {lang === 'vi' 
              ? `Đã lưu ${images.length} tác phẩm` 
              : `${images.length} masterpieces saved`}
          </p>
        </div>
        <button 
          onClick={() => loadImages()}
          className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
        >
          <Icons.Zap className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* LEFT COLUMN: LIST */}
          <div className="w-full lg:w-1/2 xl:w-7/12 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
              {loading && images.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
              ) : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-10">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4 text-slate-400">
                    <Icons.Image className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-white">
                    {lang === 'vi' ? 'Chưa có ảnh nào' : 'No images yet'}
                  </h3>
                  <p className="text-slate-500 max-w-xs mt-2 text-sm">
                    {lang === 'vi' ? 'Hãy bắt đầu tạo ảnh với các công cụ AI!' : 'Start creating images with our AI tools!'}
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 custom-scrollbar content-start">
                  {renderedImages}
                </div>
              )}
          </div>

          {/* RIGHT COLUMN: DETAILS */}
          <div className="w-full lg:w-1/2 xl:w-5/12 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
              {selectedImage ? (
                  <div className="flex flex-col h-full">
                      {/* Image Preview Area */}
                      <div className="relative h-1/2 min-h-[300px] bg-slate-100 dark:bg-black flex items-center justify-center p-4 border-b border-slate-200 dark:border-white/10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
                          {selectedImage.url ? (
                              <img src={selectedImage.url} alt="Full view" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
                          ) : (
                              <div className="flex flex-col items-center justify-center text-slate-400">
                                  {selectedImage.status === 'processing' && <Icons.Loader className="w-12 h-12 animate-spin text-blue-500 mb-4" />}
                                  {selectedImage.status === 'queued' && <Icons.Clock className="w-12 h-12 text-yellow-500 mb-4" />}
                                  {selectedImage.status === 'failed' && <Icons.AlertTriangle className="w-12 h-12 text-red-500 mb-4" />}
                                  <p className="font-bold">
                                      {selectedImage.status === 'processing' ? 'Đang xử lý hình ảnh...' : 
                                       selectedImage.status === 'queued' ? 'Đang chờ tới lượt...' : 
                                       selectedImage.status === 'failed' ? 'Xử lý thất bại' : 'Đang tải...'}
                                  </p>
                                  {selectedImage.error && (
                                      <p className="text-red-400 text-xs mt-2 max-w-xs text-center">{selectedImage.error}</p>
                                  )}
                              </div>
                          )}
                      </div>
                      
                      {/* Details Area */}
                      <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
                         <div className="flex justify-between items-start mb-4">
                             <div>
                                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{selectedImage.toolName}</h3>
                                 <span className="text-xs text-brand-500 dark:text-brand-400 font-mono">{selectedImage.engine}</span>
                             </div>
                             <button 
                               onClick={(e) => handleDelete(e, selectedImage.id)}
                               className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded-xl transition-colors"
                             >
                                <Icons.Trash className="w-5 h-5" />
                             </button>
                         </div>
                         
                         {/* Expiration Info in Detail View */}
                         {(!selectedImage.status || selectedImage.status === 'completed') && !selectedImage.isShared && (
                             <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl mb-4 flex items-center gap-3 shrink-0">
                                 <Icons.Clock className="w-5 h-5 text-orange-500" />
                                 <div>
                                     <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Tự động xóa sau</p>
                                     <p className="text-orange-600 dark:text-orange-400 font-bold text-sm">
                                         {getExpirationStatus(selectedImage.timestamp, false).label} nữa
                                     </p>
                                 </div>
                             </div>
                         )}

                         {selectedImage.isShared && (
                             <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl mb-4 flex items-center gap-3 shrink-0">
                                 <Icons.Lock className="w-5 h-5 text-green-500" />
                                 <div>
                                     <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">Trạng thái</p>
                                     <p className="text-green-600 dark:text-green-400 font-bold text-sm">Đã lưu trữ vĩnh viễn</p>
                                 </div>
                             </div>
                         )}

                         <div className="space-y-4 flex-1">
                            <div>
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{lang === 'vi' ? 'Thời gian' : 'Date Created'}</label>
                                <p className="text-slate-700 dark:text-slate-300 text-sm">{formatDate(selectedImage.timestamp)}</p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{lang === 'vi' ? 'Prompt / Lệnh' : 'Prompt Used'}</label>
                                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg mt-1 border border-slate-200 dark:border-white/5">
                                    <p className="text-slate-700 dark:text-slate-300 text-sm italic leading-relaxed break-words">"{selectedImage.prompt}"</p>
                                </div>
                            </div>
                         </div>

                         <div className="pt-4 mt-4 border-t border-slate-200 dark:border-white/10 flex flex-col gap-3 shrink-0">
                            {(!selectedImage.status || selectedImage.status === 'completed') && (
                                <>
                                    <button 
                                        onClick={handleShare}
                                        disabled={sharing}
                                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
                                            selectedImage.isShared 
                                            ? 'bg-red-50 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/50 hover:bg-red-100 dark:hover:bg-red-500 hover:text-red-700 dark:hover:text-white' 
                                            : 'bg-gradient-to-r from-audi-pink to-audi-purple text-white hover:shadow-md hover:scale-[1.02]'
                                        }`}
                                    >
                                        {sharing ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Share className="w-4 h-4" />}
                                        {selectedImage.isShared 
                                            ? (lang === 'vi' ? 'Gỡ khỏi Trang chủ' : 'Unshare') 
                                            : (lang === 'vi' ? 'Chia sẻ lên Trang chủ (Lưu)' : 'Share to Homepage')
                                        }
                                    </button>

                                    <button 
                                      onClick={() => handleDownload(selectedImage.url, `auditionai-image-${selectedImage.id}.png`)}
                                      className="w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-brand-500 dark:hover:bg-brand-500 text-slate-700 dark:text-white hover:text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-slate-200 dark:border-white/5"
                                    >
                                        <Icons.Download className="w-4 h-4" />
                                        {lang === 'vi' ? 'Tải ảnh về máy' : 'Download Image'}
                                    </button>
                                </>
                            )}
                         </div>
                      </div>
                  </div>
              ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-10 text-slate-400">
                      <Icons.Image className="w-16 h-16 mb-4 opacity-50" />
                      <p>{lang === 'vi' ? 'Chọn một ảnh để xem chi tiết' : 'Select an image to view details'}</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
