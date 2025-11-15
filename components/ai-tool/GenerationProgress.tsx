import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface GenerationProgressProps {
  progressText: string;
  progressPercentage: number;
  onCancel: () => void;
}

const GenerationProgress: React.FC<GenerationProgressProps> = ({ progressText, progressPercentage, onCancel }) => {
    const { t } = useTranslation();
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-white animate-fade-in">
            <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute inset-0 border-8 border-pink-500/20 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 border-8 border-t-pink-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-5xl text-pink-400">
                <i className={`ph-fill ph-magic-wand`}></i>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-3 animate-pulse">{progressText || t('creator.aiTool.common.waiting')}</h2>
            
            <div className="w-full max-w-lg bg-black/30 rounded-full h-4 mb-2 overflow-hidden border border-white/10">
                <div 
                    className="bg-gradient-to-r from-pink-500 to-fuchsia-500 h-full rounded-full transition-all duration-500" 
                    style={{ 
                        width: `${progressPercentage}%`,
                        backgroundSize: '200% 200%',
                        animation: 'progress-flow 3s linear infinite',
                    }}
                ></div>
            </div>
            
            <p className="text-sm text-gray-500 mt-12 text-center max-w-sm">
                AI đang xử lý dữ liệu để tạo ra tác phẩm độc đáo nhất. Vui lòng chờ trong giây lát.
            </p>

            <button 
                onClick={onCancel} 
                className="mt-6 px-6 py-2 font-semibold bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/40 hover:text-red-200 transition"
            >
                {t('creator.aiTool.common.cancel')}
            </button>
        </div>
    );
};

export default GenerationProgress;