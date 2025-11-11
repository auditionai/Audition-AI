import React from 'react';
import Modal from './Modal';
import { GalleryImage } from '../../types';
import { getRankForLevel } from '../../utils/rankUtils';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: GalleryImage | null;
  showInfoPanel?: boolean; // New prop to control info panel visibility
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, image, showInfoPanel = true }) => {
  if (!isOpen || !image) return null;

  const rank = getRankForLevel(image.creator.level);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={image.title || 'Chi tiết tác phẩm'}>
      <div className="flex flex-col md:flex-row gap-6 max-h-[80vh]">
        <div className="flex-shrink-0 md:w-2/3 flex items-center justify-center bg-black/20 rounded-lg">
          <img src={image.image_url} alt={image.prompt} className="max-w-full max-h-[75vh] object-contain rounded-md" />
        </div>
        {showInfoPanel && (
            <div className="flex-grow md:w-1/3 space-y-4 overflow-y-auto custom-scrollbar pr-2">
            <div className="flex items-center gap-3">
              <img src={image.creator.photo_url} alt={image.creator.display_name} className="w-12 h-12 rounded-full border-2 border-white/80" />
              <div>
                <p className={`font-bold text-lg drop-shadow-lg ${rank.color} neon-text-glow`}>{image.creator.display_name}</p>
                <p className={`text-gray-300 text-sm drop-shadow flex items-center gap-1 ${rank.color}`}>{rank.icon} {rank.title}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-pink-300">Prompt</h4>
              <p className="text-sm text-gray-300 bg-white/5 p-2 rounded-md mt-1">{image.prompt}</p>
            </div>
            
             <div>
              <h4 className="font-semibold text-cyan-300">Model đã dùng</h4>
              <p className="text-sm text-gray-300 bg-white/5 p-2 rounded-md mt-1">{image.model_used}</p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-400">Ngày tạo</h4>
              <p className="text-sm text-gray-300 bg-white/5 p-2 rounded-md mt-1">{new Date(image.created_at).toLocaleString('vi-VN')}</p>
            </div>

            <div className="pt-4 border-t border-gray-700">
              <button
                onClick={onClose}
                className="w-full py-3 font-bold text-white bg-white/10 rounded-lg hover:bg-white/20 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImageModal;
