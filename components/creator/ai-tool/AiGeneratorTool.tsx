
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useImageGenerator } from '../../../hooks/useImageGenerator';
import { useAuth } from '../../../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../../../constants/aiToolData';
import { AIModel, StylePreset } from '../../../types';

import SettingsBlock from './SettingsBlock';
import ImageUploader from '../../ai-tool/ImageUploader';
import ModelSelectionModal from '../../ai-tool/ModelSelectionModal';
import InstructionModal from '../../ai-tool/InstructionModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ConfirmationModal from '../../ConfirmationModal';
import ImageModal from '../../common/ImageModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';
import { resizeImage, base64ToFile } from '../../../utils/imageUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import PromptLibraryModal from './PromptLibraryModal';
import ProcessedImagePickerModal from './ProcessedImagePickerModal';

interface AiGeneratorToolProps {
    initialCharacterImage?: { url: string; file: File } | null;
    initialFaceImage?: { url: string; file: File } | null;
    onSendToSignatureTool: (imageUrl: string) => void;
    onSwitchToUtility: () => void;
    // Callback to switch tool and load image
    onSwitchToolWithImage?: (image: { url: string; file: File }, targetTool: 'bg-remover' | 'enhancer') => void;
}

interface ProcessedImageData {
    id: string;
    imageBase64?: string;
    mimeType: string;
    fileName: string;
    processedUrl: string;
    originalUrl?: string;
}

const ASPECT_RATIOS = [
    { label: '1:1', value: '1:1', icon: 'ph-square' },
    { label: '3:4', value: '3:4', icon: 'ph-rectangle' }, // Portrait
    { label: '4:3', value: '4:3', icon: 'ph-rectangle' }, // Landscape
    { label: '9:16', value: '9:16', icon: 'ph-device-mobile' },
    { label: '16:9', value: '16:9', icon: 'ph-monitor' },
    { label: '2:3', value: '2:3', icon: 'ph-frame-corners' },
    { label: '3:2', value: '3:2', icon: 'ph-frame-corners' },
    { label: '4:5', value: '4:5', icon: 'ph-instagram-logo' },
    { label: '5:4', value: '5:4', icon: 'ph-image' },
    { label: '9:21', value: '9:21', icon: 'ph-arrows-out-line-vertical' },
    { label: '21:9', value: '21:9', icon: 'ph-arrows-out-line-horizontal' },
];

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage, initialFaceImage, onSendToSignatureTool, onSwitchToUtility, onSwitchToolWithImage }) => {
    const { user, session, showToast, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
    const { isGenerating, progress, generatedImage, error, generateImage, resetGenerator, cancelGeneration } = useImageGenerator();

    // Modal States
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | 'face' | null>(null);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
    
    // Picker State
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<'pose' | 'face' | null>(null);

    // Feature States
    const [poseImage, setPoseImage] = useState<{ url: string; file: File } | null>(null);
    const [rawFaceImage, setRawFaceImage] = useState<{ url: string; file: File } | null>(null);
    const [processedFaceImage, setProcessedFaceImage] = useState<string | null>(null); // Stores base64 of processed face
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);
    const [isProcessingFace, setIsProcessingFace] = useState(false);

    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    
    // Default to Flash (Nano Banana) - id: 'audition-ai-v4'
    const [selectedModel, setSelectedModel] = useState<AIModel>(
        DETAILED_AI_MODELS.find(m => m.id === 'audition-ai-v4') || DETAILED_AI_MODELS[1]
    ); 
    
    const [selectedStyle, setSelectedStyle] = useState('none');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [seed, setSeed] = useState<number | ''>('');
    const [useUpscaler, setUseUpscaler] = useState(false);
    const [useBasicFaceLock, setUseBasicFaceLock] = useState(true);
    
    // New Features
    const [imageResolution, setImageResolution] = useState<'1K' | '2K' | '4K'>('1K');
    const [useGoogleSearch, setUseGoogleSearch] = useState(true); // Auto-on
    const [removeWatermark, setRemoveWatermark] = useState(false); // New Feature
    
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

    // Reset resolution/upscaler based on model
    useEffect(() => {
        if (selectedModel.apiModel === 'gemini-2.5-flash-image') {
            setImageResolution('1K');
            setUseGoogleSearch(false);
        } else {
            // Pro Model
            setUseGoogleSearch(true); // Auto on for Pro
            setUseUpscaler(false); // Disable upscaler for Pro as it has built-in resolution
        }
    }, [selectedModel]);

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
    
    const handleOpenPicker = (type: 'pose' | 'face') => {
        setPickerTarget(type);
        setIsPickerOpen(true);
    }

    // 1. Handle "Use Image" (Direct Fill)
    const handleImageSelectFromPicker = async (imageData: ProcessedImageData) => {
        if (!pickerTarget) return;
        
        let dataUrl = imageData.processedUrl;
        let file: File;

        // Construct proper file object.
        if (imageData.imageBase64) {
             dataUrl = `data:${imageData.mimeType};base64,${imageData.imageBase64}`;
             file = base64ToFile(imageData.imageBase64, imageData.fileName, imageData.mimeType);
        } else {
             // Fetch blob if missing base64 (common for Enhanced images)
             try {
                 const res = await fetch(imageData.processedUrl);
                 const blob = await res.blob();
                 dataUrl = URL.createObjectURL(blob);
                 file = new File([blob], imageData.fileName, { type: imageData.mimeType });
             } catch(e) {
                 showToast("Không thể tải ảnh. Vui lòng thử lại.", "error");
                 return;
             }
        }
        
        const newImage = { url: dataUrl, file };
        
        if (pickerTarget === 'pose') setPoseImage(newImage);
        else if (pickerTarget === 'face') {
            setRawFaceImage(newImage);
            setProcessedFaceImage(null);
        }
        
        setIsPickerOpen(false);
        setPickerTarget(null);
        showToast(t('modals.processedImage.success.full'), 'success');
    };

    // 2. Handle "Use Cropped" (From Picker's cropper)
    const handleCropSelectFromPicker = (croppedImage: { url: string; file: File }) => {
        if (!pickerTarget) return;
        
        if (pickerTarget === 'face') {
             setRawFaceImage(croppedImage);
             setProcessedFaceImage(null);
        } else {
             setPoseImage(croppedImage);
        }

        setIsPickerOpen(false);
        setPickerTarget(null);
        showToast(t('modals.processedImage.success.cropped'), 'success');
    };

    // 3. Handle Cross-Tool Actions (Send to Bg/Enhancer)
    const handleProcessAction = async (image: ProcessedImageData, action: 'bg-remover' | 'enhancer') => {
        if (!onSwitchToolWithImage) return;

        try {
            // Must convert to file to pass to other tools
            let file: File;
            let url: string;

             if (image.imageBase64) {
                 url = `data:${image.mimeType};base64,${image.imageBase64}`;
                 file = base64ToFile(image.imageBase64, image.fileName, image.mimeType);
            } else {
                 const res = await fetch(image.processedUrl);
                 const blob = await res.blob();
                 url = URL.createObjectURL(blob);
                 file = new File([blob], image.fileName, { type: image.mimeType });
            }
            
            setIsPickerOpen(false);
            setPickerTarget(null);
            
            onSwitchToolWithImage({ url, file }, action);

        } catch(e) {
            showToast("Lỗi chuyển công cụ.", "error");
        }
    };

    
    const handleProcessFace = async (modelType: 'flash' | 'pro') => {
        if (!rawFaceImage || !session) return;
        // UPDATE: Pro Face Lock cost = 10 diamonds
        const cost = modelType === 'pro' ? 10 : 1;

        if (user && user.diamonds < cost) {
             showToast(t('creator.aiTool.common.errorCredits', { cost, balance: user.diamonds }), 'error');
             return;
        }

        setIsProcessingFace(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(rawFaceImage.file);
            reader.onloadend = async () => {
                const base64Image = reader.result;
                const response = await fetch('/.netlify/functions/process-face', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ 
                        image: base64Image,
                        model: modelType === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image' 
                    }),
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
    const getCost = () => {
        let cost = 0;
        if (selectedModel.apiModel === 'gemini-3-pro-image-preview') {
             // UPDATE: Pro Pricing Logic
             if (imageResolution === '4K') cost = 20;
             else if (imageResolution === '2K') cost = 15;
             else cost = 10; // 1K Pro Base
        } else {
            cost = 1; // Flash
        }
        if (useUpscaler) cost += 1;
        if (removeWatermark) cost += 1; // +1 for removing watermark
        return cost;
    };

    const generationCost = getCost();

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
        generateImage(
            prompt, 
            selectedModel,
            poseImage?.file ?? null,
            styleImage?.file ?? null,
            finalFaceImage,
            aspectRatio, 
            negativePrompt,
            seed || undefined, 
            useUpscaler,
            imageResolution, 
            useGoogleSearch,
            removeWatermark 
        );
    };
    
    const openInstructionModal = (key: 'character' | 'style' | 'prompt' | 'advanced' | 'face') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const isImageInputDisabled = !selectedModel.supportedModes.includes('image-to-image');
    const isProModel = selectedModel.apiModel === 'gemini-3-pro-image-preview';
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-result',
        image_url: generatedImage,
        prompt: prompt,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: t('common.creator'), photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: t(selectedModel.name),
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
            <div className="bg-black/30 p-4 rounded-lg flex flex-col items-center justify-center min-h-[70vh]">
                <GenerationProgress progressText={progressText} progressPercentage={progressPercentage} onCancel={cancelGeneration} />
                {error && <p className="mt-4 text-red-400 text-center">{error}</p>}
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
                    <h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">{t('creator.aiTool.common.success')}</h3>
                    <div 
                        className="max-w-md w-full mx-auto bg-black/20 rounded-lg overflow-hidden border-2 border-pink-500/30 cursor-pointer group relative"
                        style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                        onClick={() => setIsResultModalOpen(true)}
                    >
                        <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <i className="ph-fill ph-magnifying-glass-plus text-5xl text-white"></i>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-6 justify-center">
                        <button onClick={resetGenerator} className="themed-button-secondary px-6 py-3 font-semibold">
                            <i className="ph-fill ph-arrow-counter-clockwise mr-2"></i>{t('creator.aiTool.common.createAnother')}
                        </button>
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-6 py-3 font-bold">
                            <i className="ph-fill ph-download-simple mr-2"></i>{t('creator.aiTool.common.downloadAndCopy')}
                        </button>
                    </div>
                </div>
             </>
        )
    }


    return (
        <>
            <ProcessedImagePickerModal 
                isOpen={isPickerOpen} 
                onClose={() => setIsPickerOpen(false)} 
                onSelect={handleImageSelectFromPicker}
                onCropSelect={handleCropSelectFromPicker}
                onProcessAction={handleProcessAction}
            />
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={generationCost} />
            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModel.id} onSelectModel={(id: string) => setSelectedModel(DETAILED_AI_MODELS.find((m: AIModel) => m.id === id) || selectedModel)} characterImage={!!poseImage} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />
            <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="single-photo" />

            {/* Upgrade Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 border border-yellow-400/40 rounded-xl p-5 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-[0_0_15px_rgba(245,158,11,0.15)] relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/5 via-transparent to-yellow-400/5 opacity-50 pointer-events-none group-hover:animate-[shimmer_3s_infinite]"></div>
                <div className="flex items-start gap-4 relative z-10">
                    <div className="flex-shrink-0 bg-gradient-to-br from-yellow-400 to-amber-600 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30">
                        <i className="ph-fill ph-rocket-launch text-2xl"></i>
                    </div>
                    <div>
                        <h4 className="text-lg font-bold text-yellow-100 flex items-center gap-2">
                            {t('creator.aiTool.upgradeBanner.title')}
                            <span className="px-2 py-0.5 bg-yellow-400 text-black text-[10px] font-black rounded uppercase tracking-wide">PRO</span>
                        </h4>
                        <p className="text-sm text-yellow-100/80 mt-1 leading-relaxed max-w-2xl">
                            {t('creator.aiTool.upgradeBanner.desc')}
                        </p>
                    </div>
                </div>
                <button onClick={() => setModelModalOpen(true)} className="flex-shrink-0 whitespace-nowrap px-6 py-3 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-bold text-sm rounded-lg transition-all shadow-lg shadow-amber-500/20 transform hover:-translate-y-0.5 relative z-10 flex items-center gap-2">
                    <i className="ph-bold ph-swaps"></i>
                    {t('creator.aiTool.upgradeBanner.button')}
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-2/3 flex flex-col gap-6">
                     <div className="p-4 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-lg text-sm flex items-start gap-3">
                        <i className="ph-fill ph-info text-2xl flex-shrink-0"></i>
                        <div>
                            <span className="font-bold">{t('langName') === 'English' ? 'Tip:' : 'Mẹo:'}</span> {t('creator.aiTool.singlePhoto.bgRemoverTip')}
                            <button onClick={onSwitchToUtility} className="font-bold underline ml-2 hover:text-white">{t('creator.aiTool.singlePhoto.switchToBgRemover')}</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <SettingsBlock title={t('creator.aiTool.singlePhoto.characterTitle')} instructionKey="character" onInstructionClick={() => openInstructionModal('character')}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose')} image={poseImage} onRemove={() => handleRemoveImage('pose')} text={t('creator.aiTool.singlePhoto.characterUploadText')} disabled={isImageInputDisabled} onPickFromProcessed={() => handleOpenPicker('pose')} />
                            <div className="mt-2 space-y-2">
                                <ToggleSwitch label={t('creator.aiTool.singlePhoto.faceLockLabel')} checked={useBasicFaceLock} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseBasicFaceLock(e.target.checked)} disabled={isImageInputDisabled || !poseImage} />
                                <p className="text-xs text-skin-muted px-1 leading-relaxed">{t('creator.aiTool.singlePhoto.faceLockDesc')}</p>
                            </div>
                        </SettingsBlock>
                         <SettingsBlock title={t('creator.aiTool.singlePhoto.superFaceLockTitle')} instructionKey="face" onInstructionClick={() => openInstructionModal('face')}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'face')} image={rawFaceImage ? { url: processedFaceImage ? `data:image/png;base64,${processedFaceImage}` : rawFaceImage.url } : null} onRemove={() => handleRemoveImage('face')} text={t('creator.aiTool.singlePhoto.superFaceLockUploadText')} disabled={isImageInputDisabled} onPickFromProcessed={() => handleOpenPicker('face')} />
                             <div className="mt-2 space-y-2">
                                {rawFaceImage && !processedFaceImage && (
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => handleProcessFace('flash')} disabled={isProcessingFace} className="w-full text-xs font-bold py-2 px-2 bg-blue-500/20 text-blue-300 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 disabled:opacity-50">
                                            {isProcessingFace ? t('creator.aiTool.singlePhoto.superFaceLockProcessing') : t('creator.aiTool.singlePhoto.superFaceLockActionFlash')}
                                        </button>
                                        <button onClick={() => handleProcessFace('pro')} disabled={isProcessingFace} className="w-full text-xs font-bold py-2 px-2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 rounded-lg hover:bg-yellow-500/30 disabled:opacity-50">
                                            {isProcessingFace ? t('creator.aiTool.singlePhoto.superFaceLockProcessing') : t('creator.aiTool.singlePhoto.superFaceLockActionPro')}
                                        </button>
                                    </div>
                                )}
                                {processedFaceImage && (
                                     <div className="w-full text-sm font-bold py-2 px-3 bg-green-500/20 text-green-300 rounded-lg text-center">
                                        <i className="ph-fill ph-check-circle mr-1"></i> {t('creator.aiTool.singlePhoto.superFaceLockProcessed')}
                                    </div>
                                )}
                                <p className="text-xs text-skin-muted px-1 leading-relaxed">{t('creator.aiTool.singlePhoto.superFaceLockDesc')}</p>
                            </div>
                        </SettingsBlock>
                         <SettingsBlock title={t('creator.aiTool.singlePhoto.styleTitle')} instructionKey="style" onInstructionClick={() => openInstructionModal('style')}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => handleRemoveImage('style')} text={t('creator.aiTool.singlePhoto.styleUploadText')} processType="style" disabled={isImageInputDisabled} />
                            <div className="mt-2 space-y-2">
                                <p className="text-xs text-skin-muted px-1 leading-relaxed">{t('creator.aiTool.singlePhoto.styleDesc')}</p>
                            </div>
                        </SettingsBlock>
                    </div>
                    
                    <SettingsBlock 
                        title={t('creator.aiTool.singlePhoto.promptTitle')} 
                        instructionKey="prompt" 
                        onInstructionClick={() => openInstructionModal('prompt')}
                        className="flex-grow flex flex-col"
                        extraHeaderContent={
                            /* Desktop Button */
                            <button
                                onClick={() => setIsPromptLibraryOpen(true)}
                                className="hidden md:flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-full px-3 py-1.5 font-semibold transition whitespace-nowrap"
                                title={t('modals.promptLibrary.buttonTooltip')}
                            >
                                <i className="ph-fill ph-scroll"></i>
                                <span>Sử dụng Prompt có sẵn</span>
                            </button>
                        }
                    >
                        <div className="flex flex-col flex-grow h-full">
                            {/* Mobile Button */}
                            <div className="flex justify-end md:hidden mb-2">
                                <button
                                    onClick={() => setIsPromptLibraryOpen(true)}
                                    className="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-full px-3 py-1.5 font-semibold transition whitespace-nowrap"
                                    title={t('modals.promptLibrary.buttonTooltip')}
                                >
                                    <i className="ph-fill ph-scroll"></i>
                                    <span>Sử dụng Prompt có sẵn</span>
                                </button>
                            </div>
                            <textarea 
                                value={prompt} 
                                onChange={(e) => setPrompt(e.target.value)} 
                                placeholder={t('creator.aiTool.singlePhoto.promptPlaceholder')} 
                                className="w-full p-3 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition text-base text-white flex-grow resize-none h-full min-h-[150px] auth-input" 
                            />
                        </div>
                    </SettingsBlock>
                </div>

                {/* Sidebar (Right) */}
                <div className="w-full lg:w-1/3 themed-panel p-4 flex flex-col">
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.advancedSettingsTitle')} instructionKey="advanced" onInstructionClick={() => openInstructionModal('advanced')}>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.singlePhoto.modelLabel')}</label>
                                <button onClick={() => setModelModalOpen(true)} className="p-3 bg-black/30 rounded-lg border border-gray-600 hover:border-pink-500 text-left w-full transition auth-input flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-white truncate">{t(selectedModel.name)}</p>
                                        <p className="text-[10px] text-skin-muted">{selectedModel.id === 'audition-ai-pro-v3' ? 'Gemini 3 Pro (4K)' : 'Flash / Imagen'}</p>
                                    </div>
                                    <span className="text-xs font-bold text-pink-400 bg-pink-500/10 px-2 py-1 rounded">
                                        {selectedModel.apiModel === 'gemini-3-pro-image-preview' ? '10+ 💎' : '1 💎'}
                                    </span>
                                </button>
                            </div>
                            
                            {/* Resolution & Google Search - Only for Pro */}
                            {isProModel && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-3">
                                     <div>
                                        <label className="text-xs font-bold text-yellow-400 mb-2 block flex justify-between">
                                            <span>Resolution (Pro)</span>
                                            <span className="text-[10px] bg-yellow-500/20 px-2 py-0.5 rounded">{imageResolution === '1K' ? '10💎' : imageResolution === '2K' ? '15💎' : '20💎'}</span>
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['1K', '2K', '4K'] as const).map(res => (
                                                <button 
                                                    key={res}
                                                    onClick={() => setImageResolution(res)}
                                                    className={`py-1.5 px-2 text-xs font-bold rounded border transition-all ${imageResolution === res ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-transparent text-yellow-200/70 border-yellow-500/30 hover:bg-yellow-500/20'}`}
                                                >
                                                    {res}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-yellow-500/20">
                                        <ToggleSwitch 
                                            label="Google Search Grounding" 
                                            checked={useGoogleSearch} 
                                            onChange={(e) => setUseGoogleSearch(e.target.checked)} 
                                        />
                                        <p className="text-[10px] text-yellow-200/60 mt-1">
                                            Giúp AI hiểu rõ hơn về các sự kiện, nhân vật và đồ vật thực tế.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="relative" ref={styleDropdownRef}>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.singlePhoto.styleLabel')}</label>
                                <div className="custom-select-wrapper">
                                    <button onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)} className="custom-select-trigger">
                                        <span>{t(STYLE_PRESETS_NEW.find((p: StylePreset) => p.id === selectedStyle)?.name || 'modals.styles.none')}</span>
                                        <i className={`ph-fill ph-caret-down transition-transform ${isStyleDropdownOpen ? 'rotate-180' : ''}`}></i>
                                    </button>
                                    {isStyleDropdownOpen && (
                                        <div className="custom-select-options">
                                            {STYLE_PRESETS_NEW.map((p: StylePreset) => (
                                                <button key={p.id} onClick={() => { setSelectedStyle(p.id); setIsStyleDropdownOpen(false); }} className={`custom-select-option ${selectedStyle === p.id ? 'active' : ''}`}>
                                                    <span>{t(p.name)}</span>
                                                    {selectedStyle === p.id && <i className="ph-fill ph-check"></i>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.singlePhoto.negativePromptLabel')}</label>
                                <textarea value={negativePrompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNegativePrompt(e.target.value)} placeholder={t('creator.aiTool.singlePhoto.negativePromptPlaceholder')} className="w-full p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-sm text-white resize-none auth-input" rows={2} />
                            </div>

                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.singlePhoto.seedLabel')}</label>
                                 <input type="number" value={seed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeed(e.target.value === '' ? '' : parseInt(e.target.value, 10))} placeholder={t('creator.aiTool.singlePhoto.seedPlaceholder')} className="w-full p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-sm text-white auth-input" />
                            </div>
                            
                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.singlePhoto.aspectRatioLabel')}</label>
                                <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                    {ASPECT_RATIOS.map(ar => (
                                        <button 
                                            key={ar.value} 
                                            onClick={() => setAspectRatio(ar.value)} 
                                            className={`p-2 rounded-md flex flex-col items-center justify-center gap-1 border-2 transition hover:scale-105 ${aspectRatio === ar.value ? 'selected-glow' : 'border-skin-border bg-skin-fill-secondary hover:border-pink-500/50 text-skin-base'}`}
                                            title={ar.label}
                                        >
                                            <i className={`ph-fill ${ar.icon} text-xl`}></i>
                                            <span className="text-[10px] font-semibold">{ar.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Upscaler and Watermark Toggles */}
                            <div className="space-y-3">
                                {!isProModel && (
                                    <div>
                                        <ToggleSwitch label={t('creator.aiTool.singlePhoto.upscalerLabel')} checked={useUpscaler} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseUpscaler(e.target.checked)} />
                                        <p className="text-xs text-skin-muted px-1 mt-1 leading-relaxed">{t('creator.aiTool.singlePhoto.upscalerDesc')}</p>
                                    </div>
                                )}
                                <div>
                                    <ToggleSwitch 
                                        label={t('creator.aiTool.singlePhoto.removeWatermarkLabel')} 
                                        checked={removeWatermark} 
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoveWatermark(e.target.checked)} 
                                    />
                                    <p className="text-xs text-skin-muted px-1 mt-1 leading-relaxed">{t('creator.aiTool.singlePhoto.removeWatermarkDesc')}</p>
                                </div>
                            </div>
                        </div>
                    </SettingsBlock>
                    
                    <div className="mt-auto pt-6 space-y-4">
                        <div className="text-center text-sm p-3 bg-black/20 rounded-lg">
                            <p className="text-skin-muted">{t('creator.aiTool.common.cost')}: <span className="font-bold text-pink-400 flex items-center justify-center gap-1">{generationCost} <i className="ph-fill ph-diamonds-four"></i></span></p>
                            <p className="text-skin-muted">{t('creator.aiTool.common.balance')}: <span className="font-bold text-white">{user?.diamonds.toLocaleString() || 0} 💎</span></p>
                        </div>
                        <button onClick={handleGenerateClick} disabled={isGenerating || !prompt.trim()} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i className="ph-fill ph-magic-wand"></i>
                            {t('creator.aiTool.singlePhoto.generateButton')}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AiGeneratorTool;
