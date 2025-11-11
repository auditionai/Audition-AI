
import React from 'react';
import Modal from './common/Modal';

interface LoadingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoadingModal: React.FC<LoadingModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Đang xử lý...">
      <div className="text-center py-8">
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
        <p className="text-lg text-gray-300 font-semibold animate-pulse">
          Đang xử lý bằng Gemini (demo)...
        </p>
        <p className="text-sm text-gray-500 mt-2">
            Vui lòng chờ trong giây lát.
        </p>
      </div>
    </Modal>
  );
};

export default LoadingModal;
