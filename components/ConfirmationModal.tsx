// FIX: Create the content for the ConfirmationModal component.
import React from 'react';
import Modal from './common/Modal';
import { useTranslation } from '../hooks/useTranslation';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  cost: number;
  isLoading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  cost,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const title = cost > 0 ? t('modals.confirmation.titleCost') : t('modals.confirmation.titleNoCost');
  
  let description;
  if (cost > 0) {
    description = t('modals.confirmation.descCost', { cost: cost.toLocaleString() });
  } else {
    description = t('modals.confirmation.descNoCost');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-500/10 mb-4">
          <i className="ph-fill ph-warning-circle text-3xl text-yellow-400"></i>
        </div>
        <p className="text-skin-muted mb-6">{description}</p>
        <div className="flex justify-center gap-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition disabled:opacity-50"
          >
            {t('modals.confirmation.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-6 py-2 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
                <>
                    <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                    <span>{t('modals.confirmation.processing')}</span>
                </>
            ) : (
              t('modals.confirmation.confirm')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
