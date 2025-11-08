import React, { useMemo } from 'react';

interface GenerationProgressProps {
  currentStep: number;
}

const STEPS = [
    { name: 'Đang chờ...', icon: 'ph-dots-three' },
    { name: 'Khởi tạo tác vụ', icon: 'ph-power' },
    { name: 'Phân tích Tư thế', icon: 'ph-person-simple-run' },
    { name: 'Phân tích Phong cách', icon: 'ph-palette' },
    { name: 'Khoá Gương mặt', icon: 'ph-face-mask' },
    { name: 'Đang tạo bối cảnh (AI #1)', icon: 'ph-magic-wand' },
    { name: 'Tinh chỉnh gương mặt (AI #2)', icon: 'ph-user-focus' },
    { name: 'Hoàn tất & Tải lên', icon: 'ph-upload-simple' },
    { name: 'Thành công!', icon: 'ph-sparkle' },
];


const GenerationProgress: React.FC<GenerationProgressProps> = ({ currentStep }) => {
    const progressPercentage = useMemo(() => {
        if (currentStep === 0) return 0;
        return Math.min(((currentStep) / (STEPS.length - 1)) * 100, 100);
    }, [currentStep]);

    const activeStep = STEPS[currentStep] || STEPS[0];

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-white animate-fade-in">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-3xl text-pink-400">
                <i className={`ph-fill ${activeStep.icon}`}></i>
              </div>
            </div>

            <p className="text-lg font-semibold mb-3 animate-pulse">{activeStep.name}</p>

            <div className="w-full max-w-sm bg-black/30 rounded-full h-2.5 mb-2">
                <div 
                    className="bg-gradient-to-r from-pink-500 to-fuchsia-500 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercentage}%` }}
                ></div>
            </div>
            <p className="text-xs text-gray-400">
                Bước {currentStep > 0 ? currentStep : 1} / {STEPS.length - 1}
            </p>

            <p className="text-xs text-gray-500 mt-8 text-center max-w-xs">
                AI đang xử lý dữ liệu để tạo ra tác phẩm độc đáo nhất. Vui lòng chờ trong giây lát.
            </p>
        </div>
    );
};

export default GenerationProgress;