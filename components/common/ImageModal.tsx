import React, { useState } from 'react';
import { GalleryImage } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { getRankForLevel } from '../../utils/rankUtils';
import { useTranslation } from '../../hooks/useTranslation';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: GalleryImage | null;
  showInfoPanel?: boolean;
  onShare?: (image: GalleryImage) => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, image, showInfoPanel = true, onShare }) => {
  const { showToast } = useAuth();
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !image) return null;

  const handleCopyPrompt = () => {
    if (!image.prompt) return;
    navigator.clipboard.writeText(image.prompt);
    showToast(t('modals.image.copied'), 'success');
    setIsCopied(true);
    setTimeout(() => {
        setIsCopied(false);
    }, 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!image?.image_url) return;

    const downloadUrl = `/.netlify/functions/download-image?url=${encodeURIComponent(image.image_url)}`;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadUrl;
    a.download = `audition-ai-${image.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  
  const rank = image.creator ? getRankForLevel(image.creator.level) : getRankForLevel(1);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-lg flex justify-center items-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative bg-[#12121A] border border-pink-500/20 rounded-2xl shadow-lg w-full max-w-4xl h-auto max-h-[85vh] lg:h-[700px] lg:max-h-none flex flex-col lg:flex-row overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image Container */}
        <div className="relative flex-1 bg-black/50 flex items-center justify-center p-2 lg:p-4 overflow-hidden">
            <img 
                src={image.image_url} 
                alt={image.title || 'Gallery Image'}
                className="w-auto h-auto max-w-full max-h-full object-contain"
            />
        </div>
        
        {/* Info & Actions Panel */}
        <div className="w-full lg:w-80 flex-shrink-0 bg-[#1e1b25]/50 flex flex-col text-white">
            <div className="flex-grow p-4 overflow-y-auto custom-scrollbar space-y-4">
                {/* Conditionally show Creator info */}
                {showInfoPanel && image.creator && (
                    <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                        <img src={image.creator.photo_url} alt={image.creator.display_name} className="w-12 h-12 rounded-full" />
                        <div>
                            <p className={`font-bold ${rank.color} neon-text-glow`}>{image.creator.display_name}</p>
                            <p className={`text-xs font-semibold flex items-center gap-1.5 ${rank.color}`}>{rank.icon} {rank.title}</p>
                        </div>
                    </div>
                )}
                
                {/* Always show Prompt */}
                <div>
                    <h4 className="font-semibold text-pink-400 mb-2 flex items-center gap-2">
                        <i className="ph-fill ph-quotes"></i>
                        {t('modals.image.prompt')}
                    </h4>
                    <p className="text-sm text-gray-300 italic bg-white/5 p-3 rounded-md max-h-40 overflow-y-auto custom-scrollbar">
                        "{image.prompt}"
                    </p>
                </div>
            </div>

            {/* Actions at the bottom of the panel */}
            <div className="p-4 border-t border-white/10 space-y-2">
                 <button
                    onClick={handleCopyPrompt}
                    className={`w-full px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 ${isCopied ? 'bg-green-500/20 text-green-300' : 'bg-pink-500/20 text-pink-300 hover:bg-pink-500/30'}`}
                >
                    <i className={`ph-fill ${isCopied ? 'ph-check-circle' : 'ph-copy'}`}></i>
                    {isCopied ? t('modals.image.copied') : t('modals.image.copy')}
                </button>
                <button 
                    onClick={handleDownload}
                    className="w-full px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                >
                    <i className="ph-fill ph-download-simple"></i>
                    <span>{t('modals.image.download')}</span>
                </button>
                 
                 {/* Share button for "My Creations" */}
                 {onShare && !image.is_public && (
                     <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onShare(image);
                        }}
                        className="w-full px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 bg-green-500/20 text-green-300 hover:bg-green-500/30"
                    >
                        <i className="ph-fill ph-share-network"></i>
                        {t('modals.image.share')}
                    </button>
                 )}
                 {onShare && image.is_public && (
                    <div className="text-center text-xs font-semibold text-green-400 bg-green-500/10 py-2 rounded-lg">
                        {t('modals.image.shared')}
                    </div>
                 )}
            </div>
        </div>
      </div>
       <button onClick={onClose} className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-2 hover:bg-pink-500/80 transition-all z-[60]">
            <i className="ph-fill ph-x text-2xl"></i>
        </button>
    </div>
  );
};

export default ImageModal;
