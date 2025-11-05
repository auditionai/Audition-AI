import React, { useState, useMemo, useEffect } from 'react';
import SettingsBlock from './ai-tool/SettingsBlock';
import ImageUploader from './ai-tool/ImageUploader';
import ToggleSwitch from './ai-tool/ToggleSwitch';
import AspectRatioButton from './ai-tool/AspectRatioButton';
import ModelSelectionModal from './ai-tool/ModelSelectionModal';
import InstructionModal from './ai-tool/InstructionModal';
import ConfirmationModal from '../ConfirmationModal';
import GenerationProgress from './ai-tool/GenerationProgress';
import { useImageGenerator, useBackgroundRemover } from '../hooks/useImageGenerator';
import { useAuth } from '../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../constants/aiToolData';
import LoadingModal from '../LoadingModal';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced';

const AITool: React.FC = () => {
    const { user, showToast } = useAuth();
    const { isLoading: isGenerating, generatedImage, generateImage, COST_PER_IMAGE } = useImageGenerator();
    const { isProcessing: isRemovingBg, removeBackground, COST_PER_REMOVAL } = useBackgroundRemover();

    // State for inputs
    const [prompt, setPrompt] = useState<string>('');
    const [characterImage, setCharacterImage] = useState<{ file: File, url: string } | null>(null);
    const [styleImage, setStyleImage] = useState<{ file: File, url: string } | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string>(DETAILED_AI_MODELS.find(m => m.recommended)?.id || DETAILED_AI_MODELS[0].id);
    const [selectedStyleId, setSelectedStyleId] = useState<string>(STYLE_PRESETS_NEW[0].id);
    const [aspectRatio, setAspectRatio] = useState<string>('3:4');
    const [useSeed, setUseSeed] = useState<boolean>(true);
    const [generationStep, setGenerationStep] = useState(0);

    // State for modals
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<InstructionKey | null>(null);
    const [isBgRemovalConfirmationOpen, setBgRemovalConfirmationOpen] = useState(false);
    const [isGenerationConfirmationOpen, setGenerationConfirmationOpen] = useState(false);
    const [imageForBgRemoval, setImageForBgRemoval] = useState<{ file: File, url: string } | null>(null);


    const selectedModel = useMemo(() => DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!, [selectedModelId]);

    // Disable image inputs if model doesn't support them
    const isImageToImageDisabled = !selectedModel.supportedModes.includes('image-to-image');
    
    useEffect(() => {
        if (isImageToImageDisabled) {
            setCharacterImage(null);
            setStyleImage(null);
        }
    }, [isImageToImageDisabled]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'character' | 'style') => {
        const file = e.target.files?.[0];
        if (file) {
            const newImage = { file, url: URL.createObjectURL(file) };
            if (type === 'character') setCharacterImage(newImage);
            else setStyleImage(newImage);
        }
    };
    
    const openInstruction = (key: InstructionKey) => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };
    
    const handleInitiateBgRemoval = () => {
        if (!characterImage) return;
        if ((user?.diamonds || 0) < COST_PER_REMOVAL) {
            showToast('Không đủ kim cương để tách nền.', 'error');
            return;
        }
        setImageForBgRemoval(characterImage);
        setBgRemovalConfirmationOpen(true);
    };

    const handleConfirmBgRemoval = async () => {
        if (!imageForBgRemoval) return;
        setBgRemovalConfirmationOpen(false);
        const resultUrl = await removeBackground(imageForBgRemoval.file);
        if (resultUrl) {
            // To display the new image, we need to fetch it as a blob and create a URL
            // because the result is a data URL string.
            const response = await fetch(resultUrl);
            const blob = await response.blob();
            const file = new File([blob], "bg_removed.png", { type: blob.type });
            setCharacterImage({ file, url: URL.createObjectURL(blob) });
        }
        setImageForBgRemoval(null);
    };

    const handleInitiateGeneration = () => {
        if (!prompt.trim()) {
            showToast('Vui lòng nhập câu lệnh mô tả.', 'error');
            return;
        }
        if ((user?.diamonds || 0) < COST_PER_IMAGE) {
            showToast('Không đủ kim cương để tạo ảnh.', 'error');
            return;
        }
        setGenerationConfirmationOpen(true);
    };

    const handleConfirmGeneration = () => {
        setGenerationConfirmationOpen(false);
        generateImage(
            prompt,
            characterImage?.file || null,
            styleImage?.file || null,
            selectedModel,
            STYLE_PRESETS_NEW.find(s => s.id === selectedStyleId)!,
            characterImage ? 'auto' : aspectRatio,
            setGenerationStep
        );
    };

    return (
        <>
            <div className="container mx-auto px-4 animate-fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left Column: Settings */}
                    <div className="lg:col-span-3 flex flex-col gap-4">
                        <SettingsBlock title="Câu lệnh (Prompt)" instructionKey="prompt" step={3} onInstructionClick={openInstruction}>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full h-48 p-3 bg-black/20 rounded-md text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-pink-500 focus:outline-none transition-shadow resize-none custom-scrollbar"
                                placeholder="Ví dụ: một cô gái tóc bạch kim, mặc váy dạ hội xanh lấp lánh, đang khiêu vũ dưới bầu trời đầy sao..."
                            />
                        </SettingsBlock>
                        <SettingsBlock title="Cài đặt nâng cao" instructionKey="advanced" step={4} onInstructionClick={openInstruction}>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-300 text-sm">Phong cách</span>
                                    <select value={selectedStyleId} onChange={e => setSelectedStyleId(e.target.value)} className="auth-input text-sm py-1.5 w-1/2">
                                        {STYLE_PRESETS_NEW.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-300 text-sm">Mô hình AI</span>
                                    <button onClick={() => setModelModalOpen(true)} className="auth-input text-sm py-1.5 w-1/2 text-left truncate hover:bg-white/10">{selectedModel.name}</button>
                                </div>
                                <div className="border-t border-white/10">
                                    <ToggleSwitch label="Tỷ lệ khung hình tự động" checked={!!characterImage} onChange={() => {}} disabled={true} />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <AspectRatioButton value="3:4" icon={<div className="w-6 h-8 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                    <AspectRatioButton value="1:1" icon={<div className="w-7 h-7 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                    <AspectRatioButton value="4:3" icon={<div className="w-8 h-6 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} />
                                </div>
                                <div className="border-t border-white/10">
                                    <ToggleSwitch label="Seed ngẫu nhiên (kết quả khác nhau)" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
                                </div>
                            </div>
                        </SettingsBlock>
                    </div>

                    {/* Middle Column: Image Inputs */}
                    <div className="lg:col-span-5 flex flex-col gap-4">
                        <div className="h-1/2">
                           <SettingsBlock title="Ảnh Nhân vật (Tùy chọn)" instructionKey="character" step={1} onInstructionClick={openInstruction}>
                                <ImageUploader
                                    onUpload={(e) => handleImageUpload(e, 'character')}
                                    image={characterImage}
                                    onRemove={() => setCharacterImage(null)}
                                    text="Tải ảnh chân dung"
                                    disabled={isImageToImageDisabled}
                                />
                            </SettingsBlock>
                        </div>
                        <div className="h-1/2">
                           <SettingsBlock title="Ảnh Mẫu (Tùy chọn)" instructionKey="style" step={2} onInstructionClick={openInstruction}>
                                <ImageUploader
                                    onUpload={(e) => handleImageUpload(e, 'style')}
                                    image={styleImage}
                                    onRemove={() => setStyleImage(null)}
                                    text="Tải ảnh lấy phong cách"
                                    processType="style"
                                    disabled={isImageToImageDisabled}
                                />
                            </SettingsBlock>
                        </div>
                         {characterImage && (
                            <button onClick={handleInitiateBgRemoval} disabled={isRemovingBg} className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50">
                                {isRemovingBg ? <div className="w-4 h-4 border-2 border-t-white border-white/50 rounded-full animate-spin"></div> : <i className="ph-fill ph-wand"></i>}
                                {isRemovingBg ? 'Đang xử lý...' : `Tách nền ảnh (-${COST_PER_REMOVAL} KC)`}
                            </button>
                        )}
                    </div>

                    {/* Right Column: Output */}
                    <div className="lg:col-span-4 lg:h-auto min-h-[400px]">
                        <div className="bg-[#1a1a22]/80 p-2 rounded-xl border border-white/10 h-full flex flex-col">
                            <div className="relative flex-grow bg-black/30 rounded-md overflow-hidden aspect-w-3 aspect-h-4">
                               {isGenerating ? (
                                   <GenerationProgress currentStep={generationStep} />
                               ) : generatedImage ? (
                                   <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" />
                               ) : (
                                   <div className="w-full h-full flex flex-col items-center justify-center p-4 text-gray-500">
                                       <i className="ph-fill ph-image text-6xl mb-4"></i>
                                       <p className="font-semibold text-lg">Kết quả sẽ xuất hiện ở đây</p>
                                       <p className="text-sm text-center">Hoàn thành các bước và nhấn "Tạo ảnh" để bắt đầu phép màu!</p>
                                   </div>
                               )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Generate Button */}
                <div className="mt-4">
                     <button onClick={handleInitiateGeneration} disabled={isGenerating} className="w-full py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1.5 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100 flex items-center justify-center gap-2">
                         {isGenerating ? (
                             <>
                                <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                <span>Đang Sáng Tạo...</span>
                            </>
                         ) : (
                             <>
                                 <i className="ph-fill ph-magic-wand"></i>
                                 <span>Tạo ảnh (-{COST_PER_IMAGE} Kim cương)</span>
                            </>
                         )}
                    </button>
                </div>
            </div>

            {/* Modals */}
            <ModelSelectionModal 
                isOpen={isModelModalOpen}
                onClose={() => setModelModalOpen(false)}
                selectedModelId={selectedModelId}
                onSelectModel={setSelectedModelId}
                characterImage={!!characterImage}
            />
            <InstructionModal
                isOpen={isInstructionModalOpen}
                onClose={() => setInstructionModalOpen(false)}
                instructionKey={instructionKey}
            />
            <ConfirmationModal
                isOpen={isBgRemovalConfirmationOpen}
                onClose={() => setBgRemovalConfirmationOpen(false)}
                onConfirm={handleConfirmBgRemoval}
                cost={COST_PER_REMOVAL}
            />
             <ConfirmationModal
                isOpen={isGenerationConfirmationOpen}
                onClose={() => setGenerationConfirmationOpen(false)}
                onConfirm={handleConfirmGeneration}
                cost={COST_PER_IMAGE}
            />
            <LoadingModal isOpen={isRemovingBg} onClose={() => {}} />
        </>
    );
};

export default AITool;
