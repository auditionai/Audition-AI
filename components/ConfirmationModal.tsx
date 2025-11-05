import React from 'react';
import Modal from './common/Modal';
import { DiamondIcon } from './common/DiamondIcon';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  cost: number;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, cost }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Xác nhận thao tác">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-pink-500/10 mb-4">
          <DiamondIcon className="h-8 w-8 text-pink-400" />
        </div>
        <p className="text-lg text-gray-300 mb-2">
          Thao tác này sẽ tốn
        </p>
        <p className="text-3xl font-bold mb-6 flex items-center justify-center gap-2">
           {cost} <span className="text-pink-400">Kim cương</span>
        </p>

        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
