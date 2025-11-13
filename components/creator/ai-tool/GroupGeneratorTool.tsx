// NEW: Create the content for the GroupGeneratorTool component.
// FIX: Import 'useState' from 'react' to resolve 'Cannot find name' errors.
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import ImageUploader from '../../ai-tool/ImageUploader';
import { resizeImage, base64ToFile } from '../../../utils/imageUtils';
import ProcessedImagePickerModal from './ProcessedImagePickerModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ImageModal from '../../common/ImageModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';
import ProcessedImageModal from '../../ai-tool/ProcessedImageModal';


// Mock data for presets - in a real app, this would come from a database
const MOCK_LAYOUTS = [
    { id: 'cool-squad', name: 'Đội hình Cool Ngầu' },
    { id: 'birthday-party', name: 'Tiệc Sinh nhật' },
    { id: 'selfie-group', name: 'Tự sướng Nhóm' },
    { id: 'dance-battle', name: 'So tài vũ đạo' },
];

const MOCK_BACKGROUNDS = [
    { id: 'audition-stage', name: 'Sàn nhảy Audition' },
    { id: 'tokyo-street', name: 'Phố Tokyo Neon' },
    { id: 'beach-sunset', name: 'Biển Hoàng hôn' },
    { id: 'fantasy-castle', name: 'Lâu đài Kỳ ảo' },
];

const MOCK_STYLES = [
    { id: 'cinematic', name: 'Điện ảnh' },
    { id: 'anime', name: 'Hoạt hình Anime' },
    { id: '3d-render', name: 'Kết xuất 3D' },
    { id: 'oil-painting', name: 'Tranh sơn dầu' },
];

type ImageState = { url: string; file: File } | null;

interface CharacterState {
    poseImage: ImageState;
    faceImage: ImageState;
    processedFace: string | null;
}

interface ProcessedImageData {
    id: string;
    imageBase64: string;
    mimeType: string;
    fileName: string;
    // Add missing properties to match the type used in ProcessedImageModal
    processedUrl: string;
    originalUrl?: string;
}

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});


// Sub-component for Preset Selection
const PresetSelector: React.FC<{
    title: string,
    presets: {id: string, name: string}[],
    selected: string,
    onSelect: (id: string) => void,
    prompt: string,
    onPromptChange: (value: string) => void,
    promptPlaceholder: string
}> = ({ title, presets, selected, onSelect, prompt, onPromptChange, promptPlaceholder }) => (
    <div className="themed-settings-block p-4">
        <h3 className="themed-heading text-base font-bold themed-title-glow mb-3">{title}</h3>
        <div className="grid grid-cols-2 gap-2">
            {presets.map(p => (
                <button 
                    key={p.id} 
                    onClick={() => onSelect(p.id)} 
                    className={`p-2 text-xs font-semibold rounded-md border-2 transition text-center ${selected === p.id ? 'selected-glow' : 'border-skin-border bg-skin-fill-secondary hover:border-pink-500/50 text-skin-base'}`}
                >
                    {p.name}
                </button>
            ))}
        </div>
        <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={promptPlaceholder}
            className="w-full mt-3 p-2 bg-skin-input-bg rounded-md border border-skin-border focus:border-skin-border-accent transition text-xs text-skin-base resize-none"
            rows={2}
        />
    </div>
);

// Main Component
const GroupGeneratorTool: React.FC = () => {
    const { user, session, showToast, updateUserDiamonds } = useAuth();
    const [numCharacters, setNumCharacters] = useState<number>(0);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    const [characters, setCharacters] = useState<CharacterState[]>([]);

    // Selections state
    const [selectedLayout, setSelectedLayout] = useState(MOCK_LAYOUTS[0].id);
    const [layoutPrompt, setLayoutPrompt] = useState('');
    const [selectedBg, setSelectedBg] = useState(MOCK_BACKGROUNDS[0].id);
    const [backgroundPrompt, setBackgroundPrompt] = useState('');
    const [selectedStyle, setSelectedStyle] = useState(MOCK_STYLES[0].id);
    const [stylePrompt, setStylePrompt] = useState('');
    
    // New states for generation flow
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [processingFaceIndex, setProcessingFaceIndex] = useState<number | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ index: number; type: 'pose' | 'face' } | null>(null);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [useUpscaler, setUseUpscaler] = useState(false);
    const [imageToProcess, setImageToProcess] = useState<ProcessedImageData | null>(null);


    const handleNumCharactersSelect = (num: number) => {
        setNumCharacters(num);
        setCharacters(Array(num).fill({
            poseImage: null,
            faceImage: null,
            processedFace: null
        }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number, type: 'pose' | 'face') => {
        const file = e.target.files?.[0];
        if (!file) return;

        resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
            const newImage = { url: resizedDataUrl, file: resizedFile };
            setCharacters(prev => prev.map((char, i) => {
                if (i === index) {
                    if (type === 'pose') return { ...char, poseImage: newImage };
                    return { ...char, faceImage: newImage, processedFace: null };
                }
                return char;
            }));
        }).catch(() => showToast("Lỗi khi xử lý ảnh.", "error"));
    };

    const handleRemoveImage = (index: number, type: 'pose' | 'face') => {
        setCharacters(prev => prev.map((char, i) => {
            if (i === index) {
                if (type === 'pose') return { ...char, poseImage: null };
                return { ...char, faceImage: null, processedFace: null };
            }
            return char;
        }));
    };
    
    const handleOpenPicker = (index: number, type: 'pose' | 'face') => {
        setPickerTarget({ index, type });
        setIsPickerOpen(true);
    };

    const handleImageSelectFromPicker = (imageData: ProcessedImageData) => {
        setIsPickerOpen(false);
        setImageToProcess(imageData);
    };

    const handleProcessFace = async (index: number) => {
        const char = characters[index];
        if (!char.faceImage || !session) return;
        
        setProcessingFaceIndex(index);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(char.faceImage.file);
            reader.onloadend = async () => {
                const base64Image = reader.result;
                const response = await fetch('/.netlify/functions/process-face', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ image: base64Image }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Xử lý gương mặt thất bại.');

                setCharacters(prev => prev.map((c, i) => i === index ? { ...c, processedFace: result.processedImageBase64 } : c));
                updateUserDiamonds(result.newDiamondCount);
                showToast('Xử lý & Khóa gương mặt thành công!', 'success');
            };
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setProcessingFaceIndex(null);
        }
    };

    const totalCost = numCharacters + (useUpscaler ? 1 : 0);

    const handleGenerateClick = () => {
        if (user && user.diamonds < totalCost) {
            showToast(`Bạn cần ${totalCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = async () => {
        setConfirmOpen(false);
        setIsGenerating(true);
        setProgress(1);
    
        const interval = setInterval(() => {
            setProgress(prev => (prev < 9 ? prev + 1 : prev));
        }, 2500); // Slower interval for a longer process
    
        try {
            const charactersPayload = await Promise.all(characters.map(async char => {
                const poseImageBase64 = char.poseImage ? await fileToBase64(char.poseImage.file) : null;
                // Face image is now only for reference, processed one takes precedence
                const faceImageBase64 = char.faceImage ? await fileToBase64(char.faceImage.file) : null;
                return {
                    poseImage: poseImageBase64,
                    faceImage: char.processedFace ? `data:image/png;base64,${char.processedFace}` : faceImageBase64,
                };
            }));
    
            const response = await fetch('/.netlify/functions/generate-group-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    characters: charactersPayload,
                    layout: MOCK_LAYOUTS.find(l => l.id === selectedLayout)?.name,
                    layoutPrompt,
                    background: MOCK_BACKGROUNDS.find(b => b.id === selectedBg)?.name,
                    backgroundPrompt,
                    style: MOCK_STYLES.find(s => s.id === selectedStyle)?.name,
                    stylePrompt,
                    aspectRatio: getAspectRatio(),
                    useUpscaler,
                }),
            });
            
            clearInterval(interval);
            
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'Lỗi không xác định từ máy chủ.');
            }
            
            const result = await response.json();
            
            setProgress(9);
            if (user) {
                updateUserDiamonds(result.newDiamondCount);
            }
            setGeneratedImage(result.imageUrl);
            showToast('Tạo ảnh nhóm thành công!', 'success');
            setProgress(10);
    
        } catch (err: any) {
            clearInterval(interval);
            showToast(err.message || 'Tạo ảnh nhóm thất bại.', 'error');
            setIsGenerating(false); // Make sure to stop generating on error
            setProgress(0);
        }
    };

    const resetGenerator = () => {
        setGeneratedImage(null);
        setProgress(0);
        handleNumCharactersSelect(numCharacters); 
    };
    
    const handleDownloadResult = () => {
        if (!generatedImage) return;
        const downloadUrl = `/.netlify/functions/download-image?url=${encodeURIComponent(generatedImage)}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `audition-ai-group-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const getAspectRatio = () => {
        if (numCharacters <= 2) return '3:4';
        if (numCharacters === 3) return '1:1';
        return '16:9';
    };
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-group-result',
        image_url: generatedImage,
        prompt: `Group Photo: ${layoutPrompt}, ${backgroundPrompt}, ${stylePrompt}`,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: 'Bạn', photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: 'Group Studio',
        user_id: user?.id || ''
    } : null;


    if (isGenerating) {
        return <GenerationProgress currentStep={progress} onCancel={() => setIsGenerating(false)} />;
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
                    <h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">Tạo ảnh nhóm thành công!</h3>
                    <div 
                        className="max-w-md w-full mx-auto bg-black/20 rounded-lg overflow-hidden border-2 border-pink-500/30 group relative cursor-pointer"
                        style={{ aspectRatio: getAspectRatio().replace(':', '/') }}
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
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-6 py-3 font-bold">
                             <i className="ph-fill ph-download-simple mr-2"></i>Tải xuống
                        </button>
                    </div>
                </div>
            </>
        );
    }


    if (numCharacters === 0) {
        return (
            <div className="text-center p-8 min-h-[50vh] flex flex-col items-center justify-center animate-fade-in">
                <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-4">Bạn muốn tạo ảnh cho bao nhiêu người?</h2>
                <p className="text-skin-muted mb-6">Chọn số lượng nhân vật để bắt đầu Studio.</p>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {[2, 3, 4, 5].map(num => (
                        <button 
                            key={num} 
                            onClick={() => handleNumCharactersSelect(num)} 
                            className="w-28 h-28 bg-skin-fill-secondary border-2 border-skin-border rounded-lg text-5xl font-black text-skin-base transition-all duration-300 hover:scale-110 hover:border-skin-border-accent hover:text-skin-accent hover:shadow-accent"
                        >
                            {num}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <ProcessedImagePickerModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={handleImageSelectFromPicker} />
             <ProcessedImageModal
                isOpen={!!imageToProcess}
                onClose={() => { setImageToProcess(null); setPickerTarget(null); }}
                image={imageToProcess}
                onUseFull={() => {
                    if (!imageToProcess || !pickerTarget) return;
                    const { imageBase64, mimeType, fileName } = imageToProcess;
                    const file = base64ToFile(imageBase64, `processed_${fileName}`, mimeType);
                    const newImage = { url: `data:${mimeType};base64,${imageBase64}`, file };

                    setCharacters(prev => prev.map((char, i) => {
                        if (i === pickerTarget.index) {
                            if (pickerTarget.type === 'pose') return { ...char, poseImage: newImage };
                            return { ...char, faceImage: newImage, processedFace: null };
                        }
                        return char;
                    }));
                    setImageToProcess(null);
                    setPickerTarget(null);
                }}
                onUseCropped={(croppedImage) => {
                    if (!pickerTarget) return;
                    setCharacters(prev => prev.map((char, i) => {
                        if (i === pickerTarget.index) {
                            if (pickerTarget.type === 'face') {
                                return { ...char, faceImage: croppedImage, processedFace: null };
                            }
                            return { ...char, poseImage: croppedImage };
                        }
                        return char;
                    }));
                    setImageToProcess(null);
                    setPickerTarget(null);
                    showToast('Đã chuyển ảnh gương mặt sang trình tạo AI!', 'success');
                }}
                onDownload={() => {
                    if (imageToProcess) handleDownloadResult();
                }}
            />
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={totalCost} />
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Left Column - Character Inputs */}
                <div className="w-full lg:w-1/2">
                     <div className="flex justify-between items-center mb-3">
                         <h3 className="themed-heading text-lg font-bold themed-title-glow">1. Cung cấp thông tin nhân vật</h3>
                         <button onClick={() => setNumCharacters(0)} className="text-xs text-skin-muted hover:text-skin-base">(Thay đổi số lượng)</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {characters.map((char, index) => (
                             <div key={index} className="bg-skin-fill p-3 rounded-xl border border-skin-border space-y-3">
                                <h4 className="text-sm font-bold text-center text-skin-base">Nhân vật {index + 1}</h4>
                                <ImageUploader onUpload={(e) => handleImageUpload(e, index, 'pose')} image={char.poseImage} onRemove={() => handleRemoveImage(index, 'pose')} text="Ảnh nhân vật (Lấy trang phục)" onPickFromProcessed={() => handleOpenPicker(index, 'pose')} />
                                <ImageUploader onUpload={(e) => handleImageUpload(e, index, 'face')} image={char.faceImage} onRemove={() => handleRemoveImage(index, 'face')} text="Ảnh gương mặt (Face ID)" onPickFromProcessed={() => handleOpenPicker(index, 'face')} />
                                 <button 
                                    onClick={() => handleProcessFace(index)}
                                    disabled={processingFaceIndex === index || !char.faceImage || !!char.processedFace}
                                    className={`w-full text-sm font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait
                                        ${char.processedFace ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'}`}
                                >
                                    {processingFaceIndex === index ? 'Đang xử lý...' : char.processedFace ? 'Gương mặt đã khóa' : 'Xử lý & Khóa Gương Mặt (-1 💎)'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column - Settings & Generation */}
                <div className="w-full lg:w-1/2 flex flex-col gap-4">
                    <PresetSelector title="2. Chọn Bố cục & Tư thế" presets={MOCK_LAYOUTS} selected={selectedLayout} onSelect={setSelectedLayout} prompt={layoutPrompt} onPromptChange={setLayoutPrompt} promptPlaceholder="Thêm chi tiết về bố cục..." />
                    <PresetSelector title="3. Chọn Bối cảnh" presets={MOCK_BACKGROUNDS} selected={selectedBg} onSelect={setSelectedBg} prompt={backgroundPrompt} onPromptChange={setBackgroundPrompt} promptPlaceholder="Thêm chi tiết về bối cảnh..." />
                    <PresetSelector title="4. Chọn Phong cách nghệ thuật" presets={MOCK_STYLES} selected={selectedStyle} onSelect={setSelectedStyle} prompt={stylePrompt} onPromptChange={setStylePrompt} promptPlaceholder="Thêm chi tiết về phong cách..." />

                     <div className="mt-auto pt-4 space-y-4">
                        <div className="themed-settings-block p-4">
                            <ToggleSwitch label="Làm Nét & Nâng Cấp (+1 💎)" checked={useUpscaler} onChange={(e) => setUseUpscaler(e.target.checked)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-center text-sm p-3 bg-black/20 rounded-lg">
                            <div>
                                <p className="text-skin-muted">Tỷ lệ khung hình (Tự động)</p>
                                <p className="font-bold text-white">{getAspectRatio()}</p>
                            </div>
                            <div>
                                <p className="text-skin-muted">Chi phí dự kiến</p>
                                <p className="font-bold text-pink-400 flex items-center justify-center gap-1">{totalCost} <i className="ph-fill ph-diamonds-four"></i></p>
                            </div>
                        </div>
                        <button onClick={handleGenerateClick} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2">
                            <i className="ph-fill ph-magic-wand"></i>
                            Tạo Ảnh Nhóm
                        </button>
                        <p className="text-xs text-center text-skin-muted">Lưu ý: Thời gian tạo ảnh nhóm sẽ lâu hơn đáng kể so với ảnh đơn.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupGeneratorTool;