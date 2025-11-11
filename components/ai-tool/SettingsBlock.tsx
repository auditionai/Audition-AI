import React from 'react';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face';

interface SettingsBlockProps {
    title: string;
    instructionKey: InstructionKey;
    children: React.ReactNode;
    step?: number;
    onInstructionClick: (key: InstructionKey) => void;
}

const SettingsBlock: React.FC<SettingsBlockProps> = ({ title, instructionKey, children, onInstructionClick }) => {
    return (
        <div className="themed-settings-block">
            <div className="flex justify-between items-center mb-4">
                <div className="text-left flex items-center gap-3 w-full">
                    <label className="themed-heading text-md font-semibold text-pink-300 neon-text-glow">{title}</label>
                </div>
                <button onClick={() => onInstructionClick(instructionKey)} className="flex items-center gap-1 text-xs text-pink-300 hover:text-pink-200 transition-all px-2 py-1 rounded-md bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 shadow-[0_0_8px_rgba(247,37,133,0.3)] hover:shadow-[0_0_12px_rgba(247,37,133,0.5)] flex-shrink-0">
                    <i className="ph-fill ph-book-open"></i> Hướng Dẫn
                </button>
            </div>
            <div className="flex flex-col flex-grow">{children}</div>
        </div>
    );
};

export default SettingsBlock;