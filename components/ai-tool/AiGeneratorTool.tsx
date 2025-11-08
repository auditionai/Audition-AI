import React, { useState, useEffect } from 'react';
import { useImageGenerator } from '../../hooks/useImageGenerator';
import { useAuth } from '../../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../../constants/aiToolData';
import { AIModel } from '../../types';

import SettingsBlock from './SettingsBlock';
import ImageUploader from './ImageUploader';
import ToggleSwitch from './ToggleSwitch';
import AspectRatioButton from './AspectRatioButton';
import ModelSelectionModal from './ModelSelectionModal';
import InstructionModal from './InstructionModal';
import GenerationProgress from './GenerationProgress';
import ConfirmationModal from '../ConfirmationModal';

interface AiGeneratorToolProps {
    initialCharacterImage?: { url: string; file: File } | null;
}

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage }) => {
    const { user } = useAuth();
    const { isGenerating, progress, generatedImage, error, generateImage, resetGenerator } = useImageGenerator();

    // UI State
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | 'face' | null>(null);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    // Generation Settings
    const [characterImage, setCharacterImage] = useState<{ url: string; file: File } | null>(null);
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);
    const [faceImage, setFaceImage] = useState<{ url: string; file: File } | null>(null);
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState<AIModel>(DETAILED_AI_MODELS.find(m => m.recommended) || DETAILED_AI_MODELS[0]);
    const [selectedStyle, setSelectedStyle] = useState('none');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    
    // Advanced Settings
    const [isFaceIdEnabled, setFaceIdEnabled] = useState(true);
    const [faceIdStrength, setFaceIdStrength] = useState(80);
    const [isStyleRefEnabled, setStyleRefEnabled] = useState(true);
    const [styleStrength, setStyleStrength] = useState(60);

    // Effect to handle image moved from BgRemoverTool
    useEffect(() => {
        if (initialCharacterImage) {
            setCharacterImage(initialCharacterImage);
        }
    }, [initialCharacterImage]);
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'character' | 'style' | 'face') => {
        const file = e.target.files?.[0];
        if (file) {
            const newImage = { url: URL.createObjectURL(file), file };
            if (type === 'character') setCharacterImage(newImage);
            else if (type === 'style') setStyleImage(newImage);
            else if (type === 'face') setFaceImage(newImage);
        }
    };

    const handleGenerateClick = () => {
        if (!prompt.trim()) {
            // Simple validation, can be expanded
            alert('Vui lòng nhập mô tả (prompt).');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = () => {
        setConfirmOpen(false);
        generateImage(
            prompt,
            selectedModel,
            isFaceIdEnabled ? characterImage?.file ?? null : null,
            isStyleRefEnabled ? styleImage?.file ?? null : null,
            faceImage?.file ?? null,
            aspectRatio,
            negativePrompt,
            faceIdStrength / 100,
            styleStrength / 100
        );
    };
    
    const openInstructionModal = (key: 'character' | 'style' | 'prompt' | 'advanced' | 'face') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const isImageInputDisabled = !selectedModel.supportedModes.includes('image-to-image');

    // Main content rendering
    if (isGenerating || generatedImage) {
        return (
            <div className="bg-black/30 p-4 rounded-lg flex flex-col items-center justify-center min-h-[70vh]">
                {isGenerating ? (
                    <GenerationProgress currentStep={progress} />
                ) : (
                    <div className="text-center animate-fade-in w-full">
                        <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">Tạo ảnh thành công!</h3>
                        <div className="max-w-md mx-auto aspect-[3/4] bg-black/20 rounded-lg overflow-hidden">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left Column: Image Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SettingsBlock title="Ảnh Nhân Vật" instructionKey="character" step={1} onInstructionClick={openInstructionModal}>
                        <ImageUploader onUpload={(e) => handleImageUpload(e, 'character')} image={characterImage} onRemove={() => setCharacterImage(null)} text="Tải ảnh gốc" disabled={isImageInputDisabled || !isFaceIdEnabled} />
                    </SettingsBlock>
                    <SettingsBlock title="Ảnh Phong Cách" instructionKey="style" step={2} onInstructionClick={openInstructionModal}>
                        <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => setStyleImage(null)} text="Tải ảnh mẫu" processType="style" disabled={isImageInputDisabled || !isStyleRefEnabled} />
                    </SettingsBlock>
                </div>
                
                {/* Right Column: Settings */}
                <div className="space-y-4">
                    <SettingsBlock title="Câu Lệnh Mô Tả" instructionKey="prompt" step={3} onInstructionClick={openInstructionModal}>
                        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Mô tả chi tiết hình ảnh bạn muốn tạo..." className="w-full h-28 p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 focus:ring-pink-500 transition text-sm text-white flex-grow resize-none" />
                    </SettingsBlock>
                    <SettingsBlock title="Cài đặt Nâng cao" instructionKey="advanced" step={4} onInstructionClick={openInstructionModal}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={() => setModelModalOpen(true)} className="p-2 bg-black/30 rounded-md border border-gray-600 hover:border-pink-500 text-left w-full transition">
                                <span className="text-xs text-gray-400">Mô hình AI</span>
                                <p className="font-semibold text-white truncate">{selectedModel.name}</p>
                            </button>
                             <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="p-2 bg-black/30 rounded-md border border-gray-600 hover:border-pink-500 text-left w-full transition appearance-none auth-input">
                                <option value="none" disabled>Chọn phong cách...</option>
                                {STYLE_PRESETS_NEW.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="Prompt phủ định (không muốn thấy)..." className="w-full mt-2 p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 focus:ring-pink-500 transition text-sm text-white resize-none" rows={2} />
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <AspectRatioButton value="3:4" icon={<div className="w-4 h-5 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} />
                            <AspectRatioButton value="1:1" icon={<div className="w-4 h-4 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} />
                            <AspectRatioButton value="4:3" icon={<div className="w-5 h-4 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} />
                        </div>
                    </SettingsBlock>
                </div>
            </div>
            {/* Action Bar */}
            <div className="mt-6 p-4 bg-black/30 rounded-b-xl border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-400">
                    Chi phí: <span className="font-bold text-pink-400 flex items-center gap-1">1 <i className="ph-fill ph-diamonds-four"></i></span> / 1 lần tạo. Kim cương hiện có: <span className="font-bold text-white">{user?.diamonds.toLocaleString() || 0}</span>
                </div>
                <button onClick={handleGenerateClick} disabled={isGenerating || !prompt.trim()} className="w-full sm:w-auto px-8 py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1.5 hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i className="ph-fill ph-magic-wand"></i>
                    Bắt đầu sáng tạo
                </button>
            </div>
        </>
    );
};

export default AiGeneratorTool;
