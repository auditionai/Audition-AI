
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

// --- INTERNAL COMPONENT: GROUP STUDIO FORM (Logic cũ của bạn) ---
const GroupStudioForm: React.FC<{ 
    initialCount: number; 
    onBack: () => void;
    onInstructionClick: (key: any) => void;
    // Pass other props if needed
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
                removeWatermark
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

    if (generatedImage) {
        return (
            <>
                <ImageModal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} image={resultImageForModal} showInfoPanel={false} />
                <div className="flex flex-col items-center justify-center w-full h-full py-6 animate-fade-in">
                    <h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-sm">{t('creator.aiTool.common.success')}</h3>
                    <div className="relative max-h-[60vh] h-full w-auto max-w-full rounded-xl overflow-hidden border-2 border-pink-500/30 shadow-[0_0_30px_rgba(236,72,153,0.15)] cursor-zoom-in group bg-black/40" onClick={() => setIsResultModalOpen(true)}>
                        <img src={generatedImage} alt="Generated result" className="max-h-[60vh] w-auto object-contain mx-auto" />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-6 justify-center w-full px-4">
                        <button onClick={() => { setGeneratedImage(null); setIsGenerating(false); }} className="themed-button-secondary px-6 py-3 font-semibold text-sm flex items-center gap-2"><i className="ph-fill ph-arrow-counter-clockwise"></i> {t('creator.aiTool.common.createAnother')}</button>
                        <button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-8 py-3 font-bold text-sm flex items-center gap-2"><i className="ph-fill ph-download-simple"></i> {t('creator.aiTool.common.downloadAndCopy')}</button>
                    </div>
                </div>
            </>
        );
    }

    if (isGenerating) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
                <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full animate-ping"></div>
                    <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
                    <i className="ph-fill ph-users-three text-4xl text-pink-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></i>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{t('creator.aiTool.groupStudio.processing')}</h3>
                <p className="text-sm text-pink-300 animate-pulse">{progressMessage || t('creator.aiTool.common.waiting')}</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
             <div className="flex items-center gap-3 mb-4">
                <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <i className="ph-bold ph-arrow-left text-white"></i>
                </button>
                <h3 className="text-lg font-bold text-white">
                    {characters.length === 2 ? 'Studio Đôi (Couple)' : `Studio Nhóm (${characters.length} người)`}
                </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
                <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={confirmGenerate} cost={calculateCost()} />
                <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="group-photo" />

                <div className="lg:col-span-2 space-y-6">
                    <SettingsBlock title={t('creator.aiTool.groupStudio.characterInfoTitle')} instructionKey="group-studio" onInstructionClick={() => onInstructionClick('group-studio')}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                                <span className="text-sm font-bold text-gray-300">Số lượng nhân vật: {characters.length}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => handleRemoveCharacter(characters[characters.length - 1].id)} disabled={characters.length <= 1} className="w-8 h-8 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50"><i className="ph-bold ph-minus"></i></button>
                                    <button onClick={handleAddCharacter} disabled={characters.length >= 5} className="w-8 h-8 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50"><i className="ph-bold ph-plus"></i></button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {characters.map((char, index) => (
                                    <div key={char.id} className="bg-[#1e1b25] p-3 rounded-xl border border-white/10 relative group">
                                        <div className="absolute -top-2 -left-2 w-6 h-6 bg-pink-600 rounded-full flex items-center justify-center text-xs font-bold shadow-md z-10">{index + 1}</div>
                                        <div className="flex gap-2">
                                            <div className="w-1/2">
                                                <p className="text-[10px] text-gray-400 mb-1 font-bold uppercase">{t('creator.aiTool.groupStudio.poseImageText')}</p>
                                                <div className="aspect-[3/4] w-full">
                                                    <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'poseImage', img))} image={char.poseImage} onRemove={() => handleCharacterChange(char.id, 'poseImage', null)} text="Dáng / Trang phục" className="w-full h-full" />
                                                </div>
                                            </div>
                                            <div className="w-1/2 flex flex-col gap-2">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 mb-1 font-bold uppercase">{t('creator.aiTool.groupStudio.faceImageText')}</p>
                                                    <div className="aspect-square w-full">
                                                        <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'faceImage', img))} image={char.faceImage} onRemove={() => handleCharacterChange(char.id, 'faceImage', null)} text="Khuôn mặt" className="w-full h-full" />
                                                    </div>
                                                </div>
                                                <div className="mt-auto">
                                                    <p className="text-[10px] text-gray-400 mb-1 font-bold uppercase">{t('creator.aiTool.groupStudio.genderLabel')}</p>
                                                    <div className="flex bg-black/40 rounded p-1">
                                                        <button onClick={() => handleCharacterChange(char.id, 'gender', 'male')} className={`flex-1 text-xs py-1 rounded ${char.gender === 'male' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{t('creator.aiTool.groupStudio.male')}</button>
                                                        <button onClick={() => handleCharacterChange(char.id, 'gender', 'female')} className={`flex-1 text-xs py-1 rounded ${char.gender === 'female' ? 'bg-pink-600 text-white' : 'text-gray-500'}`}>{t('creator.aiTool.groupStudio.female')}</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SettingsBlock>

                    <SettingsBlock title={t('creator.aiTool.groupStudio.refImageTitle')}>
                        <p className="text-xs text-gray-400 mb-2">{t('creator.aiTool.groupStudio.refImageDesc')}</p>
                        <div className="h-40 w-full">
                            <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => setReferenceImage(img))} image={referenceImage} onRemove={() => setReferenceImage(null)} text={t('creator.aiTool.groupStudio.refImageUploadText')} className="w-full h-full" />
                        </div>
                    </SettingsBlock>
                </div>

                <div className="flex flex-col gap-6">
                    <SettingsBlock title={t('creator.aiTool.groupStudio.promptTitle')}>
                        <div className="relative">
                            <textarea className="auth-input min-h-[120px] text-sm" placeholder={t('creator.aiTool.groupStudio.promptPlaceholder')} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                            <button onClick={() => setIsPromptLibraryOpen(true)} className="absolute bottom-2 right-2 text-xs bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2 py-1 rounded hover:bg-cyan-500/20"><i className="ph-fill ph-book-bookmark"></i> Mẫu</button>
                        </div>
                    </SettingsBlock>

                    <SettingsBlock title={t('creator.aiTool.singlePhoto.advancedSettingsTitle')}>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Model AI</label>
                                <div className="flex bg-black/40 p-1 rounded-lg">
                                    <button onClick={() => setModel('flash')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${model === 'flash' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>Flash (1💎)</button>
                                    <button onClick={() => setModel('pro')} className={`flex-1 py-2 text-xs font-bold rounded-md transition ${model === 'pro' ? 'bg-yellow-500 text-black shadow' : 'text-gray-500 hover:text-gray-300'}`}>Pro (10💎)</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-400 mb-1 block">Tỷ lệ khung hình</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['3:4', '1:1', '16:9', '9:16'].map(r => (
                                        <button key={r} onClick={() => setAspectRatio(r)} className={`py-1 text-xs border rounded transition ${aspectRatio === r ? 'border-pink-500 text-pink-400 bg-pink-500/10' : 'border-gray-700 text-gray-500'}`}>{r}</button>
                                    ))}
                                </div>
                            </div>
                            {model === 'pro' && (
                                <div>
                                    <label className="text-xs font-bold text-gray-400 mb-1 block">Chất lượng ảnh</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['1K', '2K', '4K'].map(s => (
                                            <button key={s} onClick={() => setImageSize(s as any)} className={`py-1 text-xs border rounded transition ${imageSize === s ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10' : 'border-gray-700 text-gray-500'}`}>{s}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="pt-2 border-t border-white/5">
                                <ToggleSwitch label="Xóa Watermark (+1 💎)" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} />
                            </div>
                        </div>
                    </SettingsBlock>

                    <div className="mt-auto bg-[#1e1b25] p-4 rounded-xl border border-white/10 shadow-lg">
                        <div className="flex justify-between items-center mb-4 text-sm">
                            <span className="text-gray-400">Chi phí dự tính:</span>
                            <span className="text-xl font-black text-pink-400">{calculateCost()} 💎</span>
                        </div>
                        <button onClick={handleGenerateClick} className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transform transition hover:-translate-y-1 flex items-center justify-center gap-2">
                            <i className="ph-fill ph-magic-wand text-xl"></i>
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
    onInstructionClick,
    onSwitchToolWithImage 
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
