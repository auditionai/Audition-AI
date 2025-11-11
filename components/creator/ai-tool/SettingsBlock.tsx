import React from 'react';

interface SettingsBlockProps {
  title: string;
  instructionKey?: 'character' | 'style' | 'prompt' | 'advanced' | 'face';
  onInstructionClick?: () => void;
  children: React.ReactNode;
}

const SettingsBlock: React.FC<SettingsBlockProps> = ({ title, instructionKey, onInstructionClick, children }) => {
  return (
    <div className="themed-panel p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-skin-base">{title}</h3>
        {instructionKey && onInstructionClick && (
          <button onClick={onInstructionClick} className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
            <i className="ph-fill ph-question text-base"></i>
            <span>Hướng dẫn</span>
          </button>
        )}
      </div>
      {children}
    </div>
  );
};

export default SettingsBlock;