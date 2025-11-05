import React, { useState } from 'react';
// Fix: Add .ts extension to module import.
import { GalleryImage } from '../../types.ts';
// Fix: Import `useAuth` from `AuthContext` to get context functionality.
import { useAuth } from '../../contexts/AuthContext.tsx';
import { getRankForLevel } from '../../utils/rankUtils.ts';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: GalleryImage | null;
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, image }) => {
  // Fix: Use `useAuth` instead of `useAppContext`.
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
  
  const rank = getRankForLevel(image.creator.level);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-lg flex justify-center items-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col lg:flex-row gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image Display */}
        <div className="flex-grow flex items-center justify-center bg-black/50 rounded-lg overflow-hidden">
            <img 
                // Fix: Use `image_url` and `title` from the updated type.
                src={image.image_url} 
                alt={image.title || 'Gallery Image'}
                className="max-w-full max-h-[90vh] object-contain animate-fade-in-up"
                style={{ animationDelay: '100ms'}}
            />
        </div>

        {/* Info Panel */}
        <div 
            className="w-full lg:w-80 flex-shrink-0 bg-[#12121A]/80 border border-pink-500/20 rounded-lg p-4 flex flex-col text-white animate-fade-in-up"
            style={{ animationDelay: '200ms'}}
        >
             <h3 className="text-xl font-bold text-white mb-3 pb-3 border-b border-white/10">{image.title}</h3>
            <div className="flex items-center gap-3">
                {/* Fix: Use `photo_url` and `display_name`. */}
                <img src={image.creator.photo_url} alt={image.creator.display_name} className="w-12 h-12 rounded-full" />
                <div>
                    <p className={`font-bold ${rank.color} neon-text-glow`}>{image.creator.display_name}</p>
                    <p className={`text-xs font-semibold flex items-center gap-1.5 ${rank.color}`}>{rank.icon} {rank.title}</p>
                </div>
            </div>
            <div className="mt-4 flex-grow overflow-y-auto custom-scrollbar flex flex-col">
                <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-2">
                    <i className="ph-fill ph-quotes"></i>
                    Câu lệnh (Prompt)
                </h4>
                <p className="text-sm text-gray-300 italic bg-white/5 p-3 rounded-md flex-grow">
                    "{image.prompt}"
                </p>
                <button
                    onClick={handleCopyPrompt}
                    className={`w-full mt-3 px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${isCopied ? 'bg-green-500/20 text-green-300' : 'bg-pink-500/20 text-pink-300 hover:bg-pink-500/30'}`}
                >
                    <i className={`ph-fill ${isCopied ? 'ph-check-circle' : 'ph-copy'}`}></i>
                    {isCopied ? 'Đã sao chép!' : 'Sao chép Prompt'}
                </button>
            </div>
        </div>
      </div>

       <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl hover:text-pink-400 transition-colors z-10">
            <i className="ph-fill ph-x-circle"></i>
        </button>
    </div>
  );
};

export default ImageModal;