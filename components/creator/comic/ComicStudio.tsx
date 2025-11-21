
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import SettingsBlock from '../ai-tool/SettingsBlock';
import { useTranslation } from '../../../hooks/useTranslation';

// --- CONSTANTS ---
const ART_STYLES = [
    'Manga (Đen Trắng)', 'Webtoon (Hàn Quốc)', 'Comic (Âu Mỹ)', 'Anime (Nhật Bản)', '3D Render (Audition)', 'Pixel Art'
];
const GENRES = [
    'Hài hước', 'Ngôn tình', 'Kinh dị', 'Hành động', 'Đời thường', 'Học đường', 'Xuyên không'
];

const RENDER_COST = 10; // 10 Diamonds per page render (Pro Model)

// --- SUB-COMPONENTS ---

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
    const steps = [
        { num: 1, label: 'Thiết lập', icon: 'ph-sliders' },
        { num: 2, label: 'Kịch bản', icon: 'ph-scroll' },
        { num: 3, label: 'Sản xuất', icon: 'ph-paint-brush-broad' },
    ];

    return (
        <div className="flex justify-center mb-8">
            <div className="bg-[#12121A]/80 backdrop-blur-md border border-white/10 p-1.5 rounded-full flex items-center relative z-10 shadow-xl">
                {steps.map((step) => {
                    const isActive = step.num === currentStep;
                    const isPast = step.num < currentStep;
                    return (
                        <div key={step.num} className="flex items-center">
                            <div 
                                className={`
                                    flex items-center gap-2 px-6 py-2.5 rounded-full transition-all duration-300 select-none
                                    ${isActive 
                                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-purple-500/30 font-bold' 
                                        : isPast 
                                            ? 'text-white/80 hover:bg-white/5' 
                                            : 'text-gray-500'
                                    }
                                `}
                            >
                                <i className={`ph-fill ${step.icon} text-lg ${isActive ? 'animate-pulse' : ''}`}></i>
                                <span className={`text-sm ${isActive ? 'block' : 'hidden sm:block'}`}>{step.label}</span>
                            </div>
                            {step.num < 3 && (
                                <div className={`w-8 h-0.5 mx-1 transition-colors duration-300 ${isPast ? 'bg-purple-500/50' : 'bg-white/5'}`}></div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

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
            className="absolute cursor-move bg-white text-black px-4 py-2 rounded-[20px] border-2 border-black shadow-xl text-xs md:text-sm font-bold max-w-[180px] text-center z-30 select-none bubble-tail hover:scale-105 transition-transform"
        >
            {text}
        </div>
    );
};

// --- MAIN COMPONENT ---

const ComicStudio: React.FC = () => {
    const { session, showToast, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
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
                    aspectRatio: '16:9' 
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
        <div className="animate-fade-in max-w-[1400px] mx-auto pb-40 pt-2">
            {/* GLOBAL STYLES */}
            <style>{`
                .bubble-tail::after {
                    content: ''; position: absolute; bottom: -8px; left: 20px;
                    border-width: 8px 8px 0; border-style: solid; border-color: black transparent;
                    display: block; width: 0;
                }
                .bubble-tail::before {
                    content: ''; position: absolute; bottom: -5px; left: 22px;
                    border-width: 6px 6px 0; border-style: solid; border-color: white transparent;
                    display: block; width: 0; z-index: 1;
                }
                .comic-card {
                    background: var(--color-fill-secondary);
                    border: 1px solid var(--color-border);
                    border-radius: 1rem;
                    overflow: hidden;
                    transition: all 0.3s ease;
                }
                .comic-card:hover {
                    border-color: var(--color-border-accent);
                    box-shadow: var(--shadow-accent);
                }
            `}</style>

            <StepIndicator currentStep={activeStep} />

            {/* STEP 1: SETUP & CASTING */}
            {activeStep === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-4">
                    
                    {/* Left: Settings (4 Cols) */}
                    <div className="lg:col-span-4 space-y-6">
                        <SettingsBlock title="Cấu Hình Truyện" instructionKey="group-studio" onInstructionClick={() => {}} >
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Thể loại</label>
                                    <select className="auth-input w-full" value={storySettings.genre} onChange={e => setStorySettings({...storySettings, genre: e.target.value})}>
                                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Phong cách vẽ</label>
                                    <select className="auth-input w-full" value={storySettings.artStyle} onChange={e => setStorySettings({...storySettings, artStyle: e.target.value})}>
                                        {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Lượng thoại</label>
                                        <select className="auth-input w-full text-xs" value={storySettings.dialogueAmount} onChange={e => setStorySettings({...storySettings, dialogueAmount: e.target.value})}>
                                            <option value="Ít (Visual Focus)">Ít (Visual)</option>
                                            <option value="Vừa phải">Vừa phải</option>
                                            <option value="Nhiều (Story Focus)">Nhiều (Story)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Số trang</label>
                                        <input type="number" className="auth-input w-full text-center font-bold" min={1} max={10} value={storySettings.pageCount} onChange={e => setStorySettings({...storySettings, pageCount: parseInt(e.target.value)})} />
                                    </div>
                                </div>
                            </div>
                        </SettingsBlock>

                        <div className="bg-gradient-to-b from-indigo-900/30 to-purple-900/30 p-5 rounded-2xl border border-indigo-500/30 shadow-lg">
                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                                <i className="ph-fill ph-lightbulb text-indigo-400"></i> Ý Tưởng Cốt Truyện
                            </h3>
                            <textarea 
                                className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none placeholder-gray-500" 
                                rows={6}
                                placeholder="Nhập ý tưởng của bạn (tiếng Việt)... Ví dụ: Hai vũ công thi đấu tại Club, nam tỏ tình nhưng nữ từ chối vì nhảy Miss nhiều quá..." 
                                value={storySettings.premise} 
                                onChange={e => setStorySettings({...storySettings, premise: e.target.value})} 
                            />
                        </div>
                    </div>

                    {/* Right: Casting (8 Cols) - Bento Grid */}
                    <div className="lg:col-span-8">
                        <div className="comic-card p-6 h-full flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                    <span className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center text-pink-400">
                                        <i className="ph-fill ph-users-three text-xl"></i>
                                    </span>
                                    Casting Nhân Vật
                                </h3>
                                <button 
                                    onClick={handleAddCharacter} 
                                    className="themed-button-secondary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-white/10"
                                >
                                    <i className="ph-bold ph-plus"></i> Thêm
                                </button>
                            </div>

                            {characters.length === 0 ? (
                                <div className="flex-grow flex flex-col items-center justify-center text-center py-20 border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
                                    <div className="w-20 h-20 bg-skin-fill-secondary rounded-full flex items-center justify-center mb-4 animate-bounce">
                                        <i className="ph-fill ph-user-plus text-4xl text-skin-muted"></i>
                                    </div>
                                    <p className="text-skin-muted font-medium">Chưa có diễn viên nào.</p>
                                    <p className="text-xs text-gray-600 mt-1">Thêm nhân vật để bắt đầu câu chuyện.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {characters.map((char) => (
                                        <div key={char.id} className="relative bg-black/30 rounded-xl border border-white/5 overflow-hidden flex group hover:border-pink-500/50 transition-all">
                                            {/* Image Section */}
                                            <label className="w-28 flex-shrink-0 bg-black/50 cursor-pointer relative">
                                                {char.image_url ? (
                                                    <img src={char.image_url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Char" />
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-1">
                                                        <i className="ph-fill ph-camera text-2xl"></i>
                                                        <span className="text-[10px] font-bold">UPLOAD</span>
                                                    </div>
                                                )}
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCharacterImageUpload(char.id, e.target.files[0])} />
                                            </label>

                                            {/* Info Section */}
                                            <div className="flex-grow p-3 flex flex-col min-w-0">
                                                <div className="flex justify-between items-start mb-2">
                                                    <input 
                                                        type="text" 
                                                        value={char.name} 
                                                        onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} 
                                                        className="bg-transparent border-b border-white/10 focus:border-pink-500 text-white font-bold text-sm focus:outline-none w-32 pb-0.5 transition-colors placeholder-gray-600" 
                                                        placeholder="Tên..." 
                                                    />
                                                    <button onClick={() => handleRemoveCharacter(char.id)} className="text-gray-500 hover:text-red-400 transition"><i className="ph-fill ph-x"></i></button>
                                                </div>
                                                
                                                <div className="relative flex-grow">
                                                    <textarea 
                                                        className={`w-full h-full bg-white/5 border border-white/5 rounded-lg p-2 text-xs text-gray-400 focus:text-white focus:bg-black/40 transition resize-none ${char.is_analyzing ? 'opacity-30' : ''}`} 
                                                        placeholder="Mô tả ngoại hình (AI tự điền)..." 
                                                        value={char.description} 
                                                        onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} 
                                                    />
                                                    {char.is_analyzing && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <i className="ph-bold ph-spinner animate-spin text-pink-500 text-xl"></i>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 2: SCRIPT EDITOR */}
            {activeStep === 2 && (
                <div className="max-w-5xl mx-auto px-4 space-y-6">
                    <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                            <i className="ph-fill ph-magic-wand text-xl"></i>
                        </div>
                        <div>
                            <h4 className="font-bold text-blue-100">Kịch bản AI đã sẵn sàng</h4>
                            <p className="text-xs text-blue-200/60">Hãy kiểm tra và chỉnh sửa lời thoại trước khi vẽ.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {panels.map((panel) => (
                            <div key={panel.id} className="comic-card p-0 flex flex-col md:flex-row">
                                {/* Left: Visual Prompt */}
                                <div className="md:w-1/2 p-4 border-b md:border-b-0 md:border-r border-white/10 bg-black/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">PANEL {panel.panel_number}</span>
                                        <span className="text-[10px] text-gray-500">Visual Description</span>
                                    </div>
                                    <textarea 
                                        className="w-full h-32 bg-transparent border-none focus:ring-0 text-sm text-gray-300 leading-relaxed resize-none p-0"
                                        value={panel.visual_description}
                                        onChange={(e) => handleUpdatePanel(panel.id, 'visual_description', e.target.value)}
                                    />
                                </div>

                                {/* Right: Dialogue */}
                                <div className="md:w-1/2 p-4 bg-skin-fill-secondary">
                                    <div className="mb-2 text-[10px] font-bold text-gray-500 uppercase">Hội thoại</div>
                                    <div className="space-y-3">
                                        {panel.dialogue.map((dia, dIndex) => (
                                            <div key={dIndex} className="flex gap-2 items-start group">
                                                <div className="w-24 pt-1">
                                                    <input 
                                                        className="w-full bg-transparent border-b border-white/10 text-xs font-bold text-yellow-400 focus:border-yellow-500 focus:outline-none text-right px-1 py-1" 
                                                        value={dia.speaker} 
                                                        onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'speaker', e.target.value)}
                                                        placeholder="Tên"
                                                    />
                                                </div>
                                                <div className="flex-grow">
                                                    <textarea 
                                                        className="w-full bg-white/5 border border-white/5 rounded-lg p-2 text-sm text-white focus:border-green-500/50 focus:outline-none transition resize-none" 
                                                        value={dia.text} 
                                                        onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'text', e.target.value)}
                                                        rows={2}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        {panel.dialogue.length === 0 && <p className="text-xs text-gray-600 italic pl-2">Không có lời thoại</p>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 3: RENDER & EXPORT */}
            {activeStep === 3 && (
                <div className="max-w-5xl mx-auto px-4 space-y-8">
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setActiveStep(2)} className="themed-button-secondary px-4 py-2 text-xs font-bold">Quay lại Kịch bản</button>
                        <button onClick={handleExportPDF} disabled={isLoading} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2 transition-all hover:scale-105">
                            {isLoading ? <i className="ph-bold ph-spinner animate-spin"></i> : <i className="ph-bold ph-file-pdf"></i>}
                            Xuất bản PDF
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {panels.map((panel) => (
                            <div key={panel.id} className="bg-[#1a1a1a] p-2 shadow-2xl rounded-sm">
                                <div 
                                    ref={(el) => { panelRefs.current[panel.id] = el; }}
                                    className="relative w-full aspect-video bg-white overflow-hidden border border-black flex items-center justify-center group"
                                >
                                    {/* Draw Button Overlay */}
                                    {!panel.image_url && (
                                        <div className="absolute inset-0 bg-skin-fill-secondary/90 flex flex-col items-center justify-center z-20">
                                            <p className="text-gray-400 text-sm mb-4 max-w-md text-center px-4 line-clamp-2">{panel.visual_description}</p>
                                            <button 
                                                onClick={() => handleRenderPanel(panel)} 
                                                disabled={panel.is_rendering}
                                                className="themed-button-primary px-8 py-3 rounded-full font-bold text-white shadow-xl flex items-center gap-2 transform hover:scale-105 transition-all"
                                            >
                                                {panel.is_rendering ? <i className="ph-bold ph-spinner animate-spin text-xl"></i> : <i className="ph-fill ph-paint-brush-broad text-xl"></i>}
                                                {panel.is_rendering ? 'Đang vẽ...' : `Vẽ Panel Này (${RENDER_COST} 💎)`}
                                            </button>
                                        </div>
                                    )}

                                    {panel.image_url ? (
                                        <>
                                            <img src={panel.image_url} alt="Panel" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                            {/* Bubbles */}
                                            {panel.dialogue.map((dia, idx) => (
                                                <DraggableBubble 
                                                    key={idx} 
                                                    text={`${dia.speaker ? dia.speaker + ': ' : ''}${dia.text}`} 
                                                    initialX={50 + (idx * 50)} 
                                                    initialY={50 + (idx * 50)}
                                                    onUpdate={() => {}} 
                                                />
                                            ))}
                                        </>
                                    ) : null}
                                    
                                    <div className="absolute bottom-2 right-2 bg-white border border-black text-black text-[10px] font-bold px-1.5 py-0.5 z-10 pointer-events-none select-none">
                                        {panel.panel_number}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FLOATING ACTION BAR (FIXED BOTTOM) */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50 animate-fade-in-up">
                <div className="bg-[#12121A]/90 backdrop-blur-xl border border-white/10 p-2 pl-6 rounded-full shadow-2xl flex items-center justify-between ring-1 ring-white/5">
                    
                    {/* Info Left */}
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ước tính chi phí</span>
                        <div className="text-white font-bold flex items-center gap-1.5">
                            {activeStep === 1 ? (
                                <>
                                    <span className="text-pink-400 text-xl">2</span>
                                    <i className="ph-fill ph-diamonds-four text-pink-400 text-xs"></i>
                                    <span className="text-xs font-medium text-gray-500 ml-1">cho Kịch bản</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-purple-400 text-xl">{RENDER_COST}</span>
                                    <i className="ph-fill ph-diamonds-four text-purple-400 text-xs"></i>
                                    <span className="text-xs font-medium text-gray-500 ml-1">/ 1 Ảnh</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Main Action Button */}
                    <div className="flex gap-2">
                        {activeStep > 1 && (
                            <button 
                                onClick={() => setActiveStep(prev => (prev - 1) as any)}
                                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 transition-colors"
                            >
                                <i className="ph-bold ph-caret-left text-lg"></i>
                            </button>
                        )}
                        
                        <button 
                            onClick={activeStep === 1 ? handleGenerateScript : () => setActiveStep(3)}
                            disabled={isLoading || (activeStep === 3)}
                            className={`
                                px-6 py-3 rounded-full font-bold text-sm transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 shadow-lg
                                ${activeStep === 3 ? 'bg-green-600 text-white cursor-default' : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-pink-500/25'}
                                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                            `}
                        >
                            {isLoading ? (
                                <i className="ph-bold ph-spinner animate-spin text-lg"></i>
                            ) : activeStep === 3 ? (
                                <>Hoàn Tất <i className="ph-bold ph-check"></i></>
                            ) : (
                                <>{activeStep === 1 ? 'Tạo Kịch Bản' : 'Vào Xưởng Vẽ'} <i className="ph-bold ph-arrow-right"></i></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComicStudio;
