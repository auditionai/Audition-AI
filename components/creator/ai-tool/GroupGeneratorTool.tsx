// NEW: Create the content for the GroupGeneratorTool component.
// FIX: Import 'useState' from 'react' to resolve 'Cannot find name' errors.
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import ImageUploader from '../../ai-tool/ImageUploader';
import { resizeImage, base64ToFile } from '../../../utils/imageUtils';
import ProcessedImagePickerModal from './ProcessedImagePickerModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ImageModal from '../../common/ImageModal';
import ProcessedImageModal from '../../ai-tool/ProcessedImageModal';
import SettingsBlock from '../../ai-tool/SettingsBlock';
import InstructionModal from '../../ai-tool/InstructionModal';


// Mock data for presets - in a real app, this would come from a database
const MOCK_STYLES = [
    { id: 'cinematic', name: 'Điện ảnh' },
    { id: 'anime', name: 'Hoạt hình Anime' },
    { id: '3d-render', name: 'Kết xuất 3D' },
    { id: 'photographic', name: 'Nhiếp ảnh' },
    { id: 'fantasy', name: 'Kỳ ảo' },
    { id: 'oil-painting', name: 'Tranh sơn dầu' },
];

type ImageState = { url: string; file: File } | null;

interface CharacterState {
    poseImage: ImageState;
    faceImage: ImageState;
    processedFace: string | null;
    gender: 'male' | 'female' | null;
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

// Main Component
const GroupGeneratorTool: React.FC = () => {
    const { user, session, showToast, supabase, updateUserDiamonds } = useAuth();
    const [numCharacters, setNumCharacters] = useState<number>(0);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    const [characters, setCharacters] = useState<CharacterState[]>([]);

    // New state for reference image based generation
    const [referenceImage, setReferenceImage] = useState<ImageState>(null);
    const [prompt, setPrompt] = useState('');
    const [selectedStyle, setSelectedStyle] = useState(MOCK_STYLES[0].id);
    const [aspectRatio, setAspectRatio] = useState('3:4');
    
    // New states for generation flow
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [progressText, setProgressText] = useState('');
    const [processingFaceIndex, setProcessingFaceIndex] = useState<number | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ index: number; type: 'pose' | 'face' } | null>(null);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [imageToProcess, setImageToProcess] = useState<ProcessedImageData | null>(null);
    const [isInstructionModalOpen, setInstructionModalOpen] = useState(false);

    // Effect to clean up any dangling subscriptions on unmount
    useEffect(() => {
        return () => {
            supabase?.removeAllChannels();
        };
    }, [supabase]);
    
    useEffect(() => {
        if (numCharacters <= 2) setAspectRatio('3:4');
        else if (numCharacters <= 4) setAspectRatio('1:1');
        else setAspectRatio('16:9');
    }, [numCharacters]);

    const progressPercentage = useMemo(() => {
        if (!isGenerating) return 0;
        if (generatedImage) return 100;

        const match = progressText.match(/Đang xử lý nhân vật (\d+)\/(\d+)/);
        if (match) {
            const current = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            // Allocate 80% of the progress to character generation
            return 10 + ((current -1) / total) * 80;
        }
        if (progressText.includes('tổng hợp')) return 95;
        if (progressText.includes('khởi tạo')) return 5;
        return 10; // Default progress after init
    }, [isGenerating, generatedImage, progressText]);


    const handleNumCharactersSelect = (num: number) => {
        setNumCharacters(num);
        setCharacters(Array.from({ length: num }, () => ({
            poseImage: null,
            faceImage: null,
            processedFace: null,
            gender: null
        })));
    };

    const handleGenderSelect = (index: number, gender: 'male' | 'female') => {
        setCharacters(prev => prev.map((char, i) => {
            if (i === index) {
                return { ...char, gender };
            }
            return char;
        }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'pose' | 'face' | 'reference', index?: number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
            const newImage = { url: resizedDataUrl, file: resizedFile };
            if (type === 'reference') {
                setReferenceImage(newImage);
            } else {
                if (index === undefined) return;
                setCharacters(prev => prev.map((char, i) => {
                    if (i === index) {
                        if (type === 'pose') return { ...char, poseImage: newImage };
                        return { ...char, faceImage: newImage, processedFace: null };
                    }
                    return char;
                }));
            }
        }).catch(() => showToast("Lỗi khi xử lý ảnh.", "error"));
    };

    const handleRemoveImage = (type: 'pose' | 'face' | 'reference', index?: number) => {
         if (type === 'reference') {
            setReferenceImage(null);
        } else {
            if (index === undefined) return;
            setCharacters(prev => prev.map((char, i) => {
                if (i === index) {
                    if (type === 'pose') return { ...char, poseImage: null };
                    return { ...char, faceImage: null, processedFace: null };
                }
                return char;
            }));
        }
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

    const totalCost = numCharacters + 1;

    const handleGenerateClick = () => {
        if (!referenceImage) {
            showToast('Vui lòng tải lên "Ảnh Mẫu Tham Chiếu".', 'error');
            return;
        }
        for (let i = 0; i < characters.length; i++) {
            if (!characters[i].poseImage) {
                showToast(`Vui lòng cung cấp "Ảnh nhân vật" cho Nhân vật ${i + 1}.`, 'error');
                return;
            }
            if (!characters[i].gender) {
                showToast(`Vui lòng chọn giới tính cho Nhân vật ${i + 1}.`, 'error');
                return;
            }
        }

        if (user && user.diamonds < totalCost) {
            showToast(`Bạn cần ${totalCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmGeneration = async () => {
        setConfirmOpen(false);
        setIsGenerating(true);
        setProgressText('Đang khởi tạo tác vụ...');

        const jobId = crypto.randomUUID();

        if (!supabase || !session) {
            showToast('Lỗi kết nối. Không thể bắt đầu tạo ảnh.', 'error');
            setIsGenerating(false);
            return;
        }

        let channel = supabase.channel(`group-job-${jobId}`);

        const cleanup = () => {
             if (channel) {
                supabase.removeChannel(channel);
                channel = null as any;
            }
        };

        channel
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'generated_images',
                filter: `id=eq.${jobId}`
            }, (payload) => {
                const record = payload.new as any;
                 if (record.progress_text) {
                    setProgressText(record.progress_text);
                }
                if (record.image_url && record.image_url !== 'PENDING') {
                    setGeneratedImage(record.image_url);
                    showToast('Tạo ảnh nhóm thành công!', 'success');
                    setIsGenerating(false);
                    cleanup();
                }
            })
            .on('postgres_changes', {
                 event: 'DELETE',
                 schema: 'public',
                 table: 'generated_images',
                 filter: `id=eq.${jobId}`
            }, () => {
                 showToast('Tạo ảnh nhóm thất bại do lỗi xử lý. Kim cương đã được hoàn lại.', 'error');
                 setIsGenerating(false);
                 cleanup();
            })
            .subscribe(async (status, err) => {
                if (status === 'SUBSCRIBED') {
                    try {
                        const charactersPayload = await Promise.all(characters.map(async char => ({
                            poseImage: char.poseImage ? await fileToBase64(char.poseImage.file) : null,
                            faceImage: char.processedFace ? `data:image/png;base64,${char.processedFace}` : (char.faceImage ? await fileToBase64(char.faceImage.file) : null),
                            gender: char.gender,
                        })));
            
                        const spawnerResponse = await fetch('/.netlify/functions/generate-group-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({
                                jobId, 
                                characters: charactersPayload,
                                referenceImage: referenceImage ? await fileToBase64(referenceImage.file) : null,
                                prompt,
                                style: selectedStyle,
                                aspectRatio: aspectRatio,
                            }),
                        });

                        if (!spawnerResponse.ok) {
                            const errorJson = await spawnerResponse.json();
                            throw new Error(errorJson.error || 'Không thể tạo tác vụ.');
                        }
                        
                        const spawnerResult = await spawnerResponse.json();
                        updateUserDiamonds(spawnerResult.newDiamondCount);

                        fetch('/.netlify/functions/generate-group-image-background', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jobId }),
                        });

                    } catch (error: any) {
                        showToast(error.message, 'error');
                        setIsGenerating(false);
                        cleanup();
                    }
                }
                if (status === 'CHANNEL_ERROR' || err) {
                    showToast('Lỗi kết nối thời gian thực.', 'error');
                    setIsGenerating(false);
                    cleanup();
                }
            });
    };

    const resetGenerator = () => {
        setGeneratedImage(null);
        setProgressText('');
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
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-group-result',
        image_url: generatedImage,
        prompt: `Group Photo based on reference. Prompt: ${prompt}`,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: 'Bạn', photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: 'Group Studio',
        user_id: user?.id || ''
    } : null;


    if (isGenerating) {
        return <GenerationProgress progressText={progressText} onCancel={() => setIsGenerating(false)} progressPercentage={progressPercentage} />;
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
                        className="max-w-xl w-full mx-auto bg-black/20 rounded-lg overflow-hidden border-2 border-pink-500/30 group relative cursor-pointer"
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
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-6 py-3 font-bold">
                             <i className="ph-fill ph-download-simple mr-2"></i>Tải & Sao chép
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
                    {[2, 3, 4, 5, 6].map(num => (
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
             <InstructionModal
                isOpen={isInstructionModalOpen}
                onClose={() => setInstructionModalOpen(false)}
                instructionKey="group-studio"
            />
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
                onUseCropped={(croppedImage: { url: string; file: File }) => {
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
                 {/* Left Column: Character Inputs */}
                <div className="w-full lg:w-2/3">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="themed-heading text-lg font-bold themed-title-glow">1. Cung cấp thông tin nhân vật</h3>
                        <button onClick={() => setNumCharacters(0)} className="text-xs text-skin-muted hover:text-skin-base">(Thay đổi số lượng)</button>
                    </div>
                    <div className={`grid grid-cols-2 ${numCharacters > 2 ? 'md:grid-cols-3' : ''} gap-4`}>
                        {characters.map((char, index) => (
                            <div key={index} className="bg-skin-fill p-3 rounded-xl border border-skin-border space-y-3">
                                <h4 className="text-sm font-bold text-center text-skin-base">Nhân vật {index + 1}</h4>
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose', index)} image={char.poseImage} onRemove={() => handleRemoveImage('pose', index)} text="Ảnh nhân vật (Lấy trang phục)" onPickFromProcessed={() => handleOpenPicker(index, 'pose')} />
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'face', index)} image={char.faceImage} onRemove={() => handleRemoveImage('face', index)} text="Ảnh gương mặt (Face ID)" onPickFromProcessed={() => handleOpenPicker(index, 'face')} />
                                <div className="pt-2">
                                    <p className="text-xs font-semibold text-center text-skin-muted mb-2">Giới tính (Bắt buộc)</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => handleGenderSelect(index, 'male')}
                                            className={`py-2 text-xs font-bold rounded-md border-2 transition flex items-center justify-center gap-1 ${char.gender === 'male' ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-skin-border bg-skin-fill-secondary text-skin-muted hover:border-blue-500/50'}`}
                                        >
                                            <i className="ph-fill ph-gender-male"></i> Nam
                                        </button>
                                        <button 
                                            onClick={() => handleGenderSelect(index, 'female')}
                                            className={`py-2 text-xs font-bold rounded-md border-2 transition flex items-center justify-center gap-1 ${char.gender === 'female' ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-skin-border bg-skin-fill-secondary text-skin-muted hover:border-pink-500/50'}`}
                                        >
                                            <i className="ph-fill ph-gender-female"></i> Nữ
                                        </button>
                                    </div>
                                </div>
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

                {/* Right Column: Settings */}
                <div className="w-full lg:w-1/3 themed-panel p-4 flex flex-col">
                     <SettingsBlock title="Cài đặt Nhóm" instructionKey="group-studio" onInstructionClick={() => setInstructionModalOpen(true)}>
                        <div className="space-y-4">
                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">2. Ảnh Mẫu Tham Chiếu</label>
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'reference')} image={referenceImage} onRemove={() => handleRemoveImage('reference')} text="Tải ảnh mẫu (Bố cục, tư thế...)" />
                                <p className="text-xs text-skin-muted mt-2">AI sẽ "học" bố cục, tư thế, bối cảnh và phong cách từ ảnh này để tái tạo lại với nhân vật của bạn.</p>
                            </div>

                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">3. Câu Lệnh Mô Tả (Prompt)</label>
                                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Thêm chi tiết về bối cảnh, hành động..." className="w-full p-2 bg-skin-input-bg rounded-md border border-skin-border focus:border-skin-border-accent transition text-xs text-skin-base resize-none" rows={3}/>
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">4. Phong cách nghệ thuật</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {MOCK_STYLES.map(p => (
                                        <button key={p.id} onClick={() => setSelectedStyle(p.id)} className={`p-2 text-xs font-semibold rounded-md border-2 transition text-center ${selectedStyle === p.id ? 'selected-glow' : 'border-skin-border bg-skin-fill-secondary hover:border-pink-500/50 text-skin-base'}`}>
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">5. Tỷ lệ khung hình</label>
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
                        </div>
                    </SettingsBlock>

                    <div className="mt-auto pt-6 space-y-4">
                        <div className="text-center text-sm p-3 bg-black/20 rounded-lg">
                            <p className="text-skin-muted">Chi phí: <span className="font-bold text-pink-400 flex items-center justify-center gap-1">{totalCost} <i className="ph-fill ph-diamonds-four"></i></span></p>
                        </div>
                        <button onClick={handleGenerateClick} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2">
                            <i className="ph-fill ph-magic-wand"></i>
                            Tạo Ảnh Nhóm
                        </button>
                         <p className="text-xs text-center text-skin-muted">Thời gian tạo ảnh nhóm sẽ lâu hơn ảnh đơn.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupGeneratorTool;