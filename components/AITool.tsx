import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../constants/aiToolData';
import { useImageGenerator, useBackgroundRemover } from '../hooks/useImageGenerator';
import ConfirmationModal from './ConfirmationModal';
import SettingsBlock from './ai-tool/SettingsBlock';
import ImageUploader from './ai-tool/ImageUploader';
import AspectRatioButton from './ai-tool/AspectRatioButton';
import ModelSelectionModal from './ai-tool/ModelSelectionModal';
import InstructionModal from './ai-tool/InstructionModal';
import GenerationProgress from './ai-tool/GenerationProgress';
import ToggleSwitch from './ai-tool/ToggleSwitch';
import { DiamondIcon } from './common/DiamondIcon';

const AITool: React.FC = () => {
    const { user, showToast } = useAuth();
    const { isLoading, generatedImage, generateImage, COST_PER_IMAGE } = useImageGenerator();
    const { isProcessing, removeBackground, COST_PER_REMOVAL } = useBackgroundRemover();
    
    const [activeTool, setActiveTool] = useState<'generate' | 'removeBg'>('generate');

    // AI Generation State
    const [characterImages, setCharacterImages] = useState<Array<{id: string, url: string, file: File}>>([]);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [styleImage, setStyleImage] = useState<{url: string, file: File} | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [selectedModelId, setSelectedModelId] = useState<string>(DETAILED_AI_MODELS[0].id);
    const [selectedStyleId, setSelectedStyleId] = useState<string>(STYLE_PRESETS_NEW[1].id);
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [randomSeed, setRandomSeed] = useState(true);

    // Background Removal State
    const [imagesForBgRemoval, setImagesForBgRemoval] = useState<Array<{id: string, url: string, file: File}>>([]);
    const [processedImages, setProcessedImages] = useState<Array<{id: string, originalUrl: string, processedUrl: string, file: File}>>([]);
    
    // Modal states
    const [isConfirmationOpen, setConfirmationOpen] = useState(false);
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | null>(null);
    const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
    
    const [generationStep, setGenerationStep] = useState(0);
    const [isStyleDropdownOpen, setStyleDropdownOpen] = useState(false);
    const styleDropdownRef = useRef<HTMLDivElement>(null);
    
    const selectedModel = useMemo(() => DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!, [selectedModelId]);
    const selectedStyle = useMemo(() => STYLE_PRESETS_NEW.find(s => s.id === selectedStyleId)!, [selectedStyleId]);
    const isImageToImageSupported = useMemo(() => selectedModel.supportedModes.includes('image-to-image'), [selectedModel]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (styleDropdownRef.current && !styleDropdownRef.current.contains(event.target as Node)) {
                setStyleDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const model = DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!;
        if (!model.supportedModes.includes('image-to-image')) {
            let imagesCleared = false;
            if (characterImages.length > 0) {
                setCharacterImages([]);
                setSelectedCharacterId(null);
                imagesCleared = true;
            }
            if (styleImage) {
                setStyleImage(null);
                imagesCleared = true;
            }
            if (imagesCleared) {
                showToast(`Đã xóa ảnh. Model "${model.name}" chỉ hỗ trợ văn bản.`, 'success');
            }
        }
    }, [selectedModelId, characterImages, styleImage, showToast]);

    const handleCharacterImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const newImage = { id: crypto.randomUUID(), url: event.target?.result as string, file };
                const newImages = [...characterImages, newImage];
                setCharacterImages(newImages);
                if (!selectedCharacterId) {
                    setSelectedCharacterId(newImage.id);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleStyleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setStyleImage({ url: event.target.result as string, file });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleBgRemovalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        files.forEach((file: File) => {
             const reader = new FileReader();
             reader.onload = (event) => {
                 const newImage = { id: crypto.randomUUID(), url: event.target?.result as string, file };
                 setImagesForBgRemoval(prev => [...prev, newImage]);
             };
             reader.readAsDataURL(file);
        });
    };
    
    const handleRemoveCharacterImage = (idToRemove: string) => {
        setCharacterImages(prev => prev.filter(img => img.id !== idToRemove));
        if (selectedCharacterId === idToRemove) {
            setSelectedCharacterId(characterImages.length > 1 ? characterImages.find(img => img.id !== idToRemove)!.id : null);
        }
    };

    const handleGenerateClick = () => {
        if (!prompt.trim() && !selectedCharacterId) {
            showToast('Vui lòng nhập mô tả hoặc tải ảnh nhân vật.', 'error');
            return;
        }
        if (user && user.diamonds < COST_PER_IMAGE) {
            showToast('Bạn không đủ kim cương. Vui lòng nạp thêm.', 'error');
            return;
        }
        setConfirmationOpen(true);
    };

    const handleConfirmGeneration = () => {
        setConfirmationOpen(false);
        setGenerationStep(0);
        const selectedImageFile = characterImages.find(img => img.id === selectedCharacterId)?.file || null;
        generateImage(prompt, selectedImageFile, styleImage?.file || null, selectedModel, selectedStyle, aspectRatio, setGenerationStep);
    };

    const handleProcessBackgrounds = async () => {
        if (imagesForBgRemoval.length === 0) {
            showToast('Vui lòng tải lên ảnh để xử lý.', 'error');
            return;
        }
        const totalCost = imagesForBgRemoval.length * COST_PER_REMOVAL;
        if (user && user.diamonds < totalCost) {
            showToast(`Bạn cần ${totalCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        const imagesToProcessNow = [...imagesForBgRemoval];
        setImagesForBgRemoval([]);
        for (const image of imagesToProcessNow) {
            const processedUrl = await removeBackground(image.file);
            if (processedUrl) {
                setProcessedImages(prev => [...prev, { id: image.id, originalUrl: image.url, processedUrl, file: image.file }]);
            }
        }
    };

    const handleMoveToGenerator = (image: {processedUrl: string, file: File}) => {
        const newImage = { id: crypto.randomUUID(), url: image.processedUrl, file: image.file };
        setCharacterImages(prev => [...prev, newImage]);
        if (!selectedCharacterId) setSelectedCharacterId(newImage.id);
        setActiveTool('generate');
        showToast('Đã chuyển ảnh sang trình tạo AI!', 'success');
    };
    
    const handleOpenInstruction = (key: 'character' | 'style' | 'prompt' | 'advanced') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };

    const AiGeneratorTool = (
        <div className="lg:grid lg:grid-cols-2 gap-6 space-y-6 lg:space-y-0">
            {/* Controls */}
            <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="sm:col-span-2">
                        <SettingsBlock step={1} title="Tải ảnh Nhân vật" instructionKey="character" onInstructionClick={handleOpenInstruction}>
                            <div id="character-uploader" className={`p-2 rounded-lg bg-black/20 ${isImageToImageSupported ? '' : 'group-disabled'}`}>
                                {characterImages.length > 0 && (
                                    <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2">
                                        {characterImages.map(img => (
                                            <div key={img.id} onClick={() => setSelectedCharacterId(img.id)} className={`relative flex-shrink-0 w-24 h-24 rounded-md cursor-pointer border-2 transition-all ${selectedCharacterId === img.id ? 'border-pink-500 selected-glow' : 'border-transparent'}`}>
                                                <img src={img.url} className="w-full h-full object-cover rounded" alt="Character"/>
                                                <button onClick={(e) => {e.stopPropagation(); handleRemoveCharacterImage(img.id)}} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-500 transition-colors z-10">
                                                    <i className="ph-fill ph-x text-sm"></i>
                                                </button>
                                                {selectedCharacterId === img.id && <div className="absolute inset-0 bg-pink-500/30 rounded-md pointer-events-none"></div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <label className={`relative w-full h-28 flex items-center justify-center text-center text-gray-400 rounded-lg border-2 border-dashed ${isImageToImageSupported ? 'border-gray-600 hover:border-pink-500 cursor-pointer' : 'border-gray-700'} bg-black/20`}>
                                     <div><i className="ph-fill ph-plus-circle text-3xl"></i><p className="text-xs mt-1">Thêm ảnh nhân vật</p></div>
                                     <input type="file" accept="image/*" onChange={handleCharacterImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={!isImageToImageSupported}/>
                                </label>
                                {isImageToImageSupported === false && <p className="text-xs text-yellow-400 mt-2 text-center">Model hiện tại không hỗ trợ ảnh nhân vật.</p>}
                            </div>
                        </SettingsBlock>
                    </div>
                    <div className="h-full">
                        <SettingsBlock step={2} title="Tải ảnh Mẫu" instructionKey="style" onInstructionClick={handleOpenInstruction}>
                            <ImageUploader image={styleImage} onUpload={handleStyleImageUpload} onRemove={() => setStyleImage(null)} text="Tải ảnh Phong cách" processType="style" disabled={!isImageToImageSupported} />
                        </SettingsBlock>
                    </div>
                    <div className="h-full">
                        <SettingsBlock step={3} title="Nhập câu lệnh" instructionKey="prompt" onInstructionClick={handleOpenInstruction}>
                            <textarea 
                                rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="VD: một cô gái tóc hồng, mặc váy công chúa..."
                                className="w-full h-full bg-white/5 p-3 rounded-lg border border-gray-700 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition"
                            />
                        </SettingsBlock>
                    </div>
                    <div className="sm:col-span-2">
                        <SettingsBlock step={4} title="Cài đặt nâng cao" instructionKey="advanced" onInstructionClick={handleOpenInstruction}>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-400 mb-1 block">Phong cách</label>
                                    <div className="relative" ref={styleDropdownRef}>
                                        <button onClick={() => setStyleDropdownOpen(!isStyleDropdownOpen)} className="w-full flex justify-between items-center text-left bg-white/5 p-3 pl-10 rounded-lg border border-gray-700 hover:border-pink-500 transition">
                                            <i className="ph-fill ph-link absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                            <span className="font-medium text-gray-200">{selectedStyle.name}</span>
                                            <i className={`ph-fill ph-caret-down transition-transform duration-200 ${isStyleDropdownOpen ? 'rotate-180' : ''}`}></i>
                                        </button>
                                        {isStyleDropdownOpen && (
                                            <div className="absolute z-10 mt-2 w-full bg-[#1e1b25] border border-white/10 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar animate-fade-in-down">
                                                <ul className="p-1">
                                                    {STYLE_PRESETS_NEW.map(style => (
                                                        <li key={style.id}> <button onClick={() => { setSelectedStyleId(style.id); setStyleDropdownOpen(false);}} className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-md transition-colors ${selectedStyleId === style.id ? 'bg-pink-500/20 text-white' : 'text-gray-300 hover:bg-white/10'}`}> <span className="flex items-center gap-3"><i className="ph-fill ph-link"></i>{style.name}</span>{selectedStyleId === style.id && <i className="ph-fill ph-check text-pink-400"></i>}</button></li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                               </div>
                               <div>
                                    <label className="text-sm font-medium text-gray-400 mb-1 block">Mô hình AI</label>
                                    <button onClick={() => setModelModalOpen(true)} className="w-full flex justify-between items-center text-left bg-white/5 p-3 rounded-lg border border-gray-700 hover:border-pink-500 transition">
                                        <span className="font-semibold">{selectedModel.name}</span> <i className="ph-fill ph-stack text-pink-400"></i>
                                    </button>
                               </div>
                               <div>
                                    <label className="text-sm font-medium text-gray-400 mb-2 block">Tỷ lệ khung hình</label>
                                    <div className="grid grid-cols-5 gap-2">
                                       <AspectRatioButton value="1:1" icon={<div className="w-6 h-6 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!selectedCharacterId} />
                                       <AspectRatioButton value="3:4" icon={<div className="w-5 h-7 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!selectedCharacterId} />
                                       <AspectRatioButton value="4:3" icon={<div className="w-7 h-5 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!selectedCharacterId} />
                                       <AspectRatioButton value="9:16" icon={<div className="w-4 h-8 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!selectedCharacterId} />
                                       <AspectRatioButton value="16:9" icon={<div className="w-8 h-4 bg-gray-500 rounded-sm"/>} currentValue={aspectRatio} onClick={setAspectRatio} disabled={!!selectedCharacterId} />
                                    </div>
                               </div>
                               <div className="pt-2 border-t border-white/10 mt-2">
                                 <ToggleSwitch label="Seed ngẫu nhiên" checked={randomSeed} onChange={(e) => setRandomSeed(e.target.checked)} />
                               </div>
                            </div>
                        </SettingsBlock>
                    </div>
                </div>

                {/* Mobile Result Panel (New Position) */}
                <div className="block lg:hidden mt-6">
                    <h3 className="text-lg font-semibold mb-3 text-gray-300">Kết quả</h3>
                    <div 
                        className="w-full aspect-square bg-black/30 rounded-lg flex items-center justify-center overflow-hidden border border-white/5 relative group"
                    >
                        {isLoading ? ( <GenerationProgress currentStep={generationStep} /> ) : 
                         generatedImage ? ( 
                            <>
                                <img src={generatedImage} alt="Generated Art" className="w-full h-full object-contain animate-fade-in" /> 
                                <div 
                                    onClick={() => setPreviewModalOpen(true)}
                                    className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                >
                                    <i className="ph-fill ph-eye text-4xl text-white"></i>
                                </div>
                                <a 
                                    href={generatedImage} 
                                    download="audition-ai-art.png" 
                                    onClick={(e) => e.stopPropagation()} 
                                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-2 hover:bg-pink-600 transition-colors z-10"
                                >
                                    <i className="ph-fill ph-download-simple text-xl"></i>
                                </a>
                            </>
                         ) : 
                         ( <div className="text-center text-gray-500 p-4"><i className="ph-fill ph-image-square text-5xl"></i><p className="mt-2 text-sm">Hình ảnh của bạn sẽ xuất hiện ở đây</p></div> )}
                    </div>
                </div>
            </div>

            {/* Desktop Result Panel */}
            <div className="hidden lg:block lg:sticky top-24 h-[calc(100vh-7rem)] bg-black/20 p-4 rounded-2xl border border-white/5">
                 <div className="w-full h-full flex flex-col items-center justify-between">
                     <div className="w-full flex-grow aspect-square bg-black/30 rounded-lg flex items-center justify-center overflow-hidden my-2 border border-white/5 relative">
                        {isLoading ? ( <GenerationProgress currentStep={generationStep} /> ) : 
                         generatedImage ? ( <img src={generatedImage} alt="Generated Art" className="w-full h-full object-contain animate-fade-in" /> ) : 
                         ( <div className="text-center text-gray-500 p-4"><i className="ph-fill ph-image-square text-5xl"></i><p className="mt-2 text-sm">Hình ảnh của bạn sẽ xuất hiện ở đây</p></div> )}
                        {generatedImage && !isLoading && ( <a href={generatedImage} download="audition-ai-art.png" className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-2 hover:bg-pink-600 transition-colors z-10"><i className="ph-fill ph-download-simple text-xl"></i></a> )}
                     </div>
                     <div className="w-full">
                         <button onClick={handleGenerateClick} disabled={isLoading} className="w-full mt-2 py-3.5 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full hover:scale-105 transform transition-transform duration-300 shadow-lg shadow-[#F72585]/30 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100">
                            <i className="ph-fill ph-magic-wand"></i>
                            {isLoading ? "Đang xử lý..." : `Tạo ảnh (-${COST_PER_IMAGE} kim cương)`}
                        </button>
                     </div>
                 </div>
            </div>
        </div>
    );

    const BgRemoverTool = (
        <div className="bg-[#1a1a22]/80 rounded-2xl border border-white/10 shadow-lg p-4 md:p-6 h-full flex flex-col">
            <div className="flex-grow flex flex-col gap-4">
                <div className="flex-grow flex flex-col">
                    <h3 className="font-semibold mb-3 text-lg">1. Tải ảnh lên</h3>
                    <div className="p-4 bg-black/20 rounded-lg border border-white/10 flex-grow flex flex-col">
                        <label className="relative w-full flex-grow min-h-[12rem] flex flex-col items-center justify-center text-center text-gray-400 rounded-lg border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer bg-black/20">
                            <i className="ph-fill ph-upload-simple text-4xl"></i>
                            <p className="font-semibold mt-2">Nhấn để chọn hoặc kéo thả</p>
                            <p className="text-xs">Có thể chọn nhiều ảnh</p>
                            <input type="file" multiple accept="image/*" onChange={handleBgRemovalImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                        </label>
                        {imagesForBgRemoval.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-semibold mb-2 text-gray-300">Sẵn sàng xử lý: {imagesForBgRemoval.length} ảnh</h4>
                                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                    {imagesForBgRemoval.map(img => (
                                        <div key={img.id} className="relative flex-shrink-0 w-20 h-20 rounded-md">
                                            <img src={img.url} className="w-full h-full object-cover rounded" alt="To process"/>
                                            <button onClick={() => setImagesForBgRemoval(p => p.filter(i => i.id !== img.id))} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 z-10 text-xs"><i className="ph-fill ph-x"></i></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                 <button onClick={handleProcessBackgrounds} disabled={isProcessing || imagesForBgRemoval.length === 0} className="w-full mt-2 py-3 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isProcessing ? <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <>
                        <DiamondIcon className="w-6 h-6"/>
                        <span>Xử lý ({imagesForBgRemoval.length * COST_PER_REMOVAL} Kim cương)</span>
                    </>}
                </button>
                <div className="flex flex-col flex-grow">
                    <h3 className="font-semibold mb-3 text-lg">2. Kết quả</h3>
                    <div className="bg-black/20 rounded-lg border border-white/10 flex-grow p-4 min-h-[14rem]">
                        {processedImages.length === 0 && !isProcessing ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                                <i className="ph-fill ph-image text-5xl"></i>
                                <p className="mt-2">Ảnh sau khi xử lý sẽ hiện ở đây</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-3 gap-4 h-full overflow-y-auto custom-scrollbar">
                                {processedImages.map(img => (
                                    <div key={img.id} className="group relative aspect-square">
                                        <img src={img.processedUrl} alt="Processed" className="w-full h-full object-cover rounded-md"/>
                                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                                            <button onClick={() => handleMoveToGenerator({processedUrl: img.processedUrl, file: img.file})} className="px-3 py-2 bg-pink-600 text-white font-semibold rounded-lg text-sm hover:bg-pink-700 transition">
                                                Sử dụng
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                 {isProcessing && Array(imagesForBgRemoval.length > 0 ? imagesForBgRemoval.length : 1).fill(0).map((_, i) => (
                                    <div key={i} className="aspect-square bg-white/5 rounded-md flex items-center justify-center animate-pulse">
                                        <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                    </div>
                                 ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div id="ai-tool" className="container mx-auto px-4 py-8 text-white">
            <div className="bg-[#1a1a22]/80 rounded-2xl border border-white/10 shadow-lg p-4 md:p-6">
                {/* Tab switcher */}
                <div className="mb-6 max-w-md mx-auto p-1 bg-black/30 rounded-full flex items-center">
                    <button onClick={() => setActiveTool('removeBg')} className={`w-1/2 py-2 rounded-full font-bold transition-all ${activeTool === 'removeBg' ? 'bg-pink-600 shadow-lg shadow-pink-500/30' : 'text-gray-400'}`}>Tách Nền</button>
                    <button onClick={() => setActiveTool('generate')} className={`w-1/2 py-2 rounded-full font-bold transition-all ${activeTool === 'generate' ? 'bg-pink-600 shadow-lg shadow-pink-500/30' : 'text-gray-400'}`}>Tạo Ảnh AI</button>
                </div>

                {/* Content based on tab */}
                <div className="pb-32 md:pb-0"> {/* Padding bottom for mobile footer */}
                    {activeTool === 'generate' ? AiGeneratorTool : BgRemoverTool}
                </div>
            </div>
            
            {/* Mobile Sticky Footer for Generator */}
            {activeTool === 'generate' && (
                <div className="md:hidden fixed bottom-16 left-0 w-full p-3 z-30 mobile-ai-footer">
                   <button onClick={handleGenerateClick} disabled={isLoading} className="w-full py-3 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full flex items-center justify-center gap-2 disabled:opacity-60">
                       <i className="ph-fill ph-magic-wand"></i>
                       {isLoading ? "Đang xử lý..." : `Tạo ảnh`}
                   </button>
                </div>
            )}
            
            <ConfirmationModal isOpen={isConfirmationOpen} onClose={() => setConfirmationOpen(false)} onConfirm={handleConfirmGeneration} cost={COST_PER_IMAGE}/>
            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} characterImage={characterImages.length > 0}/>
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey}/>

            {/* Simplified modal for mobile preview */}
            {isPreviewModalOpen && generatedImage && (
                <div 
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                  onClick={() => setPreviewModalOpen(false)}
                >
                    <img src={generatedImage} alt="Generated Preview" className="max-w-full max-h-full rounded-lg" />
                </div>
            )}
        </div>
    );
};

export default AITool;