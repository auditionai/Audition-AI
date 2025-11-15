// FIX: Create the content for the common InstructionModal component.
import React from 'react';
import Modal from './Modal';
import { useTranslation } from '../../hooks/useTranslation';

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const steps = t('modals.instruction.quickSteps');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modals.instruction.quickTitle')}>
      <div className="space-y-4">
        {steps.map((step: any, index: number) => (
          <div key={index} className="flex items-start gap-4 p-3 bg-skin-fill-secondary rounded-lg">
            <div className="flex-shrink-0 bg-skin-accent/10 text-skin-accent w-10 h-10 flex items-center justify-center rounded-full">
              <i className={`ph-fill ${step.icon} text-xl`}></i>
            </div>
            <div>
              <h4 className="font-bold text-skin-base">{step.title}</h4>
              <p className="text-sm text-skin-muted">{step.description}</p>
            </div>
          </div>
        ))}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 font-bold themed-button-primary"
        >
          {t('modals.instruction.understand')}
        </button>
      </div>
    </Modal>
  );
};

export default InstructionModal;