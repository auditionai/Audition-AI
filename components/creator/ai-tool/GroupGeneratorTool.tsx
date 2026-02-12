
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { resizeImage } from '../../../utils/imageUtils';
import SettingsBlock from './SettingsBlock';
import ImageUploader from '../../ai-tool/ImageUploader';
import ImageModal from '../../common/ImageModal';
import ConfirmationModal from '../../ConfirmationModal';
import PromptLibraryModal from './PromptLibraryModal';
import ToggleSwitch from '../../ai-tool/ToggleSwitch';
import AiGeneratorTool from './AiGeneratorTool';
import ComicStudio from '../comic/ComicStudio';

// --- TYPES ---
interface GroupGeneratorToolProps {
    onSwitchToUtility: () => void;
    onInstructionClick: (key: any) => void;
    onSwitchToolWithImage: (image: { url: string; file: File }, targetTool: 'bg-remover' | 'enhancer') => void;
}

interface CharacterInput {
    id: string;
    poseImage: { url: string; file: File } | null;
    faceImage: { url: string; file: File } | null;
    gender: 'male' | 'female';
}

// --- INTERNAL COMPONENT: GROUP STUDIO FORM (Redesigned) ---
const GroupStudioForm: React.FC<{ 
    initialCount: number; 
    onBack: () => void;
    onInstructionClick: (key: any) => void;
}> = ({ initialCount, onBack, onInstructionClick }) => {
    const { user, session, showToast, updateUserDiamonds, supabase } = useAuth();
    const { t } = useTranslation();

    // Init characters based on initialCount
    const [characters, setCharacters] = useState<CharacterInput[]>(() => {
        const initialChars: CharacterInput[] = [];
        for (let i = 0; i < initialCount; i++) {
            initialChars.push({ 
                id: crypto.randomUUID(), 
                poseImage: null, 
                faceImage: null, 
                gender: i % 2 === 0 ? 'female' : 'male' 
            });
        }
        return initialChars;
    });

    const [referenceImage, setReferenceImage] = useState<{ url: string; file: File } | null>(null);
    const [prompt, setPrompt] = useState('');
    
    // Config State
    const [model, setModel] = useState<'flash' | 'pro'>('flash');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [style] = useState('Cinematic');
    const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
    const [removeWatermark, setRemoveWatermark] = useState(false);
    const [enableGoogleSearch, setEnableGoogleSearch] = useState(false);

    // Process State
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
    
    // Result State
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);

    const handleCharacterChange = (id: string, field: keyof CharacterInput, value: any) => {
        setCharacters(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleAddCharacter = () => {
        if (characters.length >= 5) return showToast('Tối đa 5 nhân vật.', 'error');
        setCharacters(prev => [...prev, { id: crypto.randomUUID(), poseImage: null, faceImage: null, gender: 'female' }]);
    };

    const handleRemoveCharacter = (id: string) => {
        if (characters.length <= 1) return;
        setCharacters(prev => prev.filter(c => c.id !== id));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (img: { url: string; file: File }) => void) => {
        const file = e.target.files?.[0];
        if (file) {
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl }) => {
                callback({ url: dataUrl, file: resizedFile });
            });
        }
        e.target.value = '';
    };

    const calculateCost = () => {
        let base = 1;
        if (model === 'pro') {
            if (imageSize === '4K') base = 20;
            else if (imageSize === '2K') base = 15;
            else base = 10;
        }
        let total = base + characters.length;
        if (removeWatermark) total += 1;
        return total;
    };

    const handleGenerateClick = () => {
        const missingPose = characters.some((c) => !c.poseImage);
        if (missingPose) return showToast('Vui lòng tải ảnh nhân vật (Pose) cho tất cả các slot.', 'error');
        
        if (!referenceImage && !prompt.trim()) return showToast('Vui lòng cung cấp Ảnh Tham Chiếu hoặc nhập Prompt mô tả cảnh.', 'error');

        const cost = calculateCost();
        if (user && user.diamonds < cost) return showToast(t('creator.aiTool.common.errorCredits', { cost, balance: user.diamonds }), 'error');

        setIsConfirmOpen(true);
    };

    const confirmGenerate = async () => {
        setIsConfirmOpen(false);
        setIsGenerating(true);
        setGeneratedImage(null);
        setProgressMessage(t('creator.aiTool.groupStudio.progressCreatingBg'));

        try {
            const payloadCharacters = await Promise.all(characters.map(async c => ({
                gender: c.gender,
                poseImage: c.poseImage?.url,
                faceImage: c.faceImage?.url
            })));

            const payload = {
                jobId: crypto.randomUUID(),
                characters: payloadCharacters,
                referenceImage: referenceImage?.url,
                prompt,
                style,
                aspectRatio,
                model,
                imageSize,
                removeWatermark,
                useSearch: enableGoogleSearch
            };

            const res = await fetch('/.netlify/functions/generate-group-image', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Server Error');
            }

            const data = await res.json();
            if (data.newDiamondCount !== undefined) {
                updateUserDiamonds(data.newDiamondCount);
            }

            pollJob(payload.jobId);

        } catch (e: any) {
            showToast(e.message, 'error');
            setIsGenerating(false);
        }
    };

    const pollJob = (jobId: string) => {
        if (!supabase) return;
        const interval = setInterval(async () => {
            const { data, error } = await supabase.from('generated_images').select('image_url, prompt').eq('id', jobId).single();
            
            if (error || !data) {
                clearInterval(interval);
                setIsGenerating(false);
                return;
            }
            if (data.image_url && data.image_url.startsWith('FAILED:')) {
                clearInterval(interval);
                setIsGenerating(false);
                showToast(data.image_url.replace('FAILED: ', ''), 'error');
                return;
            }
            try {
                const promptData = JSON.parse(data.prompt);
                if (promptData.progress) setProgressMessage(promptData.progress);
            } catch(e) {}

            if (data.image_url && data.image_url !== 'PENDING') {
                clearInterval(interval);
                setGeneratedImage(data.image_url);
                setIsGenerating(false);
                showToast(t('creator.aiTool.common.success'), 'success');
            }
        }, 3000);
    };

    const resultImageForModal = generatedImage ? {
        id: 'generated-result',
        image_url: generatedImage,
        prompt: prompt,
        creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: 'Creator', photo_url: '', level: 1 },
        created_at: new Date().toISOString(),
        model_used: 'Group Studio',
        user_id: user?.id || ''
    } : null;

    // --- RENDER RESULT ---
    if (generatedImage) {
        return (
            <>
                <ImageModal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} image={resultImageForModal} showInfoPanel={false} />
                <div className="flex flex-col items-center justify-center w-full min-h-[70vh] py-6 animate-fade-in">
                    <h3 className="themed-heading text-3xl font-bold mb-6 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-md">{t('creator.aiTool.common.success')}</h3>
                    <div 
                        className="max-w-md w-full mx-auto bg-black/40 rounded-2xl overflow-hidden border-2 border-pink-500/50 cursor-pointer group relative shadow-[0_0_50px_rgba(236,72,153,0.15)]"
                        style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                        onClick={() => setIsResultModalOpen(true)}
                    >
                        <img src={generatedImage} alt="Generated result" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                            <i className="ph-fill ph-magnifying-glass-plus text-5xl text-white drop-shadow-lg"></i>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-8 justify-center">
                        <button onClick={() => { setGeneratedImage(null); setIsGenerating(false); }} className="themed-button-secondary px-8 py-3 font-bold text-base rounded-full shadow-lg">
                            <i className="ph-fill ph-arrow-counter-clockwise mr-2"></i> {t('creator.aiTool.common.createAnother')}
                        </button>
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-8 py-3 font-bold text-base rounded-full shadow-lg">
                            <i className="ph-fill ph-download-simple mr-2"></i> {t('creator.aiTool.common.downloadAndCopy')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // --- RENDER PROGRESS ---
    if (isGenerating) {
        return (
            <div className="bg-black/30 p-8 rounded-2xl flex flex-col items-center justify-center min-h-[70vh] border border-white/10 shadow-2xl">
                <div className="relative w-32 h-32 mb-8">
                    <div className="absolute inset-0 border-8 border-pink-500/20 rounded-full animate-ping"></div>
                    <div className="absolute inset-0 border-8 border-t-pink-500 rounded-full animate-spin"></div>
                    <i className="ph-fill ph-users-three text-5xl text-pink-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></i>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">{t('creator.aiTool.groupStudio.processing')}</h3>
                <p className="text-sm text-pink-300 animate-pulse bg-pink-500/10 px-4 py-2 rounded-full border border-pink-500/20">{progressMessage || t('creator.aiTool.common.waiting')}</p>
            </div>
        );
    }

    // --- RENDER FORM ---
    return (
        <div className="animate-fade-in h-full">
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={confirmGenerate} cost={calculateCost()} />
            <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="group-photo" />

            {/* Header */}
             <div className="flex items-center gap-3 mb-4">
                <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <i className="ph-bold ph-arrow-left text-white"></i>
                </button>
                <h3 className="text-lg font-bold text-white">
                    {characters.length === 2 ? 'Studio Đôi (Couple)' : `Studio Nhóm (${characters.length} người)`}
                </h3>
            </div>

            <div className="grid grid-cols-12 gap-3 pb-24 h-full">
                
                {/* --- LEFT: CHARACTERS (5/12) --- */}
                <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
                     <SettingsBlock 
                        title={`${t('creator.aiTool.groupStudio.character')} (${characters.length})`}
                        instructionKey="group-studio" 
                        onInstructionClick={() => onInstructionClick('group-studio')}
                        variant="pink"
                        className="h-full"
                        extraHeaderContent={
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => handleRemoveCharacter(characters[characters.length - 1].id)} disabled={characters.length <= 1} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50 transition"><i className="ph-bold ph-minus text-xs"></i></button>
                                <button onClick={handleAddCharacter} disabled={characters.length >= 5} className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50 transition"><i className="ph-bold ph-plus text-xs"></i></button>
                            </div>
                        }
                    >
                         <div className="grid grid-cols-1 gap-3 overflow-y-auto custom-scrollbar pr-1 max-h-[600px] lg:max-h-none h-full content-start">
                            {characters.map((char, index) => (
                                <div key={char.id} className="bg-[#1e1b25] p-2 rounded-xl border border-white/10 relative group hover:border-pink-500/30 transition-colors shadow-sm">
                                    <div className="absolute -top-2 -left-2 w-5 h-5 bg-pink-600 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md z-10">{index + 1}</div>
                                    <div className="grid grid-cols-12 gap-2">
                                        
                                        {/* Pose Image */}
                                        <div className="col-span-5">
                                            <p className="text-[9px] text-gray-400 mb-1 font-bold uppercase text-center">{t('creator.aiTool.groupStudio.poseImageText')}</p>
                                            <div className="aspect-[3/4] w-full">
                                                <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'poseImage', img))} image={char.poseImage} onRemove={() => handleCharacterChange(char.id, 'poseImage', null)} text="Dáng" className="w-full h-full" />
                                            </div>
                                        </div>

                                        {/* Face & Gender */}
                                        <div className="col-span-7 flex flex-col gap-2">
                                            <div>
                                                <p className="text-[9px] text-gray-400 mb-1 font-bold uppercase text-center">{t('creator.aiTool.groupStudio.faceImageText')}</p>
                                                <div className="aspect-square w-full">
                                                    <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'faceImage', img))} image={char.faceImage} onRemove={() => handleCharacterChange(char.id, 'faceImage', null)} text="Mặt" className="w-full h-full" />
                                                </div>
                                            </div>
                                            <div className="mt-auto">
                                                <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
                                                    <button onClick={() => handleCharacterChange(char.id, 'gender', 'male')} className={`flex-1 text-[10px] py-1.5 rounded font-bold transition-all ${char.gender === 'male' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-400'}`}>{t('creator.aiTool.groupStudio.male')}</button>
                                                    <button onClick={() => handleCharacterChange(char.id, 'gender', 'female')} className={`flex-1 text-[10px] py-1.5 rounded font-bold transition-all ${char.gender === 'female' ? 'bg-pink-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-400'}`}>{t('creator.aiTool.groupStudio.female')}</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SettingsBlock>
                </div>

                {/* --- CENTER: REF & PROMPT (3/12) --- */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
                     <SettingsBlock title="Tham Chiếu" variant="blue" className="h-auto">
                        <div className="aspect-square w-full">
                            <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => setReferenceImage(img))} image={referenceImage} onRemove={() => setReferenceImage(null)} text={t('creator.aiTool.groupStudio.refImageUploadText')} className="w-full h-full" />
                        </div>
                         <p className="text-[10px] text-gray-400 text-center leading-tight mt-1">{t('creator.aiTool.groupStudio.refImageDesc')}</p>
                    </SettingsBlock>

                    <SettingsBlock title={t('creator.aiTool.groupStudio.promptTitle')} variant="purple" className="flex-grow flex flex-col">
                        <div className="relative h-full">
                            <textarea 
                                value={prompt} 
                                onChange={(e) => setPrompt(e.target.value)} 
                                placeholder={t('creator.aiTool.groupStudio.promptPlaceholder')} 
                                className="w-full p-3 bg-black/40 rounded-xl border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition text-sm text-white h-full resize-none shadow-inner leading-relaxed min-h-[100px]" 
                            />
                            <button
                                onClick={() => setIsPromptLibraryOpen(true)}
                                className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-900/30 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-full px-2 py-1 font-bold transition shadow-lg backdrop-blur-md"
                                title={t('modals.promptLibrary.buttonTooltip')}
                            >
                                <i className="ph-fill ph-book-bookmark"></i>
                                {t('modals.promptLibrary.button')}
                            </button>
                        </div>
                    </SettingsBlock>
                </div>

                {/* --- RIGHT: SETTINGS (4/12) --- */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-3">
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.advancedSettingsTitle')} variant="yellow">
                        <div className="space-y-4">
                             {/* AI MODEL SELECTOR */}
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">
                                    <i className="ph-fill ph-robot mr-1"></i> {t('creator.aiTool.singlePhoto.modelLabel')}
                                </label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
                                    <button 
                                        onClick={() => setModel('flash')}
                                        className={`py-2.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-1 ${model === 'flash' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <i className="ph-fill ph-lightning text-base"></i>
                                        Flash (1💎)
                                    </button>
                                    <button 
                                        onClick={() => setModel('pro')}
                                        className={`py-2.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-1 ${model === 'pro' ? 'bg-gradient-to-br from-yellow-500 to-orange-600 text-white shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <i className="ph-fill ph-crown text-base"></i>
                                        Pro (10💎)
                                    </button>
                                </div>
                            </div>

                             {/* ASPECT RATIO */}
                             <div>
                                <label className="text-xs font-bold text-gray-400 mb-1.5 block uppercase tracking-wide">{t('creator.aiTool.singlePhoto.aspectRatioLabel')}</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(['3:4', '1:1', '16:9', '9:16'] as const).map(ar => (
                                        <button key={ar} onClick={() => setAspectRatio(ar)} className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${aspectRatio === ar ? 'border-pink-500 bg-pink-500/10 text-white shadow-lg shadow-pink-500/10' : 'border-white/10 bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'}`}>
                                            {ar}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* PRO OPTIONS */}
                            {model === 'pro' && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 space-y-3 animate-fade-in-down">
                                    <div>
                                        <label className="text-[10px] font-bold text-yellow-500 uppercase mb-1.5 block">Chất lượng (Pro)</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['1K', '2K', '4K'] as const).map(res => (
                                                <button 
                                                    key={res} 
                                                    onClick={() => setImageSize(res)}
                                                    className={`py-1.5 text-xs font-bold rounded border transition-all ${imageSize === res ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'}`}
                                                >
                                                    {res}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                     <div className="flex items-center justify-between border-t border-yellow-500/10 pt-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 bg-blue-500/20 rounded text-blue-400"><i className="ph-bold ph-google-logo text-sm"></i></div>
                                            <span className="text-xs font-bold text-gray-300">Grounding</span>
                                        </div>
                                        <ToggleSwitch label="" checked={enableGoogleSearch} onChange={(e) => setEnableGoogleSearch(e.target.checked)} />
                                    </div>
                                </div>
                            )}

                             {/* OTHER TOGGLES */}
                            <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-300 flex items-center gap-2"><i className="ph-fill ph-eraser text-red-400"></i> Xóa Watermark (+1💎)</span>
                                    <ToggleSwitch label="" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} />
                                </div>
                            </div>
                        </div>
                    </SettingsBlock>
                    
                     {/* GENERATE BUTTON */}
                    <div className="mt-auto bg-[#1e1b25] p-5 rounded-2xl border border-white/10 shadow-2xl sticky bottom-4 z-10">
                        <div className="flex justify-between items-end mb-4">
                             <div>
                                <p className="text-xs text-gray-400 font-bold uppercase">Tổng Chi phí</p>
                                <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">{calculateCost()} 💎</p>
                             </div>
                             <div className="text-right">
                                <p className="text-xs text-gray-400 font-bold uppercase">Số dư</p>
                                <p className="text-lg font-bold text-white">{user?.diamonds.toLocaleString()} 💎</p>
                             </div>
                        </div>
                        <button 
                            onClick={handleGenerateClick} 
                            className="themed-button-primary w-full py-4 text-xl font-black rounded-xl shadow-xl hover:shadow-pink-500/40 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isGenerating ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-users-three"></i>}
                            {t('creator.aiTool.groupStudio.generateButton')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN CONTAINER (Studio Hub) ---

type StudioMode = 'menu' | 'solo' | 'couple' | 'group' | 'comic';

const ModeCard: React.FC<{
    icon: string;
    title: string;
    description: string;
    onClick: () => void;
    color: string;
    hot?: boolean;
}> = ({ icon, title, description, onClick, color, hot }) => (
    <button 
        onClick={onClick}
        className={`relative flex flex-col items-center justify-center p-8 rounded-[30px] 
            bg-[#151518]/90 border border-white/10 hover:border-${color}-500/50 
            transition-all duration-300 group hover:-translate-y-2 hover:shadow-2xl overflow-hidden min-h-[260px]`}
    >
        {hot && <div className="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg animate-pulse z-10 border border-red-400">HOT</div>}
        <div className={`absolute inset-0 bg-gradient-to-b from-${color}-500/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity`}></div>
        
        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-6 
            bg-black/40 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] border border-white/5 
            group-hover:scale-110 transition-transform duration-300 relative z-10`}>
            <i className={`ph-fill ${icon} text-${color}-400 drop-shadow-[0_0_15px_rgba(var(--color-${color}),0.5)]`}></i>
        </div>
        
        <h3 className="text-xl font-black uppercase tracking-wider mb-3 text-white group-hover:text-shadow-glow relative z-10">{title}</h3>
        <p className="text-xs text-gray-400 font-medium px-4 text-center leading-relaxed group-hover:text-white transition-colors relative z-10">{description}</p>
    </button>
);

const GroupGeneratorTool: React.FC<GroupGeneratorToolProps> = ({ 
    onSwitchToUtility, 
    onInstructionClick
}) => {
    const [mode, setMode] = useState<StudioMode>('menu');

    // Render Sub-tools
    if (mode === 'solo') {
        return (
            <div className="animate-fade-in">
                <div className="flex items-center gap-3 mb-4">
                    <button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <i className="ph-bold ph-arrow-left text-white"></i>
                    </button>
                    <h3 className="text-lg font-bold text-white">Tạo Ảnh Đơn (Solo)</h3>
                </div>
                <AiGeneratorTool 
                    onSendToSignatureTool={() => {}} // Not implemented in flow yet
                    onSwitchToUtility={onSwitchToUtility}
                />
            </div>
        );
    }

    if (mode === 'comic') {
        return (
             <ComicStudio 
                onInstructionClick={() => onInstructionClick('comic-studio')} 
                onBack={() => setMode('menu')}
             />
        );
    }

    if (mode === 'couple') {
        return <GroupStudioForm initialCount={2} onBack={() => setMode('menu')} onInstructionClick={onInstructionClick} />;
    }

    if (mode === 'group') {
        return <GroupStudioForm initialCount={3} onBack={() => setMode('menu')} onInstructionClick={onInstructionClick} />;
    }

    // Default: MENU VIEW (Image 2 Style)
    return (
        <div className="flex flex-col items-center animate-fade-in py-8 w-full max-w-7xl mx-auto">
            <h2 className="themed-heading text-2xl md:text-3xl font-bold themed-title-glow mb-2 text-center text-white drop-shadow-md">
                Bạn muốn tạo ảnh cho mấy người?
            </h2>
            <p className="text-gray-400 mb-12 text-center text-sm">Chọn số lượng nhân vật để bắt đầu Studio.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full px-4">
                <ModeCard 
                    icon="ph-user"
                    title="ĐƠN (SOLO)"
                    description="Ảnh chân dung, Avatar, Fashion"
                    color="blue"
                    onClick={() => setMode('solo')}
                />
                <ModeCard 
                    icon="ph-heart"
                    title="ĐÔI (COUPLE)"
                    description="Ảnh đôi, Hẹn hò, Cưới"
                    color="pink"
                    onClick={() => setMode('couple')}
                />
                <ModeCard 
                    icon="ph-users-three"
                    title="NHÓM (PARTY)"
                    description="Nhóm bạn, Gia đình, Fam (3+)"
                    color="yellow"
                    onClick={() => setMode('group')}
                />
                <ModeCard 
                    icon="ph-book-open-text"
                    title="TRUYỆN TRANH"
                    description="Viết kịch bản & Vẽ truyện AI"
                    color="purple"
                    onClick={() => setMode('comic')}
                    hot={true}
                />
            </div>
        </div>
    );
};

export default GroupGeneratorTool;
