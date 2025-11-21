
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Mock data for dropdowns
const ART_STYLES = [
    'Manga (Đen Trắng)', 'Webtoon (Hàn Quốc)', 'Comic (Âu Mỹ)', 'Anime (Nhật Bản)', '3D Render (Audition)', 'Pixel Art'
];
const GENRES = [
    'Hài hước', 'Ngôn tình', 'Kinh dị', 'Hành động', 'Đời thường', 'Học đường', 'Xuyên không'
];

const RENDER_COST = 10;

// Draggable Bubble Component
const DraggableBubble = ({ 
    text, 
    initialX, 
    initialY, 
    onUpdate 
}: { 
    text: string; 
    initialX: number; 
    initialY: number; 
    onUpdate: (x: number, y: number) => void 
}) => {
    const [position, setPosition] = useState({ x: initialX, y: initialY });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newX = e.clientX - dragStart.current.x;
            const newY = e.clientY - dragStart.current.y;
            setPosition({ x: newX, y: newY });
        };
        const handleMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                onUpdate(position.x, position.y);
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, onUpdate, position.x, position.y]);

    return (
        <div 
            onMouseDown={handleMouseDown}
            style={{ left: position.x, top: position.y }}
            className="absolute cursor-move bg-white text-black px-4 py-2 rounded-[20px] border-2 border-black shadow-lg text-sm font-bold max-w-[200px] text-center z-10 select-none bubble-tail"
        >
            {text}
        </div>
    );
};

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

    // State for Step 2 & 3
    const [panels, setPanels] = useState<ComicPanel[]>([]);
    
    // Refs for Export
    const panelRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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

    // --- PHASE 3 LOGIC ---

    const handleRenderPanel = async (panel: ComicPanel) => {
        setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: true } : p));
        
        try {
            const res = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ 
                    panel, 
                    characters, 
                    style: storySettings.artStyle,
                    aspectRatio: '16:9' // Or dynamic based on layout
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            updateUserDiamonds(data.newDiamondCount);
            setPanels(prev => prev.map(p => p.id === panel.id ? { 
                ...p, 
                image_url: data.imageUrl, 
                is_rendering: false,
                status: 'completed' 
            } : p));
            
            showToast(`Đã vẽ xong khung tranh #${panel.panel_number}!`, "success");

        } catch (e: any) {
            showToast(e.message, "error");
            setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: false } : p));
        }
    };

    const handleExportPDF = async () => {
        setIsLoading(true);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            let yOffset = 10;
            
            for (let i = 0; i < panels.length; i++) {
                const panelEl = panelRefs.current[panels[i].id];
                if (panelEl && panels[i].image_url) {
                    const canvas = await html2canvas(panelEl, { useCORS: true, scale: 2 });
                    const imgData = canvas.toDataURL('image/jpeg', 0.8);
                    
                    const imgWidth = 190; // A4 width - margins
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    
                    if (yOffset + imgHeight > 280) {
                        pdf.addPage();
                        yOffset = 10;
                    }
                    
                    pdf.addImage(imgData, 'JPEG', 10, yOffset, imgWidth, imgHeight);
                    yOffset += imgHeight + 10;
                }
            }
            
            pdf.save('audition-comic.pdf');
            showToast("Xuất file PDF thành công!", "success");
        } catch (e: any) {
            console.error(e);
            showToast("Lỗi khi xuất file.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="animate-fade-in max-w-7xl mx-auto pb-32">
            <style>{`
                .bubble-tail::after {
                    content: '';
                    position: absolute;
                    bottom: -8px;
                    left: 20px;
                    border-width: 8px 8px 0;
                    border-style: solid;
                    border-color: black transparent;
                    display: block;
                    width: 0;
                }
                .bubble-tail::before {
                    content: '';
                    position: absolute;
                    bottom: -5px;
                    left: 22px;
                    border-width: 6px 6px 0;
                    border-style: solid;
                    border-color: white transparent;
                    display: block;
                    width: 0;
                    z-index: 1;
                }
            `}</style>

            {/* Header / Steps */}
            <div className="mb-10 flex justify-center">
                <div className="flex items-center gap-0 bg-black/40 p-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                    <div className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${activeStep === 1 ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                        1. Thiết lập
                    </div>
                    <div className="w-8 h-px bg-white/10"></div>
                    <div className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${activeStep === 2 ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                        2. Kịch bản
                    </div>
                    <div className="w-8 h-px bg-white/10"></div>
                    <div className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${activeStep === 3 ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                        3. Vẽ & Hậu kỳ
                    </div>
                </div>
            </div>

            {/* STEP 1: SETUP */}
            {activeStep === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Story Settings (4 cols) */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-skin-fill-secondary p-6 rounded-3xl border border-skin-border shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <i className="ph-fill ph-gear text-8xl text-white"></i>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3 relative z-10">
                                <span className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center text-yellow-400">
                                    <i className="ph-fill ph-sliders-horizontal"></i>
                                </span>
                                Cấu Hình Truyện
                            </h3>
                            
                            <div className="space-y-5 relative z-10">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Thể loại</label>
                                    <select className="auth-input w-full bg-black/20 border-gray-600" value={storySettings.genre} onChange={e => setStorySettings({...storySettings, genre: e.target.value})}>
                                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Phong cách vẽ</label>
                                    <select className="auth-input w-full bg-black/20 border-gray-600" value={storySettings.artStyle} onChange={e => setStorySettings({...storySettings, artStyle: e.target.value})}>
                                        {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Lượng thoại</label>
                                        <select className="auth-input w-full bg-black/20 border-gray-600 text-xs" value={storySettings.dialogueAmount} onChange={e => setStorySettings({...storySettings, dialogueAmount: e.target.value})}>
                                            <option value="Ít (Visual Focus)">Ít (Visual)</option>
                                            <option value="Vừa phải">Vừa phải</option>
                                            <option value="Nhiều (Story Focus)">Nhiều (Story)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Số trang</label>
                                        <input type="number" className="auth-input w-full bg-black/20 border-gray-600 text-center font-bold" min={1} max={10} value={storySettings.pageCount} onChange={e => setStorySettings({...storySettings, pageCount: parseInt(e.target.value)})} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-b from-indigo-900/40 to-purple-900/40 p-6 rounded-3xl border border-indigo-500/30 shadow-xl">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                                <span className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-300">
                                    <i className="ph-fill ph-lightbulb"></i>
                                </span>
                                Ý Tưởng Cốt Truyện
                            </h3>
                            <textarea 
                                className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none" 
                                rows={6}
                                placeholder="Ví dụ: Hai vũ công thi đấu tại Club, nam tỏ tình nhưng nữ từ chối vì nhảy Miss nhiều quá..." 
                                value={storySettings.premise} 
                                onChange={e => setStorySettings({...storySettings, premise: e.target.value})} 
                            />
                        </div>
                    </div>

                    {/* Right Column: Characters (8 cols) */}
                    <div className="lg:col-span-8">
                        <div className="bg-skin-fill-secondary p-6 rounded-3xl border border-skin-border shadow-xl min-h-full relative">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                    <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center text-pink-400">
                                        <i className="ph-fill ph-users-three"></i>
                                    </span>
                                    Casting Nhân Vật
                                </h3>
                                <button 
                                    onClick={handleAddCharacter} 
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-sm font-bold text-white transition flex items-center gap-2"
                                >
                                    <i className="ph-bold ph-plus"></i> Thêm Nhân Vật
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {characters.length === 0 && (
                                    <div className="text-center py-20 border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
                                        <i className="ph-fill ph-user-plus text-6xl text-gray-600 mb-4"></i>
                                        <p className="text-gray-400 font-medium">Chưa có nhân vật nào. Hãy thêm nhân vật để bắt đầu.</p>
                                    </div>
                                )}
                                
                                {characters.map((char) => (
                                    <div key={char.id} className="bg-black/20 p-4 rounded-2xl border border-white/5 hover:border-pink-500/30 transition-all flex flex-col md:flex-row gap-6 items-start group">
                                        <div className="w-full md:w-40 flex-shrink-0">
                                            <label className="block relative aspect-[3/4] bg-black/40 rounded-xl border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer overflow-hidden transition-colors shadow-inner">
                                                {char.image_url ? (
                                                    <img src={char.image_url} className="w-full h-full object-cover" alt="Char" />
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
                                                        <i className="ph-fill ph-upload-simple text-3xl"></i>
                                                        <span className="text-xs font-bold uppercase">Tải ảnh gốc</span>
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <i className="ph-bold ph-pencil-simple text-white text-2xl"></i>
                                                </div>
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCharacterImageUpload(char.id, e.target.files[0])} />
                                            </label>
                                        </div>
                                        
                                        <div className="flex-grow w-full space-y-4">
                                            <div className="flex justify-between items-start">
                                                <div className="w-full max-w-xs">
                                                    <input 
                                                        type="text" 
                                                        value={char.name} 
                                                        onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} 
                                                        className="bg-transparent border-b-2 border-gray-700 focus:border-pink-500 text-white font-bold text-xl focus:outline-none w-full pb-1 transition-colors placeholder-gray-600" 
                                                        placeholder="Tên Nhân Vật" 
                                                    />
                                                </div>
                                                <button onClick={() => handleRemoveCharacter(char.id)} className="w-8 h-8 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all">
                                                    <i className="ph-fill ph-trash"></i>
                                                </button>
                                            </div>
                                            
                                            <div className="relative">
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Mô tả ngoại hình (AI Phân tích)</label>
                                                <textarea 
                                                    className={`w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-gray-300 focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition resize-none h-28 ${char.is_analyzing ? 'opacity-50 blur-sm' : ''}`} 
                                                    placeholder="Tải ảnh lên để AI tự động điền mô tả..." 
                                                    value={char.description} 
                                                    onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} 
                                                />
                                                {char.is_analyzing && (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="bg-black/80 backdrop-blur-md px-5 py-2 rounded-full flex items-center gap-3 text-pink-400 text-sm font-bold border border-pink-500/30 shadow-xl">
                                                            <i className="ph-bold ph-spinner animate-spin text-lg"></i> 
                                                            AI Đang Phân Tích...
                                                        </div>
                                                    </div>
                                                )}
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
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="bg-blue-500/10 border border-blue-500/30 p-5 rounded-2xl flex items-center justify-between shadow-lg">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 border border-blue-500/30">
                                <i className="ph-fill ph-magic-wand text-2xl"></i>
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-lg">Kịch bản đã sẵn sàng!</h4>
                                <p className="text-sm text-blue-200/70">AI Đạo Diễn đã tạo xong phân cảnh. Hãy kiểm tra và chỉnh sửa nếu cần.</p>
                            </div>
                        </div>
                        <button onClick={() => setActiveStep(1)} className="text-sm text-gray-400 hover:text-white font-semibold px-4 py-2 rounded-lg hover:bg-white/5 transition">
                            <i className="ph-bold ph-arrow-left mr-1"></i> Quay lại
                        </button>
                    </div>

                    <div className="space-y-6">
                        {panels.map((panel) => (
                            <div key={panel.id} className="bg-skin-fill-secondary border border-skin-border rounded-2xl overflow-hidden shadow-lg hover:border-blue-500/30 transition-all">
                                <div className="bg-black/30 p-4 border-b border-white/5 flex justify-between items-center">
                                    <h4 className="font-bold text-white flex items-center gap-2">
                                        <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded font-bold">PANEL {panel.panel_number}</span>
                                    </h4>
                                    <span className="text-xs text-gray-500 font-mono">ID: {panel.id.slice(0,8)}</span>
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-blue-400 uppercase tracking-wider">Mô tả cảnh (Visual Prompt)</label>
                                        <textarea 
                                            className="w-full h-40 text-sm resize-none bg-black/20 border border-white/10 rounded-xl p-3 text-gray-300 focus:border-blue-500/50 transition leading-relaxed" 
                                            value={panel.visual_description}
                                            onChange={(e) => handleUpdatePanel(panel.id, 'visual_description', e.target.value)}
                                        />
                                        <p className="text-[10px] text-gray-500 italic">* Gợi ý: Giữ nguyên các từ khóa mô tả ngoại hình nhân vật tiếng Anh.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-green-400 uppercase tracking-wider">Hội thoại (Dialogue)</label>
                                        <div className="space-y-3 h-40 overflow-y-auto custom-scrollbar pr-2">
                                            {panel.dialogue.map((dia, dIndex) => (
                                                <div key={dIndex} className="flex gap-2 items-start">
                                                    <div className="w-1/3 pt-1">
                                                        <input 
                                                            className="w-full bg-transparent border-b border-gray-700 text-xs font-bold text-yellow-400 focus:border-yellow-500 focus:outline-none pb-1 text-right px-2" 
                                                            value={dia.speaker} 
                                                            onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'speaker', e.target.value)}
                                                            placeholder="Tên"
                                                        />
                                                    </div>
                                                    <div className="w-2/3">
                                                        <textarea 
                                                            className="w-full bg-white/5 border border-white/5 rounded-lg p-2 text-sm text-white focus:border-green-500/50 focus:outline-none transition resize-none" 
                                                            value={dia.text} 
                                                            onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'text', e.target.value)}
                                                            placeholder="Nội dung..."
                                                            rows={2}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            {panel.dialogue.length === 0 && <div className="text-center py-8 text-gray-600 text-sm italic bg-black/10 rounded-xl">Cảnh tĩnh (Không thoại)</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 3: RENDERING & POST-PROCESSING */}
            {activeStep === 3 && (
                <div className="space-y-8 max-w-5xl mx-auto">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-3xl font-black text-white flex items-center gap-3">
                                <span className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/30">
                                    <i className="ph-fill ph-paint-brush-broad"></i>
                                </span>
                                Xưởng Vẽ & Hậu Kỳ
                            </h2>
                            <p className="text-gray-400 text-sm mt-1 ml-14">Vẽ tranh, chèn thoại và xuất bản truyện.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setActiveStep(2)} className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-bold text-gray-300 transition">
                                Quay lại
                            </button>
                            <button onClick={handleExportPDF} disabled={isLoading} className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-full text-sm font-bold text-white transition shadow-lg flex items-center gap-2">
                                {isLoading ? <i className="ph-bold ph-spinner animate-spin"></i> : <i className="ph-bold ph-file-pdf"></i>}
                                Xuất bản PDF
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-12">
                        {panels.map((panel) => (
                            <div 
                                key={panel.id} 
                                className="bg-[#2a2a2a] p-1 rounded-sm shadow-2xl relative group"
                            >
                                {/* Tools Overlay (Top) */}
                                {!panel.image_url && (
                                    <div className="absolute top-4 right-4 z-20">
                                        <button 
                                            onClick={() => handleRenderPanel(panel)} 
                                            disabled={panel.is_rendering}
                                            className="px-6 py-3 bg-purple-600 text-white text-sm font-bold rounded-full hover:bg-purple-500 transition shadow-xl flex items-center gap-2 transform hover:scale-105"
                                        >
                                            {panel.is_rendering ? <i className="ph-bold ph-spinner animate-spin text-xl"></i> : <i className="ph-fill ph-paint-brush text-xl"></i>}
                                            {panel.is_rendering ? 'AI Đang Vẽ...' : `Vẽ Tranh (${RENDER_COST} 💎)`}
                                        </button>
                                    </div>
                                )}

                                {/* Paper Container */}
                                <div 
                                    ref={(el) => { panelRefs.current[panel.id] = el; }}
                                    className="relative w-full aspect-video bg-white overflow-hidden border border-black flex items-center justify-center"
                                >
                                    {panel.image_url ? (
                                        <>
                                            <img src={panel.image_url} alt="Panel" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                            
                                            {/* Drag Hint Overlay */}
                                            <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
                                                Kéo thả bóng thoại để di chuyển
                                            </div>

                                            {/* Bubbles Overlay */}
                                            {panel.dialogue.map((dia, idx) => (
                                                <DraggableBubble 
                                                    key={idx} 
                                                    text={`${dia.speaker ? dia.speaker + ': ' : ''}${dia.text}`} 
                                                    initialX={50 + (idx * 100)} // Better staggering
                                                    initialY={50 + (idx * 80)}
                                                    onUpdate={() => {}} 
                                                />
                                            ))}
                                        </>
                                    ) : (
                                        <div className="text-center text-gray-300 p-10 max-w-lg">
                                            <div className="w-20 h-20 border-4 border-gray-200 border-dashed rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                                                <i className="ph-fill ph-image text-4xl text-gray-300"></i>
                                            </div>
                                            <h4 className="text-xl font-bold text-gray-400 mb-2">Khung tranh trống</h4>
                                            <p className="text-sm text-gray-500 line-clamp-3">{panel.visual_description}</p>
                                        </div>
                                    )}
                                    
                                    {/* Page Number Badge */}
                                    <div className="absolute bottom-2 right-2 bg-white border border-black text-black text-xs font-bold px-2 py-0.5 z-0 pointer-events-none">
                                        {panel.panel_number}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FLOATING FOOTER ACTION BAR (New Design) */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50">
                <div className="bg-[#12121A]/90 backdrop-blur-xl border border-white/10 p-4 rounded-full shadow-2xl flex items-center justify-between gap-6 ring-1 ring-white/5">
                    <div className="flex flex-col pl-4">
                        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Chi phí dự kiến</span>
                        <div className="text-white font-bold text-lg flex items-center gap-1.5">
                            {activeStep === 1 ? (
                                <>
                                    <span className="text-pink-400 text-2xl">2</span>
                                    <i className="ph-fill ph-diamonds-four text-pink-400 text-sm"></i>
                                    <span className="text-sm font-normal text-gray-500 ml-1">(Tạo kịch bản)</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-purple-400 text-2xl">{RENDER_COST}</span>
                                    <i className="ph-fill ph-diamonds-four text-purple-400 text-sm"></i>
                                    <span className="text-sm font-normal text-gray-500 ml-1">/ Trang ảnh</span>
                                </>
                            )}
                        </div>
                    </div>

                    <button 
                        onClick={activeStep === 1 ? handleGenerateScript : () => setActiveStep(3)}
                        disabled={isLoading || (activeStep === 3)}
                        className={`
                            px-8 py-3 rounded-full font-bold text-base transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 shadow-lg
                            ${activeStep === 3 ? 'hidden' : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-purple-500/30'}
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                        `}
                    >
                        {isLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>Đang xử lý...</span>
                            </>
                        ) : (
                            <>
                                {activeStep === 1 ? 'Tạo Kịch Bản AI' : 'Vào Xưởng Vẽ'} 
                                <i className="ph-bold ph-arrow-right"></i>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComicStudio;
