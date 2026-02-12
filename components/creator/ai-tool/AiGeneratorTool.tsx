
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useImageGenerator } from '../../../hooks/useImageGenerator';
import { useAuth } from '../../../contexts/AuthContext';
import { STYLE_PRESETS_NEW } from '../../../constants/aiToolData';
import { AIModel } from '../../../types';

import SettingsBlock from './SettingsBlock';
import ImageUploader from '../../ai-tool/ImageUploader';
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

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage, initialFaceImage }) => {
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
    const [processedFaceImage, setProcessedFaceImage] = useState<string | null>(null);
    const [styleImage, setStyleImage] = useState<{ url: string; file: File } | null>(null);
    const [isProcessingFace, setIsProcessingFace] = useState(false);

    const [prompt, setPrompt] = useState('');
    // Removed unused negativePrompt state
    
    // Config
    const [modelType, setModelType] = useState<'flash' | 'pro'>('flash');
    const [imageResolution, setImageResolution] = useState<'1K' | '2K' | '4K'>('1K');
    const [enableGoogleSearch, setEnableGoogleSearch] = useState(false);
    
    const [selectedStyle, setSelectedStyle] = useState('none');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [useUpscaler, setUseUpscaler] = useState(false);
    const [useBasicFaceLock, setUseBasicFaceLock] = useState(true);
    const [removeWatermark, setRemoveWatermark] = useState(false);
    
    const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
    const styleDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialCharacterImage) setPoseImage(initialCharacterImage);
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
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl }) => {
                const newImage = { url: dataUrl, file: resizedFile };
                if (type === 'pose') setPoseImage(newImage);
                else if (type === 'face') { setRawFaceImage(newImage); setProcessedFaceImage(null); }
                else if (type === 'style') setStyleImage(newImage);
            }).catch(() => showToast(t('creator.aiTool.common.errorProcessImage'), "error"));
        }
    };

    const handleRemoveImage = (type: 'pose' | 'face' | 'style') => {
        if (type === 'pose') setPoseImage(null);
        else if (type === 'face') { setRawFaceImage(null); setProcessedFaceImage(null); }
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
        } catch (err: any) { showToast(err.message, 'error'); } finally { setIsProcessingFace(false); }
    };

    const calculateCost = () => {
        let cost = 1;
        if (modelType === 'pro') {
            if (imageResolution === '4K') cost = 20;
            else if (imageResolution === '2K') cost = 15;
            else cost = 10;
        }
        if (useUpscaler) cost += 1;
        if (removeWatermark) cost += 1;
        return cost;
    };
    
    const generationCost = calculateCost();

    const handleGenerateClick = () => {
        if (!prompt.trim()) return showToast(t('creator.aiTool.common.errorPrompt'), 'error');
        if (user && user.diamonds < generationCost) return showToast(t('creator.aiTool.common.errorCredits', { cost: generationCost, balance: user.diamonds }), 'error');
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = () => {
        setConfirmOpen(false);
        const finalFaceImage = processedFaceImage ? processedFaceImage : (useBasicFaceLock && poseImage) ? poseImage.file : null;
        const selectedModelObj: AIModel = {
            id: modelType === 'pro' ? 'gemini-3-pro' : 'gemini-flash',
            name: modelType === 'pro' ? 'Nano Banana Pro' : 'Nano Banana',
            description: '',
            apiModel: modelType === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image',
            tags: [], details: [], supportedModes: ['text-to-image', 'image-to-image']
        };

        generateImage(prompt, selectedModelObj, poseImage?.file ?? null, styleImage?.file ?? null, finalFaceImage, aspectRatio, "", undefined, useUpscaler, imageResolution, enableGoogleSearch, removeWatermark);
    };
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-result', image_url: generatedImage, prompt: prompt,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: t('common.creator'), photo_url: '', level: 1 },
        created_at: new Date().toISOString(), model_used: modelType === 'pro' ? `Pro (${imageResolution})` : 'Flash', user_id: user?.id || ''
    } : null;

    const { progressText, progressPercentage } = useMemo(() => {
        if (!isGenerating) return { progressText: '', progressPercentage: 0 };
        const percentage = Math.min(progress * 10, 99);
        let text = t('creator.aiTool.common.waiting');
        if (progress > 0 && progress < 3) text = t('creator.aiTool.common.initializing');
        else if (progress >= 3 && progress < 9) text = t('creator.aiTool.common.drawing');
        else if (progress >= 9) text = t('creator.aiTool.common.finishing');
        return { progressText: text, progressPercentage: percentage };
    }, [isGenerating, progress, t]);

    if (isGenerating) {
        return (
            <div className="bg-black/30 p-8 rounded-2xl flex flex-col items-center justify-center min-h-[50vh] border border-white/10 shadow-2xl">
                <GenerationProgress progressText={progressText} progressPercentage={progressPercentage} onCancel={cancelGeneration} />
                {error && <p className="mt-6 text-red-400 text-center font-bold bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}
            </div>
        );
    }
    
    if (generatedImage) {
        return (
             <>
                <ImageModal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} image={resultImageForModal} showInfoPanel={false} />
                <div className="text-center animate-fade-in w-full min-h-[60vh] flex flex-col items-center justify-center">
                    <h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-md">{t('creator.aiTool.common.success')}</h3>
                    <div className="max-w-xs w-full mx-auto bg-black/40 rounded-xl overflow-hidden border-2 border-pink-500/50 cursor-pointer group relative shadow-[0_0_50px_rgba(236,72,153,0.15)]" style={{ aspectRatio: aspectRatio.replace(':', '/') }} onClick={() => setIsResultModalOpen(true)}>
                        <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm"><i className="ph-fill ph-magnifying-glass-plus text-4xl text-white"></i></div>
                    </div>
                    <div className="flex gap-3 mt-6 justify-center">
                        <button onClick={resetGenerator} className="themed-button-secondary px-6 py-2 font-bold text-sm rounded-full shadow-lg"><i className="ph-fill ph-arrow-counter-clockwise mr-2"></i>{t('creator.aiTool.common.createAnother')}</button>
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-6 py-2 font-bold text-sm rounded-full shadow-lg"><i className="ph-fill ph-download-simple mr-2"></i>{t('creator.aiTool.common.downloadAndCopy')}</button>
                    </div>
                </div>
             </>
        )
    }

    // --- COMPACT LAYOUT (3 Columns: 3 - 6 - 3) ---
    return (
        <>
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={generationCost} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />
            <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="single-photo" />

            <div className="grid grid-cols-12 gap-3 h-full pb-20">
                {/* COL 1: CHARACTER (3/12) */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-2">
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.characterTitle')} instructionKey="character" onInstructionClick={() => { setInstructionKey('character'); setInstructionModalOpen(true); }} variant="pink" className="h-full flex flex-col">
                        <div className="flex-grow w-full relative group">
                            <div className="aspect-[3/4] w-full">
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose')} image={poseImage} onRemove={() => handleRemoveImage('pose')} text={t('creator.aiTool.singlePhoto.characterUploadText')} disabled={false} className="w-full h-full" />
                            </div>
                            {poseImage && (
                                <div className="absolute bottom-1 left-1 right-1 bg-black/70 backdrop-blur-md rounded px-2 py-1 flex items-center justify-between border border-white/10">
                                    <label className="text-[9px] font-bold text-pink-300 flex items-center gap-1"><i className="ph-fill ph-face-mask"></i> Khóa mặt (70%)</label>
                                    <ToggleSwitch label="" checked={useBasicFaceLock} onChange={(e) => setUseBasicFaceLock(e.target.checked)} />
                                </div>
                            )}
                        </div>
                    </SettingsBlock>
                </div>

                {/* COL 2: FACE + REF + PROMPT (6/12) */}
                <div className="col-span-12 lg:col-span-6 flex flex-col gap-2 h-full">
                    {/* Upper Row: Face & Ref (Compact) */}
                    <div className="grid grid-cols-2 gap-2 h-40">
                         <div className="bg-[#1e1b25] border border-pink-500/30 rounded-xl p-2 flex flex-col gap-1 relative shadow-sm h-full">
                             <div className="flex justify-between items-center h-5">
                                 <h4 className="text-[10px] font-bold text-pink-400 uppercase">Face ID (95%)</h4>
                                 <button onClick={() => { setInstructionKey('face'); setInstructionModalOpen(true); }} className="text-gray-500 hover:text-white"><i className="ph-fill ph-question text-xs"></i></button>
                             </div>
                             <div className="flex-grow w-full relative">
                                 <ImageUploader onUpload={(e) => handleImageUpload(e, 'face')} image={rawFaceImage ? { url: processedFaceImage ? `data:image/png;base64,${processedFaceImage}` : rawFaceImage.url } : null} onRemove={() => handleRemoveImage('face')} text="Face" className="w-full h-full object-contain" />
                                 {rawFaceImage && !processedFaceImage && (
                                    <button onClick={handleProcessFace} disabled={isProcessingFace} className="absolute bottom-1 right-1 left-1 text-[9px] font-bold py-1 bg-yellow-500 text-black rounded shadow disabled:opacity-50">
                                        {isProcessingFace ? '...' : 'Xử lý (-1💎)'}
                                    </button>
                                )}
                                {processedFaceImage && <div className="absolute bottom-1 right-1 bg-green-500 text-white text-[8px] font-bold px-1.5 rounded-full shadow">Đã khóa</div>}
                             </div>
                         </div>
                         <div className="bg-[#1e1b25] border border-cyan-500/30 rounded-xl p-2 flex flex-col gap-1 relative shadow-sm h-full">
                             <div className="flex justify-between items-center h-5">
                                 <h4 className="text-[10px] font-bold text-cyan-400 uppercase">Ảnh Mẫu</h4>
                                 <button onClick={() => { setInstructionKey('style'); setInstructionModalOpen(true); }} className="text-gray-500 hover:text-white"><i className="ph-fill ph-question text-xs"></i></button>
                             </div>
                             <div className="flex-grow w-full relative">
                                 <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => handleRemoveImage('style')} text="Ref Style" className="w-full h-full" />
                             </div>
                         </div>
                    </div>

                    {/* Prompt Box */}
                    <div className="flex-grow min-h-0">
                        <SettingsBlock title={t('creator.aiTool.singlePhoto.promptTitle')} instructionKey="prompt" onInstructionClick={() => { setInstructionKey('prompt'); setInstructionModalOpen(true); }} variant="purple" className="h-full flex flex-col">
                            <div className="relative h-full flex flex-col">
                                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('creator.aiTool.singlePhoto.promptPlaceholder')} className="w-full p-3 bg-black/40 rounded-xl border border-white/10 focus:border-purple-500 transition text-sm text-white flex-grow resize-none shadow-inner leading-relaxed min-h-[80px]" />
                                <button onClick={() => setIsPromptLibraryOpen(true)} className="absolute bottom-2 right-2 text-[10px] text-cyan-300 bg-cyan-900/30 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-full px-2 py-1 font-bold transition flex items-center gap-1">
                                    <i className="ph-fill ph-book-bookmark"></i> {t('modals.promptLibrary.button')}
                                </button>
                            </div>
                        </SettingsBlock>
                    </div>
                </div>

                {/* COL 3: SETTINGS (3/12) */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-2">
                    <SettingsBlock title="Cài đặt" instructionKey="advanced" onInstructionClick={() => { setInstructionKey('advanced'); setInstructionModalOpen(true); }} variant="yellow">
                        <div className="space-y-3">
                            {/* Model */}
                            <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                <button onClick={() => setModelType('flash')} className={`py-1.5 rounded text-[10px] font-bold flex flex-col items-center ${modelType === 'flash' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}>Flash (1💎)</button>
                                <button onClick={() => setModelType('pro')} className={`py-1.5 rounded text-[10px] font-bold flex flex-col items-center ${modelType === 'pro' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-white'}`}>Pro (Gemini 3)</button>
                            </div>
                            
                            {/* Pro Options */}
                            {modelType === 'pro' && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2 space-y-2">
                                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-yellow-500">Chất lượng</span><div className="flex gap-1">{(['1K', '2K', '4K'] as const).map(res => (<button key={res} onClick={() => setImageResolution(res)} className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${imageResolution === res ? 'bg-yellow-500 text-black border-yellow-500' : 'text-gray-400 border-white/10'}`}>{res}</button>))}</div></div>
                                    <div className="flex justify-between items-center border-t border-yellow-500/10 pt-1"><span className="text-[10px] text-gray-300 flex items-center gap-1"><i className="ph-bold ph-google-logo text-blue-400"></i> Grounding</span><ToggleSwitch label="" checked={enableGoogleSearch} onChange={(e) => setEnableGoogleSearch(e.target.checked)} /></div>
                                </div>
                            )}
                            
                            {/* Style Select */}
                            <div className="relative" ref={styleDropdownRef}>
                                <button onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 flex items-center justify-between text-xs text-white">
                                    <span className="truncate"><i className="ph-fill ph-palette text-pink-400 mr-1"></i> {t(STYLE_PRESETS_NEW.find(p => p.id === selectedStyle)?.name || 'modals.styles.none')}</span>
                                    <i className="ph-fill ph-caret-down text-[10px]"></i>
                                </button>
                                {isStyleDropdownOpen && (
                                    <div className="absolute top-full left-0 w-full mt-1 bg-[#1e1b25] border border-white/10 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                        {STYLE_PRESETS_NEW.map(p => (<button key={p.id} onClick={() => { setSelectedStyle(p.id); setIsStyleDropdownOpen(false); }} className={`w-full text-left px-2 py-1.5 rounded text-[10px] ${selectedStyle === p.id ? 'bg-pink-500/20 text-pink-300' : 'text-gray-300 hover:bg-white/10'}`}>{t(p.name)}</button>))}
                                    </div>
                                )}
                            </div>

                             {/* Ratio */}
                             <div className="grid grid-cols-5 gap-1">
                                {(['3:4', '1:1', '4:3', '9:16', '16:9'] as const).map(ar => (
                                    <button key={ar} onClick={() => setAspectRatio(ar)} className={`py-1 rounded border text-[9px] font-bold ${aspectRatio === ar ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/10 text-gray-500 hover:bg-white/5'}`}>{ar}</button>
                                ))}
                            </div>
                            
                            {/* Toggles */}
                            <div className="bg-white/5 p-2 rounded-lg space-y-1">
                                <div className="flex items-center justify-between"><span className="text-[10px] text-gray-300 flex items-center gap-1"><i className="ph-fill ph-magic-wand text-pink-400"></i> Upscaler</span><ToggleSwitch label="" checked={useUpscaler} onChange={(e) => setUseUpscaler(e.target.checked)} /></div>
                                <div className="flex items-center justify-between"><span className="text-[10px] text-gray-300 flex items-center gap-1"><i className="ph-fill ph-eraser text-red-400"></i> NoWatermark</span><ToggleSwitch label="" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} /></div>
                            </div>
                        </div>
                    </SettingsBlock>
                    
                    {/* Generate Btn */}
                    <div className="mt-auto bg-[#1e1b25] p-3 rounded-xl border border-white/10 shadow-lg sticky bottom-0 z-10">
                        <div className="flex justify-between items-end mb-2">
                             <div><p className="text-[10px] text-gray-400 font-bold uppercase">Chi phí</p><p className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">{generationCost} 💎</p></div>
                             <div className="text-right"><p className="text-[10px] text-gray-400 font-bold uppercase">Số dư</p><p className="text-sm font-bold text-white">{user?.diamonds.toLocaleString()} 💎</p></div>
                        </div>
                        <button onClick={handleGenerateClick} disabled={isGenerating || !prompt.trim()} className="themed-button-primary w-full py-3 text-base font-black rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isGenerating ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-sparkle"></i>} {t('creator.aiTool.singlePhoto.generateButton')}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AiGeneratorTool;
