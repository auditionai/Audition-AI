import React from 'react';
import Modal from '../common/Modal';

interface ProcessedImage {
    processedUrl: string;
}

interface ProcessedImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: ProcessedImage | null;
  onUse: () => void;
  onDownload: () => void;
}

const ProcessedImageModal: React.FC<ProcessedImageModalProps> = ({ isOpen, onClose, image, onUse, onDownload }) => {
  if (!isOpen || !image) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Xem ảnh đã tách nền">
      <div className="flex flex-col items-center">
        <div className="w-full max-w-md bg-black/30 rounded-lg p-2 mb-6">
            <img 
                src={image.processedUrl} 
                alt="Processed result"
                className="w-full h-auto object-contain rounded-md max-h-[60vh]"
            />
        </div>
        <div className="w-full flex flex-col sm:flex-row gap-4">
          <button
            onClick={onDownload}
            className="flex-1 py-3 font-bold text-white bg-green-500/80 hover:bg-green-600 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <i className="ph-fill ph-download-simple text-xl"></i>
            Tải xuống
          </button>
          <button
            onClick={onUse}
            className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <i className="ph-fill ph-magic-wand text-xl"></i>
            Sử dụng
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProcessedImageModal;
