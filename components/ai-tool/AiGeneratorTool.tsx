import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useImageGenerator } from '../../hooks/useImageGenerator';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../../constants/aiToolData';
import { AIModel, StylePreset } from '../../types';
import SettingsBlock from './SettingsBlock';
import ImageUploader from './ImageUploader';
import ToggleSwitch from './ToggleSwitch';
import AspectRatioButton from './AspectRatioButton';
import ModelSelectionModal from './ModelSelectionModal';
import InstructionModal from './InstructionModal';
import GenerationProgress from './GenerationProgress';
import ConfirmationModal from '../ConfirmationModal';
import ImageModal from '../common/ImageModal';
import { GalleryImage } from '../../types';

interface AiGeneratorToolProps {
    initialCharacterImage: { url: string; file: File } | null;
}

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage }) => {
    const { user } = useAuth();
    const { isLoading, generatedImage, generateImage, COST_PER_IMAGE } = useImageGenerator();
    
    // UI State
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | null>(null);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [generationStep, setGenerationStep] = useState(0); // 0: idle, 1-6: progress, 7: complete

    // Form State
    const [characterImage, setCharacterImage] = useState<{ url: string; file: File } | null>(null);
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);
    const [prompt, setPrompt] = useState('');
    const [selectedModelId, setSelectedModelId] = useState(DETAILED_AI_MODELS.find(m => m.recommended)?.id || DETAILED_AI_MODELS[0].id);
    const [selectedStyleId, setSelectedStyleId] = useState(STYLE_PRESETS_NEW[0].id);
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [useRandomSeed, setUseRandomSeed] = useState(true);
    
    // Logic to handle incoming image from BgRemoverTool
    useEffect(() => {
        if (initialCharacterImage) {
            setCharacterImage(initialCharacterImage);
        }
    }, [initialCharacterImage]);
    
    const selectedModel: AIModel = useMemo(() => DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!, [selectedModelId]);
    const selectedStyle: StylePreset = useMemo(() => STYLE_PRESETS_NEW.find(s => s.id === selectedStyleId)!, [selectedStyleId]);
    
    // Disable certain features based on selected model
    const isCharImageDisabled = !selectedModel.supportedModes.includes('image-to-image');
    const isStyleImageDisabled = !selectedModel.supportedModes.includes('image-to-image');
    
    // Reset inputs if model changes and they are no longer supported
    useEffect(() => {
        if (isCharImageDisabled && characterImage) setCharacterImage(null);
        if (isStyleImageDisabled && styleImage) setStyleImage(null);
    }, [selectedModelId, isCharImageDisabled, isStyleImageDisabled, characterImage, styleImage]);
    
    const handleInstructionClick = (key: 'character' | 'style' | 'prompt' | 'advanced') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setImage: React.Dispatch<React.SetStateAction<{ url: string; file: File; } | null>>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setImage({ url, file });
        }
    };
    
    const handleSubmit = () => {
        if (!prompt.trim()) {
            // A toast could be shown here
            return;
        }
        setConfirmModalOpen(true);
    };
    
    const handleConfirmGeneration = () => {
        setConfirmModalOpen(false);
        generateImage(prompt, characterImage?.file ?? null, styleImage?.file ?? null, selectedModel, selectedStyle, aspectRatio, setGenerationStep);
    };
    
    useEffect(() => {
        if(generatedImage) {
             setIsResultModalOpen(true);
        }
    }, [generatedImage])

    const resultImageForModal: GalleryImage | null = generatedImage ? {
        id: 'generated-result',
        image_url: generatedImage,
        prompt: prompt,
        model_used: selectedModel.name,
        created_at: new Date().toISOString(),
        user_id: user?.id || '',
        creator: {
            display_name: user?.display_name || 'You',
            photo_url: user?.photo_url || '',
            level: user?.level || 1
        }
    } : null;

    const mainContent = (
         <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Left side - settings */}
            <div className="lg:col-span-2 flex flex-col gap-4">
                <SettingsBlock title="Tải ảnh Nhân vật" step={1} instructionKey="character" onInstructionClick={handleInstructionClick}>
                    <ImageUploader
                        onUpload={(e) => handleImageUpload(e, setCharacterImage)}
                        image={characterImage}
                        onRemove={() => setCharacterImage(null)}
                        text="Ảnh gốc của bạn"
                        disabled={isCharImageDisabled}
                    />
                </SettingsBlock>
                <SettingsBlock title="Tải ảnh Mẫu (Tùy chọn)" step={2} instructionKey="style" onInstructionClick={handleInstructionClick}>
                    <ImageUploader
                        onUpload={(e) => handleImageUpload(e, setStyleImage)}
                        image={styleImage}
                        onRemove={() => setStyleImage(null)}
                        text="Ảnh lấy phong cách"
                        processType="style"
                        disabled={isStyleImageDisabled}
                    />
                </SettingsBlock>
            </div>

            {/* Right side - prompt & advanced */}
            <div className="lg:col-span-3 flex flex-col gap-4">
                <SettingsBlock title="Nhập câu lệnh" step={3} instructionKey="prompt" onInstructionClick={handleInstructionClick}>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Mô tả hình ảnh bạn muốn tạo..."
                        className="w-full flex-grow bg-black/30 rounded-lg p-3 text-white placeholder-gray-500 border border-gray-700 focus:border-pink-500 focus:ring-pink-500 transition resize-none text-sm min-h-[150px]"
                    ></textarea>
                </SettingsBlock>
                <SettingsBlock title="Cài đặt nâng cao" step={4} instructionKey="advanced" onInstructionClick={handleInstructionClick}>
                    <div className="space-y-3">
                         <div>
                            <label className="text-gray-300 text-sm mb-2 block">Phong cách</label>
                            <select value={selectedStyleId} onChange={(e) => setSelectedStyleId(e.target.value)} className="auth-input">
                                {STYLE_PRESETS_NEW.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="text-gray-300 text-sm mb-2 block">Mô hình AI</label>
                             <button onClick={() => setModelModalOpen(true)} className="auth-input text-left w-full flex justify-between items-center">
                                <span>{selectedModel.name}</span>
                                <i className="ph-fill ph-caret-down"></i>
                            </button>
                        </div>
                         <div>
                            <label className="text-gray-300 text-sm mb-2 block">Tỷ lệ khung hình</label>
                            <div className="grid grid-cols-5 gap-2">
                                <AspectRatioButton value="3:4" icon={<div className="w-4 h-5 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                <AspectRatioButton value="1:1" icon={<div className="w-5 h-5 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                <AspectRatioButton value="4:3" icon={<div className="w-5 h-4 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                <AspectRatioButton value="9:16" icon={<div className="w-3 h-5 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                <AspectRatioButton value="16:9" icon={<div className="w-5 h-3 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                            </div>
                        </div>
                        <ToggleSwitch label="Seed ngẫu nhiên" checked={useRandomSeed} onChange={(e) => setUseRandomSeed(e.target.checked)} />
                    </div>
                </SettingsBlock>
                
                 <button onClick={handleSubmit} disabled={isLoading} className="w-full mt-2 py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1">
                    <i className="ph-fill ph-magic-wand"></i>
                    Tạo ảnh (-{COST_PER_IMAGE} Kim cương)
                </button>
            </div>
        </div>
    );
    
    return (
        <>
            <div className={`transition-opacity duration-500 ${isLoading ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
                {mainContent}
            </div>

            {isLoading && (
                <div className="min-h-[60vh] flex items-center justify-center">
                    <GenerationProgress currentStep={generationStep} />
                </div>
            )}

            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} characterImage={!!characterImage} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />
            <ConfirmationModal isOpen={isConfirmModalOpen} onClose={() => setConfirmModalOpen(false)} onConfirm={handleConfirmGeneration} cost={COST_PER_IMAGE} />
            <ImageModal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} image={resultImageForModal} showInfoPanel={false} />
        </>
    );
};

export default AiGeneratorTool;
