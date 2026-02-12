
import React from 'react';
import { useTranslation } from '../../../hooks/useTranslation';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced' | 'face' | 'group-studio' | 'comic-studio';
type BlockVariant = 'default' | 'pink' | 'blue' | 'yellow' | 'purple';

interface SettingsBlockProps {
    title: string;
    instructionKey?: InstructionKey;
    children: React.ReactNode;
    step?: number;
    onInstructionClick?: (key: InstructionKey) => void;
    extraHeaderContent?: React.ReactNode;
    className?: string;
    variant?: BlockVariant;
}

const SettingsBlock: React.FC<SettingsBlockProps> = ({ 
    title, 
    instructionKey, 
    children, 
    onInstructionClick, 
    extraHeaderContent, 
    className = '',
    variant = 'default'
}) => {
    const { t } = useTranslation();

    // Compact styles
    const variantStyles = {
        default: 'border-white/10 bg-[#1e1b25]',
        pink: 'border-pink-500/30 bg-[#1e1b25] shadow-[0_0_10px_rgba(236,72,153,0.05)]',
        blue: 'border-cyan-500/30 bg-[#1e1b25] shadow-[0_0_10px_rgba(6,182,212,0.05)]',
        yellow: 'border-yellow-500/30 bg-[#1e1b25] shadow-[0_0_10px_rgba(234,179,8,0.05)]',
        purple: 'border-purple-500/30 bg-[#1e1b25] shadow-[0_0_10px_rgba(168,85,247,0.05)]'
    };

    const titleColors = {
        default: 'text-white',
        pink: 'text-pink-400',
        blue: 'text-cyan-400',
        yellow: 'text-yellow-400',
        purple: 'text-purple-400'
    };

    return (
        <div className={`rounded-xl border p-3 transition-all duration-300 hover:border-opacity-50 ${variantStyles[variant]} ${className}`}>
            <div className="flex justify-between items-center mb-2 gap-2 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 overflow-hidden flex-grow">
                    <label className={`text-xs font-black uppercase tracking-wider truncate ${titleColors[variant]}`}>
                        {title}
                    </label>
                    {extraHeaderContent}
                </div>
                {onInstructionClick && instructionKey && (
                    <button 
                        onClick={() => onInstructionClick(instructionKey)} 
                        className="flex items-center justify-center w-5 h-5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-all flex-shrink-0"
                        title={t('creator.aiTool.common.help')}
                    >
                        <i className="ph-fill ph-question text-xs"></i>
                    </button>
                )}
            </div>
            <div className="flex flex-col flex-grow gap-2 text-xs">{children}</div>
        </div>
    );
};

export default SettingsBlock;
