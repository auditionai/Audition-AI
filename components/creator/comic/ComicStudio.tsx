
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';

// Mock data for dropdowns
const ART_STYLES = [
    'Manga (Đen Trắng)', 'Webtoon (Hàn Quốc)', 'Comic (Âu Mỹ)', 'Anime (Nhật Bản)', '3D Render (Audition)', 'Pixel Art'
];
const GENRES = [
    'Hài hước', 'Ngôn tình', 'Kinh dị', 'Hành động', 'Đời thường', 'Học đường', 'Xuyên không'
];

const ComicStudio: React.FC = () => {
    const { session, showToast, updateUserDiamonds } = useAuth();
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1); 
    const [isLoading, setIsLoading] = useState(false);
    
    // State for Step 1: Setup
    const [characters, setCharacters] = useState<ComicCharacter[]>([]);
    const [storySettings, setStorySettings] = useState({
        genre: 'Hài hước',
        artStyle: 'Manga (Đen Trắng)',
        dialogueAmount: 'Vừa phải',
        pageCount: 1,
        premise: ''
    });

    // State for Step 2: Script
    const [panels, setPanels] = useState<ComicPanel[]>([]);

    const handleAddCharacter = () => {
        if (characters.length >= 4) {
            showToast("Tối đa 4 nhân vật trong phiên bản này.", "error");
            return;
        }
        const newChar: ComicCharacter = {
            id: crypto.randomUUID(),
            name: `Nhân vật ${characters.length + 1}`,
            description: '',
            is_analyzing: false
        };
        setCharacters([...characters, newChar]);
    };

    const handleRemoveCharacter = (id: string) => {
        setCharacters(characters.filter(c => c.id !== id));
    };

    const handleCharacterImageUpload = async (id: string, file: File) => {
        const { dataUrl } = await resizeImage(file, 800);
        setCharacters(prev => prev.map(c => c.id === id ? { ...c, image_url: dataUrl, image_file: file, is_analyzing: true } : c));

        try {
            const res = await fetch('/.netlify/functions/comic-analyze-character', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ image: dataUrl })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setCharacters(prev => prev.map(c => c.id === id ? { ...c, description: data.description, is_analyzing: false } : c));
            showToast("Đã phân tích xong ngoại hình nhân vật!", "success");

        } catch (e: any) {
            console.error(e);
            showToast("Lỗi phân tích ảnh: " + e.message, "error");
            setCharacters(prev => prev.map(c => c.id === id ? { ...c, is_analyzing: false } : c));
        }
    };

    const handleGenerateScript = async () => {
        if (characters.length === 0) return showToast("Cần ít nhất 1 nhân vật.", "error");
        if (!storySettings.premise.trim()) return showToast("Vui lòng nhập ý tưởng câu chuyện.", "error");
        
        // Validate description
        const missingDesc = characters.find(c => !c.description);
        if (missingDesc) return showToast(`Vui lòng upload ảnh cho ${missingDesc.name} để AI phân tích ngoại hình.`, "error");

        setIsLoading(true);
        try {
            const res = await fetch('/.netlify/functions/comic-generate-script', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ ...storySettings, characters })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // Map response to internal state format
            const generatedPanels = data.script.map((p: any) => ({
                id: crypto.randomUUID(),
                panel_number: p.panel_number,
                visual_description: p.visual_description,
                dialogue: p.dialogue,
                is_rendering: false
            }));

            setPanels(generatedPanels);
            updateUserDiamonds(data.newDiamondCount);
            setActiveStep(2);
            showToast("Tạo kịch bản thành công!", "success");

        } catch (e: any) {
            showToast(e.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePanel = (id: string, field: keyof ComicPanel, value: any) => {
        setPanels(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleUpdateDialogue = (panelId: string, dialogueIndex: number, field: 'speaker' | 'text', value: string) => {
        setPanels(prev => prev.map(p => {
            if (p.id !== panelId) return p;
            const newDialogue = [...p.dialogue];
            newDialogue[dialogueIndex] = { ...newDialogue[dialogueIndex], [field]: value };
            return { ...p, dialogue: newDialogue };
        }));
    };

    return (
        <div className="animate-fade-in max-w-7xl mx-auto">
            {/* Header / Steps */}
            <div className="mb-8 flex justify-center">
                <div className="flex items-center gap-4 bg-skin-fill-secondary p-2 rounded-full border border-skin-border">
                    <div className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeStep === 1 ? 'bg-pink-500 text-white' : 'text-gray-400'}`}>
                        1. Thiết lập & Casting
                    </div>
                    <div className={`w-8 h-0.5 ${activeStep >= 2 ? 'bg-pink-500' : 'bg-gray-700'}`}></div>
                    <div className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeStep === 2 ? 'bg-blue-500 text-white' : 'text-gray-400'}`}>
                        2. Kịch bản AI
                    </div>
                    <div className={`w-8 h-0.5 ${activeStep >= 3 ? 'bg-blue-500' : 'bg-gray-700'}`}></div>
                    <div className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeStep === 3 ? 'bg-purple-500 text-white' : 'text-gray-400'}`}>
                        3. Vẽ & Hậu kỳ
                    </div>
                </div>
            </div>

            {/* STEP 1: SETUP */}
            {activeStep === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-skin-fill-secondary p-6 rounded-2xl border border-skin-border shadow-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <i className="ph-fill ph-book-open-text text-yellow-400"></i> Cấu Hình Truyện
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-gray-400 font-semibold block mb-1">Thể loại</label>
                                    <select className="auth-input" value={storySettings.genre} onChange={e => setStorySettings({...storySettings, genre: e.target.value})}>
                                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 font-semibold block mb-1">Phong cách vẽ</label>
                                    <select className="auth-input" value={storySettings.artStyle} onChange={e => setStorySettings({...storySettings, artStyle: e.target.value})}>
                                        {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 font-semibold block mb-1">Lượng thoại</label>
                                    <select className="auth-input" value={storySettings.dialogueAmount} onChange={e => setStorySettings({...storySettings, dialogueAmount: e.target.value})}>
                                        <option value="Ít (Visual Focus)">Ít (Tập trung hình ảnh)</option>
                                        <option value="Vừa phải">Vừa phải (Cân bằng)</option>
                                        <option value="Nhiều (Story Focus)">Nhiều (Tập trung cốt truyện)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400 font-semibold block mb-1">Số trang dự kiến</label>
                                    <input type="number" className="auth-input" min={1} max={10} value={storySettings.pageCount} onChange={e => setStorySettings({...storySettings, pageCount: parseInt(e.target.value)})} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-skin-fill-secondary p-6 rounded-2xl border border-skin-border shadow-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <i className="ph-fill ph-lightbulb text-cyan-400"></i> Ý Tưởng Cốt Truyện
                            </h3>
                            <textarea className="auth-input min-h-[150px] text-sm" placeholder="Nhập ý tưởng của bạn..." value={storySettings.premise} onChange={e => setStorySettings({...storySettings, premise: e.target.value})} />
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="bg-skin-fill-secondary p-6 rounded-2xl border border-skin-border shadow-lg min-h-full">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="ph-fill ph-users-three text-pink-400"></i> Casting Nhân Vật</h3>
                                <button onClick={handleAddCharacter} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold text-white transition">+ Thêm Nhân Vật</button>
                            </div>
                            <div className="space-y-6">
                                {characters.length === 0 && <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-700 rounded-xl"><i className="ph-fill ph-user-plus text-4xl mb-2"></i><p>Chưa có nhân vật nào.</p></div>}
                                {characters.map((char) => (
                                    <div key={char.id} className="bg-black/20 p-4 rounded-xl border border-white/10 flex flex-col md:flex-row gap-4 items-start">
                                        <div className="w-full md:w-32 flex-shrink-0">
                                            <label className="block relative aspect-[3/4] bg-black/40 rounded-lg border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer overflow-hidden group transition-colors">
                                                {char.image_url ? <img src={char.image_url} className="w-full h-full object-cover" alt="Char" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500"><i className="ph-fill ph-upload-simple text-2xl mb-1"></i><span className="text-[10px]">Ảnh gốc</span></div>}
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCharacterImageUpload(char.id, e.target.files[0])} />
                                            </label>
                                        </div>
                                        <div className="flex-grow w-full">
                                            <div className="flex justify-between items-start mb-2">
                                                <input type="text" value={char.name} onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} className="bg-transparent border-b border-gray-700 text-white font-bold text-lg focus:border-pink-500 focus:outline-none w-full md:w-1/2" placeholder="Tên nhân vật" />
                                                <button onClick={() => handleRemoveCharacter(char.id)} className="text-red-400 hover:text-red-300 p-1"><i className="ph-fill ph-trash"></i></button>
                                            </div>
                                            <div className="relative">
                                                <textarea className={`auth-input w-full h-24 text-xs resize-none ${char.is_analyzing ? 'opacity-50' : ''}`} placeholder="Mô tả ngoại hình..." value={char.description} onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} />
                                                {char.is_analyzing && <div className="absolute inset-0 flex items-center justify-center"><div className="bg-black/70 px-4 py-2 rounded-full flex items-center gap-2 text-pink-400 text-xs font-bold border border-pink-500/30"><i className="ph-bold ph-spinner animate-spin"></i> AI Đang Phân Tích...</div></div>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 2: SCRIPT EDITOR */}
            {activeStep === 2 && (
                <div className="space-y-6">
                    <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400"><i className="ph-fill ph-magic-wand text-xl"></i></div>
                            <div>
                                <h4 className="font-bold text-white">AI Đạo Diễn đã hoàn thành kịch bản!</h4>
                                <p className="text-xs text-gray-400">Hãy kiểm tra và chỉnh sửa lại lời thoại hoặc mô tả cảnh trước khi vẽ.</p>
                            </div>
                        </div>
                        <button onClick={() => setActiveStep(1)} className="text-xs text-gray-400 hover:text-white underline">Quay lại Setup</button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {panels.map((panel) => (
                            <div key={panel.id} className="bg-skin-fill-secondary border border-skin-border rounded-xl overflow-hidden">
                                <div className="bg-white/5 p-3 border-b border-white/10 flex justify-between items-center">
                                    <h4 className="font-bold text-white">Khung Tranh #{panel.panel_number}</h4>
                                    <span className="text-xs text-gray-500">ID: {panel.id.slice(0,8)}</span>
                                </div>
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Left: Visual Description */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Mô tả cảnh (Cho AI Vẽ)</label>
                                        <textarea 
                                            className="auth-input w-full h-32 text-sm resize-none bg-black/20" 
                                            value={panel.visual_description}
                                            onChange={(e) => handleUpdatePanel(panel.id, 'visual_description', e.target.value)}
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1">* Gợi ý: Giữ nguyên các từ khóa mô tả ngoại hình nhân vật.</p>
                                    </div>

                                    {/* Right: Dialogue */}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Lời thoại</label>
                                        <div className="space-y-2">
                                            {panel.dialogue.map((dia, dIndex) => (
                                                <div key={dIndex} className="flex gap-2">
                                                    <input 
                                                        className="auth-input w-1/3 text-xs font-bold text-yellow-400" 
                                                        value={dia.speaker} 
                                                        onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'speaker', e.target.value)}
                                                        placeholder="Tên"
                                                    />
                                                    <input 
                                                        className="auth-input w-2/3 text-xs" 
                                                        value={dia.text} 
                                                        onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'text', e.target.value)}
                                                        placeholder="Nội dung thoại"
                                                    />
                                                </div>
                                            ))}
                                            {panel.dialogue.length === 0 && <p className="text-sm text-gray-500 italic">Không có thoại (Cảnh tĩnh)</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 3: RENDER (Placeholder) */}
            {activeStep === 3 && (
                <div className="text-center py-20">
                    <h2 className="text-2xl font-bold text-white mb-4">Giai đoạn 3: Xưởng Vẽ</h2>
                    <p className="text-gray-400">Tính năng vẽ tranh đang được phát triển. Vui lòng quay lại sau!</p>
                    <button onClick={() => setActiveStep(2)} className="mt-4 text-pink-400 underline">Quay lại Kịch bản</button>
                </div>
            )}

            {/* Footer Action Bar */}
            <div className="fixed bottom-0 left-0 w-full bg-[#12121A] border-t border-white/10 p-4 z-30">
                <div className="container mx-auto flex justify-between items-center max-w-7xl">
                    <div className="text-sm text-gray-400">
                        {activeStep === 1 && <>Chi phí: <span className="text-pink-400 font-bold">2 💎</span> (Tạo kịch bản)</>}
                        {activeStep === 2 && <>Chi phí: <span className="text-pink-400 font-bold">10 💎/Trang</span> (Vẽ tranh)</>}
                    </div>
                    <button 
                        onClick={activeStep === 1 ? handleGenerateScript : () => setActiveStep(3)}
                        disabled={isLoading}
                        className="themed-button-primary px-8 py-3 font-bold text-lg rounded-full shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 transform hover:-translate-y-1 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {isLoading && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                        {activeStep === 1 ? 'Tạo Kịch Bản AI' : activeStep === 2 ? 'Duyệt & Vẽ Tranh' : 'Hoàn Tất'} 
                        {!isLoading && <i className="ph-bold ph-arrow-right"></i>}
                    </button>
                </div>
            </div>
            
            <div className="h-24"></div>
        </div>
    );
};

export default ComicStudio;
