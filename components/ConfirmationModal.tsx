import React from 'react';
import Modal from './common/Modal.tsx';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isConfirming?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  isConfirming = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="py-4">
        <p className="text-gray-300 text-center">{message}</p>
        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="px-6 py-2 font-semibold text-gray-300 bg-white/10 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-6 py-2 font-bold text-white bg-red-600/90 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isConfirming && <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>}
            {isConfirming ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
