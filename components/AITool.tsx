
import React, { useState } from 'react';
import AiGeneratorTool from './ai-tool/AiGeneratorTool';
import BgRemoverTool from './ai-tool/BgRemoverTool';
import InstructionModal from './common/InstructionModal';

type AIToolTab = 'generator' | 'utilities';

const AITool: React.FC = () => {
    const [activeTab, setActiveTab] = useState<AIToolTab>('generator');
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    
    // State to pass images between tools
    const [initialCharacterImage, setInitialCharacterImage] = useState<{ url: string; file: File } | null>(null);
    const [initialFaceImage, setInitialFaceImage] = useState<{ url: string; file: File } | null>(null);

    const handleMoveToGenerator = (image: { url: string; file: File }) => {
        setInitialCharacterImage(image);
        setInitialFaceImage(null); // Clear face image when a full character is moved
        setActiveTab('generator');
    };
    
    const handleMoveFaceToGenerator = (image: { url: string; file: File }) => {
        setInitialFaceImage(image);
        setInitialCharacterImage(null); // Clear character image when only a face is moved
        setActiveTab('generator');
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <InstructionModal 
                isOpen={isInstructionModalOpen} 
                onClose={() => setInstructionModalOpen(false)} 
            />
            <div className="text-center max-w-4xl mx-auto mb-8">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Audition AI Studio</h1>
                <p className="text-lg text-gray-400">
                    Nền tảng sáng tạo ảnh 3D AI theo phong cách Audition độc đáo.
                </p>
                <button
                    onClick={() => setInstructionModalOpen(true)}
                    className="mt-4 px-6 py-2 font-bold text-sm text-white bg-white/10 backdrop-blur-sm border border-white/20 rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1"
                >
                    <i className="ph-fill ph-book-open mr-2"></i>
                    Xem Hướng Dẫn Nhanh
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
                            key={`${initialCharacterImage?.url}-${initialFaceImage?.url}`} // Force re-mount when images are passed
                            initialCharacterImage={initialCharacterImage} 
                            initialFaceImage={initialFaceImage}
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
