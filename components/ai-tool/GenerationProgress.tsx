import React, { useMemo } from 'react';

interface GenerationProgressProps {
  currentStep: number;
  onCancel: () => void;
}

const STEPS = [
    { name: 'Đang chờ...', icon: 'ph-dots-three' },
    { name: 'Khởi tạo tác vụ', icon: 'ph-power' },
    { name: 'Phân tích Tư thế', icon: 'ph-person-simple-run' },
    { name: 'Phân tích Phong cách', icon: 'ph-palette' },
    { name: 'Khoá Gương mặt', icon: 'ph-face-mask' },
    { name: 'Đang tạo bối cảnh (AI #1)', icon: 'ph-magic-wand' },
    { name: 'Tinh chỉnh gương mặt (AI #2)', icon: 'ph-user-focus' },
    { name: 'Làm nét & nâng cấp (AI #3)', icon: 'ph-arrows-clockwise' },
    { name: 'Hoàn tất & Tải lên', icon: 'ph-upload-simple' },
    { name: 'Thành công!', icon: 'ph-sparkle' },
];

const GenerationProgress: React.FC<GenerationProgressProps> = ({ currentStep, onCancel }) => {
    const progressPercentage = useMemo(() => {
        if (currentStep === 0) return 0;
        return Math.min(((currentStep) / (STEPS.length - 1)) * 100, 100);
    }, [currentStep]);

    const activeStep = STEPS[currentStep] || STEPS[0];

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-white animate-fade-in">
            <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute inset-0 border-8 border-pink-500/20 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 border-8 border-t-pink-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-5xl text-pink-400">
                <i className={`ph-fill ${activeStep.icon}`}></i>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-3 animate-pulse">{activeStep.name}</h2>
            <p className="text-sm text-gray-400 mb-6">
                Bước {currentStep > 0 ? currentStep : 1} / {STEPS.length - 1}
            </p>

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
                Hủy bỏ
            </button>
        </div>
    );
};

export default GenerationProgress;
