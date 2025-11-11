import React, { useState } from 'react';
import AiGeneratorTool from './ai-tool/AiGeneratorTool';
import BgRemoverTool from '../ai-tool/BgRemoverTool';

const AITool: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'generator' | 'bgRemover'>('generator');
    const [imageToMove, setImageToMove] = useState<{ url: string, file: File } | null>(null);
    const [faceImageToMove, setFaceImageToMove] = useState<{ url: string, file: File } | null>(null);

    const handleMoveToGenerator = (image: { url: string, file: File }) => {
        setImageToMove(image);
        setFaceImageToMove(null);
        setActiveTab('generator');
    };

    const handleMoveFaceToGenerator = (image: { url: string, file: File }) => {
        setFaceImageToMove(image);
        setImageToMove(null);
        setActiveTab('generator');
    };

    return (
        <div className="container mx-auto px-4 pb-8">
            <div className="mb-6 flex justify-center">
                <div className="bg-skin-fill-secondary p-1.5 rounded-full flex items-center gap-2 border border-skin-border">
                    <button
                        onClick={() => setActiveTab('generator')}
                        className={`px-6 py-2 rounded-full font-semibold text-sm transition-colors duration-300 ${activeTab === 'generator' ? 'bg-skin-accent text-skin-accent-text' : 'text-skin-muted hover:text-skin-base'}`}
                    >
                        <i className="ph-fill ph-magic-wand mr-2"></i>Trình Tạo Ảnh AI
                    </button>
                    <button
                        onClick={() => setActiveTab('bgRemover')}
                        className={`px-6 py-2 rounded-full font-semibold text-sm transition-colors duration-300 ${activeTab === 'bgRemover' ? 'bg-skin-accent text-skin-accent-text' : 'text-skin-muted hover:text-skin-base'}`}
                    >
                       <i className="ph-fill ph-person-simple-run mr-2"></i>Tách Nền & Khóa Mặt
                    </button>
                </div>
            </div>

            <div className="animate-fade-in">
                {activeTab === 'generator' && (
                    <AiGeneratorTool 
                        key={imageToMove?.url || faceImageToMove?.url} // Remount component when image is moved
                        initialCharacterImage={imageToMove} 
                        initialFaceImage={faceImageToMove}
                    />
                )}
                {activeTab === 'bgRemover' && (
                    <BgRemoverTool 
                        onMoveToGenerator={handleMoveToGenerator}
                        onMoveFaceToGenerator={handleMoveFaceToGenerator}
                    />
                )}
            </div>
        </div>
    );
};

export default AITool;
