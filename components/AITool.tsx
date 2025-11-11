import React, { useState } from 'react';
import AiGeneratorTool from './ai-tool/AiGeneratorTool';
import BgRemoverTool from './ai-tool/BgRemoverTool';

const AITool: React.FC = () => {
    const [activeTool, setActiveTool] = useState<'generate' | 'removeBg'>('removeBg');
    
    // State to manage moving images from the remover to the generator
    const [imageToMove, setImageToMove] = useState<string | null>(null);
    const [faceToMove, setFaceToMove] = useState<string | null>(null);

    const handleMoveToGenerator = (imageUrl: string) => {
        setImageToMove(imageUrl);
        setFaceToMove(null); // Clear face image if full image is moved
        setActiveTool('generate');
    };
    
    const handleMoveFaceToGenerator = (croppedImage: { url: string; file: File }) => {
        // This function now only moves the cropped face image URL as a string.
        // The file object is no longer needed in the new architecture.
        setFaceToMove(croppedImage.url);
        setImageToMove(null); // Clear full image if face is moved
        setActiveTool('generate');
    };

    return (
        <div id="ai-tool" className="container mx-auto px-4 py-8 text-white">
            <div className="bg-[#1a1a22]/80 rounded-2xl border border-white/10 shadow-lg p-4 md:p-6">
                {/* Tab switcher */}
                <div className="mb-6 max-w-md mx-auto p-1 bg-black/30 rounded-full flex items-center">
                    <button onClick={() => setActiveTool('removeBg')} className={`w-1/2 py-2 rounded-full font-bold transition-all ${activeTool === 'removeBg' ? 'bg-pink-600 shadow-lg shadow-pink-500/30' : 'text-gray-400'}`}>Tách Nền</button>
                    <button onClick={() => setActiveTool('generate')} className={`w-1/2 py-2 rounded-full font-bold transition-all ${activeTool === 'generate' ? 'bg-pink-600 shadow-lg shadow-pink-500/30' : 'text-gray-400'}`}>Tạo Ảnh AI</button>
                </div>

                {/* Content based on tab */}
                <div>
                    {activeTool === 'generate' ? 
                        <AiGeneratorTool initialCharacterImage={imageToMove} initialFaceImage={faceToMove} /> : 
                        <BgRemoverTool onMoveToGenerator={handleMoveToGenerator} onMoveFaceToGenerator={handleMoveFaceToGenerator} />
                    }
                </div>
            </div>
        </div>
    );
};

export default AITool;