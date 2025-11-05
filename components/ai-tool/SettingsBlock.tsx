<script>
// The user wants to make the "Hướng Dẫn" button more prominent with a neon effect.
// I'll change the classes to give it a pink border, pink text, and a subtle pink shadow to create a glow.
// Old classes: `flex items-center gap-1 text-xs text-gray-400 hover:text-pink-400 transition-colors px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 flex-shrink-0`
// New classes: `flex items-center gap-1 text-xs text-pink-300 hover:text-pink-200 transition-all px-2 py-1 rounded-md bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/20 shadow-[0_0_8px_rgba(247,37,133,0.3)] hover:shadow-[0_0_12px_rgba(247,37,133,0.5)] flex-shrink-0`
</script>
import React from 'react';

interface SettingsBlockProps {
    title: string;
    instructionKey: string;
    children: React.ReactNode;
    step: number;
    onInstructionClick: (key: string) => void;
}

const SettingsBlock: React.FC<SettingsBlockProps> = ({ title, instructionKey, children, step, onInstructionClick }) => {
    return (
        <div className="bg-[#1a1a22]/80 p-4 rounded-xl border border-white/10 flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
                <div className="text-left flex items-center gap-3 w-full">
                    <span className="bg-red-500/80 text-white w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0">{step}</span>
                    <label className="text-md font-semibold text-gray-200">{title}</label>
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