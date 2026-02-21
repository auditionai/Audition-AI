
import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GeneratedImage, Language } from '../types';
import { getAllImagesFromStorage, deleteImageFromStorage, shareImageToShowcase } from '../services/storageService';
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
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      const storedImages = await getAllImagesFromStorage();
      setImages(storedImages);
    } catch (error) {
      console.error("Failed to load gallery", error);
    } finally {
      setLoading(false);
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
                : (lang === 'vi' ? 'Đã gỡ (Sẽ bị xóa sau 7 ngày)!' : 'Unshared (Will expire)!');
              
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
      
      const EXPIRATION_DAYS = 7;
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
      
      if (preciseDaysLeft <= 2) {
          return { type: 'warning', label: `${preciseDaysLeft} ngày`, color: 'bg-orange-500' };
      }

      return { type: 'normal', label: `${preciseDaysLeft} ngày`, color: 'bg-slate-600' };
  };

  const renderedImages = useMemo(() => {
      return images.map((img) => {
            const status = getExpirationStatus(img.timestamp, img.isShared);
            
            return (
                <div 
                  key={img.id} 
                  onClick={() => setSelectedImage(img)}
                  className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border border-slate-200 dark:border-white/10 shadow-sm hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  <img 
                    src={img.url} 
                    alt={img.toolName} 
                    className="w-full h-full object-cover" 
                    loading="lazy"
                  />
                  
                  {/* EXPIRATION / SHARED BADGE */}
                  <div className={`absolute top-2 right-2 z-10 px-2 py-1 text-[9px] font-bold text-white rounded-md shadow-md flex items-center gap-1 ${status.color}`}>
                      {status.type === 'saved' ? <Icons.Lock className="w-3 h-3" /> : <Icons.Clock className="w-3 h-3" />}
                      {status.label}
                  </div>

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
  }, [images, lang]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      
      {/* STORAGE POLICY WARNING BANNER */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <Icons.Info className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Chính sách lưu trữ ảnh</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                  Ảnh trong thư viện sẽ tự động bị xóa sau <b className="text-yellow-500">7 ngày</b> để tối ưu bộ nhớ hệ thống. 
                  Vui lòng tải ảnh về máy để lưu trữ.
              </p>
          </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
            {lang === 'vi' ? 'Thư viện của tôi' : 'My Gallery'}
          </h2>
          <p className="text-slate-500">
            {lang === 'vi' 
              ? `Đã lưu ${images.length} tác phẩm` 
              : `${images.length} masterpieces saved`}
          </p>
        </div>
        <button 
          onClick={loadImages}
          className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
        >
          <Icons.Zap className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center glass-panel rounded-3xl p-10">
          <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4 text-slate-400">
            <Icons.Image className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-white">
            {lang === 'vi' ? 'Chưa có ảnh nào' : 'No images yet'}
          </h3>
          <p className="text-slate-500 max-w-xs mt-2">
            {lang === 'vi' ? 'Hãy bắt đầu tạo ảnh với các công cụ AI!' : 'Start creating images with our AI tools!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {renderedImages}
        </div>
      )}

      {selectedImage && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
           <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row bg-slate-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
              
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-white/20"
              >
                <Icons.X className="w-6 h-6" />
              </button>

              <div className="flex-1 bg-black flex items-center justify-center p-4 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
                <img src={selectedImage.url} alt="Full view" className="max-w-full max-h-[80vh] object-contain shadow-2xl" />
              </div>
              
              <div className="w-full md:w-80 bg-slate-800 p-6 flex flex-col border-l border-white/10 overflow-y-auto">
                 <h3 className="text-xl font-bold text-white mb-1">{selectedImage.toolName}</h3>
                 <span className="text-xs text-brand-400 font-mono mb-6">{selectedImage.engine}</span>
                 
                 {/* Expiration Info in Detail View */}
                 {!selectedImage.isShared && (
                     <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl mb-4 flex items-center gap-3">
                         <Icons.Clock className="w-5 h-5 text-orange-500" />
                         <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Tự động xóa sau</p>
                             <p className="text-orange-400 font-bold">
                                 {getExpirationStatus(selectedImage.timestamp, false).label} nữa
                             </p>
                         </div>
                     </div>
                 )}

                 {selectedImage.isShared && (
                     <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl mb-4 flex items-center gap-3">
                         <Icons.Lock className="w-5 h-5 text-green-500" />
                         <div>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">Trạng thái</p>
                             <p className="text-green-400 font-bold">Đã lưu trữ vĩnh viễn</p>
                         </div>
                     </div>
                 )}

                 <div className="space-y-4 flex-1">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lang === 'vi' ? 'Thời gian' : 'Date Created'}</label>
                        <p className="text-slate-300 text-sm">{formatDate(selectedImage.timestamp)}</p>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lang === 'vi' ? 'Prompt / Lệnh' : 'Prompt Used'}</label>
                        <div className="p-3 bg-slate-900/50 rounded-lg mt-1 border border-white/5">
                            <p className="text-slate-300 text-sm italic leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">"{selectedImage.prompt}"</p>
                        </div>
                    </div>
                 </div>

                 <div className="pt-6 mt-6 border-t border-white/10 flex flex-col gap-3">
                    
                    <button 
                        onClick={handleShare}
                        disabled={sharing}
                        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                            selectedImage.isShared 
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500 hover:text-white' 
                            : 'bg-gradient-to-r from-audi-pink to-audi-purple text-white hover:scale-105'
                        }`}
                    >
                        {sharing ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Share className="w-4 h-4" />}
                        {selectedImage.isShared 
                            ? (lang === 'vi' ? 'Gỡ khỏi Trang chủ' : 'Unshare') 
                            : (lang === 'vi' ? 'Chia sẻ lên Trang chủ (Lưu)' : 'Share to Homepage')
                        }
                    </button>

                    <div className="flex gap-3">
                        <button 
                          onClick={() => handleDownload(selectedImage.url, `auditionai-image-${selectedImage.id}.png`)}
                          className="flex-1 py-3 bg-slate-700 hover:bg-brand-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-white/5"
                        >
                            <Icons.Download className="w-4 h-4" />
                            {lang === 'vi' ? 'Tải về' : 'Download'}
                        </button>
                        <button 
                           onClick={(e) => handleDelete(e, selectedImage.id)}
                           className="p-3 bg-slate-700 hover:bg-red-500/20 hover:text-red-500 text-slate-300 rounded-xl transition-colors border border-white/5"
                        >
                           <Icons.Trash className="w-5 h-5" />
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
