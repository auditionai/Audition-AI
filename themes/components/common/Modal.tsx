
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="relative bg-[#12121A] border border-pink-500/30 rounded-2xl shadow-lg shadow-pink-500/20 w-full max-w-md max-h-[90vh] overflow-y-auto p-6 text-white animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <i className="ph-fill ph-x text-2xl"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
