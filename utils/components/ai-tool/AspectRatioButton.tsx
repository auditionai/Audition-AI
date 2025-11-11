import React from 'react';

interface AspectRatioButtonProps {
    value: string;
    icon: React.ReactNode;
    currentValue: string;
    onClick: (value: string) => void;
    disabled?: boolean;
}

const AspectRatioButton: React.FC<AspectRatioButtonProps> = ({ value, icon, currentValue, onClick, disabled = false }) => (
    <button
        onClick={() => onClick(value)}
        disabled={disabled}
        className={`w-full p-2 rounded-md flex flex-col items-center justify-center gap-1 border-2 transition ${currentValue === value ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-gray-600 bg-white/5 hover:bg-white/10 text-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
        {icon}
        <span className="text-xs font-semibold">{value}</span>
    </button>
);

export default AspectRatioButton;