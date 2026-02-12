
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useImageGenerator } from '../../../hooks/useImageGenerator';
import { useAuth } from '../../../contexts/AuthContext';
import { STYLE_PRESETS_NEW } from '../../../constants/aiToolData';
import { AIModel, StylePreset } from '../../../types';

import SettingsBlock from './SettingsBlock';
import ImageUploader from '../../ai-tool/ImageUploader';
// import ModelSelectionModal from '../../ai-tool/ModelSelectionModal'; // Removed, using inline UI
import InstructionModal from '../../ai-tool/InstructionModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ConfirmationModal from '../../ConfirmationModal';
import ImageModal from '../../common/ImageModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';
import { resizeImage } from '../../../utils/imageUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import PromptLibraryModal from './PromptLibraryModal';

interface AiGeneratorToolProps {
    initialCharacterImage?: { url: string; file: File } | null;
    initialFaceImage?: { url: string; file: File } | null;
    onSendToSignatureTool: (imageUrl: string) => void;
    onSwitchToUtility: () => void;
}

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage, initialFaceImage, onSendToSignatureTool, onSwitchToUtility }) => {
    const { user, session, showToast, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
    const { isGenerating, progress, generatedImage, error, generateImage, resetGenerator, cancelGeneration } = useImageGenerator();

    // Modal States
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | 'face' | null>(null);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
    
    // Feature States
    const [poseImage, setPoseImage] = useState<{ url: string; file: File } | null>(null);
    const [rawFaceImage, setRawFaceImage] = useState<{ url: string; file: File } | null>(null);
    const [processedFaceImage, setProcessedFaceImage] = useState<string | null>(null); // Stores base64 of processed face
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);
    const [isProcessingFace, setIsProcessingFace] = useState(false);

    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    
    // NEW MODEL CONFIG STATE
    const [modelType, setModelType] = useState<'flash' | 'pro'>('flash');
    const [imageResolution, setImageResolution] = useState<'1K' | '2K' | '4K'>('1K');
    const [enableGoogleSearch, setEnableGoogleSearch] = useState(false);
    
    const [selectedStyle, setSelectedStyle] = useState('none');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [useUpscaler, setUseUpscaler] = useState(false);
    const [useBasicFaceLock, setUseBasicFaceLock] = useState(true);
    const [removeWatermark, setRemoveWatermark] = useState(false);
    
    // Custom Style Dropdown State
    const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
    const styleDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialCharacterImage) {
            setPoseImage(initialCharacterImage);
        }
        if (initialFaceImage) {
            setRawFaceImage(initialFaceImage);
            setProcessedFaceImage(null);
        }
    }, [initialCharacterImage, initialFaceImage]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (styleDropdownRef.current && !styleDropdownRef.current.contains(event.target as Node)) {
                setIsStyleDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'pose' | 'face' | 'style') => {
        const file = e.target.files?.[0];
        if (file) {
            resizeImage(file, 1024) // Resize to max 1024px
                .then(({ file: resizedFile, dataUrl: resizedDataUrl }: { file: File, dataUrl: string }) => {
                    const newImage = { url: resizedDataUrl, file: resizedFile };
                    if (type === 'pose') setPoseImage(newImage);
                    else if (type === 'face') {
                        setRawFaceImage(newImage);
                        setProcessedFaceImage(null); // Reset processed image if a new one is uploaded
                    }
                    else if (type === 'style') setStyleImage(newImage);
                })
                .catch((err: any) => {
                    console.error("Error resizing image:", err);
                    showToast(t('creator.aiTool.common.errorProcessImage'), "error");
                });
        }
    };

    const handleRemoveImage = (type: 'pose' | 'face' | 'style') => {
        if (type === 'pose') setPoseImage(null);
        else if (type === 'face') {
            setRawFaceImage(null);
            setProcessedFaceImage(null);
        }
        else if (type === 'style') setStyleImage(null);
    }
    
    const handleProcessFace = async () => {
        if (!rawFaceImage || !session) return;
        setIsProcessingFace(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(rawFaceImage.file);
            reader.onloadend = async () => {
                const base64Image = reader.result;
                const response = await fetch('/.netlify/functions/process-face', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ image: base64Image, model: modelType === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image' }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || t('creator.aiTool.singlePhoto.superFaceLockProcessing'));

                setProcessedFaceImage(result.processedImageBase64);
                updateUserDiamonds(result.newDiamondCount);
                showToast(t('creator.aiTool.singlePhoto.superFaceLockProcessed'), 'success');
            };
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsProcessingFace(false);
        }
    };


    // Calculate Total Cost
    const calculateCost = () => {
        let cost = 1; // Base cost (Flash)
        if (modelType === 'pro') {
            if (imageResolution === '4K') cost = 20;
            else if (imageResolution === '2K') cost = 15;
            else cost = 10; // 1K Pro
        }
        if (useUpscaler) cost += 1;
        if (removeWatermark) cost += 1;
        return cost;
    };
    
    const generationCost = calculateCost();

    const handleGenerateClick = () => {
        if (!prompt.trim()) {
            showToast(t('creator.aiTool.common.errorPrompt'), 'error');
            return;
        }
        if (user && user.diamonds < generationCost) {
            showToast(t('creator.aiTool.common.errorCredits', { cost: generationCost, balance: user.diamonds }), 'error');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = () => {
        setConfirmOpen(false);
        const finalFaceImage = processedFaceImage ? processedFaceImage : (useBasicFaceLock && poseImage) ? poseImage.file : null;
        
        // Map UI state to AIModel object structure expected by hook
        const selectedModelObj: AIModel = {
            id: modelType === 'pro' ? 'gemini-3-pro' : 'gemini-flash',
            name: modelType === 'pro' ? 'Nano Banana Pro' : 'Nano Banana',
            description: '',
            apiModel: modelType === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image',
            tags: [],
            details: [],
            supportedModes: ['text-to-image', 'image-to-image']
        };

        generateImage(
            prompt, selectedModelObj,
            poseImage?.file ?? null,
            styleImage?.file ?? null,
            finalFaceImage,
            aspectRatio, negativePrompt,
            undefined, // seed removed
            useUpscaler,
            imageResolution,
            enableGoogleSearch,
            removeWatermark
        );
    };
    
    const openInstructionModal = (key: 'character' | 'style' | 'prompt' | 'advanced' | 'face') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const isImageInputDisabled = false; // All current models support image input
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-result',
        image_url: generatedImage,
        prompt: prompt,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: t('common.creator'), photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: modelType === 'pro' ? `Pro (${imageResolution})` : 'Flash',
        user_id: user?.id || ''
    } : null;

    const { progressText, progressPercentage } = useMemo(() => {
        if (!isGenerating) {
            return { progressText: '', progressPercentage: 0 };
        }

        const percentage = Math.min(progress * 10, 99);
        let text = t('creator.aiTool.common.waiting');
        if (progress > 0 && progress < 3) {
            text = t('creator.aiTool.common.initializing');
        } else if (progress >= 3 && progress < 9) {
            text = t('creator.aiTool.common.drawing');
        } else if (progress >= 9) {
            text = t('creator.aiTool.common.finishing');
        }
        
        return { progressText: text, progressPercentage: percentage };

    }, [isGenerating, progress, t]);

    if (isGenerating) {
        return (
            <div className="bg-black/30 p-8 rounded-2xl flex flex-col items-center justify-center min-h-[70vh] border border-white/10 shadow-2xl">
                <GenerationProgress progressText={progressText} progressPercentage={progressPercentage} onCancel={cancelGeneration} />
                {error && <p className="mt-6 text-red-400 text-center font-bold bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}
            </div>
        );
    }
    
    if (generatedImage) {
        return (
             <>
                <ImageModal 
                    isOpen={isResultModalOpen}
                    onClose={() => setIsResultModalOpen(false)}
                    image={resultImageForModal}
                    showInfoPanel={false}
                />
                <div className="text-center animate-fade-in w-full min-h-[70vh] flex flex-col items-center justify-center">
                    <h3 className="themed-heading text-3xl font-bold mb-6 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-md">{t('creator.aiTool.common.success')}</h3>
                    <div 
                        className="max-w-md w-full mx-auto bg-black/40 rounded-2xl overflow-hidden border-2 border-pink-500/50 cursor-pointer group relative shadow-[0_0_50px_rgba(236,72,153,0.15)]"
                        style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                        onClick={() => setIsResultModalOpen(true)}
                    >
                        <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                            <i className="ph-fill ph-magnifying-glass-plus text-5xl text-white drop-shadow-lg"></i>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-8 justify-center">
                        <button onClick={resetGenerator} className="themed-button-secondary px-8 py-3 font-bold text-base rounded-full shadow-lg">
                            <i className="ph-fill ph-arrow-counter-clockwise mr-2"></i>{t('creator.aiTool.common.createAnother')}
                        </button>
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-8 py-3 font-bold text-base rounded-full shadow-lg">
                            <i className="ph-fill ph-download-simple mr-2"></i>{t('creator.aiTool.common.downloadAndCopy')}
                        </button>
                    </div>
                </div>
             </>
        )
    }


    return (
        <>
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={generationCost} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />
            <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="single-photo" />

            <div className="grid grid-cols-12 gap-5 pb-24 h-full">
                
                {/* --- LEFT: CHARACTER (25%) --- */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
                    <SettingsBlock 
                        title={t('creator.aiTool.singlePhoto.characterTitle')} 
                        instructionKey="character" 
                        onInstructionClick={() => openInstructionModal('character')} 
                        variant="pink" 
                        className="h-full"
                    >
                        <div className="flex flex-col h-full">
                            <div className="flex-grow w-full relative group">
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose')} image={poseImage} onRemove={() => handleRemoveImage('pose')} text={t('creator.aiTool.singlePhoto.characterUploadText')} disabled={isImageInputDisabled} className="w-full h-full min-h-[300px]" />
                                {/* Face Lock Toggle Floating Inside */}
                                {poseImage && (
                                     <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-md rounded-lg p-2 flex items-center justify-between border border-white/10 z-20">
                                        <label className="text-[10px] font-bold text-pink-300 flex items-center gap-1">
                                            <i className="ph-fill ph-face-mask"></i> Khóa mặt (70%)
                                        </label>
                                        <ToggleSwitch label="" checked={useBasicFaceLock} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseBasicFaceLock(e.target.checked)} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </SettingsBlock>
                </div>

                {/* --- CENTER: FACE ID & REF & PROMPT (45%) --- */}
                <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
                     {/* TIP BANNER */}
                     <div className="px-3 py-2 bg-yellow-500/5 border border-yellow-500/20 text-yellow-200 rounded-lg text-[10px] flex items-center gap-2 shadow-sm">
                        <i className="ph-fill ph-lightbulb text-yellow-400"></i>
                        <div className="flex-grow truncate">
                             <span className="font-bold text-yellow-400 mr-1">{t('langName') === 'English' ? 'Tip:' : 'Mẹo:'}</span> 
                             {t('creator.aiTool.singlePhoto.bgRemoverTip')}
                        </div>
                         <button onClick={onSwitchToUtility} className="text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold transition-colors whitespace-nowrap">
                             {t('creator.aiTool.singlePhoto.switchToBgRemover')}
                         </button>
                    </div>

                    {/* TOP ROW: FACE & REF (Compact Side-by-Side) */}
                    <div className="grid grid-cols-2 gap-4">
                         {/* FACE ID */}
                         <div className="bg-[#1e1b25] border border-pink-500/30 rounded-xl p-3 flex flex-col gap-2 relative shadow-lg">
                             <div className="flex justify-between items-center">
                                 <h4 className="text-[11px] font-bold text-pink-400 uppercase tracking-wide">Face ID (95%)</h4>
                                 <button onClick={() => openInstructionModal('face')} className="text-gray-500 hover:text-white"><i className="ph-fill ph-question text-xs"></i></button>
                             </div>
                             <div className="flex gap-3">
                                 <div className="w-16 h-16 flex-shrink-0">
                                     <ImageUploader onUpload={(e) => handleImageUpload(e, 'face')} image={rawFaceImage ? { url: processedFaceImage ? `data:image/png;base64,${processedFaceImage}` : rawFaceImage.url } : null} onRemove={() => handleRemoveImage('face')} text="Face" disabled={isImageInputDisabled} className="w-full h-full rounded-lg" />
                                 </div>
                                 <div className="flex-grow flex flex-col justify-center gap-1">
                                    {rawFaceImage && !processedFaceImage ? (
                                        <button onClick={handleProcessFace} disabled={isProcessingFace} className="w-full text-[10px] font-bold py-1.5 px-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1">
                                            {isProcessingFace ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-scan"></i>}
                                            {isProcessingFace ? '...' : 'Xử lý (-1💎)'}
                                        </button>
                                    ) : processedFaceImage ? (
                                         <div className="w-full text-[10px] font-bold py-1.5 px-2 bg-green-500/20 text-green-300 border border-green-500/30 rounded text-center flex items-center justify-center gap-1">
                                            <i className="ph-fill ph-check-circle"></i> Đã khóa
                                        </div>
                                    ) : (
                                        <p className="text-[9px] text-gray-500 leading-tight">Tải ảnh mặt rõ nét để tăng độ giống.</p>
                                    )}
                                 </div>
                             </div>
                         </div>

                         {/* REFERENCE */}
                         <div className="bg-[#1e1b25] border border-cyan-500/30 rounded-xl p-3 flex flex-col gap-2 relative shadow-lg">
                             <div className="flex justify-between items-center">
                                 <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide">Ảnh Mẫu</h4>
                                 <button onClick={() => openInstructionModal('style')} className="text-gray-500 hover:text-white"><i className="ph-fill ph-question text-xs"></i></button>
                             </div>
                             <div className="flex gap-3 h-16">
                                 <div className="w-16 h-full flex-shrink-0">
                                     <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => handleRemoveImage('style')} text="Mẫu" disabled={isImageInputDisabled} className="w-full h-full rounded-lg" />
                                 </div>
                                 <div className="flex-grow flex items-center">
                                     <p className="text-[9px] text-gray-500 leading-tight">AI sẽ sao chép <b>Bố cục & Dáng</b> của ảnh này.</p>
                                 </div>
                             </div>
                         </div>
                    </div>

                    {/* PROMPT (Auto Expand) */}
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.promptTitle')} instructionKey="prompt" onInstructionClick={() => openInstructionModal('prompt')} variant="purple" className="flex-grow">
                        <div className="relative group h-full flex flex-col">
                            <textarea 
                                value={prompt} 
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)} 
                                placeholder={t('creator.aiTool.singlePhoto.promptPlaceholder')} 
                                className="w-full p-4 bg-black/40 rounded-xl border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition text-sm text-white flex-grow resize-none shadow-inner leading-relaxed min-h-[140px]" 
                            />
                            <button
                                onClick={() => setIsPromptLibraryOpen(true)}
                                className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-cyan-300 bg-cyan-900/30 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-full px-3 py-1.5 font-bold transition shadow-lg backdrop-blur-md"
                                title={t('modals.promptLibrary.buttonTooltip')}
                            >
                                <i className="ph-fill ph-book-bookmark"></i>
                                {t('modals.promptLibrary.button')}
                            </button>
                        </div>
                    </SettingsBlock>
                </div>

                {/* --- RIGHT: SETTINGS (30%) --- */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.advancedSettingsTitle')} instructionKey="advanced" onInstructionClick={() => openInstructionModal('advanced')} variant="yellow">
                        <div className="space-y-4">
                            
                            {/* AI MODEL SELECTOR */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">
                                    <i className="ph-fill ph-robot mr-1"></i> {t('creator.aiTool.singlePhoto.modelLabel')}
                                </label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
                                    <button 
                                        onClick={() => setModelType('flash')}
                                        className={`py-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center gap-1 ${modelType === 'flash' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <i className="ph-fill ph-lightning text-sm"></i>
                                        Flash (1💎)
                                    </button>
                                    <button 
                                        onClick={() => setModelType('pro')}
                                        className={`py-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center gap-1 ${modelType === 'pro' ? 'bg-gradient-to-br from-yellow-500 to-orange-600 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <i className="ph-fill ph-crown text-sm"></i>
                                        Pro (Gemini 3)
                                    </button>
                                </div>
                            </div>

                            {/* PRO OPTIONS: RESOLUTION & SEARCH */}
                            {modelType === 'pro' && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 space-y-3 animate-fade-in-down">
                                    <div>
                                        <label className="text-[9px] font-bold text-yellow-500 uppercase mb-1.5 block">Chất lượng (Pro)</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['1K', '2K', '4K'] as const).map(res => (
                                                <button 
                                                    key={res} 
                                                    onClick={() => setImageResolution(res)}
                                                    className={`py-1 text-[10px] font-bold rounded border transition-all ${imageResolution === res ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'}`}
                                                >
                                                    {res}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-yellow-500/10 pt-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 bg-blue-500/20 rounded text-blue-400"><i className="ph-bold ph-google-logo text-xs"></i></div>
                                            <span className="text-[10px] font-bold text-gray-300">Grounding</span>
                                        </div>
                                        <ToggleSwitch label="" checked={enableGoogleSearch} onChange={(e) => setEnableGoogleSearch(e.target.checked)} />
                                    </div>
                                </div>
                            )}
                            
                            {/* STYLE SELECTOR */}
                            <div className="relative" ref={styleDropdownRef}>
                                <label className="text-[10px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">{t('creator.aiTool.singlePhoto.styleLabel')}</label>
                                <button 
                                    onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)} 
                                    className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-white font-medium transition-all"
                                >
                                    <span className="flex items-center gap-2">
                                        <i className="ph-fill ph-palette text-pink-400"></i>
                                        {t(STYLE_PRESETS_NEW.find((p: StylePreset) => p.id === selectedStyle)?.name || 'modals.styles.none')}
                                    </span>
                                    <i className={`ph-fill ph-caret-down transition-transform ${isStyleDropdownOpen ? 'rotate-180' : ''}`}></i>
                                </button>
                                {isStyleDropdownOpen && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-[#1e1b25] border border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                        {STYLE_PRESETS_NEW.map((p: StylePreset) => (
                                            <button 
                                                key={p.id} 
                                                onClick={() => { setSelectedStyle(p.id); setIsStyleDropdownOpen(false); }} 
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${selectedStyle === p.id ? 'bg-pink-500/20 text-pink-300 font-bold' : 'text-gray-300 hover:bg-white/10'}`}
                                            >
                                                <span>{t(p.name)}</span>
                                                {selectedStyle === p.id && <i className="ph-fill ph-check"></i>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                             {/* ASPECT RATIO */}
                             <div>
                                <label className="text-[10px] font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">{t('creator.aiTool.singlePhoto.aspectRatioLabel')}</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {(['3:4', '1:1', '4:3', '9:16', '16:9'] as const).map(ar => {
                                        const dims: { [key: string]: string } = { '3:4': 'w-2 h-3', '1:1': 'w-2.5 h-2.5', '4:3': 'w-3 h-2', '9:16': 'w-1.5 h-3', '16:9': 'w-3 h-1.5' };
                                        return (
                                            <button key={ar} onClick={() => setAspectRatio(ar)} className={`p-1.5 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${aspectRatio === ar ? 'border-pink-500 bg-pink-500/10 text-white shadow-lg shadow-pink-500/10' : 'border-white/10 bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'}`}>
                                                <div className={`${dims[ar]} border border-current rounded-[1px]`}/>
                                                <span className="text-[9px] font-bold">{ar}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            {/* OTHER TOGGLES */}
                            <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
                                 <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-bold text-gray-300 uppercase">Negative Prompt</label>
                                    </div>
                                    <input type="text" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="VD: ugly, bad anatomy..." className="w-full bg-black/30 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-white focus:border-white/30 outline-none" />
                                </div>

                                <div className="h-px bg-white/10"></div>
                                
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-300 flex items-center gap-2"><i className="ph-fill ph-magic-wand text-pink-400"></i> Upscaler (Làm nét)</span>
                                    <ToggleSwitch label="" checked={useUpscaler} onChange={(e) => setUseUpscaler(e.target.checked)} />
                                </div>
                                
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-gray-300 flex items-center gap-2"><i className="ph-fill ph-eraser text-red-400"></i> Xóa Watermark</span>
                                    <ToggleSwitch label="" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} />
                                </div>
                            </div>
                        </div>
                    </SettingsBlock>
                    
                    {/* GENERATE BUTTON */}
                    <div className="mt-auto bg-[#1e1b25] p-5 rounded-2xl border border-white/10 shadow-2xl sticky bottom-4 z-10">
                        <div className="flex justify-between items-end mb-4">
                             <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Tổng Chi phí</p>
                                <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">{generationCost} 💎</p>
                             </div>
                             <div className="text-right">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Số dư</p>
                                <p className="text-lg font-bold text-white">{user?.diamonds.toLocaleString()} 💎</p>
                             </div>
                        </div>
                        <button 
                            onClick={handleGenerateClick} 
                            disabled={isGenerating || !prompt.trim()} 
                            className="themed-button-primary w-full py-4 text-lg font-black rounded-xl shadow-xl hover:shadow-pink-500/40 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isGenerating ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-sparkle"></i>}
                            {t('creator.aiTool.singlePhoto.generateButton')}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AiGeneratorTool;
