import React from 'react';

interface ToggleSwitchProps {
    label: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, checked, onChange, disabled = false }) => (
    <label className={`flex items-center justify-between py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="text-sm text-skin-base">{label}</span>
        <div className="relative">
            <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} />
            <div className={`block w-10 h-5 rounded-full transition ${checked ? 'bg-pink-600' : 'bg-gray-600'}`}></div>
            <div className={`toggle-switch-dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full ${checked ? 'transform translate-x-5' : ''}`}></div>
        </div>
    </label>
);

export default ToggleSwitch;