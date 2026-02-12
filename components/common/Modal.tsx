// FIX: Create the content for the common Modal component.
import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[1000] p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-skin-fill-modal border border-skin-border rounded-2xl shadow-lg w-full max-w-lg animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-skin-border">
          <h2 className="text-xl font-bold text-skin-base">{title}</h2>
          <button onClick={onClose} className="text-skin-muted hover:text-skin-base transition-colors">
            <i className="ph-fill ph-x text-2xl"></i>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
