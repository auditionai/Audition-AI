import React, { useState } from 'react';
// FIX: Corrected import path to use the version of AiGeneratorTool within the creator folder.
import AiGeneratorTool from './ai-tool/AiGeneratorTool';
import BgRemoverTool from '../ai-tool/BgRemoverTool';
import InstructionModal from '../common/InstructionModal';

type AIToolTab = 'generator' | 'utilities';

const AITool: React.FC = () => {
    const [activeTab, setActiveTab] = useState<AIToolTab>('generator');
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    
    // State is now LIFTED to this parent component to persist across tabs
    const [poseImage, setPoseImage] = useState<{ url: string; file: File } | null>(null);
    const [rawFaceImage, setRawFaceImage] = useState<{ url: string; file: File } | null>(null);
    const [processedFaceImage, setProcessedFaceImage] = useState<string | null>(null);
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);

    const handleMoveToGenerator = (image: { url: string; file: File }) => {
        setPoseImage(image);
        setActiveTab('generator');
    };
    
    const handleMoveFaceToGenerator = (image: { url: string; file: File }) => {
        setRawFaceImage(image);
        setProcessedFaceImage(null); // Reset processed image when a new raw face is passed
        setActiveTab('generator');
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <InstructionModal 
                isOpen={isInstructionModalOpen} 
                onClose={() => setInstructionModalOpen(false)} 
            />
            <div className="themed-main-title-container text-center max-w-4xl mx-auto mb-12">
                <h1 
                    className="themed-main-title text-4xl md:text-5xl lg:text-6xl font-black mb-4 leading-tight"
                    data-text="Audition AI Studio"
                >
                    Audition AI Studio
                </h1>
                <p className="themed-main-subtitle text-lg md:text-xl max-w-2xl mx-auto">
                    Nền tảng sáng tạo ảnh 3D AI theo phong cách Audition độc đáo.
                </p>
                <button
                    onClick={() => setInstructionModalOpen(true)}
                    className="themed-guide-button"
                >
                    <i className="ph-fill ph-book-open"></i>
                    <span>Xem Hướng Dẫn Nhanh</span>
                </button>
            </div>
            
            <div className="max-w-7xl mx-auto">
                {/* Tabs */}
                <div className="flex justify-center border-b border-white/10 mb-6">
                    <button
                        onClick={() => setActiveTab('generator')}
                        className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'generator' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'}`}
                    >
                       <i className="ph-fill ph-magic-wand mr-2"></i>
                        Trình Tạo Ảnh AI
                    </button>
                    <button
                        onClick={() => setActiveTab('utilities')}
                        className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'utilities' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400 hover:text-white'}`}
                    >
                        <i className="ph-fill ph-wrench mr-2"></i>
                        Công Cụ Hỗ Trợ
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 bg-skin-fill-secondary rounded-2xl border border-skin-border shadow-lg">
                    {activeTab === 'generator' && (
                        <AiGeneratorTool 
                           // Pass all state and setters down as props
                           poseImage={poseImage}
                           onPoseImageChange={setPoseImage}
                           rawFaceImage={rawFaceImage}
                           onRawFaceImageChange={setRawFaceImage}
                           processedFaceImage={processedFaceImage}
                           onProcessedFaceImageChange={setProcessedFaceImage}
                           styleImage={styleImage}
                           onStyleImageChange={setStyleImage}
                        />
                    )}
                    {activeTab === 'utilities' && (
                        <BgRemoverTool 
                            onMoveToGenerator={handleMoveToGenerator}
                            onMoveFaceToGenerator={handleMoveFaceToGenerator}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default AITool;