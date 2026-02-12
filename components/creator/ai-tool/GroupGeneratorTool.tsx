
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import ImageUploader from '../../ai-tool/ImageUploader';
import { resizeImage, base64ToFile, preprocessImageToAspectRatio, createBlankCanvas } from '../../../utils/imageUtils';
import ProcessedImagePickerModal from './ProcessedImagePickerModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ImageModal from '../../common/ImageModal';
import SettingsBlock from '../../ai-tool/SettingsBlock';
import { useTranslation } from '../../../hooks/useTranslation';
import PromptLibraryModal from './PromptLibraryModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';
import ComicStudio from '../comic/ComicStudio';


// Mock data for styles
const MOCK_STYLES = [
    { id: 'cinematic', name: 'Điện ảnh' },
    { id: 'anime', name: 'Hoạt hình Anime' },
    { id: '3d-render', name: 'Kết xuất 3D' },
    { id: 'photographic', name: 'Nhiếp ảnh' },
    { id: 'fantasy', name: 'Kỳ ảo' },
    { id: 'oil-painting', name: 'Tranh sơn dầu' },
];

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

type ImageState = { url: string; file: File } | null;

interface CharacterState {
    poseImage: ImageState;
    faceImage: ImageState;
    processedFace: string | null;
    gender: 'male' | 'female' | null;
}

interface ProcessedImageData {
    id: string;
    imageBase64?: string;
    mimeType: string;
    fileName: string;
    processedUrl: string;
    originalUrl?: string;
}

interface GroupGeneratorToolProps {
    onSwitchToUtility: () => void;
    onInstructionClick: (key?: any) => void;
    // Callback to switch tool and load image
    onSwitchToolWithImage?: (image: { url: string; file: File }, targetTool: 'bg-remover' | 'enhancer') => void;
}

// Helper Component for Mode Selection Card
const ModeCard: React.FC<{
    icon: string;
    title: string;
    description: string;
    colorClass: string;
    onClick: () => void;
    hot?: boolean;
}> = ({ icon, title, description, colorClass, onClick, hot }) => (
    <button 
        onClick={onClick}
        className={`group relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-white/5 bg-[#181820] hover:bg-white/5 transition-all duration-300 w-full hover:-translate-y-2 hover:shadow-xl ${colorClass} interactive-3d overflow-hidden`}
    >
        {hot && <div className="absolute top-3 right-3 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase shadow-sm animate-pulse z-10">HOT</div>}
        <div className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-500 from-white to-transparent pointer-events-none"></div>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-4 bg-white/5 shadow-inner transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>
            <i className={`ph-fill ${icon}`}></i>
        </div>
        <h3 className="text-xl font-black uppercase tracking-wide mb-1">{title}</h3>
        <p className="text-xs text-gray-400 font-medium">{description}</p>
    </button>
);

// Main Component
const GroupGeneratorTool: React.FC<GroupGeneratorToolProps> = ({ onSwitchToUtility, onInstructionClick, onSwitchToolWithImage }) => {
    const { user, session, showToast, supabase, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
    
    // Mode State: 'selection' | 'generator' | 'comic'
    const [activeMode, setActiveMode] = useState<'selection' | 'generator' | 'comic'>('selection');

    const [numCharacters, setNumCharacters] = useState<number>(0);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
    // UI State for Group Selection Slider
    const [tempGroupSize, setTempGroupSize] = useState(3);
    const [showGroupSlider, setShowGroupSlider] = useState(false);
    
    const [characters, setCharacters] = useState<CharacterState[]>([]);

    // New state for reference image based generation
    const [referenceImage, setReferenceImage] = useState<ImageState>(null);
    const [prompt, setPrompt] = useState('');
    const [selectedStyle, setSelectedStyle] = useState(MOCK_STYLES[0].id);
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [selectedModel, setSelectedModel] = useState<'flash' | 'pro'>('flash');
    
    // New features state
    const [imageResolution, setImageResolution] = useState<'1K' | '2K' | '4K'>('1K');
    const [useGoogleSearch, setUseGoogleSearch] = useState(true);
    const [removeWatermark, setRemoveWatermark] = useState(false);

    // New states for generation flow
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [progressText, setProgressText] = useState('');
    const [processingFaceIndex, setProcessingFaceIndex] = useState<number | null>(null);
    
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ index: number; type: 'pose' | 'face' } | null>(null);
    
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);

    // Refs for cleanup
    const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            supabase?.removeAllChannels();
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, [supabase]);
    
    useEffect(() => {
        // Smart default Aspect Ratios based on character count
        if (numCharacters === 1) setAspectRatio('3:4'); // Portrait for solo
        else if (numCharacters === 2) setAspectRatio('3:4'); // Portrait for couple often works, or 1:1
        else if (numCharacters <= 4) setAspectRatio('1:1'); // Square for small group
        else setAspectRatio('16:9'); // Landscape for large group
    }, [numCharacters]);
    
    // Reset resolution when switching to flash
    useEffect(() => {
        if (selectedModel === 'flash') {
            setImageResolution('1K');
            setUseGoogleSearch(false);
        } else {
            setUseGoogleSearch(true);
        }
    }, [selectedModel]);

    const progressPercentage = useMemo(() => {
        if (!isGenerating) return 0;
        if (generatedImage) return 100;

        const match = progressText.match(/(\d+)\/(\d+)/);
        if (match) {
            const current = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            return 10 + ((current - 1) / total) * 80;
        }
        if (progressText.includes('tổng hợp') || progressText.includes('compositing')) return 95;
        if (progressText.includes('khởi tạo') || progressText.includes('initializing')) return 5;
        return 10;
    }, [isGenerating, generatedImage, progressText]);


    const handleNumCharactersSelect = (num: number) => {
        setNumCharacters(num);
        setShowGroupSlider(false); 
        setCharacters(Array.from({ length: num }, () => ({
            poseImage: null,
            faceImage: null,
            processedFace: null,
            gender: null
        })));
        setActiveMode('generator');
    };
    
    const handleComicModeSelect = () => {
        setActiveMode('comic');
    }

    const handleGenderSelect = (index: number, gender: 'male' | 'female') => {
        setCharacters(prev => prev.map((char, i) => {
            if (i === index) {
                return { ...char, gender };
            }
            return char;
        }));
    };
    
    // ... (Keep existing image upload and processing handlers unchanged) ...
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'pose' | 'face' | 'reference', index?: number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        resizeImage(file, 800).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
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
        }).catch(() => showToast(t('creator.aiTool.common.errorProcessImage'), "error"));
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
    
    const handleImageSelectFromPicker = async (imageData: ProcessedImageData) => {
        if (!pickerTarget) return;
        
        let dataUrl = imageData.processedUrl;
        let file: File;

        if (imageData.imageBase64) {
             dataUrl = `data:${imageData.mimeType};base64,${imageData.imageBase64}`;
             file = base64ToFile(imageData.imageBase64, imageData.fileName, imageData.mimeType);
        } else {
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
        
        setCharacters(prev => prev.map((char, i) => {
            if (i === pickerTarget.index) {
                if (pickerTarget.type === 'pose') return { ...char, poseImage: newImage };
                return { ...char, faceImage: newImage, processedFace: null };
            }
            return char;
        }));
        
        setIsPickerOpen(false);
        setPickerTarget(null);
        showToast(t('modals.processedImage.success.full'), 'success');
    };

    const handleCropSelectFromPicker = (croppedImage: { url: string; file: File }) => {
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
        setIsPickerOpen(false);
        setPickerTarget(null);
        showToast(t('modals.processedImage.success.cropped'), 'success');
    };

    const handleProcessAction = async (image: ProcessedImageData, action: 'bg-remover' | 'enhancer') => {
        if (!onSwitchToolWithImage) return;

        try {
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


    const handleProcessFace = async (index: number, modelType: 'flash' | 'pro') => {
        const char = characters[index];
        if (!char.faceImage || !session) return;
        
        const cost = modelType === 'pro' ? 10 : 1;
        if (user && user.diamonds < cost) {
             showToast(t('creator.aiTool.common.errorCredits', { cost, balance: user.diamonds }), 'error');
             return;
        }

        setProcessingFaceIndex(index);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(char.faceImage.file);
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

                setCharacters(prev => prev.map((c, i) => i === index ? { ...c, processedFace: result.processedImageBase64 } : c));
                updateUserDiamonds(result.newDiamondCount);
                showToast(t('creator.aiTool.singlePhoto.superFaceLockProcessed'), 'success');
            };
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setProcessingFaceIndex(null);
        }
    };

    const getBaseCost = () => {
        if (selectedModel === 'pro') {
            if (imageResolution === '4K') return 20;
            if (imageResolution === '2K') return 15;
            return 10;
        }
        return 1;
    };
    const baseCost = getBaseCost();
    let totalCost = baseCost + numCharacters;
    if (removeWatermark) totalCost += 1;

    const handleGenerateClick = () => {
        if (!referenceImage && !prompt.trim()) {
            showToast(t('creator.aiTool.groupStudio.errorRefOrPrompt'), 'error');
            return;
        }
        for (let i = 0; i < characters.length; i++) {
            if (!characters[i].poseImage) {
                showToast(t('creator.aiTool.groupStudio.errorPoseImage', { index: i + 1 }), 'error');
                return;
            }
            if (!characters[i].gender) {
                showToast(t('creator.aiTool.groupStudio.errorGender', { index: i + 1 }), 'error');
                return;
            }
        }

        if (user && user.diamonds < totalCost) {
            showToast(t('creator.aiTool.common.errorCredits', { cost: totalCost, balance: user.diamonds }), 'error');
            return;
        }
        setConfirmOpen(true);
    };
    
    // --- UPLOAD HELPER ---
    const uploadImageToR2 = async (file: File): Promise<string> => {
        const { dataUrl } = await resizeImage(file, 1024); // 1024 for high quality
        const res = await fetch('/.netlify/functions/upload-temp-image', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                Authorization: `Bearer ${session?.access_token}` 
            },
            body: JSON.stringify({ image: dataUrl }),
        });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Upload failed");
        }
        const data = await res.json();
        return data.url;
    };

    const handleConfirmGeneration = async () => {
        setConfirmOpen(false);
        setIsGenerating(true);
        setProgressText(t('creator.aiTool.common.initializing'));

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
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
            }
        };

        // 1. Realtime Subscription
        channel
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'generated_images',
                filter: `id=eq.${jobId}`
            }, (payload) => {
                const record = payload.new as any;
                
                if (record.prompt && record.prompt.startsWith('{')) {
                    try {
                        const jobData = JSON.parse(record.prompt);
                        if (jobData && jobData.progress) {
                            const progressMsg = jobData.progress;
                            const match = progressMsg.match(/(\d+)\/(\d+)/);
                            if (match) {
                                setProgressText(t('creator.aiTool.groupStudio.progress', { current: match[1], total: match[2] }));
                            } else if (progressMsg.includes('compositing')) {
                                setProgressText(t('creator.aiTool.groupStudio.progressCompositing'));
                            } else if (progressMsg.includes('background')) {
                                setProgressText(t('creator.aiTool.groupStudio.progressCreatingBg'));
                            } else {
                                setProgressText(progressMsg);
                            }
                        }
                    } catch (e) {
                       // Ignore parsing errors
                    }
                }

                if (record.image_url && record.image_url !== 'PENDING') {
                    setGeneratedImage(record.image_url);
                    showToast(t('creator.aiTool.common.success'), 'success');
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
                 showToast('Tạo ảnh thất bại. Hệ thống đã hoàn tiền cho bạn.', 'error');
                 setIsGenerating(false);
                 cleanup();
            })
            .subscribe(async (status, err) => {
                if (status === 'SUBSCRIBED') {
                    try {
                        // --- PREPARE AND UPLOAD IMAGES ---
                        setProgressText('Đang chuẩn bị dữ liệu...');
                        
                        // 1. Prepare Master Canvas (Client-side Preprocessing)
                        let masterCanvasBase64 = '';
                        if (referenceImage) {
                            masterCanvasBase64 = await preprocessImageToAspectRatio(referenceImage.url, aspectRatio);
                        } else {
                            masterCanvasBase64 = createBlankCanvas(aspectRatio);
                        }

                        // Upload the preprocessed master canvas
                        const masterCanvasFile = base64ToFile(masterCanvasBase64.split(',')[1], 'master_canvas.png', 'image/png');
                        const uploadedRefUrl = await uploadImageToR2(masterCanvasFile);

                        // 2. Upload Character Images (Parallel)
                        const charactersPayload = await Promise.all(characters.map(async (char, idx) => {
                            let poseUrl = null;
                            let faceUrl = null;

                            // Pose is mandatory
                            if (char.poseImage) {
                                poseUrl = await uploadImageToR2(char.poseImage.file);
                            }

                            // Face: Either use processed base64 (from face lock) OR upload raw file
                            if (char.processedFace) {
                                const file = base64ToFile(char.processedFace, `char_${idx}_face.png`, 'image/png');
                                faceUrl = await uploadImageToR2(file);
                            } else if (char.faceImage) {
                                faceUrl = await uploadImageToR2(char.faceImage.file);
                            }

                            return {
                                poseImage: poseUrl,
                                faceImage: faceUrl, 
                                gender: char.gender,
                            };
                        }));
            
                        // 3. Send Lightweight Payload (URLs only)
                        const spawnerResponse = await fetch('/.netlify/functions/generate-group-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({
                                jobId, 
                                characters: charactersPayload,
                                referenceImage: uploadedRefUrl, // Now points to the pre-processed canvas
                                prompt,
                                style: selectedStyle,
                                aspectRatio: aspectRatio,
                                model: selectedModel,
                                imageSize: imageResolution, 
                                useSearch: useGoogleSearch,
                                removeWatermark 
                            }),
                        });

                        if (!spawnerResponse.ok) {
                            const errorJson = await spawnerResponse.json();
                            throw new Error(errorJson.error || 'Không thể tạo tác vụ.');
                        }
                        
                        const spawnerResult = await spawnerResponse.json();
                        updateUserDiamonds(spawnerResult.newDiamondCount);

                        // Trigger Worker
                        fetch('/.netlify/functions/generate-group-image-background', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jobId }),
                        });

                        // 2. Polling Fallback
                        pollingInterval.current = setInterval(async () => {
                            const { data } = await supabase
                                .from('generated_images')
                                .select('image_url')
                                .eq('id', jobId)
                                .single();
                            
                            if (data && data.image_url && data.image_url !== 'PENDING') {
                                setGeneratedImage(data.image_url);
                                showToast(t('creator.aiTool.common.success'), 'success');
                                setIsGenerating(false);
                                cleanup();
                            }
                        }, 3000);

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
    };
    
    const resultImageForModal = generatedImage ? {
        id: 'generated-group-result',
        image_url: generatedImage,
        prompt: `Studio Photo. Prompt: ${prompt}`,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: t('common.creator'), photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: 'Studio',
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
                    <h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">{t('creator.aiTool.common.success')}</h3>
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
                            <i className="ph-fill ph-arrow-counter-clockwise mr-2"></i>{t('creator.aiTool.common.createAnother')}
                        </button>
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-6 py-3 font-bold">
                             <i className="ph-fill ph-download-simple mr-2"></i>{t('creator.aiTool.common.downloadAndCopy')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // --- COMIC STUDIO MODE ---
    if (activeMode === 'comic') {
        return (
            <ComicStudio 
                onInstructionClick={() => onInstructionClick('comic-studio')} 
                onBack={() => setActiveMode('selection')}
            />
        );
    }

    // --- SELECTION MODE ---
    if (activeMode === 'selection') {
        return (
            <div className="flex flex-col items-center animate-fade-in py-8">
                <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-2 text-center">{t('creator.aiTool.groupStudio.introTitle')}</h2>
                <p className="text-skin-muted mb-8 text-center text-sm">{t('creator.aiTool.groupStudio.introDesc')}</p>
                
                {/* 4 Main Mode Selection Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl w-full px-4">
                    
                    {/* Solo Mode */}
                    <ModeCard 
                        icon="ph-user"
                        title="Đơn (Solo)"
                        description="Ảnh chân dung, Avatar, Fashion"
                        colorClass="text-cyan-400 border-cyan-500/30 hover:border-cyan-400 hover:shadow-cyan-500/20"
                        onClick={() => handleNumCharactersSelect(1)}
                    />
                    
                    {/* Couple Mode */}
                    <ModeCard 
                        icon="ph-heart"
                        title="Đôi (Couple)"
                        description="Ảnh đôi, Hẹn hò, Cưới"
                        colorClass="text-pink-400 border-pink-500/30 hover:border-pink-400 hover:shadow-pink-500/20"
                        onClick={() => handleNumCharactersSelect(2)}
                    />
                    
                    {/* Group Mode (Slider Trigger) */}
                    {!showGroupSlider ? (
                        <ModeCard 
                            icon="ph-users-three"
                            title="Nhóm (Party)"
                            description="Nhóm bạn, Gia đình, Fam (3+)"
                            colorClass="text-yellow-400 border-yellow-500/30 hover:border-yellow-400 hover:shadow-yellow-500/20"
                            onClick={() => setShowGroupSlider(true)}
                        />
                    ) : (
                        <div className="bg-[#181820] border-2 border-yellow-500 rounded-2xl p-6 flex flex-col items-center justify-center animate-fade-in shadow-xl shadow-yellow-500/20 w-full h-full min-h-[200px]">
                            <h4 className="text-yellow-400 font-bold mb-4 uppercase tracking-wider text-sm">Chọn số lượng</h4>
                            <div className="flex items-center gap-4 mb-6 w-full">
                                <span className="text-2xl font-black text-white w-8 text-center">{tempGroupSize}</span>
                                <input 
                                    type="range" 
                                    min="3" 
                                    max="6" 
                                    value={tempGroupSize} 
                                    onChange={(e) => setTempGroupSize(Number(e.target.value))} 
                                    className="flex-grow accent-yellow-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" 
                                />
                            </div>
                            <div className="flex gap-2 w-full">
                                <button onClick={() => setShowGroupSlider(false)} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition">Hủy</button>
                                <button onClick={() => handleNumCharactersSelect(tempGroupSize)} className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg text-xs font-bold transition shadow-lg">Xác nhận</button>
                            </div>
                        </div>
                    )}
                    
                    {/* Comic Mode (New) */}
                    <ModeCard 
                        icon="ph-book-open-text"
                        title="Truyện Tranh"
                        description="Viết kịch bản & Vẽ truyện AI"
                        colorClass="text-purple-400 border-purple-500/30 hover:border-purple-400 hover:shadow-purple-500/20"
                        onClick={handleComicModeSelect}
                        hot={true}
                    />
                </div>
            </div>
        );
    }

    // --- GENERATOR MODE ---
    return (
        <div className="animate-fade-in">
             <ProcessedImagePickerModal 
                isOpen={isPickerOpen} 
                onClose={() => setIsPickerOpen(false)} 
                onSelect={handleImageSelectFromPicker}
                onCropSelect={handleCropSelectFromPicker}
                onProcessAction={handleProcessAction}
            />
             {/* Category logic: 1->single, 2->couple, 3+->group */}
             <PromptLibraryModal 
                isOpen={isPromptLibraryOpen} 
                onClose={() => setIsPromptLibraryOpen(false)} 
                onSelectPrompt={(p) => setPrompt(p)} 
                category={numCharacters === 1 ? 'single-photo' : numCharacters === 2 ? 'couple-photo' : 'group-photo'} 
             />
             
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmGeneration} cost={totalCost} />
            
             <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-lg text-sm flex items-start gap-3 mb-6">
                <i className="ph-fill ph-info text-2xl flex-shrink-0"></i>
                <div>
                    <span className="font-bold">{t('langName') === 'English' ? 'Tip:' : 'Mẹo:'}</span> {t('creator.aiTool.singlePhoto.bgRemoverTip')}
                    <button onClick={onSwitchToUtility} className="font-bold underline ml-2 hover:text-white">{t('creator.aiTool.singlePhoto.switchToBgRemover')}</button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                 {/* Left Column: Character Inputs */}
                <div className="w-full lg:w-2/3">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="themed-heading text-lg font-bold themed-title-glow">{t('creator.aiTool.groupStudio.characterInfoTitle')}</h3>
                        <button onClick={() => setActiveMode('selection')} className="text-xs text-skin-muted hover:text-skin-base border border-skin-border px-2 py-1 rounded-full bg-skin-fill hover:bg-white/5 transition flex items-center gap-1">
                            <i className="ph-bold ph-arrow-left"></i> Quay lại Menu
                        </button>
                    </div>
                    {/* Responsive Grid based on count */}
                    <div className={`grid grid-cols-1 sm:grid-cols-2 ${numCharacters > 2 ? 'md:grid-cols-3' : ''} gap-4`}>
                        {characters.map((char, index) => (
                            <div key={index} className="bg-skin-fill p-3 rounded-xl border border-skin-border space-y-3 shadow-md">
                                <h4 className="text-sm font-bold text-center text-skin-base flex items-center justify-center gap-2">
                                    <span className="bg-skin-accent/10 text-skin-accent px-2 py-0.5 rounded text-xs uppercase">
                                        {numCharacters === 1 ? 'Nhân vật chính' : `${t('creator.aiTool.groupStudio.character')} ${index + 1}`}
                                    </span>
                                </h4>
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'pose', index)} image={char.poseImage} onRemove={() => handleRemoveImage('pose', index)} text={t('creator.aiTool.groupStudio.poseImageText')} onPickFromProcessed={() => handleOpenPicker(index, 'pose')} />
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'face', index)} image={char.faceImage} onRemove={() => handleRemoveImage('face', index)} text={t('creator.aiTool.groupStudio.faceImageText')} onPickFromProcessed={() => handleOpenPicker(index, 'face')} />
                                <div className="pt-2">
                                    <p className="text-xs font-semibold text-center text-skin-muted mb-2">{t('creator.aiTool.groupStudio.genderLabel')}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => handleGenderSelect(index, 'male')}
                                            className={`py-2 text-xs font-bold rounded-md border-2 transition flex items-center justify-center gap-1 ${char.gender === 'male' ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-skin-border bg-skin-fill-secondary text-skin-muted hover:border-blue-500/50'}`}
                                        >
                                            <i className="ph-fill ph-gender-male"></i> {t('creator.aiTool.groupStudio.male')}
                                        </button>
                                        <button 
                                            onClick={() => handleGenderSelect(index, 'female')}
                                            className={`py-2 text-xs font-bold rounded-md border-2 transition flex items-center justify-center gap-1 ${char.gender === 'female' ? 'border-pink-500 bg-pink-500/10 text-pink-300' : 'border-skin-border bg-skin-fill-secondary text-skin-muted hover:border-pink-500/50'}`}
                                        >
                                            <i className="ph-fill ph-gender-female"></i> {t('creator.aiTool.groupStudio.female')}
                                        </button>
                                    </div>
                                </div>
                                {/* Face Lock Buttons */}
                                {char.processedFace ? (
                                     <div className="w-full text-sm font-bold py-2 px-3 bg-green-500/20 text-green-300 rounded-lg text-center">
                                        <i className="ph-fill ph-check-circle mr-1"></i> {t('creator.aiTool.singlePhoto.superFaceLockProcessed')}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <button 
                                            onClick={() => handleProcessFace(index, 'flash')}
                                            disabled={processingFaceIndex === index || !char.faceImage}
                                            className="w-full text-xs font-bold py-2 px-2 bg-blue-500/20 text-blue-300 border border-blue-500/50 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-wait"
                                        >
                                            {processingFaceIndex === index ? t('creator.aiTool.singlePhoto.superFaceLockProcessing') : t('creator.aiTool.singlePhoto.superFaceLockActionFlash')}
                                        </button>
                                        <button 
                                            onClick={() => handleProcessFace(index, 'pro')}
                                            disabled={processingFaceIndex === index || !char.faceImage}
                                            className="w-full text-xs font-bold py-2 px-2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-wait shadow-lg shadow-yellow-500/10"
                                        >
                                            {processingFaceIndex === index ? t('creator.aiTool.singlePhoto.superFaceLockProcessing') : t('creator.aiTool.singlePhoto.superFaceLockActionPro')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column: Settings */}
                <div className="w-full lg:w-1/3 themed-panel p-4 flex flex-col">
                     <SettingsBlock 
                        title={t('creator.aiTool.groupStudio.settingsTitle')} 
                        instructionKey="group-studio" 
                        onInstructionClick={onInstructionClick}
                    >
                        <div className="space-y-4">
                             <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.groupStudio.refImageTitle')}</label>
                                <ImageUploader onUpload={(e) => handleImageUpload(e, 'reference')} image={referenceImage} onRemove={() => handleRemoveImage('reference')} text={t('creator.aiTool.groupStudio.refImageUploadText')} />
                                <p className="text-xs text-skin-muted mt-2">{t('creator.aiTool.groupStudio.refImageDesc')}</p>
                            </div>

                             <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-semibold text-skin-base">{t('creator.aiTool.groupStudio.promptTitle')}</label>
                                    <button
                                        onClick={() => setIsPromptLibraryOpen(true)}
                                        className="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-full px-3 py-1.5 font-semibold transition whitespace-nowrap"
                                        title={t('modals.promptLibrary.buttonTooltip')}
                                    >
                                        <i className="ph-fill ph-scroll"></i>
                                        <span>Sử dụng Prompt có sẵn</span>
                                    </button>
                                </div>
                                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('creator.aiTool.groupStudio.promptPlaceholder')} className="w-full p-2 bg-skin-input-bg rounded-md border border-skin-border focus:border-skin-border-accent transition text-xs text-skin-base resize-none" rows={3}/>
                            </div>

                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.singlePhoto.modelLabel')}</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => setSelectedModel('flash')}
                                        className={`p-2 rounded-lg border-2 text-left transition-all ${selectedModel === 'flash' ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-skin-border bg-skin-fill-secondary text-gray-400'}`}
                                    >
                                        <div className="text-xs font-bold">Flash</div>
                                        <div className="text-[10px] mt-1 opacity-80">1💎 base</div>
                                    </button>
                                    <button 
                                        onClick={() => setSelectedModel('pro')}
                                        className={`p-2 rounded-lg border-2 text-left transition-all ${selectedModel === 'pro' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-skin-border bg-skin-fill-secondary text-gray-400'}`}
                                    >
                                        <div className="text-xs font-bold">Pro 4K</div>
                                        <div className="text-[10px] mt-1 opacity-80">10+ 💎 base</div>
                                    </button>
                                </div>
                            </div>

                             {/* Resolution & Search for Pro */}
                             {selectedModel === 'pro' && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-3">
                                     <div>
                                        <label className="text-xs font-bold text-yellow-400 mb-2 block flex justify-between">
                                            <span>Resolution (Pro)</span>
                                            <span className="text-[10px] bg-yellow-500/20 px-2 py-0.5 rounded">{imageResolution === '1K' ? 'Base 10💎' : imageResolution === '2K' ? 'Base 15💎' : 'Base 20💎'}</span>
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
                                            Kết nối tìm kiếm thực tế (Auto-on).
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.groupStudio.styleTitle')}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {MOCK_STYLES.map(p => (
                                        <button key={p.id} onClick={() => setSelectedStyle(p.id)} className={`p-2 text-xs font-semibold rounded-md border-2 transition text-center ${selectedStyle === p.id ? 'selected-glow' : 'border-skin-border bg-skin-fill-secondary hover:border-pink-500/50 text-skin-base'}`}>
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.groupStudio.aspectRatioTitle')}</label>
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

                            <div>
                                <ToggleSwitch 
                                    label={t('creator.aiTool.singlePhoto.removeWatermarkLabel')} 
                                    checked={removeWatermark} 
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemoveWatermark(e.target.checked)} 
                                    title={t('creator.aiTool.singlePhoto.removeWatermarkDesc')}
                                />
                                <p className="text-xs text-skin-muted px-1 mt-1 leading-relaxed">{t('creator.aiTool.singlePhoto.removeWatermarkDesc')}</p>
                            </div>
                        </div>
                    </SettingsBlock>

                    <div className="mt-auto pt-6 space-y-4">
                        <div className="text-center text-sm p-3 bg-black/20 rounded-lg">
                            <p className="text-skin-muted">{t('creator.aiTool.common.cost')}: <span className="font-bold text-pink-400 flex items-center justify-center gap-1">{totalCost} <i className="ph-fill ph-diamonds-four"></i></span></p>
                        </div>
                        <button onClick={handleGenerateClick} className="themed-button-primary w-full px-8 py-4 font-bold text-lg flex items-center justify-center gap-2">
                            <i className="ph-fill ph-magic-wand"></i>
                            {t('creator.aiTool.groupStudio.generateButton')}
                        </button>
                         <p className="text-xs text-center text-skin-muted">{t('creator.aiTool.groupStudio.generateTimeWarning')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupGeneratorTool;
