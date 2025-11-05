import React, { useState, useMemo, useEffect } from 'react';
import SettingsBlock from './ai-tool/SettingsBlock';
import ImageUploader from './ai-tool/ImageUploader';
import ToggleSwitch from './ai-tool/ToggleSwitch';
import AspectRatioButton from './ai-tool/AspectRatioButton';
import ModelSelectionModal from './ai-tool/ModelSelectionModal';
import InstructionModal from './ai-tool/InstructionModal';
import ConfirmationModal from './ConfirmationModal';
import GenerationProgress from './ai-tool/GenerationProgress';
import { useImageGenerator, useBackgroundRemover } from '../hooks/useImageGenerator';
import { useAuth } from '../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../constants/aiToolData';
import LoadingModal from './LoadingModal';

type InstructionKey = 'character' | 'style' | 'prompt' | 'advanced';
type AIToolTab = 'remove-bg' | 'generate';

const AITool: React.FC = () => {
    const { user, showToast } = useAuth();
    const { isLoading: isGenerating, generatedImage, generateImage, COST_PER_IMAGE } = useImageGenerator();
    const { isProcessing: isRemovingBg, removeBackground, COST_PER_REMOVAL } = useBackgroundRemover();
    const [bgRemovalResult, setBgRemovalResult] = useState<string | null>(null);

    // Common state for both tabs
    const [activeTab, setActiveTab] = useState<AIToolTab>('generate');
    const [characterImage, setCharacterImage] = useState<{ file: File, url: string } | null>(null);

    // State for image generation
    const [prompt, setPrompt] = useState<string>('');
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
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

    const selectedModel = useMemo(() => DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!, [selectedModelId]);

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
        if (!characterImage) {
            showToast('Vui lòng tải ảnh lên trước.', 'error');
            return;
        };
        if ((user?.diamonds || 0) < COST_PER_REMOVAL) {
            showToast('Không đủ kim cương để tách nền.', 'error');
            return;
        }
        setBgRemovalConfirmationOpen(true);
    };

    const handleConfirmBgRemoval = async () => {
        if (!characterImage) return;
        setBgRemovalConfirmationOpen(false);
        const resultUrl = await removeBackground(characterImage.file);
        if (resultUrl) {
           setBgRemovalResult(resultUrl);
        }
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
    
    const TabButton: React.FC<{ tabId: AIToolTab; children: React.ReactNode }> = ({ tabId, children }) => (
      <button
        onClick={() => setActiveTab(tabId)}
        className={`px-6 py-2.5 rounded-full font-bold transition-all duration-300 text-sm md:text-base ${
          activeTab === tabId
            ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30'
            : 'bg-white/10 text-gray-300 hover:bg-white/20'
        }`}
      >
        {children}
      </button>
    );

    return (
        <>
            <div className="container mx-auto px-4 animate-fade-in">
                 <div className="flex justify-center items-center gap-2 mb-6">
                    <TabButton tabId="remove-bg">Tách Nền</TabButton>
                    <TabButton tabId="generate">Tạo Ảnh AI</TabButton>
                </div>

                {activeTab === 'remove-bg' ? (
                     <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-4 md:p-6 lg:min-h-[60vh] flex flex-col">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow">
                             {/* Cột tải ảnh */}
                            <div className="flex flex-col gap-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <span className="bg-pink-500 text-white w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs">1</span>
                                    Tải ảnh lên
                                </h2>
                                <div className="flex-grow">
                                    <ImageUploader
                                        onUpload={(e) => handleImageUpload(e, 'character')}
                                        image={characterImage}
                                        onRemove={() => {setCharacterImage(null); setBgRemovalResult(null);}}
                                        text="Nhấn để chọn hoặc kéo thả"
                                        subtext="Có thể chọn nhiều ảnh"
                                    />
                                </div>
                                <button onClick={handleInitiateBgRemoval} disabled={isRemovingBg} className="w-full py-3 font-bold text-base text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-lg shadow-[#F72585]/30 hover:shadow-xl hover:shadow-[#F72585]/40 hover:-translate-y-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                     {isRemovingBg ? <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <i className="ph-fill ph-diamonds-four"></i>}
                                     <span>{isRemovingBg ? 'Đang xử lý...' : `Xử lý (${COST_PER_REMOVAL} Kim cương)`}</span>
                                </button>
                            </div>
                             {/* Cột kết quả */}
                            <div className="flex flex-col gap-4">
                               <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <span className="bg-gray-600 text-white w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs">2</span>
                                    Kết quả
                                </h2>
                                 <div className="relative flex-grow bg-black/30 rounded-md overflow-hidden flex items-center justify-center p-2">
                                    {isRemovingBg ? (
                                        <div className="text-center text-gray-400">
                                            <div className="w-12 h-12 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto mb-4"></div>
                                            <p>Đang tách nền...</p>
                                        </div>
                                    ) : bgRemovalResult ? (
                                        <>
                                            <img src={bgRemovalResult} alt="Background removed result" className="w-full h-full object-contain" />
                                            <div className="absolute top-2 right-2 flex flex-col gap-2">
                                                <a href={bgRemovalResult} download="audition-ai-bg-removed.png" className="bg-black/60 text-white rounded-full p-2 hover:bg-green-500 transition-colors">
                                                    <i className="ph-fill ph-download-simple text-xl"></i>
                                                </a>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center text-gray-500">
                                            <i className="ph-fill ph-image text-4xl mb-2"></i>
                                            <p className="text-sm">Ảnh sau khi xử lý sẽ hiện ở đây</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="hidden md:block">
                            {/* Desktop layout */}
                             <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                <div className="lg:col-span-3 flex flex-col gap-4">
                                    <SettingsBlock title="Cài đặt nâng cao" instructionKey="advanced" step={4} onInstructionClick={openInstruction}>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Phong cách</span><select value={selectedStyleId} onChange={e => setSelectedStyleId(e.target.value)} className="auth-input text-sm py-1.5 w-1/2 custom-select">{STYLE_PRESETS_NEW.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Mô hình AI</span><button onClick={() => setModelModalOpen(true)} className="auth-input text-sm py-1.5 w-1/2 text-left truncate hover:bg-white/10">{selectedModel.name}</button></div>
                                            <div className="border-t border-white/10"><ToggleSwitch label="Tỷ lệ tự động" checked={!!characterImage} onChange={() => {}} disabled={true} /></div>
                                            <div className="grid grid-cols-5 gap-1.5"><AspectRatioButton value="1:1" icon={<div className="w-6 h-6 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="3:4" icon={<div className="w-5 h-7 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="4:3" icon={<div className="w-7 h-5 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="9:16" icon={<div className="w-4 h-7 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="16:9" icon={<div className="w-7 h-4 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /></div>
                                            <div className="border-t border-white/10"><ToggleSwitch label="Seed ngẫu nhiên" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} /></div>
                                        </div>
                                    </SettingsBlock>
                                </div>
                                <div className="lg:col-span-5 flex flex-col gap-4">
                                    <div className="lg:h-1/3"><SettingsBlock title="Nhập câu lệnh" instructionKey="prompt" step={3} onInstructionClick={openInstruction}><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full h-full p-3 bg-black/20 rounded-md text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-pink-500 focus:outline-none transition-shadow resize-none custom-scrollbar" placeholder="VD: một cô gái tóc hồng, mặc váy công chúa..."/></SettingsBlock></div>
                                    <div className="lg:h-1/3"><SettingsBlock title="Tải ảnh Nhân vật" instructionKey="character" step={1} onInstructionClick={openInstruction}><ImageUploader onUpload={(e) => handleImageUpload(e, 'character')} image={characterImage} onRemove={() => setCharacterImage(null)} text="Thêm ảnh nhân vật" disabled={isImageToImageDisabled}/></SettingsBlock></div>
                                    <div className="lg:h-1/3"><SettingsBlock title="Tải ảnh Mẫu" instructionKey="style" step={2} onInstructionClick={openInstruction}><ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => setStyleImage(null)} text="Tải ảnh Phong cách" processType="style" disabled={isImageToImageDisabled}/></SettingsBlock></div>
                                </div>
                                <div className="lg:col-span-4 lg:h-auto min-h-[400px]">
                                    <div className="bg-[#1a1a22]/80 p-2 rounded-xl border border-white/10 h-full flex flex-col">
                                        <h2 className="text-lg font-semibold text-gray-200 mb-2 text-center">Kết quả</h2>
                                        <div className="relative flex-grow bg-black/30 rounded-md overflow-hidden">{isGenerating ? <GenerationProgress currentStep={generationStep} /> : generatedImage ? <><img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" /><div className="absolute top-2 right-2 flex flex-col gap-2"><a href={generatedImage} download={`audition-ai-${Date.now()}.jpg`} className="bg-black/60 text-white rounded-full p-2 hover:bg-green-500 transition-colors"><i className="ph-fill ph-download-simple text-xl"></i></a></div></> : <div className="w-full h-full flex flex-col items-center justify-center p-4 text-gray-500"><i className="ph-fill ph-image text-6xl mb-4"></i><p className="font-semibold text-base">Hình ảnh của bạn sẽ xuất hiện ở đây</p></div>}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="md:hidden flex flex-col gap-4">
                             {/* Mobile layout */}
                            <SettingsBlock title="Tải ảnh Nhân vật" instructionKey="character" step={1} onInstructionClick={openInstruction}><ImageUploader onUpload={(e) => handleImageUpload(e, 'character')} image={characterImage} onRemove={() => setCharacterImage(null)} text="Thêm ảnh nhân vật" disabled={isImageToImageDisabled}/></SettingsBlock>
                            <SettingsBlock title="Tải ảnh Mẫu" instructionKey="style" step={2} onInstructionClick={openInstruction}><ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => setStyleImage(null)} text="Tải ảnh Phong cách" processType="style" disabled={isImageToImageDisabled}/></SettingsBlock>
                            <SettingsBlock title="Nhập câu lệnh" instructionKey="prompt" step={3} onInstructionClick={openInstruction}><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full h-32 p-3 bg-black/20 rounded-md text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-pink-500 focus:outline-none transition-shadow resize-none custom-scrollbar" placeholder="VD: một cô gái tóc hồng, mặc váy công chúa..."/></SettingsBlock>
                            <SettingsBlock title="Cài đặt nâng cao" instructionKey="advanced" step={4} onInstructionClick={openInstruction}>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Phong cách</span><select value={selectedStyleId} onChange={e => setSelectedStyleId(e.target.value)} className="auth-input text-sm py-1.5 w-1/2 custom-select">{STYLE_PRESETS_NEW.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select></div>
                                    <div className="flex items-center justify-between"><span className="text-gray-300 text-sm">Mô hình AI</span><button onClick={() => setModelModalOpen(true)} className="auth-input text-sm py-1.5 w-1/2 text-left truncate hover:bg-white/10">{selectedModel.name}</button></div>
                                    <div className="border-t border-white/10"><ToggleSwitch label="Tỷ lệ tự động" checked={!!characterImage} onChange={() => {}} disabled={true} /></div>
                                    <div className="grid grid-cols-5 gap-1.5"><AspectRatioButton value="1:1" icon={<div className="w-6 h-6 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="3:4" icon={<div className="w-5 h-7 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="4:3" icon={<div className="w-7 h-5 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="9:16" icon={<div className="w-4 h-7 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /><AspectRatioButton value="16:9" icon={<div className="w-7 h-4 bg-gray-500 rounded-sm"></div>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!characterImage} /></div>
                                    <div className="border-t border-white/10"><ToggleSwitch label="Seed ngẫu nhiên" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} /></div>
                                </div>
                            </SettingsBlock>
                            <div className="bg-[#1a1a22]/80 p-4 rounded-xl border border-white/10 flex flex-col">
                               <h2 className="text-lg font-semibold text-gray-200 mb-2 text-center">Kết quả</h2>
                                <div className="relative w-full aspect-square bg-black/30 rounded-md overflow-hidden">{isGenerating ? <GenerationProgress currentStep={generationStep} /> : generatedImage ? <><img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" /><div className="absolute top-2 right-2 flex flex-col gap-2"><a href={generatedImage} download={`audition-ai-${Date.now()}.jpg`} className="bg-black/60 text-white rounded-full p-2 hover:bg-green-500 transition-colors"><i className="ph-fill ph-download-simple text-xl"></i></a></div></> : <div className="w-full h-full flex flex-col items-center justify-center p-4 text-gray-500"><i className="ph-fill ph-image text-4xl mb-2"></i><p className="font-semibold text-sm">Hình ảnh của bạn sẽ xuất hiện ở đây</p></div>}</div>
                            </div>
                        </div>

                         <div className="md:hidden fixed bottom-16 left-0 w-full p-2 mobile-ai-footer z-30">
                            <button onClick={handleInitiateGeneration} disabled={isGenerating} className="w-full py-3 font-bold text-base text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 flex items-center justify-center gap-2">
                               {isGenerating ? <><div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div><span>Đang tạo...</span></> : <><i className="ph-fill ph-magic-wand"></i><span>Tạo ảnh (-{COST_PER_IMAGE} KC)</span></>}
                           </button>
                        </div>
                        <div className="hidden md:block mt-6">
                             <button onClick={handleInitiateGeneration} disabled={isGenerating} className="w-full py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1.5 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100 flex items-center justify-center gap-2">
                                 {isGenerating ? <><div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div><span>Đang Sáng Tạo...</span></> : <><i className="ph-fill ph-magic-wand"></i><span>Tạo ảnh (-{COST_PER_IMAGE} Kim cương)</span></>}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} characterImage={!!characterImage}/>
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey}/>
            <ConfirmationModal isOpen={isBgRemovalConfirmationOpen} onClose={() => setBgRemovalConfirmationOpen(false)} onConfirm={handleConfirmBgRemoval} cost={COST_PER_REMOVAL}/>
            <ConfirmationModal isOpen={isGenerationConfirmationOpen} onClose={() => setGenerationConfirmationOpen(false)} onConfirm={handleConfirmGeneration} cost={COST_PER_IMAGE}/>
            <LoadingModal isOpen={isRemovingBg} onClose={() => {}} />

            {fullScreenImage && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setFullScreenImage(null)}>
                    <img src={fullScreenImage} alt="Fullscreen preview" className="max-w-full max-h-full object-contain"/>
                </div>
            )}
        </>
    );
};

export default AITool;