
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

interface GroupGeneratorToolProps {
    onSwitchToUtility: () => void;
    onInstructionClick: (key: any) => void;
}

interface CharacterInput {
    id: string;
    poseImage: { url: string; file: File } | null;
    faceImage: { url: string; file: File } | null;
    gender: 'male' | 'female';
}

const GroupStudioForm: React.FC<{ 
    initialCount: number; 
    onBack: () => void;
    onInstructionClick: (key: any) => void;
}> = ({ initialCount, onBack, onInstructionClick }) => {
    const { user, session, showToast, updateUserDiamonds, supabase } = useAuth();
    const { t } = useTranslation();

    const [characters, setCharacters] = useState<CharacterInput[]>(() => {
        const initialChars: CharacterInput[] = [];
        for (let i = 0; i < initialCount; i++) initialChars.push({ id: crypto.randomUUID(), poseImage: null, faceImage: null, gender: i % 2 === 0 ? 'female' : 'male' });
        return initialChars;
    });

    const [referenceImage, setReferenceImage] = useState<{ url: string; file: File } | null>(null);
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState<'flash' | 'pro'>('flash');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [style] = useState('Cinematic');
    const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
    const [removeWatermark, setRemoveWatermark] = useState(false);
    const [enableGoogleSearch, setEnableGoogleSearch] = useState(false);

    const [isGenerating, setIsGenerating] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);

    const handleCharacterChange = (id: string, field: keyof CharacterInput, value: any) => setCharacters(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    const handleAddCharacter = () => { if (characters.length >= 5) return showToast('Tối đa 5 nhân vật.', 'error'); setCharacters(prev => [...prev, { id: crypto.randomUUID(), poseImage: null, faceImage: null, gender: 'female' }]); };
    const handleRemoveCharacter = (id: string) => { if (characters.length <= 1) return; setCharacters(prev => prev.filter(c => c.id !== id)); };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (img: { url: string; file: File }) => void) => {
        const file = e.target.files?.[0];
        if (file) resizeImage(file, 1024).then(({ file: resizedFile, dataUrl }) => callback({ url: dataUrl, file: resizedFile }));
        e.target.value = '';
    };

    const calculateCost = () => {
        let base = 1;
        if (model === 'pro') {
            if (imageSize === '4K') base = 20; else if (imageSize === '2K') base = 15; else base = 10;
        }
        let total = base + characters.length;
        if (removeWatermark) total += 1;
        return total;
    };

    const handleGenerateClick = () => {
        if (characters.some((c) => !c.poseImage)) return showToast('Vui lòng tải ảnh nhân vật (Pose) cho tất cả các slot.', 'error');
        if (!referenceImage && !prompt.trim()) return showToast('Vui lòng cung cấp Ảnh Tham Chiếu hoặc nhập Prompt.', 'error');
        if (user && user.diamonds < calculateCost()) return showToast(t('creator.aiTool.common.errorCredits', { cost: calculateCost(), balance: user.diamonds }), 'error');
        setIsConfirmOpen(true);
    };

    const confirmGenerate = async () => {
        setIsConfirmOpen(false); setIsGenerating(true); setGeneratedImage(null); setProgressMessage(t('creator.aiTool.groupStudio.progressCreatingBg'));
        try {
            const payloadCharacters = await Promise.all(characters.map(async c => ({ gender: c.gender, poseImage: c.poseImage?.url, faceImage: c.faceImage?.url })));
            const payload = { jobId: crypto.randomUUID(), characters: payloadCharacters, referenceImage: referenceImage?.url, prompt, style, aspectRatio, model, imageSize, removeWatermark, useSearch: enableGoogleSearch };
            
            // 1. Create Job (Spawner)
            const res = await fetch('/.netlify/functions/generate-group-image', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error((await res.json()).error || 'Server Error');
            const data = await res.json();
            if (data.newDiamondCount !== undefined) updateUserDiamonds(data.newDiamondCount);

            // 2. Trigger Worker (Fire and Forget)
            fetch('/.netlify/functions/generate-group-image-background', {
                method: 'POST',
                body: JSON.stringify({ jobId: payload.jobId })
            }).catch(e => console.warn("Worker trigger warning:", e));

            // 3. Start Polling
            pollJob(payload.jobId);
        } catch (e: any) { showToast(e.message, 'error'); setIsGenerating(false); }
    };

    const pollJob = (jobId: string) => {
        if (!supabase) return;
        const interval = setInterval(async () => {
            const { data, error } = await supabase.from('generated_images').select('image_url, prompt').eq('id', jobId).single();
            if (error || !data) { clearInterval(interval); setIsGenerating(false); return; }
            if (data.image_url && data.image_url.startsWith('FAILED:')) { clearInterval(interval); setIsGenerating(false); showToast(data.image_url.replace('FAILED: ', ''), 'error'); return; }
            try { const promptData = JSON.parse(data.prompt); if (promptData.progress) setProgressMessage(promptData.progress); } catch(e) {}
            if (data.image_url && data.image_url !== 'PENDING') { clearInterval(interval); setGeneratedImage(data.image_url); setIsGenerating(false); showToast(t('creator.aiTool.common.success'), 'success'); }
        }, 3000);
    };

    if (generatedImage) return (<><ImageModal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} image={{ id: 'generated-result', image_url: generatedImage, prompt: prompt, creator: user ? { display_name: user.display_name, photo_url: user.photo_url, level: user.level } : { display_name: 'Creator', photo_url: '', level: 1 }, created_at: new Date().toISOString(), model_used: 'Group Studio', user_id: user?.id || '' }} showInfoPanel={false} /><div className="flex flex-col items-center justify-center w-full min-h-[60vh] py-6 animate-fade-in"><h3 className="themed-heading text-2xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-md">{t('creator.aiTool.common.success')}</h3><div className="max-w-md w-full mx-auto bg-black/40 rounded-xl overflow-hidden border-2 border-pink-500/50 cursor-pointer group relative shadow-[0_0_50px_rgba(236,72,153,0.15)]" style={{ aspectRatio: aspectRatio.replace(':', '/') }} onClick={() => setIsResultModalOpen(true)}><img src={generatedImage} alt="Result" className="w-full h-full object-contain" /><div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><i className="ph-fill ph-magnifying-glass-plus text-4xl text-white"></i></div></div><div className="flex gap-3 mt-6"><button onClick={() => { setGeneratedImage(null); setIsGenerating(false); }} className="themed-button-secondary px-6 py-2 font-bold text-sm rounded-full"><i className="ph-fill ph-arrow-counter-clockwise mr-2"></i> {t('creator.aiTool.common.createAnother')}</button><button onClick={() => setIsResultModalOpen(true)} className="themed-button-primary px-6 py-2 font-bold text-sm rounded-full"><i className="ph-fill ph-download-simple mr-2"></i> {t('creator.aiTool.common.downloadAndCopy')}</button></div></div></>);
    if (isGenerating) return (<div className="bg-black/30 p-8 rounded-2xl flex flex-col items-center justify-center min-h-[60vh] border border-white/10 shadow-2xl"><div className="relative w-20 h-20 mb-6"><div className="absolute inset-0 border-8 border-pink-500/20 rounded-full animate-ping"></div><div className="absolute inset-0 border-8 border-t-pink-500 rounded-full animate-spin"></div><i className="ph-fill ph-users-three text-3xl text-pink-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></i></div><h3 className="text-xl font-bold text-white mb-2">{t('creator.aiTool.groupStudio.processing') || 'Đang xử lý...'}</h3><p className="text-xs text-pink-300 animate-pulse bg-pink-500/10 px-4 py-1.5 rounded-full border border-pink-500/20">{progressMessage || t('creator.aiTool.common.waiting')}</p></div>);

    return (
        <div className="animate-fade-in h-full pb-20">
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={confirmGenerate} cost={calculateCost()} />
            <PromptLibraryModal isOpen={isPromptLibraryOpen} onClose={() => setIsPromptLibraryOpen(false)} onSelectPrompt={(p) => setPrompt(p)} category="group-photo" />

             <div className="flex items-center gap-2 mb-3">
                <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><i className="ph-bold ph-arrow-left text-white"></i></button>
                <h3 className="text-base font-bold text-white">{characters.length === 2 ? 'Studio Đôi (Couple)' : `Studio Nhóm (${characters.length} người)`}</h3>
            </div>

            <div className="grid grid-cols-12 gap-3 h-full">
                
                {/* LEFT: CHARACTER LIST (5/12) - FIXED HEIGHT SCROLLABLE */}
                <div className="col-span-12 lg:col-span-5 flex flex-col gap-2 h-full">
                     <SettingsBlock 
                        title={`${t('creator.aiTool.groupStudio.character')} (${characters.length})`}
                        instructionKey="group-studio" 
                        onInstructionClick={() => onInstructionClick('group-studio')}
                        variant="pink"
                        className="h-full flex flex-col overflow-hidden"
                        extraHeaderContent={
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => handleRemoveCharacter(characters[characters.length - 1].id)} disabled={characters.length <= 1} className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50 transition"><i className="ph-bold ph-minus text-[10px]"></i></button>
                                <button onClick={handleAddCharacter} disabled={characters.length >= 5} className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center disabled:opacity-50 transition"><i className="ph-bold ph-plus text-[10px]"></i></button>
                            </div>
                        }
                    >
                         {/* SCROLLABLE AREA - Prevents layout expansion */}
                         <div className="grid grid-cols-1 gap-2 overflow-y-auto custom-scrollbar pr-1 max-h-[500px] content-start">
                            {characters.map((char, index) => (
                                <div key={char.id} className="bg-[#1e1b25] p-2 rounded-lg border border-white/10 relative group hover:border-pink-500/30 transition-colors shadow-sm">
                                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-pink-600 rounded-full flex items-center justify-center text-[8px] font-bold shadow-md z-10">{index + 1}</div>
                                    <div className="grid grid-cols-12 gap-2">
                                        <div className="col-span-4">
                                            <p className="text-[8px] text-gray-400 mb-0.5 font-bold uppercase text-center">Dáng</p>
                                            <div className="aspect-[3/4] w-full"><ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'poseImage', img))} image={char.poseImage} onRemove={() => handleCharacterChange(char.id, 'poseImage', null)} text="Pose" className="w-full h-full" /></div>
                                        </div>
                                        <div className="col-span-8 flex flex-col gap-1">
                                            <div className="flex gap-2 h-full">
                                                <div className="flex-1 flex flex-col">
                                                    <p className="text-[8px] text-gray-400 mb-0.5 font-bold uppercase text-center">Mặt</p>
                                                    <div className="aspect-square w-full flex-grow"><ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'faceImage', img))} image={char.faceImage} onRemove={() => handleCharacterChange(char.id, 'faceImage', null)} text="Face" className="w-full h-full" /></div>
                                                </div>
                                                <div className="w-16 flex flex-col justify-end">
                                                     <div className="flex flex-col gap-1 bg-black/40 rounded p-0.5 border border-white/5">
                                                        <button onClick={() => handleCharacterChange(char.id, 'gender', 'male')} className={`text-[9px] py-1 rounded font-bold transition-all ${char.gender === 'male' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{t('creator.aiTool.groupStudio.male')}</button>
                                                        <button onClick={() => handleCharacterChange(char.id, 'gender', 'female')} className={`text-[9px] py-1 rounded font-bold transition-all ${char.gender === 'female' ? 'bg-pink-600 text-white' : 'text-gray-500'}`}>{t('creator.aiTool.groupStudio.female')}</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SettingsBlock>
                </div>

                {/* CENTER: REF & PROMPT (3/12) */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-2">
                     <SettingsBlock title="Tham Chiếu" variant="blue">
                        <div className="aspect-square w-full"><ImageUploader onUpload={(e) => handleImageUpload(e, (img) => setReferenceImage(img))} image={referenceImage} onRemove={() => setReferenceImage(null)} text="Reference" className="w-full h-full" /></div>
                        <p className="text-[9px] text-gray-400 text-center leading-tight mt-1">{t('creator.aiTool.groupStudio.refImageDesc')}</p>
                    </SettingsBlock>
                    <div className="flex-grow min-h-0">
                         <SettingsBlock title={t('creator.aiTool.groupStudio.promptTitle')} variant="purple" className="flex flex-col h-full">
                            <div className="relative h-full flex flex-col">
                                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('creator.aiTool.groupStudio.promptPlaceholder')} className="w-full p-2 bg-black/40 rounded-lg border border-white/10 focus:border-purple-500 transition text-xs text-white flex-grow resize-none shadow-inner leading-relaxed min-h-[80px]" />
                                <button onClick={() => setIsPromptLibraryOpen(true)} className="absolute bottom-1 right-1 text-[9px] text-cyan-300 bg-cyan-900/30 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-full px-2 py-0.5 font-bold transition flex items-center gap-1"><i className="ph-fill ph-book-bookmark"></i> Prompt</button>
                            </div>
                        </SettingsBlock>
                    </div>
                </div>

                {/* RIGHT: SETTINGS (4/12) */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-2">
                    <SettingsBlock title={t('creator.aiTool.singlePhoto.advancedSettingsTitle')} variant="yellow">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                <button onClick={() => setModel('flash')} className={`py-1.5 rounded text-[10px] font-bold flex flex-col items-center ${model === 'flash' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>Flash (1💎)</button>
                                <button onClick={() => setModel('pro')} className={`py-1.5 rounded text-[10px] font-bold flex flex-col items-center ${model === 'pro' ? 'bg-orange-600 text-white' : 'text-gray-500'}`}>Pro (10💎)</button>
                            </div>
                             <div className="grid grid-cols-4 gap-1">
                                {(['3:4', '1:1', '16:9', '9:16'] as const).map(ar => (<button key={ar} onClick={() => setAspectRatio(ar)} className={`py-1 rounded text-[9px] font-bold border transition-all ${aspectRatio === ar ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/10 text-gray-500'}`}>{ar}</button>))}
                            </div>
                            {model === 'pro' && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2 space-y-2">
                                    <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-yellow-500">Chất lượng</span><div className="flex gap-1">{(['1K', '2K', '4K'] as const).map(res => (<button key={res} onClick={() => setImageSize(res)} className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${imageSize === res ? 'bg-yellow-500 text-black border-yellow-500' : 'text-gray-400 border-white/10'}`}>{res}</button>))}</div></div>
                                     <div className="flex justify-between items-center border-t border-yellow-500/10 pt-1"><span className="text-[10px] text-gray-300">Grounding</span><ToggleSwitch label="" checked={enableGoogleSearch} onChange={(e) => setEnableGoogleSearch(e.target.checked)} /></div>
                                </div>
                            )}
                            <div className="bg-white/5 p-2 rounded-lg flex items-center justify-between"><span className="text-[10px] text-gray-300 flex items-center gap-1"><i className="ph-fill ph-eraser text-red-400"></i> NoWatermark (+1💎)</span><ToggleSwitch label="" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} /></div>
                        </div>
                    </SettingsBlock>
                    
                    <div className="mt-auto bg-[#1e1b25] p-3 rounded-xl border border-white/10 shadow-lg sticky bottom-0 z-10">
                        <div className="flex justify-between items-end mb-2"><div><p className="text-[10px] text-gray-400 font-bold uppercase">Chi phí</p><p className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">{calculateCost()} 💎</p></div><div className="text-right"><p className="text-[10px] text-gray-400 font-bold uppercase">Số dư</p><p className="text-sm font-bold text-white">{user?.diamonds.toLocaleString()} 💎</p></div></div>
                        <button onClick={handleGenerateClick} className="themed-button-primary w-full py-3 text-base font-black rounded-lg shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">{isGenerating ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-users-three"></i>} {t('creator.aiTool.groupStudio.generateButton')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

type StudioMode = 'menu' | 'solo' | 'couple' | 'group' | 'comic';

const ModeCard: React.FC<{ icon: string; title: string; description: string; onClick: () => void; color: string; hot?: boolean; }> = ({ icon, title, description, onClick, color, hot }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center p-6 rounded-[24px] bg-[#151518]/90 border border-white/10 hover:border-${color}-500/50 transition-all duration-300 group hover:-translate-y-2 hover:shadow-xl overflow-hidden min-h-[220px]`}>
        {hot && <div className="absolute top-3 right-3 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow animate-pulse z-10">HOT</div>}
        <div className={`absolute inset-0 bg-gradient-to-b from-${color}-500/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity`}></div>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-4 bg-black/40 shadow-inner border border-white/5 group-hover:scale-110 transition-transform relative z-10`}><i className={`ph-fill ${icon} text-${color}-400`}></i></div>
        <h3 className="text-lg font-black uppercase tracking-wide mb-2 text-white relative z-10">{title}</h3>
        <p className="text-[10px] text-gray-400 font-medium text-center relative z-10">{description}</p>
    </button>
);

const GroupGeneratorTool: React.FC<GroupGeneratorToolProps> = ({ onSwitchToUtility, onInstructionClick }) => {
    const [mode, setMode] = useState<StudioMode>('menu');
    if (mode === 'solo') return (<div className="animate-fade-in"><div className="flex items-center gap-2 mb-3"><button onClick={() => setMode('menu')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><i className="ph-bold ph-arrow-left text-white"></i></button><h3 className="text-base font-bold text-white">Tạo Ảnh Đơn (Solo)</h3></div><AiGeneratorTool onSendToSignatureTool={() => {}} onSwitchToUtility={onSwitchToUtility} /></div>);
    if (mode === 'comic') return (<ComicStudio onInstructionClick={() => onInstructionClick('comic-studio')} onBack={() => setMode('menu')} />);
    if (mode === 'couple') return <GroupStudioForm initialCount={2} onBack={() => setMode('menu')} onInstructionClick={onInstructionClick} />;
    if (mode === 'group') return <GroupStudioForm initialCount={3} onBack={() => setMode('menu')} onInstructionClick={onInstructionClick} />;
    return (
        <div className="flex flex-col items-center animate-fade-in py-6 w-full max-w-7xl mx-auto">
            <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-2 text-center text-white">Bạn muốn tạo ảnh cho mấy người?</h2>
            <p className="text-gray-400 mb-8 text-center text-xs">Chọn số lượng nhân vật để bắt đầu Studio.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full px-4">
                <ModeCard icon="ph-user" title="ĐƠN (SOLO)" description="Ảnh chân dung, Avatar, Fashion" color="blue" onClick={() => setMode('solo')} />
                <ModeCard icon="ph-heart" title="ĐÔI (COUPLE)" description="Ảnh đôi, Hẹn hò, Cưới" color="pink" onClick={() => setMode('couple')} />
                <ModeCard icon="ph-users-three" title="NHÓM (PARTY)" description="Nhóm bạn, Gia đình (3+)" color="yellow" onClick={() => setMode('group')} />
                <ModeCard icon="ph-book-open-text" title="TRUYỆN TRANH" description="Viết kịch bản & Vẽ truyện AI" color="purple" onClick={() => setMode('comic')} hot={true} />
            </div>
        </div>
    );
};

export default GroupGeneratorTool;
