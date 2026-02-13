
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { resizeImage, createBlankCanvas } from '../../../utils/imageUtils';
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
    processedFaceImage?: string | null; // Stores base64 of processed face
    isProcessing?: boolean;
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
        for (let i = 0; i < initialCount; i++) {
            initialChars.push({ 
                id: crypto.randomUUID(), 
                poseImage: null, 
                faceImage: null,
                processedFaceImage: null,
                isProcessing: false,
                gender: i % 2 === 0 ? 'female' : 'male' 
            });
        }
        return initialChars;
    });

    const [referenceImage, setReferenceImage] = useState<{ url: string; file: File } | null>(null);
    const [prompt, setPrompt] = useState('');
    const [model, setModel] = useState<'flash' | 'pro'>('flash');
    const [aspectRatio, setAspectRatio] = useState('3:4');
    const [style] = useState('Cinematic');
    
    // Fixed settings for now as per UI request
    // Use state to avoid TS error on comparison overlap
    const [imageSize] = useState<'1K' | '2K' | '4K'>('1K');
    const enableGoogleSearch = false;

    const [removeWatermark, setRemoveWatermark] = useState(false);

    const [isGenerating, setIsGenerating] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
    const [isResultModalOpen, setIsResultModalOpen] = useState(false);

    const handleCharacterChange = (id: string, field: keyof CharacterInput, value: any) => {
        setCharacters(prev => prev.map(c => {
            if (c.id === id) {
                // If changing face image, reset processed state
                if (field === 'faceImage') {
                    return { ...c, [field]: value, processedFaceImage: null };
                }
                return { ...c, [field]: value };
            }
            return c;
        }));
    };
    
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (img: { url: string; file: File }) => void) => {
        const file = e.target.files?.[0];
        if (file) resizeImage(file, 1024).then(({ file: resizedFile, dataUrl }) => callback({ url: dataUrl, file: resizedFile }));
        e.target.value = '';
    };

    const handleProcessFace = async (index: number) => {
        const char = characters[index];
        if (!char.faceImage || !session) return;
        if (user && user.diamonds < 1) return showToast(t('creator.aiTool.common.errorCredits', { cost: 1, balance: user.diamonds }), 'error');

        // Set processing state
        setCharacters(prev => prev.map((c, i) => i === index ? { ...c, isProcessing: true } : c));

        try {
            const reader = new FileReader();
            reader.readAsDataURL(char.faceImage.file);
            reader.onloadend = async () => {
                const base64Image = reader.result;
                const response = await fetch('/.netlify/functions/process-face', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    // Use flash model for face processing (cost 1)
                    body: JSON.stringify({ image: base64Image, model: 'gemini-2.5-flash-image' }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Lỗi xử lý');
                
                setCharacters(prev => prev.map((c, i) => i === index ? { 
                    ...c, 
                    processedFaceImage: result.processedImageBase64, 
                    isProcessing: false 
                } : c));
                
                updateUserDiamonds(result.newDiamondCount);
                showToast('Đã khóa gương mặt thành công!', 'success');
            };
        } catch (e: any) {
            showToast(e.message, 'error');
            setCharacters(prev => prev.map((c, i) => i === index ? { ...c, isProcessing: false } : c));
        }
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
        console.log('[GroupStudio] Validating inputs...');
        if (characters.some((c) => !c.poseImage)) return showToast('Vui lòng tải ảnh nhân vật (Pose) cho tất cả các slot.', 'error');
        if (!referenceImage && !prompt.trim()) return showToast('Vui lòng cung cấp Ảnh Tham Chiếu hoặc nhập Prompt.', 'error');
        if (user && user.diamonds < calculateCost()) return showToast(t('creator.aiTool.common.errorCredits', { cost: calculateCost(), balance: user.diamonds }), 'error');
        
        console.log('[GroupStudio] Validation passed. Opening confirmation.');
        setIsConfirmOpen(true);
    };

    const confirmGenerate = async () => {
        console.log('[GroupStudio] Starting Generation Process...');
        setIsConfirmOpen(false); 
        setIsGenerating(true); 
        setGeneratedImage(null); 
        setProgressMessage(t('creator.aiTool.groupStudio.progressCreatingBg'));
        
        try {
            // 1. Prepare Characters
            console.log('[GroupStudio] Preparing character payloads...');
            const payloadCharacters = await Promise.all(characters.map(async c => ({ 
                gender: c.gender, 
                poseImage: c.poseImage?.url, 
                // Prioritize processed face image (base64) if available, otherwise use raw url
                faceImage: c.processedFaceImage ? `data:image/png;base64,${c.processedFaceImage}` : c.faceImage?.url 
            })));
            
            // --- DEBUG LOGGING ---
            console.group("--- [GroupStudio] Pre-flight Data Check ---");
            console.log(`Prompt: ${prompt}`);
            console.log(`Model: ${model}, AspectRatio: ${aspectRatio}`);
            payloadCharacters.forEach((c, i) => {
                 console.log(`Character ${i+1}:`, {
                     gender: c.gender,
                     poseImageSize: c.poseImage?.length || 0,
                     faceImageSize: c.faceImage?.length || 0
                 });
                 if (!c.poseImage) console.error(`⚠️ Character ${i+1} MISSING POSE IMAGE!`);
            });
            
            // 2. Prepare Reference Image (Auto generate blank if missing)
            let finalReferenceUrl = referenceImage?.url;
            if (!finalReferenceUrl) {
                console.log('[GroupStudio] No reference image provided. Generating blank canvas...');
                // Uses a protected function to generate a 95% JPEG solid color canvas
                finalReferenceUrl = await createBlankCanvas(aspectRatio);
                console.log('[GroupStudio] Blank canvas generated. Size:', finalReferenceUrl.length);
            } else {
                console.log('[GroupStudio] Using user provided reference image. Size:', finalReferenceUrl.length);
            }
            console.groupEnd();

            const payload = { 
                jobId: crypto.randomUUID(), 
                characters: payloadCharacters, 
                referenceImage: finalReferenceUrl, 
                prompt, 
                style, 
                aspectRatio, 
                model, 
                imageSize, 
                removeWatermark, 
                useSearch: enableGoogleSearch 
            };
            
            // 3. Create Job (Spawner)
            const res = await fetch('/.netlify/functions/generate-group-image', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, 
                body: JSON.stringify(payload) 
            });
            
            if (!res.ok) {
                const errData = await res.json();
                console.error('[GroupStudio] Spawner Error:', errData);
                throw new Error(errData.error || 'Server Error');
            }
            
            const data = await res.json();
            console.log('[GroupStudio] Job Created:', data);
            
            if (data.newDiamondCount !== undefined) updateUserDiamonds(data.newDiamondCount);

            // 4. Trigger Worker (Fire and Forget)
            console.log('[GroupStudio] Triggering Background Worker...');
            fetch('/.netlify/functions/generate-group-image-background', {
                method: 'POST',
                body: JSON.stringify({ jobId: payload.jobId })
            }).then(() => console.log('[GroupStudio] Worker triggered.'))
              .catch(e => console.warn("[GroupStudio] Worker trigger warning:", e));

            // 5. Start Polling
            console.log('[GroupStudio] Starting Poll for Job:', payload.jobId);
            pollJob(payload.jobId);
        } catch (e: any) { 
            console.error('[GroupStudio] Critical Error:', e);
            showToast(e.message, 'error'); 
            setIsGenerating(false); 
        }
    };

    const pollJob = (jobId: string) => {
        if (!supabase) return;
        const interval = setInterval(async () => {
            const { data, error } = await supabase.from('generated_images').select('image_url, prompt').eq('id', jobId).single();
            
            if (error || !data) { 
                console.error('[GroupStudio] Poll Error or No Data:', error);
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
                if (promptData.progress) {
                    setProgressMessage(promptData.progress); 
                }
            } catch(e) {}
            
            if (data.image_url && data.image_url !== 'PENDING') { 
                console.log('[GroupStudio] SUCCESS! URL:', data.image_url);
                clearInterval(interval); 
                setGeneratedImage(data.image_url); 
                setIsGenerating(false); 
                showToast(t('creator.aiTool.common.success'), 'success'); 
            }
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

            <div className="flex flex-col lg:flex-row gap-6">
                
                {/* --- LEFT: CHARACTER LIST --- */}
                <div className="w-full lg:w-3/4 flex flex-col gap-4">
                     <SettingsBlock 
                        title={`1. Cung cấp thông tin nhân vật (${characters.length})`}
                        instructionKey="group-studio" 
                        onInstructionClick={() => onInstructionClick('group-studio')}
                        variant="pink"
                        extraHeaderContent={
                            <span className="text-[10px] text-gray-400 font-normal ml-2 cursor-pointer hover:text-white" onClick={onBack}>(Thay đổi số lượng)</span>
                        }
                    >
                         {/* CHARACTER GRID - ADAPTIVE */}
                         <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {characters.map((char, index) => (
                                <div key={char.id} className="bg-[#1e1b25] p-3 rounded-xl border border-white/10 relative group hover:border-pink-500/50 transition-colors shadow-lg flex flex-col h-full">
                                    <h4 className="text-center text-xs font-bold text-white mb-2 uppercase">Nhân vật {index + 1}</h4>
                                    
                                    {/* Main Pose Image - Fixed aspect ratio 3:4 */}
                                    <div className="aspect-[3/4] w-full mb-2 bg-black/20 rounded-lg overflow-hidden border-2 border-dashed border-white/10 hover:border-pink-500/50 transition">
                                        <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'poseImage', img))} image={char.poseImage} onRemove={() => handleCharacterChange(char.id, 'poseImage', null)} text="Ảnh Nhân vật (Dáng & Outfit)" className="w-full h-full" />
                                    </div>

                                    {/* Face Image & Actions */}
                                    <div className="bg-black/20 rounded-lg p-2 border border-white/5 space-y-2">
                                        <div className="aspect-square w-full mx-auto border border-dashed border-white/10 rounded overflow-hidden">
                                            <ImageUploader 
                                                onUpload={(e) => handleImageUpload(e, (img) => handleCharacterChange(char.id, 'faceImage', img))} 
                                                // Correctly pass only url to image prop, removing 'file' property to fix type error
                                                image={char.faceImage ? { url: char.processedFaceImage ? `data:image/png;base64,${char.processedFaceImage}` : char.faceImage.url } : null} 
                                                onRemove={() => handleCharacterChange(char.id, 'faceImage', null)} 
                                                text="Ảnh Gương mặt (Face ID)" 
                                                className="w-full h-full" 
                                            />
                                        </div>
                                        
                                        {/* Face Processing Button */}
                                        {char.faceImage && !char.processedFaceImage && (
                                            <button 
                                                onClick={() => handleProcessFace(index)}
                                                disabled={char.isProcessing}
                                                className="w-full py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 text-yellow-300 text-[10px] font-bold rounded hover:bg-yellow-500/30 transition-colors flex items-center justify-center gap-1"
                                            >
                                                {char.isProcessing ? <i className="ph ph-spinner animate-spin"></i> : <i className="ph-fill ph-scan"></i>}
                                                {char.isProcessing ? 'Đang xử lý...' : 'Xử lý & Khóa mặt (1 💎)'}
                                            </button>
                                        )}
                                        
                                        {/* Processed Badge */}
                                        {char.processedFaceImage && (
                                             <div className="w-full py-1 bg-green-500/20 border border-green-500/30 text-green-400 text-[10px] font-bold rounded text-center flex items-center justify-center gap-1">
                                                <i className="ph-fill ph-check-circle"></i> Đã khóa (Face ID)
                                            </div>
                                        )}
                                        
                                        {/* Gender Buttons */}
                                        <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1 border-t border-white/5">
                                            <span>Giới tính (Bắt buộc)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => handleCharacterChange(char.id, 'gender', 'male')} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${char.gender === 'male' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-white/20'}`}><i className="ph-fill ph-gender-male"></i> Nam</button>
                                            <button onClick={() => handleCharacterChange(char.id, 'gender', 'female')} className={`py-1.5 rounded text-[10px] font-bold border transition-colors ${char.gender === 'female' ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-white/20'}`}><i className="ph-fill ph-gender-female"></i> Nữ</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SettingsBlock>
                </div>

                {/* --- RIGHT: SIDEBAR SETTINGS --- */}
                <div className="w-full lg:w-1/4 flex flex-col gap-4">
                    <div className="bg-[#1e1b25] border border-white/10 rounded-xl p-4 shadow-lg flex-grow flex flex-col gap-4">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wide border-b border-white/10 pb-2">Cài đặt nhóm</h3>
                        
                        {/* Reference Image */}
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">2. Ảnh Tham Chiếu (Tùy chọn)</label>
                            <div className="aspect-square w-full bg-black/20 rounded-lg overflow-hidden border border-dashed border-white/20">
                                <ImageUploader onUpload={(e) => handleImageUpload(e, (img) => setReferenceImage(img))} image={referenceImage} onRemove={() => setReferenceImage(null)} text="Tải ảnh tham chiếu" className="w-full h-full" />
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">AI sẽ học bố cục, dáng, bối cảnh và phong cách của ảnh này để tạo ra ảnh cuối cùng.</p>
                        </div>

                        {/* Prompt */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-gray-400">3. Mô tả (Prompt)</label>
                                <button onClick={() => setIsPromptLibraryOpen(true)} className="text-[9px] text-cyan-400 hover:text-white flex items-center gap-1"><i className="ph-bold ph-magic-wand"></i> Sử dụng Prompt có sẵn</button>
                            </div>
                            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Thêm chi tiết về bối cảnh..." className="w-full p-2 bg-black/40 rounded border border-white/10 focus:border-purple-500 text-xs text-white h-20 resize-none" />
                        </div>

                        {/* Model */}
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">Model AI</label>
                            <div className="grid grid-cols-2 gap-2 bg-black/30 p-1 rounded-lg">
                                <button onClick={() => setModel('flash')} className={`py-2 rounded text-xs font-bold flex flex-col items-center ${model === 'flash' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}>
                                    <span>Flash</span><span className="text-[9px] opacity-70">1 💎</span>
                                </button>
                                <button onClick={() => setModel('pro')} className={`py-2 rounded text-xs font-bold flex flex-col items-center ${model === 'pro' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-white'}`}>
                                    <span>Pro 4K</span><span className="text-[9px] opacity-70">10+ 💎</span>
                                </button>
                            </div>
                        </div>

                        {/* Style Buttons */}
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">4. Phong cách nghệ thuật</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button className="py-1 px-2 rounded border border-pink-500 bg-pink-500/10 text-pink-300 text-[10px] font-bold">Điện ảnh</button>
                                <button className="py-1 px-2 rounded border border-white/10 text-gray-400 text-[10px] hover:bg-white/5">Hoạt hình Anime</button>
                                <button className="py-1 px-2 rounded border border-white/10 text-gray-400 text-[10px] hover:bg-white/5">Kết xuất 3D</button>
                                <button className="py-1 px-2 rounded border border-white/10 text-gray-400 text-[10px] hover:bg-white/5">Nhiếp ảnh</button>
                            </div>
                        </div>

                        {/* Aspect Ratio */}
                        <div>
                            <label className="text-xs font-bold text-gray-400 mb-1 block">5. Tỷ lệ khung hình</label>
                            <div className="grid grid-cols-5 gap-1">
                                {(['1:1', '3:4', '4:3', '9:16', '16:9'] as const).map(ar => (
                                    <button key={ar} onClick={() => setAspectRatio(ar)} className={`py-2 rounded border flex flex-col items-center justify-center gap-1 transition-all ${aspectRatio === ar ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/10 text-gray-500 hover:bg-white/5'}`}>
                                        <div className={`border border-current opacity-50 ${ar === '1:1' ? 'w-3 h-3' : ar === '3:4' ? 'w-2 h-3' : ar === '16:9' ? 'w-4 h-2' : 'w-3 h-3'}`}></div>
                                        <span className="text-[9px] font-bold">{ar}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Toggle */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                            <span className="text-[10px] text-gray-300">Xóa Watermark (+1 💎)</span>
                            <ToggleSwitch label="" checked={removeWatermark} onChange={(e) => setRemoveWatermark(e.target.checked)} />
                        </div>

                        {/* Generate Button */}
                        <div className="mt-auto pt-4 border-t border-white/10">
                            <div className="flex justify-between items-end mb-2">
                                 <div><p className="text-[10px] text-gray-400 font-bold uppercase">Chi phí</p><p className="text-xl font-black text-pink-400">{calculateCost()} 💎</p></div>
                            </div>
                            <button onClick={handleGenerateClick} className="themed-button-primary w-full py-3 text-base font-black rounded-lg shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">
                                {isGenerating ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-magic-wand"></i>} Tạo ảnh nhóm
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

type StudioMode = 'menu' | 'solo' | 'couple' | 'group' | 'party' | 'comic';

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
    if (mode === 'party') return <GroupStudioForm initialCount={4} onBack={() => setMode('menu')} onInstructionClick={onInstructionClick} />; // 4, 5, 6 etc handled by Add button
    
    return (
        <div className="flex flex-col items-center animate-fade-in py-6 w-full max-w-7xl mx-auto">
            <h2 className="themed-heading text-2xl font-bold themed-title-glow mb-2 text-center text-white">Bạn muốn tạo ảnh cho mấy người?</h2>
            <p className="text-gray-400 mb-8 text-center text-xs">Chọn số lượng nhân vật để bắt đầu Studio.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full px-4">
                <ModeCard icon="ph-user" title="ĐƠN (SOLO)" description="Ảnh chân dung, Avatar, Fashion" color="blue" onClick={() => setMode('solo')} />
                <ModeCard icon="ph-heart" title="ĐÔI (COUPLE)" description="Ảnh đôi, Hẹn hò, Cưới" color="pink" onClick={() => setMode('couple')} />
                <ModeCard icon="ph-users-three" title="NHÓM (3 NGƯỜI)" description="Nhóm bạn thân, Team 3" color="yellow" onClick={() => setMode('group')} />
                <ModeCard icon="ph-users-four" title="PARTY (4+ NGƯỜI)" description="Gia đình, Hội nhóm đông" color="purple" onClick={() => setMode('party')} />
            </div>
            
            <div className="mt-8 w-full px-4">
                 <button onClick={() => setMode('comic')} className="w-full bg-[#151518]/90 border border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/10 p-6 rounded-[24px] flex items-center justify-between group transition-all duration-300 relative overflow-hidden">
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-3xl border border-purple-500/30 text-purple-400 group-hover:scale-110 transition-transform"><i className="ph-fill ph-book-open-text"></i></div>
                        <div className="text-left">
                            <h3 className="text-lg font-black uppercase text-white mb-1">TRUYỆN TRANH AI <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded ml-2 animate-pulse">HOT</span></h3>
                            <p className="text-xs text-gray-400">Viết kịch bản & Vẽ truyện chuyên nghiệp</p>
                        </div>
                    </div>
                    <i className="ph-bold ph-caret-right text-2xl text-gray-500 group-hover:text-white transition-colors relative z-10"></i>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 </button>
            </div>
        </div>
    );
};

export default GroupGeneratorTool;
