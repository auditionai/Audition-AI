import React from 'react';
import Modal from '../common/Modal';
import { DETAILED_AI_MODELS } from '../../constants/aiToolData';
import { useTranslation } from '../../hooks/useTranslation';

interface ModelSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedModelId: string;
    onSelectModel: (id: string) => void;
    characterImage: boolean;
}

const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({ isOpen, onClose, selectedModelId, onSelectModel, characterImage }) => {
    const { t } = useTranslation();
    const tagColorClasses: { [key: string]: string } = {
        red: 'bg-red-500/20 text-red-300',
        blue: 'bg-blue-500/20 text-blue-300',
        yellow: 'bg-yellow-500/20 text-yellow-300',
        cyan: 'bg-cyan-500/20 text-cyan-300',
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('modals.models.title')}>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                {DETAILED_AI_MODELS.map(model => {
                    const isDisabled = characterImage && !model.supportedModes.includes('image-to-image');
                    return (
                        <div
                            key={model.id}
                            onClick={() => {
                                if (isDisabled) return;
                                onSelectModel(model.id);
                                onClose();
                            }}
                            className={`p-4 border rounded-lg transition-all duration-200 ${selectedModelId === model.id ? 'border-pink-500 bg-pink-500/10' : 'border-gray-700 bg-white/5'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-pink-500 hover:bg-pink-500/5'}`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-white flex items-center gap-2">{t(model.name)} {model.recommended && <i className="ph-fill ph-seal-check text-green-400"></i>}</h3>
                                    <p className="text-xs text-gray-400 mt-1">{t(model.description)}</p>
                                </div>
                                <div className="flex gap-1.5 flex-shrink-0">
                                    {model.tags.map(tag => (
                                        <span key={tag.text} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tagColorClasses[tag.color] || 'bg-gray-500/20 text-gray-300'}`}>{t(tag.text)}</span>
                                    ))}
                                </div>
                            </div>
                            <ul className="mt-3 text-xs text-gray-300 space-y-1 list-disc list-inside pl-1 border-t border-white/10 pt-3">
                                {model.details.map((detail, i) => <li key={i}>{t(detail)}</li>)}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
};

export default ModelSelectionModal;