
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
                ? (lang === 'vi' ? 'Đã chia sẻ lên Trang chủ!' : 'Shared to Homepage!')
                : (lang === 'vi' ? 'Đã gỡ khỏi Trang chủ!' : 'Removed from Homepage!');
              
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

  const handleDownload = async (imageUrl: string, filename: string) => {
      try {
          // Attempt Direct Fetch (Works if Same Origin or CORS enabled)
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error("Fetch failed");
          
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          notify(lang === 'vi' ? 'Đã tải ảnh xuống!' : 'Image downloaded!', 'success');
      } catch (error) {
          // If Direct Fetch fails (CORS), just open in new tab.
          // We removed the Canvas proxy because it throws a second red error in console if CORS is blocked.
          window.open(imageUrl, '_blank');
          notify(lang === 'vi' ? 'Đã mở ảnh trong tab mới (Server chặn tải)' : 'Opened in new tab (Server blocked download)', 'info');
      }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const renderedImages = useMemo(() => {
      return images.map((img) => (
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
                // Removed crossOrigin="anonymous" to fix broken thumbnail display
              />
              {img.isShared && (
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-audi-pink text-white text-[9px] font-bold rounded-full shadow-lg">
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
          ));
  }, [images, lang]);

  return (
    <div className="space-y-6 animate-fade-in pb-20">
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
                            : (lang === 'vi' ? 'Chia sẻ lên Trang chủ' : 'Share to Homepage')
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
