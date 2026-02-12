
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

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage, initialFaceImage, onSwitchToUtility }) => {
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
    const [negativePrompt, setNegativePrompt] = useState('');
    const [seed, setSeed] = useState<number | ''>('');
    
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

        generateImage(prompt, selectedModelObj, poseImage?.file ?? null, styleImage?.file ?? null, finalFaceImage, aspectRatio, negativePrompt, seed || undefined, useUpscaler, imageResolution, enableGoogleSearch, removeWatermark);
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
                    <div className="max-w-md w-full mx-auto bg-black/40 rounded-xl overflow-hidden border-2 border-pink-500/50 cursor-pointer group relative shadow-[0_0_50px_rgba(236,72,153,0.15)]" style={{ aspectRatio: aspectRatio.replace(':', '/') }} onClick={() => setIsResultModalOpen(true)}>
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

    return (
        <>
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={generationCost} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />
            <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="single-photo" />

            {/* CLASSIC 2-COLUMN LAYOUT */}
            <div className="flex flex-col lg:flex-row gap-6 pb-20">
                
                {/* --- LEFT COLUMN: INPUTS (2/3) --- */}
                <div className="w-full lg:w-2/3 flex flex-col gap-6">
                    
                    {/* TIP BANNER */}
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-lg text-sm flex items-center gap-3">
                        <i className="ph-fill ph-info text-xl flex-shrink-0"></i>
                        <div>
                            <span className="font-bold">{t('langName') === 'English' ? 'Tip:' : 'Mẹo:'}</span> {t('creator.aiTool.singlePhoto.bgRemoverTip')}
                            <button onClick={onSwitchToUtility} className="font-bold underline ml-2 hover:text-white">{t('creator.aiTool.singlePhoto.switchToBgRemover')}</button>
                        </div>
                    </div>

                    {/* INPUT GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. CHARACTER */}
                        <SettingsBlock title={t('creator.aiTool.singlePhoto.characterTitle')} instructionKey="character" onInstructionClick={() => { setInstructionKey('character'); setInstructionModalOpen(true); }} variant="pink">
                            <div className="aspect-[3/4] w-full">
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose')} image={poseImage} onRemove={() => handleRemoveImage('pose')} text={t('creator.aiTool.singlePhoto.characterUploadText')} className="w-full h-full" />
                            </div>
                            <div className="mt-2 flex items-center justify-between bg-black/30 p-2 rounded">
                                <span className="text-[10px] font-bold text-gray-300">Khóa mặt (70%)</span>
                                <ToggleSwitch label="" checked={useBasicFaceLock} onChange={(e) => setUseBasicFaceLock(e.target.checked)} disabled={!poseImage} />
                            </div>
                        </SettingsBlock>

                        {/* 2. FACE ID */}
                        <SettingsBlock title={t('creator.aiTool.singlePhoto.superFaceLockTitle')} instructionKey="face" onInstructionClick={() => { setInstructionKey('face'); setInstructionModalOpen(true); }} variant="pink">
                            <div className="aspect-square w-full mb-2">
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'face')} image={rawFaceImage ? { url: processedFaceImage ? `data:image/png;base64,${processedFaceImage}` : rawFaceImage.url } : null} onRemove={() => handleRemoveImage('face')} text="Face ID" className="w-full h-full object-contain" />
                            </div>
                            {rawFaceImage && !processedFaceImage && (
                                <button onClick={handleProcessFace} disabled={isProcessingFace} className="w-full text-xs font-bold py-2 bg-yellow-500/20 text-yellow-300 rounded hover:bg-yellow-500/30 border border-yellow-500/50">
                                    {isProcessingFace ? '...' : t('creator.aiTool.singlePhoto.superFaceLockProcess')}
                                </button>
                            )}
                            {processedFaceImage && <div className="text-center text-xs font-bold text-green-400 bg-green-500/10 py-1 rounded border border-green-500/30">Đã khóa</div>}
                        </SettingsBlock>

                        {/* 3. STYLE */}
                        <SettingsBlock title={t('creator.aiTool.singlePhoto.styleTitle')} instructionKey="style" onInstructionClick={() => { setInstructionKey('style'); setInstructionModalOpen(true); }} variant="blue">
                            <div className="aspect-square w-full mb-2">
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => handleRemoveImage('style')} text="Reference" className="w-full h-full" />
                            </div>
                            <p className="text-[10px] text-gray-400 text-center leading-tight">AI học màu sắc & ánh sáng từ ảnh này.</p>
                        </SettingsBlock>
                    </div>

                    {/* PROMPT BOX */}
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.promptTitle')} instructionKey="prompt" onInstructionClick={() => { setInstructionKey('prompt'); setInstructionModalOpen(true); }} variant="purple">
                        <div className="relative">
                            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('creator.aiTool.singlePhoto.promptPlaceholder')} className="w-full p-4 bg-black/40 rounded-xl border border-white/10 focus:border-purple-500 transition text-sm text-white flex-grow resize-none shadow-inner leading-relaxed min-h-[120px]" />
                            <button onClick={() => setIsPromptLibraryOpen(true)} className="absolute bottom-3 right-3 text-xs text-cyan-300 bg-cyan-900/30 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-full px-3 py-1 font-bold transition flex items-center gap-1">
                                <i className="ph-fill ph-book-bookmark"></i> {t('modals.promptLibrary.button')}
                            </button>
                        </div>
                    </SettingsBlock>
                </div>

                {/* --- RIGHT COLUMN: SETTINGS (1/3) --- */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4">
                    <div className="bg-[#1e1b25] border border-white/10 rounded-xl p-4 shadow-lg flex-grow">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wide border-b border-white/10 pb-2">
                            <i className="ph-fill ph-sliders-horizontal text-yellow-400"></i> Cài Đặt Nâng Cao
                        </h3>
                        
                        <div className="space-y-4">
                            {/* Model Selection */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Model AI</label>
                                <div className="grid grid-cols-2 gap-2 bg-black/30 p-1 rounded-lg">
                                    <button onClick={() => setModelType('flash')} className={`py-2 rounded text-xs font-bold flex flex-col items-center ${modelType === 'flash' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}>
                                        <span>Nano Banana</span>
                                        <span className="text-[9px] opacity-70">Flash (1💎)</span>
                                    </button>
                                    <button onClick={() => setModelType('pro')} className={`py-2 rounded text-xs font-bold flex flex-col items-center ${modelType === 'pro' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-white'}`}>
                                        <span>Gemini 3 Pro</span>
                                        <span className="text-[9px] opacity-70">4K (10💎)</span>
                                    </button>
                                </div>
                            </div>

                            {/* Pro Options */}
                            {modelType === 'pro' && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2 space-y-2">
                                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-yellow-500">Chất lượng ảnh</span><div className="flex gap-1">{(['1K', '2K', '4K'] as const).map(res => (<button key={res} onClick={() => setImageResolution(res)} className={`px-2 py-0.5 text-[10px] font-bold rounded border ${imageResolution === res ? 'bg-yellow-500 text-black border-yellow-500' : 'text-gray-400 border-white/10'}`}>{res}</button>))}</div></div>
                                    <div className="flex justify-between items-center border-t border-yellow-500/10 pt-1"><span className="text-[10px] text-gray-300">Grounding (Search)</span><ToggleSwitch label="" checked={enableGoogleSearch} onChange={(e) => setEnableGoogleSearch(e.target.checked)} /></div>
                                </div>
                            )}

                            {/* Style Dropdown */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Phong cách</label>
                                <div className="relative" ref={styleDropdownRef}>
                                    <button onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-white">
                                        <span className="truncate">{t(STYLE_PRESETS_NEW.find(p => p.id === selectedStyle)?.name || 'modals.styles.none')}</span>
                                        <i className="ph-fill ph-caret-down"></i>
                                    </button>
                                    {isStyleDropdownOpen && (
                                        <div className="absolute top-full left-0 w-full mt-1 bg-[#252529] border border-white/10 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                            {STYLE_PRESETS_NEW.map(p => (<button key={p.id} onClick={() => { setSelectedStyle(p.id); setIsStyleDropdownOpen(false); }} className={`w-full text-left px-2 py-1.5 rounded text-xs ${selectedStyle === p.id ? 'bg-pink-500/20 text-pink-300' : 'text-gray-300 hover:bg-white/10'}`}>{t(p.name)}</button>))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Negative Prompt */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Prompt Loại Trừ</label>
                                <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="VD: xấu xí, mờ, thừa ngón tay..." className="w-full p-2 bg-black/40 rounded-lg border border-white/10 text-xs text-white resize-none h-16 focus:border-red-500/50 outline-none" />
                            </div>

                            {/* Seed */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Seed (Tùy chọn)</label>
                                <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === '' ? '' : parseInt(e.target.value))} placeholder="Để trống để ngẫu nhiên" className="w-full p-2 bg-black/40 rounded-lg border border-white/10 text-xs text-white focus:border-blue-500/50 outline-none" />
                            </div>

                            {/* Ratio */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Tỷ lệ khung hình</label>
                                <div className="grid grid-cols-5 gap-1">
                                    {(['1:1', '3:4', '4:3', '9:16', '16:9'] as const).map(ar => (
                                        <button key={ar} onClick={() => setAspectRatio(ar)} className={`py-1.5 rounded border text-[10px] font-bold ${aspectRatio === ar ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/10 text-gray-500 hover:bg-white/5'}`}>{ar}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Toggles */}
                            <div className="space-y-2 bg-white/5 p-3 rounded-lg">
                                <div className="flex items-center justify-between"><span className="text-[10px] text-gray-300">Làm nét & Phóng đại (+1💎)</span><ToggleSwitch label="" checked={useUpscaler} onChange={(e) => setUseUpscaler(e.target.checked)} /></div>
                                <div className="flex items-center justify-between"><span className="text-[10px] text-gray-300">Xóa Watermark (+1💎)</span><ToggleSwitch label="" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} /></div>
                            </div>
                        </div>

                        {/* Sticky Bottom Actions */}
                        <div className="mt-6 pt-4 border-t border-white/10">
                            <div className="flex justify-between items-end mb-3">
                                <div><p className="text-[10px] text-gray-400 font-bold uppercase">Chi phí</p><p className="text-xl font-black text-pink-400">{generationCost} 💎</p></div>
                                <div className="text-right"><p className="text-[10px] text-gray-400 font-bold uppercase">Số dư</p><p className="text-sm font-bold text-white">{user?.diamonds.toLocaleString()} 💎</p></div>
                            </div>
                            <button onClick={handleGenerateClick} disabled={isGenerating || !prompt.trim()} className="themed-button-primary w-full py-3 text-base font-black rounded-lg shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">
                                {isGenerating ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-magic-wand"></i>} Bắt đầu tạo
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </>
    );
};

export default AiGeneratorTool;
