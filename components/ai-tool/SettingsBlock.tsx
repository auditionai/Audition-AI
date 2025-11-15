import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face' | 'group-studio';

interface SettingsBlockProps {
    title: string;
    instructionKey: InstructionKey;
    children: React.ReactNode;
    // Fix: Made the 'step' prop optional as it is not used by the component, resolving multiple type errors in AiGeneratorTool.tsx.
    step?: number; // Keep prop for mapping, but don't display
    onInstructionClick: (key: InstructionKey) => void;
}

const SettingsBlock: React.FC<SettingsBlockProps> = ({ title, instructionKey, children, onInstructionClick }) => {
    const { t } = useTranslation();
    return (
        <div className="themed-settings-block">
            <div className="flex justify-between items-center mb-4">
                <div className="text-left flex items-center gap-3 w-full">
                    <label className="themed-heading text-lg font-bold themed-title-glow">{title}</label>
                </div>
                <button onClick={() => onInstructionClick(instructionKey)} className="flex items-center gap-1 text-xs text-skin-accent hover:opacity-80 transition-all px-2 py-1 rounded-md bg-skin-accent/10 border border-skin-border-accent hover:bg-skin-accent/20 shadow-accent hover:shadow-accent-lg flex-shrink-0">
                    <i className="ph-fill ph-book-open"></i> {t('creator.aiTool.common.help')}
                </button>
            </div>
            <div className="flex flex-col flex-grow">{children}</div>
        </div>
    );
};

export default SettingsBlock;