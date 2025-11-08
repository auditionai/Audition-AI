import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DETAILED_AI_MODELS, STYLE_PRESETS_NEW } from '../../constants/aiToolData';
import { useImageGenerator } from '../../hooks/useImageGenerator';
import ConfirmationModal from '../ConfirmationModal';
import SettingsBlock from './SettingsBlock';
import ImageUploader from './ImageUploader';
import AspectRatioButton from './AspectRatioButton';
import ModelSelectionModal from './ModelSelectionModal';
import InstructionModal from './InstructionModal';
import GenerationProgress from './GenerationProgress';
import ToggleSwitch from './ToggleSwitch';

// Helper function to resize an image file before uploading
const resizeImage = (file: File, maxSize: number): Promise<{ file: File; dataUrl: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) return reject(new Error('FileReader did not return a result.'));
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Could not get canvas context'));
                
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('Canvas to Blob conversion failed'));
                    const resizedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve({ file: resizedFile, dataUrl });
                }, 'image/jpeg', 0.9);
            };
            img.onerror = reject;
            img.src = event.target.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

interface AiGeneratorToolProps {
    initialCharacterImage: { url: string; file: File } | null;
}

const AiGeneratorTool: React.FC<AiGeneratorToolProps> = ({ initialCharacterImage }) => {
    const { user, showToast } = useAuth();
    const { isLoading, generatedImage, generateImage, COST_PER_IMAGE } = useImageGenerator();

    // NEW: State for face reference image
    const [faceReferenceImage, setFaceReferenceImage] = useState<{url: string, file: File} | null>(null);
    const [isFaceLocked, setIsFaceLocked] = useState(false);

    // OLD: Renamed to poseImage
    const [poseImage, setPoseImage] = useState<{url: string, file: File} | null>(null);

    const [styleImage, setStyleImage] = useState<{url: string, file: File} | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [selectedModelId, setSelectedModelId] = useState<string>(DETAILED_AI_MODELS[0].id);
    const [selectedStyleId, setSelectedStyleId] = useState<string>(STYLE_PRESETS_NEW[1].id);
    const [aspectRatio, setAspectRatio] = useState('1:1');
    
    // NEW: Super face lock toggle
    const [superFaceLock, setSuperFaceLock] = useState(true);

    const [isConfirmationOpen, setConfirmationOpen] = useState(false);
    const [isModelModalOpen, setModelModalOpen] = useState(false);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);
    const [instructionKey, setInstructionKey] = useState<'character' | 'style' | 'prompt' | 'advanced' | 'face' | null>(null);
    const [isPreviewModalOpen, setPreviewModalOpen] = useState(false);
    
    const [generationStep, setGenerationStep] = useState(0);
    const [isStyleDropdownOpen, setStyleDropdownOpen] = useState(false);
    const styleDropdownRef = useRef<HTMLDivElement>(null);
    
    const selectedModel = useMemo(() => DETAILED_AI_MODELS.find(m => m.id === selectedModelId)!, [selectedModelId]);
    const selectedStyle = useMemo(() => STYLE_PRESETS_NEW.find(s => s.id === selectedStyleId)!, [selectedStyleId]);
    const isImageToImageSupported = useMemo(() => selectedModel.supportedModes.includes('image-to-image'), [selectedModel]);
    
    // NEW: Calculate cost dynamically
    const generationCost = COST_PER_IMAGE + (faceReferenceImage && superFaceLock ? 1 : 0);

    // Effect to handle the image moved from the background remover
    useEffect(() => {
        if (initialCharacterImage) {
            setPoseImage(initialCharacterImage);
            showToast('Ảnh đã tách nền được chuyển vào ô "Ảnh Toàn Thân". Hãy tải ảnh gương mặt để có kết quả tốt nhất!', 'success');
        }
    }, [initialCharacterImage, showToast]);


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
            if (poseImage) { setPoseImage(null); imagesCleared = true; }
            if (styleImage) { setStyleImage(null); imagesCleared = true; }
            if (faceReferenceImage) { setFaceReferenceImage(null); setIsFaceLocked(false); imagesCleared = true; }
            if (imagesCleared) {
                showToast(`Đã xóa ảnh. Model "${model.name}" chỉ hỗ trợ văn bản.`, 'success');
            }
        }
    }, [selectedModelId, poseImage, styleImage, faceReferenceImage, showToast]);

    const handlePoseImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                setPoseImage({ url: resizedDataUrl, file: resizedFile });
            }).catch(err => {
                console.error("Error resizing pose image:", err);
                showToast("Lỗi khi xử lý ảnh toàn thân.", "error");
            });
        }
        e.target.value = '';
    };

    const handleFaceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsFaceLocked(false);
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                setFaceReferenceImage({ url: resizedDataUrl, file: resizedFile });
                setTimeout(() => setIsFaceLocked(true), 1500); // Simulate locking
            }).catch(err => {
                console.error("Error resizing face image:", err);
                showToast("Lỗi khi xử lý ảnh gương mặt.", "error");
            });
        }
        e.target.value = '';
    };

    const handleStyleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
             resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                setStyleImage({ url: resizedDataUrl, file: resizedFile });
            }).catch(err => {
                console.error("Error resizing style image:", err);
                showToast("Lỗi khi xử lý ảnh mẫu.", "error");
            });
        }
        e.target.value = '';
    };

    const handleGenerateClick = () => {
        if (!prompt.trim() && !faceReferenceImage && !poseImage) {
            showToast('Vui lòng nhập mô tả hoặc tải lên ít nhất một ảnh.', 'error');
            return;
        }
        if (user && user.diamonds < generationCost) {
            showToast(`Bạn cần ${generationCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        setConfirmationOpen(true);
    };

    const handleConfirmGeneration = () => {
        setConfirmationOpen(false);
        setGenerationStep(0);
        generateImage(prompt, poseImage?.file || null, styleImage?.file || null, faceReferenceImage?.file || null, selectedModel, selectedStyle, aspectRatio, superFaceLock && !!faceReferenceImage, setGenerationStep);
    };

    const handleOpenInstruction = (key: 'character' | 'style' | 'prompt' | 'advanced' | 'face') => {
        setInstructionKey(key);
        setInstructionModalOpen(true);
    };
    
    const ResultPanel = ({ isMobile = false }) => (
      <div className={`${isMobile ? 'block lg:hidden mt-6' : 'hidden lg:block lg:sticky top-24 h-[calc(100vh-7rem)] bg-black/20 p-4 rounded-2xl border border-white/5'}`}>
          {isMobile && <h3 className="text-lg font-semibold mb-3 text-gray-300">Kết quả</h3>}
          <div className="w-full h-full flex flex-col items-center justify-between">
              <div className="w-full flex-grow aspect-square bg-black/30 rounded-lg flex items-center justify-center overflow-hidden my-2 border border-white/5 relative group">
                  {isLoading ? ( <GenerationProgress currentStep={generationStep} /> ) : 
                   generatedImage ? ( 
                      <>
                          <img src={generatedImage} alt="Generated Art" className="w-full h-full object-contain animate-fade-in" />
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <button onClick={() => setPreviewModalOpen(true)} className="flex flex-col items-center text-white hover:text-pink-400 transition-colors">
                                  <i className="ph-fill ph-eye text-4xl"></i>
                                  <span className="text-xs font-semibold">Phóng to</span>
                              </button>
                              <a href={generatedImage} download="audition-ai-art.png" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center text-white hover:text-green-400 transition-colors">
                                  <i className="ph-fill ph-download-simple text-4xl"></i>
                                  <span className="text-xs font-semibold">Tải xuống</span>
                              </a>
                          </div>
                      </>
                   ) : 
                   ( <div className="text-center text-gray-500 p-4"><i className="ph-fill ph-image-square text-5xl"></i><p className="mt-2 text-sm">Hình ảnh của bạn sẽ xuất hiện ở đây</p></div> )}
              </div>
              {!isMobile && (
                  <div className="w-full">
                      <button onClick={handleGenerateClick} disabled={isLoading} className="w-full mt-2 py-3.5 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full hover:scale-105 transform transition-transform duration-300 shadow-lg shadow-[#F72585]/30 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100">
                         <i className="ph-fill ph-magic-wand"></i>
                         {isLoading ? "Đang xử lý..." : `Tạo ảnh (-${generationCost} kim cương)`}
                     </button>
                  </div>
              )}
          </div>
      </div>
    );
    
    return (
        <>
            <div className="lg:grid lg:grid-cols-2 gap-6 space-y-6 lg:space-y-0">
                {/* Controls */}
                <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                             <SettingsBlock step={1} title="Siêu Khóa Gương Mặt (Face ID)" instructionKey="face" onInstructionClick={handleOpenInstruction}>
                                <div className={`relative p-2 rounded-lg bg-black/20 glowing-border ${faceReferenceImage ? 'glowing-border-active' : ''}`}>
                                    <ImageUploader 
                                        image={faceReferenceImage} 
                                        onUpload={handleFaceImageUpload} 
                                        onRemove={() => { setFaceReferenceImage(null); setIsFaceLocked(false); }} 
                                        text="Tải ảnh chân dung rõ nét" 
                                        disabled={!isImageToImageSupported} 
                                    />
                                </div>
                                {faceReferenceImage && (
                                    <div className="mt-3 text-center animate-fade-in px-2">
                                        {!isFaceLocked ? (
                                            <div className="flex items-center justify-center gap-2 text-sm text-cyan-300">
                                                <div className="w-4 h-4 border-2 border-cyan-300/50 border-t-cyan-300 rounded-full animate-spin"></div>
                                                <span>AI đang phân tích & khoá gương mặt...</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center gap-2 text-sm text-green-400 font-semibold p-2 bg-green-500/10 rounded-lg">
                                                <i className="ph-fill ph-check-circle"></i>
                                                <span>Gương mặt đã được khoá! (+1 💎)</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                             </SettingsBlock>
                        </div>

                        <div className="h-full">
                           <SettingsBlock step={2} title="Ảnh Toàn Thân (Tùy chọn)" instructionKey="character" onInstructionClick={handleOpenInstruction}>
                               <ImageUploader image={poseImage} onUpload={handlePoseImageUpload} onRemove={() => setPoseImage(null)} text="Tải ảnh tham khảo tư thế, trang phục" disabled={!isImageToImageSupported} />
                           </SettingsBlock>
                        </div>
                        <div className="h-full">
                            <SettingsBlock step={3} title="Ảnh Mẫu (Tùy chọn)" instructionKey="style" onInstructionClick={handleOpenInstruction}>
                                <ImageUploader image={styleImage} onUpload={handleStyleImageUpload} onRemove={() => setStyleImage(null)} text="Tải ảnh tham khảo phong cách" processType="style" disabled={!isImageToImageSupported} />
                            </SettingsBlock>
                        </div>

                        <div className="sm:col-span-2">
                            <SettingsBlock step={4} title="Nhập câu lệnh & Cài đặt" instructionKey="prompt" onInstructionClick={handleOpenInstruction}>
                                <textarea 
                                    rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="VD: một cô gái tóc hồng, mặc váy công chúa..."
                                    className="w-full bg-white/5 p-3 rounded-lg border border-gray-700 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition"
                                />
                                <div className="mt-4 space-y-4">
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
                                    <div className="pt-2 border-t border-white/10 mt-2">
                                        <ToggleSwitch 
                                            label="Kích hoạt Siêu Khóa Gương Mặt" 
                                            checked={superFaceLock} 
                                            onChange={(e) => setSuperFaceLock(e.target.checked)}
                                            disabled={!faceReferenceImage}
                                        />
                                    </div>
                                </div>
                            </SettingsBlock>
                        </div>
                    </div>
                    <ResultPanel isMobile={true} />
                </div>
                <ResultPanel isMobile={false} />
            </div>

            {/* Mobile Sticky Footer for Generator */}
            <div className="md:hidden fixed bottom-16 left-0 w-full p-3 z-30 mobile-ai-footer">
                <button onClick={handleGenerateClick} disabled={isLoading} className="w-full py-3 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full flex items-center justify-center gap-2 disabled:opacity-60">
                    <i className="ph-fill ph-magic-wand"></i>
                    {isLoading ? "Đang xử lý..." : `Tạo ảnh (-${generationCost} Kim cương)`}
                </button>
            </div>
            
            <ConfirmationModal isOpen={isConfirmationOpen} onClose={() => setConfirmationOpen(false)} onConfirm={handleConfirmGeneration} cost={generationCost}/>
            <ModelSelectionModal isOpen={isModelModalOpen} onClose={() => setModelModalOpen(false)} selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} characterImage={!!poseImage || !!faceReferenceImage}/>
            <InstructionModal isOpen={isInstructionModalOpen} onClose={() => setInstructionModalOpen(false)} instructionKey={instructionKey}/>

            {isPreviewModalOpen && generatedImage && (
                <div 
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
                  onClick={() => setPreviewModalOpen(false)}
                >
                    <img src={generatedImage} alt="Generated Preview" className="max-w-full max-h-full rounded-lg shadow-2xl shadow-pink-500/20" />
                     <a 
                        href={generatedImage} 
                        download="audition-ai-art.png" 
                        onClick={(e) => e.stopPropagation()} 
                        className="absolute bottom-6 bg-green-500 text-white rounded-full py-3 px-6 hover:bg-green-600 transition-colors z-10 font-bold flex items-center gap-2 text-lg"
                    >
                        <i className="ph-fill ph-download-simple"></i>
                        Tải xuống
                    </a>
                </div>
            )}
        </>
    );
};

export default AiGeneratorTool;