
// FIX: Import 'useState' from 'react' to resolve 'Cannot find name' errors.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import ImageUploader from '../../ai-tool/ImageUploader';
import { resizeImage, base64ToFile } from '../../../utils/imageUtils';
import ProcessedImagePickerModal from './ProcessedImagePickerModal';
import GenerationProgress from '../../ai-tool/GenerationProgress';
import ImageModal from '../../common/ImageModal';
import ProcessedImageModal from '../../ai-tool/ProcessedImageModal';
import SettingsBlock from '../../ai-tool/SettingsBlock';
import { useTranslation } from '../../../hooks/useTranslation';
import PromptLibraryModal from './PromptLibraryModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';


// Mock data for presets - in a real app, this would come from a database
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
    imageBase64: string;
    mimeType: string;
    fileName: string;
    // Add missing properties to match the type used in ProcessedImageModal
    processedUrl: string;
    originalUrl?: string;
}

interface GroupGeneratorToolProps {
    onSwitchToUtility: () => void;
    // FIX: Add missing 'onInstructionClick' prop to align with its usage in AITool.tsx.
    onInstructionClick: () => void;
}

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

// Main Component
const GroupGeneratorTool: React.FC<GroupGeneratorToolProps> = ({ onSwitchToUtility, onInstructionClick }) => {
    const { user, session, showToast, supabase, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
    const [numCharacters, setNumCharacters] = useState<number>(0);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    
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
    const [removeWatermark, setRemoveWatermark] = useState(false); // New

    // New states for generation flow
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [progressText, setProgressText] = useState('');
    const [processingFaceIndex, setProcessingFaceIndex] = useState<number | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ index: number; type: 'pose' | 'face' } | null>(null);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);
    const [imageToProcess, setImageToProcess] = useState<ProcessedImageData | null>(null);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);

    // Refs for cleanup
    const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Effect to clean up any dangling subscriptions on unmount
    useEffect(() => {
        return () => {
            supabase?.removeAllChannels();
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, [supabase]);
    
    useEffect(() => {
        if (numCharacters <= 2) setAspectRatio('3:4');
        else if (numCharacters <= 4) setAspectRatio('1:1');
        else setAspectRatio('16:9');
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

    const handleImageSelectFromPicker = (imageData: ProcessedImageData) => {
        setIsPickerOpen(false);
        setImageToProcess(imageData);
    };

    const handleProcessFace = async (index: number, modelType: 'flash' | 'pro') => {
        const char = characters[index];
        if (!char.faceImage || !session) return;
        
        // Cost check
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

    // Cost Calculation
    // Base: Pro (1K) = 10, Pro (2K) = 15, Pro (4K) = 20. Flash = 1.
    // + Characters count.
    // + Watermark removal (+1)
    const getBaseCost = () => {
        if (selectedModel === 'pro') {
            if (imageResolution === '4K') return 20;
            if (imageResolution === '2K') return 15;
            return 10; // 1K Base
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
                                model: selectedModel,
                                imageSize: imageResolution, 
                                useSearch: useGoogleSearch,
                                removeWatermark // New Param
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

                        // 2. Polling Fallback (in case socket events are missed)
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
                        }, 3000); // Check every 3 seconds

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
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: t('common.creator'), photo_url: '', level: 1 },
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


    if (numCharacters === 0) {
        return (
            <div className="text-center p-8 min-h-[50vh] flex flex-col items-center justify-center animate-fade-in">
                <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-4">{t('creator.aiTool.groupStudio.introTitle')}</h2>
                <p className="text-skin-muted mb-6">{t('creator.aiTool.groupStudio.introDesc')}</p>
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
             <ProcessedImagePickerModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={handleImageSelectFromPicker} />
             <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category={numCharacters > 2 ? 'group-photo' : 'couple-photo'} />
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
                    showToast(t('modals.processedImage.success.cropped'), 'success');
                }}
                onDownload={() => {
                    if (imageToProcess) handleDownloadResult();
                }}
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
                        <button onClick={() => setNumCharacters(0)} className="text-xs text-skin-muted hover:text-skin-base">{t('creator.aiTool.groupStudio.changeAmount')}</button>
                    </div>
                    <div className={`grid grid-cols-2 ${numCharacters > 2 ? 'md:grid-cols-3' : ''} gap-4`}>
                        {characters.map((char, index) => (
                            <div key={index} className="bg-skin-fill p-3 rounded-xl border border-skin-border space-y-3">
                                <h4 className="text-sm font-bold text-center text-skin-base">{t('creator.aiTool.groupStudio.character')} {index + 1}</h4>
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
                     <SettingsBlock title={t('creator.aiTool.groupStudio.settingsTitle')} instructionKey="group-studio" onInstructionClick={onInstructionClick}>
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
                                        className="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg px-3 py-1.5 font-semibold transition whitespace-nowrap"
                                        title={t('modals.promptLibrary.buttonTooltip')}
                                    >
                                        <i className="ph-fill ph-scroll"></i>
                                        {t('modals.promptLibrary.button')}
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
