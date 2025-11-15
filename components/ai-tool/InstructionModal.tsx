import React from 'react';
import Modal from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face' | 'bg-remover' | 'signature' | 'group-studio' | null;

interface InstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructionKey: InstructionKey;
}

const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose, instructionKey }) => {
  const { t } = useTranslation();

  if (!isOpen || !instructionKey) return null;

  const content = {
    'character': (
      <>
        <p>{t('modals.instruction.character.p1')}</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>{t('modals.instruction.character.li1_strong')}</strong>{t('modals.instruction.character.li1_text')}</li>
          <li><strong>{t('modals.instruction.character.li2_strong')}</strong>{t('modals.instruction.character.li2_text')}</li>
          <li><strong>{t('modals.instruction.character.li3_strong')}</strong>{t('modals.instruction.character.li3_text')}</li>
        </ul>
        <p className="font-bold mt-4">{t('modals.instruction.character.tip')}</p>
        <p>{t('modals.instruction.character.tip_text')}</p>
      </>
    ),
    'face': (
      <>
        <p>{t('modals.instruction.face.p1')}</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>{t('modals.instruction.face.li1')}</li>
          <li>{t('modals.instruction.face.li2')}</li>
          <li>{t('modals.instruction.face.li3')}</li>
        </ul>
        <p className="font-bold mt-4">{t('modals.instruction.face.note')}</p>
        <p>{t('modals.instruction.face.note_text')}</p>
      </>
    ),
    'style': (
       <>
        <p>{t('modals.instruction.style.p1')}</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>{t('modals.instruction.style.li1_strong')}</strong>{t('modals.instruction.style.li1_text')}</li>
          <li><strong>{t('modals.instruction.style.li2_strong')}</strong>{t('modals.instruction.style.li2_text')}</li>
          <li><strong>{t('modals.instruction.style.li3_strong')}</strong>{t('modals.instruction.style.li3_text')}</li>
          <li><strong>{t('modals.instruction.style.li4_strong')}</strong>{t('modals.instruction.style.li4_text')}</li>
        </ul>
        <p className="font-bold mt-4">{t('modals.instruction.style.tip')}</p>
        <p>{t('modals.instruction.style.tip_text')}</p>
      </>
    ),
    'prompt': (
      <>
        <p>{t('modals.instruction.prompt.p1')}</p>
        <p className="font-bold mt-4">{t('modals.instruction.prompt.formula')}</p>
        <p className="italic bg-skin-fill-secondary p-2 rounded-md mt-2 text-sm">{t('modals.instruction.prompt.formula_text')}</p>
        <p className="font-bold mt-4">{t('modals.instruction.prompt.example')}</p>
        <p className="italic bg-skin-fill-secondary p-2 rounded-md mt-2 text-sm">"{t('modals.instruction.prompt.example_text')}"</p>
        <p className="mt-2">{t('modals.instruction.prompt.p2')}</p>
      </>
    ),
    'advanced': (
      <>
        <ul className="space-y-3">
          <li><strong>{t('modals.instruction.advanced.li1_strong')}</strong>{t('modals.instruction.advanced.li1_text')}</li>
          <li><strong>{t('modals.instruction.advanced.li2_strong')}</strong>{t('modals.instruction.advanced.li2_text')}</li>
          <li><strong>{t('modals.instruction.advanced.li3_strong')}</strong>{t('modals.instruction.advanced.li3_text')}</li>
          <li><strong>{t('modals.instruction.advanced.li4_strong')}</strong>{t('modals.instruction.advanced.li4_text')}</li>
          <li><strong>{t('modals.instruction.advanced.li5_strong')}</strong>{t('modals.instruction.advanced.li5_text')}</li>
        </ul>
      </>
    ),
    'bg-remover': (
       <>
        <p>{t('modals.instruction.bg-remover.p1')}</p>
        <p className="font-bold mt-2"><span className="text-pink-400">{t('modals.instruction.bg-remover.cost')}</span></p>
        <p className="font-bold mt-4">{t('modals.instruction.bg-remover.steps_title')}</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
            <li>{t('modals.instruction.bg-remover.step1')}</li>
            <li>{t('modals.instruction.bg-remover.step2')}</li>
            <li>{t('modals.instruction.bg-remover.step3')}</li>
            <li>{t('modals.instruction.bg-remover.step4')}</li>
        </ol>
        <ul className="list-disc list-inside pl-8 space-y-1 mt-1">
            <li>{t('modals.instruction.bg-remover.option1')}</li>
            <li>{t('modals.instruction.bg-remover.option2')}</li>
            <li>{t('modals.instruction.bg-remover.option3')}</li>
        </ul>
      </>
    ),
    'signature': (
       <>
        <p>{t('modals.instruction.signature.p1')}</p>
        <p className="font-bold mt-4">{t('modals.instruction.signature.modes_title')}</p>
         <ul className="list-disc list-inside space-y-2 mt-2">
            <li>{t('modals.instruction.signature.mode1')}</li>
            <li>{t('modals.instruction.signature.mode2')}</li>
        </ul>
        <p className="font-bold mt-4">{t('modals.instruction.signature.steps_title')}</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
            <li>{t('modals.instruction.signature.step1')}</li>
            <li>{t('modals.instruction.signature.step2')}</li>
            <li>{t('modals.instruction.signature.step3')}</li>
            <li>{t('modals.instruction.signature.step4')}</li>
            <li>{t('modals.instruction.signature.step5')}</li>
        </ol>
      </>
    ),
    'group-studio': (
       <>
        <p>{t('modals.instruction.group-studio.p1')}</p>
        <p className="font-bold mt-4">{t('modals.instruction.group-studio.steps_title')}</p>
        <ol className="list-decimal list-inside space-y-2 mt-2">
          <li>{t('modals.instruction.group-studio.step1')}</li>
          <li>{t('modals.instruction.group-studio.step2')}</li>
          <li>{t('modals.instruction.group-studio.step3')}</li>
          <li>{t('modals.instruction.group-studio.step4')}</li>
          <li>{t('modals.instruction.group-studio.step5')}</li>
        </ol>
        <p className="font-bold mt-4">{t('modals.instruction.group-studio.note')}</p>
        <p>{t('modals.instruction.group-studio.note_text')}</p>
      </>
    ),
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(`modals.instruction.${instructionKey}.title`)}>
      <div className="text-sm text-skin-muted space-y-3 custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
        {content[instructionKey]}
      </div>
      <button
          onClick={onClose}
          className="w-full mt-6 py-2.5 font-bold themed-button-primary"
      >
          {t('modals.instruction.understand')}
      </button>
    </Modal>
  );
};

export default InstructionModal;