import React, { useState } from 'react';
import { GalleryImage } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { getRankForLevel } from '../../utils/rankUtils';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: GalleryImage | null;
  showInfoPanel?: boolean;
  onShare?: (image: GalleryImage) => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, image, showInfoPanel = true, onShare }) => {
  const { showToast } = useAuth();
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !image) return null;

  const handleCopyPrompt = () => {
    if (!image.prompt) return;
    navigator.clipboard.writeText(image.prompt);
    showToast('Đã sao chép prompt!', 'success');
    setIsCopied(true);
    setTimeout(() => {
        setIsCopied(false);
    }, 2000);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent modal from closing if the button is inside
    if (!image?.image_url) return;
    try {
        const response = await fetch(image.image_url);
        if (!response.ok) throw new Error('Network response was not ok.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `audition-ai-${image.id}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error('Download error:', error);
        showToast('Tải ảnh xuống thất bại.', 'error');
    }
  };
  
  const rank = image.creator ? getRankForLevel(image.creator.level) : getRankForLevel(1);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-lg flex justify-center items-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-auto max-w-6xl max-h-[95vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full h-full flex flex-col lg:flex-row gap-4">
            <div className="relative flex-grow flex items-center justify-center bg-black/50 rounded-lg overflow-hidden min-h-[300px]">
                <img 
                    src={image.image_url} 
                    alt={image.title || 'Gallery Image'}
                    className="max-w-full max-h-[95vh] object-contain animate-fade-in-up"
                    style={{ animationDelay: '100ms'}}
                />
            </div>
            
            {showInfoPanel && (
                <div 
                    className="w-full lg:w-80 flex-shrink-0 bg-[#12121A]/80 border border-pink-500/20 rounded-lg p-4 flex flex-col text-white animate-fade-in-up"
                    style={{ animationDelay: '200ms'}}
                >
                    {image.title && <h3 className="text-xl font-bold text-white mb-3 pb-3 border-b border-white/10">{image.title}</h3>}
                    {image.creator && (
                        <div className="flex items-center gap-3">
                            <img src={image.creator.photo_url} alt={image.creator.display_name} className="w-12 h-12 rounded-full" />
                            <div>
                                <p className={`font-bold ${rank.color} neon-text-glow`}>{image.creator.display_name}</p>
                                <p className={`text-xs font-semibold flex items-center gap-1.5 ${rank.color}`}>{rank.icon} {rank.title}</p>
                            </div>
                        </div>
                    )}
                    <div className="mt-4 flex-grow overflow-y-auto custom-scrollbar flex flex-col">
                        <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-2">
                            <i className="ph-fill ph-quotes"></i>
                            Câu lệnh (Prompt)
                        </h4>
                        <p className="text-sm text-gray-300 italic bg-white/5 p-3 rounded-md flex-grow">
                            "{image.prompt}"
                        </p>
                        <div className="mt-auto pt-3">
                            <button
                                onClick={handleCopyPrompt}
                                className={`w-full px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${isCopied ? 'bg-green-500/20 text-green-300' : 'bg-pink-500/20 text-pink-300 hover:bg-pink-500/30'}`}
                            >
                                <i className={`ph-fill ${isCopied ? 'ph-check-circle' : 'ph-copy'}`}></i>
                                {isCopied ? 'Đã sao chép!' : 'Sao chép Prompt'}
                            </button>
                            <button 
                                onClick={handleDownload}
                                className="w-full mt-2 px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 bg-green-500/20 text-green-300 hover:bg-green-500/30"
                            >
                                <i className="ph-fill ph-download-simple"></i>
                                <span>Tải xuống</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {onShare && (
            <div className="w-full mt-4 flex items-center justify-center gap-4 animate-fade-in">
                {!image.is_public && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onShare(image);
                        }}
                        className="bg-pink-500 text-white rounded-full py-3 px-6 hover:bg-pink-600 transition-colors z-10 font-bold flex items-center gap-2 text-lg"
                    >
                        <i className="ph-fill ph-share-network"></i>
                        Chia sẻ
                    </button>
                )}
                <button 
                    onClick={handleDownload}
                    className="bg-green-500 text-white rounded-full py-3 px-6 hover:bg-green-600 transition-colors z-10 font-bold flex items-center gap-2 text-lg"
                >
                    <i className="ph-fill ph-download-simple"></i>
                    Tải xuống
                </button>
            </div>
        )}

      </div>
       <button onClick={onClose} className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-2 hover:bg-pink-500/80 transition-all z-[60]">
            <i className="ph-fill ph-x text-2xl"></i>
        </button>
    </div>
  );
};

export default ImageModal;
