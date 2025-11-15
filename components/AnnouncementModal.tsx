import React from 'react';
import Modal from './common/Modal';
import { Announcement } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcement: Announcement | null;
}

const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ isOpen, onClose, announcement }) => {
  const { t } = useTranslation();
  if (!isOpen || !announcement) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={announcement.title}>
      <div className="text-center py-4">
         <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-pink-500/10 mb-4">
            <i className="ph-fill ph-sparkle text-4xl text-pink-400"></i>
        </div>
        <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
            {announcement.content}
        </p>

        <button
            onClick={onClose}
            className="mt-8 w-full py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition"
        >
            {t('modals.announcement.button')}
        </button>
      </div>
    </Modal>
  );
};

export default AnnouncementModal;
