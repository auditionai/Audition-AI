import React, { useState, useEffect } from 'react';
import { useImageGenerator } from '../../hooks/useImageGenerator';
import { useAuth } from '../../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../../constants/aiToolData';
import { AIModel } from '../../types';

import SettingsBlock from './SettingsBlock';
import ImageUploader from './ImageUploader';
import ModelSelectionModal from './ModelSelectionModal';
import InstructionModal from './InstructionModal';
import GenerationProgress from './GenerationProgress';
import ConfirmationModal from '../ConfirmationModal';

interface AiGeneratorToolProps {
    initialCharacterImage?: { url: string; file: File } | null;
}

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage }) => {
    const { user } = useAuth();
    const { isGenerating, progress, generatedImage, error, generateImage, resetGenerator, cancelGeneration } = useImageGenerator();

    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | 'face' | null>(null);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    const [characterImage, setCharacterImage] = useState<{ url: string; file: File } | null>(null);
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState<AIModel>(DETAILED_AI_MODELS.find(m => m.recommended) || DETAILED_AI_MODELS[0]);
    const [selectedStyle, setSelectedStyle] = useState('none');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    
    const [isFaceIdEnabled] = useState(true);
    const [faceIdStrength] = useState(80);
    const [isStyleRefEnabled] = useState(true);
    const [styleStrength] = useState(60);

    useEffect(() => {
        if (initialCharacterImage) {
            setCharacterImage(initialCharacterImage);
        }
    }, [initialCharacterImage]);
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'character' | 'style') => {
        const file = e.target.files?.[0];
        if (file) {
            const newImage = { url: URL.createObjectURL(file), file };
            if (type === 'character') setCharacterImage(newImage);
            else if (type === 'style') setStyleImage(newImage);
        }
    };

    const handleGenerateClick = () => {
        if (!prompt.trim()) {
            alert('Vui lòng nhập mô tả (prompt).');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = () => {
        setConfirmOpen(false);
        generateImage(
            prompt, selectedModel,
            isFaceIdEnabled ? characterImage?.file ?? null : null,
            isStyleRefEnabled ? styleImage?.file ?? null : null,
            null, // faceImageFile removed in previous refactor
            aspectRatio, negativePrompt,
            faceIdStrength / 100, styleStrength / 100
        );
    };
    
    const openInstructionModal = (key: 'character' | 'style' | 'prompt' | 'advanced' | 'face') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const isImageInputDisabled = !selectedModel.supportedModes.includes('image-to-image');

    if (isGenerating || generatedImage) {
        return (
            <div className="bg-black/30 p-4 rounded-lg flex flex-col items-center justify-center min-h-[70vh]">
                {isGenerating ? (
                    <GenerationProgress currentStep={progress} onCancel={cancelGeneration} />
                ) : (
                    <div className="text-center animate-fade-in w-full">
                        <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">Tạo ảnh thành công!</h3>
                        <div className="max-w-md mx-auto aspect-[3/4] bg-black/20 rounded-lg overflow-hidden border-2 border-pink-500/30">
                            {generatedImage && <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" />}
                        </div>
                        <div className="flex gap-4 mt-6 justify-center">
                            <button onClick={resetGenerator} className="px-6 py-3 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition">
                                <i className="ph-fill ph-arrow-counter-clockwise mr-2"></i>Tạo ảnh khác
                            </button>
                            <a href={generatedImage || ''} download={`audition-ai-${Date.now()}.png`} className="px-6 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition">
                                <i className="ph-fill ph-download-simple mr-2"></i>Tải xuống
                            </a>
                        </div>
                    </div>
                )}
                 {error && <p className="mt-4 text-red-400 text-center">{error}</p>}
            </div>
        );
    }

    return (
        <>
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={1} />
            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModel.id} onSelectModel={(id) => setSelectedModel(DETAILED_AI_MODELS.find(m => m.id === id) || selectedModel)} characterImage={!!characterImage} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Area (Left) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SettingsBlock title="1. Ảnh Nhân Vật" instructionKey="character" onInstructionClick={() => openInstructionModal('character')} step={1}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'character')} image={characterImage} onRemove={() => setCharacterImage(null)} text="Tải ảnh gốc" disabled={isImageInputDisabled || !isFaceIdEnabled} />
                        </SettingsBlock>
                        <SettingsBlock title="2. Ảnh Phong Cách (Tùy chọn)" instructionKey="style" onInstructionClick={() => openInstructionModal('style')} step={2}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => setStyleImage(null)} text="Tải ảnh mẫu" processType="style" disabled={isImageInputDisabled || !isStyleRefEnabled} />
                        </SettingsBlock>
                    </div>
                    
                    <SettingsBlock title="3. Câu Lệnh Mô Tả (Prompt)" instructionKey="prompt" onInstructionClick={() => openInstructionModal('prompt')} step={3}>
                        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả chi tiết hình ảnh bạn muốn tạo, ví dụ: 'một cô gái tóc hồng, mặc váy công chúa, đang khiêu vũ trong một cung điện lộng lẫy'..." className="w-full p-3 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition text-base text-white flex-grow resize-none min-h-[150px]" />
                    </SettingsBlock>
                </div>

                {/* Sidebar (Right) */}
                <div className="lg:col-span-1 bg-[#1a1a22]/80 p-4 rounded-xl border border-white/10 flex flex-col h-full">
                    <SettingsBlock title="4. Cài đặt Nâng cao" instructionKey="advanced" onInstructionClick={() => openInstructionModal('advanced')} step={4}>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-400">Mô hình AI</label>
                                <button onClick={() => setModelModalOpen(true)} className="p-2 bg-black/30 rounded-md border border-gray-600 hover:border-pink-500 text-left w-full transition">
                                    <p className="font-semibold text-white truncate">{selectedModel.name}</p>
                                </button>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400">Phong cách</label>
                                <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="p-2 bg-black/30 rounded-md border border-gray-600 hover:border-pink-500 text-left w-full transition appearance-none auth-input text-white">
                                    {STYLE_PRESETS_NEW.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                             <div>
                                <label className="text-xs text-gray-400">Prompt Phủ định</label>
                                <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="VD: xấu, mờ, nhiều tay..." className="w-full mt-1 p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-sm text-white resize-none" rows={2} />
                            </div>
                             <div>
                                <label className="text-xs text-gray-400 mb-2 block">Tỷ lệ khung hình</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => setAspectRatio('3:4')} className={`p-2 rounded-md flex flex-col items-center justify-center gap-1 border-2 transition ${aspectRatio === '3:4' ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-gray-600 bg-white/5 hover:bg-white/10 text-gray-300'}`}> <div className="w-4 h-5 bg-gray-500 rounded-sm"/> <span className="text-xs font-semibold">3:4</span> </button>
                                    <button onClick={() => setAspectRatio('1:1')} className={`p-2 rounded-md flex flex-col items-center justify-center gap-1 border-2 transition ${aspectRatio === '1:1' ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-gray-600 bg-white/5 hover:bg-white/10 text-gray-300'}`}> <div className="w-4 h-4 bg-gray-500 rounded-sm"/> <span className="text-xs font-semibold">1:1</span> </button>
                                    <button onClick={() => setAspectRatio('4:3')} className={`p-2 rounded-md flex flex-col items-center justify-center gap-1 border-2 transition ${aspectRatio === '4:3' ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-gray-600 bg-white/5 hover:bg-white/10 text-gray-300'}`}> <div className="w-5 h-4 bg-gray-500 rounded-sm"/> <span className="text-xs font-semibold">4:3</span> </button>
                                </div>
                            </div>
                        </div>
                    </SettingsBlock>
                    
                    {/* Cost and Action Button */}
                    <div className="mt-auto pt-6 space-y-4">
                        <div className="text-center text-sm p-3 bg-black/20 rounded-lg">
                            <p className="text-gray-400">Chi phí: <span className="font-bold text-pink-400 flex items-center justify-center gap-1">1 <i className="ph-fill ph-diamonds-four"></i></span></p>
                            <p className="text-gray-400">Hiện có: <span className="font-bold text-white">{user?.diamonds.toLocaleString() || 0} 💎</span></p>
                        </div>
                        <button onClick={handleGenerateClick} disabled={isGenerating || !prompt.trim()} className="w-full px-8 py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1.5 hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i className="ph-fill ph-magic-wand"></i>
                            Bắt đầu sáng tạo
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AiGeneratorTool;
