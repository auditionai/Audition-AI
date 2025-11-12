import React, { useState, useEffect, useRef } from 'react';
import { useImageGenerator } from '../../../hooks/useImageGenerator';
import { useAuth } from '../../../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../../../constants/aiToolData';
import { AIModel, StylePreset } from '../../../types';

import SettingsBlock from '../../ai-tool/SettingsBlock';
import ImageUploader from '../../ai-tool/ImageUploader';
import ModelSelectionModal from '../../ai-tool/ModelSelectionModal';
import InstructionModal from '../../ai-tool/InstructionModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ConfirmationModal from '../../ConfirmationModal';
import ImageModal from '../../common/ImageModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';
import { resizeImage } from '../../../utils/imageUtils';

type ImageState = { url: string; file: File } | null;

interface AiGeneratorToolProps {
    poseImage: ImageState;
    onPoseImageChange: (image: ImageState) => void;
    rawFaceImage: ImageState;
    onRawFaceImageChange: (image: ImageState) => void;
    processedFaceImage: string | null;
    onProcessedFaceImageChange: (image: string | null) => void;
    styleImage: ImageState;
    onStyleImageChange: (image: ImageState) => void;
}

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({
    poseImage, onPoseImageChange,
    rawFaceImage, onRawFaceImageChange,
    processedFaceImage, onProcessedFaceImageChange,
    styleImage, onStyleImageChange
}) => {
    const { user, session, showToast, updateUserDiamonds } = useAuth();
    const { isGenerating, progress, generatedImage, error, generateImage, resetGenerator, cancelGeneration } = useImageGenerator();

    // Modal States
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | 'face' | null>(null);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    
    // Feature States (now only local UI state, image state is controlled by parent)
    const [isProcessingFace, setIsProcessingFace] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [selectedModel, setSelectedModel] = useState<AIModel>(DETAILED_AI_MODELS.find((m: AIModel) => m.recommended) || DETAILED_AI_MODELS[0]);
    const [selectedStyle, setSelectedStyle] = useState('none');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [seed, setSeed] = useState<number | ''>('');
    const [useUpscaler, setUseUpscaler] = useState(false);
    const [useBasicFaceLock, setUseBasicFaceLock] = useState(true);
    
    // Custom Style Dropdown State
    const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
    const styleDropdownRef = useRef<HTMLDivElement>(null);

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
                    if (type === 'pose') onPoseImageChange(newImage);
                    else if (type === 'face') {
                        onRawFaceImageChange(newImage);
                        onProcessedFaceImageChange(null); // Reset processed image if a new one is uploaded
                    }
                    else if (type === 'style') onStyleImageChange(newImage);
                })
                .catch((err: any) => {
                    console.error("Error resizing image:", err);
                    showToast("Lỗi khi xử lý ảnh đầu vào.", "error");
                });
        }
    };

    const handleRemoveImage = (type: 'pose' | 'face' | 'style') => {
        if (type === 'pose') onPoseImageChange(null);
        else if (type === 'face') {
            onRawFaceImageChange(null);
            onProcessedFaceImageChange(null);
        }
        else if (type === 'style') onStyleImageChange(null);
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
                    body: JSON.stringify({ image: base64Image }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Xử lý gương mặt thất bại.');

                onProcessedFaceImageChange(result.processedImageBase64);
                updateUserDiamonds(result.newDiamondCount);
                showToast('Xử lý & Khóa gương mặt thành công!', 'success');
            };
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsProcessingFace(false);
        }
    };

    const generationCost = 1 + (useUpscaler ? 1 : 0);

    const handleGenerateClick = () => {
        if (!prompt.trim()) {
            showToast('Vui lòng nhập mô tả (prompt).', 'error');
            return;
        }
        if (user && user.diamonds < generationCost) {
            showToast(`Bạn cần ${generationCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = () => {
        setConfirmOpen(false);
        // Determine which face image to send
        const finalFaceImage = processedFaceImage ? processedFaceImage : (useBasicFaceLock && poseImage) ? poseImage.file : null;

        generateImage(
            prompt, selectedModel,
            poseImage?.file ?? null,
            styleImage?.file ?? null,
            finalFaceImage,
            aspectRatio, negativePrompt,
            seed || undefined, useUpscaler
        );
    };

    const handleDownloadResult = () => {
        if (!generatedImage) return;
        
        const downloadUrl = `/.netlify/functions/download-image?url=${encodeURIComponent(generatedImage)}`;
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = `audition-ai-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };
    
    const openInstructionModal = (key: 'character' | 'style' | 'prompt' | 'advanced' | 'face') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const isImageInputDisabled = !selectedModel.supportedModes.includes('image-to-image');
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-result',
        image_url: generatedImage,
        prompt: prompt,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: 'Bạn', photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: selectedModel.name,
        user_id: user?.id || ''
    } : null;

    if (isGenerating) {
        return (
            <div className="bg-black/30 p-4 rounded-lg flex flex-col items-center justify-center min-h-[70vh]">
                <GenerationProgress currentStep={progress} onCancel={cancelGeneration} />
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
                    <h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">Tạo ảnh thành công!</h3>
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
                    <div className="flex gap-4 mt-6 justify-center">
                        <button onClick={resetGenerator} className="themed-button-secondary px-6 py-3 font-semibold">
                            <i className="ph-fill ph-arrow-counter-clockwise mr-2"></i>Tạo ảnh khác
                        </button>
                        <button onClick={handleDownloadResult} className="themed-button-primary px-6 py-3 font-bold">
                            <i className="ph-fill ph-download-simple mr-2"></i>Tải xuống
                        </button>
                    </div>
                </div>
             </>
        )
    }

    return (
        <>
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={generationCost} />
            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModel.id} onSelectModel={(id: string) => setSelectedModel(DETAILED_AI_MODELS.find((m: AIModel) => m.id === id) || selectedModel)} characterImage={!!poseImage} />
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey} />

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Main Content Area (Left) */}
                <div className="w-full lg:w-2/3 flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <SettingsBlock title="Ảnh Nhân Vật" instructionKey="character" onInstructionClick={() => openInstructionModal('character')}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose')} image={poseImage} onRemove={() => handleRemoveImage('pose')} text="Tư thế & Trang phục" disabled={isImageInputDisabled} />
                            <div className="mt-2 space-y-2">
                                <ToggleSwitch label="Face Lock (70-80%)" checked={useBasicFaceLock} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseBasicFaceLock(e.target.checked)} disabled={isImageInputDisabled || !poseImage} />
                                <p className="text-xs text-skin-muted px-1 leading-relaxed">AI sẽ vẽ lại gương mặt dựa trên ảnh này. Để có độ chính xác <span className="font-bold text-yellow-400 neon-highlight"> 95%+</span>, hãy dùng <span className="font-bold text-pink-400">"Siêu Khóa Gương Mặt"</span>.</p>
                            </div>
                        </SettingsBlock>
                         <SettingsBlock title="Siêu Khóa Gương Mặt" instructionKey="face" onInstructionClick={() => openInstructionModal('face')}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'face')} image={rawFaceImage ? { url: processedFaceImage ? `data:image/png;base64,${processedFaceImage}` : rawFaceImage.url } : null} onRemove={() => handleRemoveImage('face')} text="Face ID (95%+)" disabled={isImageInputDisabled} />
                             <div className="mt-2 space-y-2">
                                {rawFaceImage && !processedFaceImage && (
                                    <button onClick={handleProcessFace} disabled={isProcessingFace} className="w-full text-sm font-bold py-2 px-3 bg-yellow-500/20 text-yellow-300 rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-wait">
                                        {isProcessingFace ? 'Đang xử lý...' : 'Xử lý & Khóa Gương Mặt (-1 💎)'}
                                    </button>
                                )}
                                {processedFaceImage && (
                                     <div className="w-full text-sm font-bold py-2 px-3 bg-green-500/20 text-green-300 rounded-lg text-center">
                                        <i className="ph-fill ph-check-circle mr-1"></i> Gương mặt đã được khóa
                                    </div>
                                )}
                                <p className="text-xs text-skin-muted px-1 leading-relaxed">Tải ảnh chân dung rõ nét, sau đó <span className="font-bold text-cyan-400 neon-highlight">bắt buộc phải nhấn nút "Xử lý"</span> để AI làm nét và khóa gương mặt. Thao tác này tốn <span className="font-bold text-pink-400">1 kim cương</span>.</p>
                            </div>
                        </SettingsBlock>
                         <SettingsBlock title="Ảnh Phong Cách" instructionKey="style" onInstructionClick={() => openInstructionModal('style')}>
                            <ImageUploader onUpload={(e) => handleImageUpload(e, 'style')} image={styleImage} onRemove={() => handleRemoveImage('style')} text="Style Reference" processType="style" disabled={isImageInputDisabled} />
                            <div className="mt-2 space-y-2">
                                <p className="text-xs text-skin-muted px-1 leading-relaxed">AI sẽ <span className="font-bold text-cyan-400 neon-highlight">học hỏi</span> dải màu, ánh sáng và bố cục từ ảnh này để áp dụng vào tác phẩm của bạn.</p>
                            </div>
                        </SettingsBlock>
                    </div>
                    
                    <SettingsBlock title="Câu Lệnh Mô Tả (Prompt)" instructionKey="prompt" onInstructionClick={() => openInstructionModal('prompt')}>
                        <textarea value={prompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)} placeholder="Mô tả chi tiết hình ảnh bạn muốn tạo, ví dụ: 'một cô gái tóc hồng, mặc váy công chúa, đang khiêu vũ trong một cung điện lộng lẫy'..." className="w-full p-3 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition text-base text-white flex-grow resize-none min-h-[150px] auth-input" />
                    </SettingsBlock>
                </div>

                {/* Sidebar (Right) */}
                <div className="w-full lg:w-1/3 themed-panel p-4 flex flex-col">
                    <SettingsBlock title="Cài đặt Nâng cao" instructionKey="advanced" onInstructionClick={() => openInstructionModal('advanced')}>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">Mô hình AI</label>
                                <button onClick={() => setModelModalOpen(true)} className="p-2 bg-black/30 rounded-md border border-gray-600 hover:border-pink-500 text-left w-full transition auth-input">
                                    <p className="font-semibold text-white truncate">{selectedModel.name}</p>
                                </button>
                            </div>
                            
                            <div className="relative" ref={styleDropdownRef}>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">Phong cách</label>
                                <div className="custom-select-wrapper">
                                    <button onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)} className="custom-select-trigger">
                                        <span>{STYLE_PRESETS_NEW.find((p: StylePreset) => p.id === selectedStyle)?.name}</span>
                                        <i className={`ph-fill ph-caret-down transition-transform ${isStyleDropdownOpen ? 'rotate-180' : ''}`}></i>
                                    </button>
                                    {isStyleDropdownOpen && (
                                        <div className="custom-select-options">
                                            {STYLE_PRESETS_NEW.map((p: StylePreset) => (
                                                <button key={p.id} onClick={() => { setSelectedStyle(p.id); setIsStyleDropdownOpen(false); }} className={`custom-select-option ${selectedStyle === p.id ? 'active' : ''}`}>
                                                    <span>{p.name}</span>
                                                    {selectedStyle === p.id && <i className="ph-fill ph-check"></i>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">Prompt Phủ định</label>
                                <textarea value={negativePrompt} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNegativePrompt(e.target.value)} placeholder="VD: xấu, mờ, nhiều tay..." className="w-full p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-sm text-white resize-none auth-input" rows={2} />
                            </div>

                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-1 block">Seed</label>
                                 <input type="number" value={seed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeed(e.target.value === '' ? '' : parseInt(e.target.value, 10))} placeholder="Để trống để tạo ngẫu nhiên" className="w-full p-2 bg-black/30 rounded-md border border-gray-600 focus:border-pink-500 transition text-sm text-white auth-input" />
                            </div>
                            
                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">Tỷ lệ khung hình</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {(['3:4', '1:1', '4:3', '9:16', '16:9'] as const).map(ar => {
                                        const dims: { [key: string]: string } = { '3:4': 'w-3 h-4', '1:1': 'w-4 h-4', '4:3': 'w-4 h-3', '9:16': 'w-[1.125rem] h-5', '16:9': 'w-5 h-[1.125rem]' };
                                        return (
                                            <button key={ar} onClick={() => setAspectRatio(ar)} className={`p-2 rounded-md flex flex-col items-center justify-center gap-1 border-2 transition ${aspectRatio === ar ? 'selected-glow' : 'border-skin-border bg-skin-fill-secondary hover:border-pink-500/50 text-skin-base'}`}>
                                                <div className={`${dims[ar]} bg-gray-500 rounded-sm`}/>
                                                <span className="text-xs font-semibold">{ar}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div>
                                <ToggleSwitch label="Làm Nét & Nâng Cấp (+1 💎)" checked={useUpscaler} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseUpscaler(e.target.checked)} />
                                <p className="text-xs text-skin-muted px-1 mt-1 leading-relaxed">Khi bật, ảnh AI tạo ra sẽ có kết quả <span className="font-bold text-cyan-400 neon-highlight">siêu nét</span>, chi tiết rõ ràng, và dung lượng ảnh cao hơn.</p>
                            </div>
                        </div>
                    </SettingsBlock>
                    
                    <div className="mt-auto pt-6 space-y-4">
                        <div className="text-center text-sm p-3 bg-black/20 rounded-lg">
                            <p className="text-skin-muted">Chi phí: <span className="font-bold text-pink-400 flex items-center justify-center gap-1">{generationCost} <i className="ph-fill ph-diamonds-four"></i></span></p>
                            <p className="text-skin-muted">Hiện có: <span className="font-bold text-white">{user?.diamonds.toLocaleString() || 0} 💎</span></p>
                        </div>
                        <button onClick={handleGenerateClick} disabled={isGenerating || !prompt.trim()} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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