import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import SettingsBlock from '../ai-tool/SettingsBlock';
import Modal from '../../common/Modal';
import { COMIC_PREMISES } from '../../../constants/comicPremises';

// --- CONSTANTS (UPDATED) ---

const GENRES = [
    'Mặc định (Sáng tạo)',
    'Hành động / Phiêu lưu',
    'Trận chiến / Shonen',
    'Lãng mạn / Shoujo',
    'Hài hước / Vui nhộn',
    'Kinh dị / Ly kỳ',
    'Lát cắt cuộc sống',
    'Khoa học viễn tưởng / Mecha',
    'Giả tưởng / Isekai',
    'Bí ẩn / Thám tử',
    'Bẩn thỉu và thô tục'
];

const ART_STYLES = [
    { label: 'Mặc định (Audition)', value: 'Audition 3D Game Style' },
    { label: 'Manga (Đen Trắng)', value: 'Manga Black and White' },
    { label: 'Webtoon (Hàn Quốc)', value: 'Korean Webtoon Manhwa' },
    { label: 'Comic (Âu Mỹ)', value: 'American Comic Book' },
    { label: 'Anime (Nhật Bản)', value: 'Anime Style' },
    { label: 'Oda Eiichiro (One Piece)', value: 'One Piece Art Style' },
    { label: 'Akira Toriyama (Dragon Ball)', value: 'Dragon Ball Art Style' },
    { label: 'Studio Ghibli', value: 'Studio Ghibli Art Style' },
    { label: 'Makoto Shinkai', value: 'Makoto Shinkai Scenery' },
    { label: 'Junji Ito (Kinh dị)', value: 'Junji Ito Horror Manga Style' },
    { label: 'Pixel Art', value: 'Pixel Art' },
    { label: 'Cyberpunk', value: 'Cyberpunk Neon' },
    { label: 'Disney Cổ điển', value: 'Classic Disney Animation' },
    { label: 'Ukiyo-e (Tranh khắc gỗ)', value: 'Ukiyo-e Style' }
];

const LANGUAGES = [
    'Tiếng Việt', 'Tiếng Anh', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc', 'Tây Ban Nha', 'Tiếng Pháp'
];

const COLOR_FORMATS = [
    { label: 'Đầy đủ màu sắc', value: 'Full Color' },
    { label: 'Đen trắng / Manga', value: 'Black and White, Screen tones' },
    { label: 'Bản phác thảo thô', value: 'Rough Sketch, Pencil' }
];

const PAGE_NUMBERING = [
    { label: 'Không có', value: 'none' },
    { label: 'Dưới cùng bên trái', value: 'bottom-left' },
    { label: 'Trung tâm dưới cùng', value: 'bottom-center' },
    { label: 'Góc dưới bên phải', value: 'bottom-right' }
];

const BUBBLE_FONTS = [
    { label: 'Dễ thương / Tròn (Mali/Cát lún)', value: 'font-mali', family: '"Mali", cursive' },
    { label: 'Anime Standard (Chữ hoa/Chữ không chân)', value: 'font-anime', family: 'sans-serif' },
    { label: 'Viết tay (Patrick Hand/Pangolin)', value: 'font-hand', family: '"Patrick Hand", cursive' },
    { label: 'Truyện tranh cổ điển (Phong cách Comic Sans)', value: 'font-comic', family: '"Comic Neue", cursive' },
    { label: 'Webtoon hiện đại (Clean Roboto/Open Sans)', value: 'font-webtoon', family: '"Barlow", sans-serif' },
    { label: 'Serif / Novel (Merriweather/Times)', value: 'font-serif', family: '"Merriweather", serif' },
    { label: 'Pixel / Retro (VT323)', value: 'font-pixel', family: '"VT323", monospace' },
    { label: 'Cọ / Thư pháp (Mực Châu Á)', value: 'font-brush', family: '"Sedgwick Ave Display", cursive' },
    { label: 'Kinh dị (Scratchy/Distorted)', value: 'font-horror', family: '"Creepster", display' }
];

const ASPECT_RATIOS = [
    { label: '9:16 (Điện thoại)', value: '9:16' },
    { label: '1:1 (Vuông)', value: '1:1' },
    { label: '3:4 (Chân dung)', value: '3:4' },
    { label: '4:3 (Phong cảnh)', value: '4:3' },
    { label: '16:9 (Điện ảnh)', value: '16:9' }
];

const VISUAL_EFFECTS = [
    { label: 'Không có', value: 'none' },
    { label: 'Vụ nổ hoành tráng', value: 'Epic Explosion background' },
    { label: 'Đường Tốc Độ (Anime)', value: 'Anime Speed Lines' },
    { label: 'Máu me/Tối', value: 'Dark and Gore atmosphere' },
    { label: 'Hạt ma thuật', value: 'Magical Particles' },
    { label: 'Hiệu ứng trục trặc', value: 'Glitch Effect' },
    { label: 'Làm mờ chuyển động động', value: 'Dynamic Motion Blur' },
    { label: 'Kinh dị tâm lý', value: 'Psychological Horror vignette' }
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
        <div className="bg-[#12121A]/50 border border-white/5 p-1 rounded-full flex items-center shadow-inner">
            {steps.map((step) => {
                const isActive = step.num === currentStep;
                const isPast = step.num < currentStep;
                return (
                    <div key={step.num} className="flex items-center">
                        <div 
                            className={`
                                flex items-center gap-2 px-5 py-2 rounded-full transition-all duration-300 select-none
                                ${isActive 
                                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md font-bold' 
                                    : isPast 
                                        ? 'text-purple-300 hover:text-white' 
                                        : 'text-gray-600'
                                }
                            `}
                        >
                            <i className={`ph-fill ${step.icon} text-lg ${isActive ? 'animate-pulse' : ''}`}></i>
                            <span className={`text-xs sm:text-sm ${isActive ? 'block' : 'hidden sm:block'}`}>{step.label}</span>
                        </div>
                        {step.num < 3 && (
                            <div className={`w-6 h-0.5 mx-1 transition-colors duration-300 ${isPast ? 'bg-purple-500/30' : 'bg-white/5'}`}></div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const DraggableBubble = ({ 
    text, 
    initialX, 
    initialY, 
    onUpdate,
    fontFamily
}: { 
    text: string; 
    initialX: number; 
    initialY: number; 
    onUpdate: (x: number, y: number) => void;
    fontFamily: string;
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
            style={{ left: position.x, top: position.y, fontFamily: fontFamily }}
            className="absolute cursor-move bg-white text-black px-4 py-3 rounded-[20px] border-2 border-black shadow-xl text-sm font-bold max-w-[200px] text-center z-30 select-none bubble-tail hover:scale-105 transition-transform leading-tight"
        >
            {text}
        </div>
    );
};

// --- MAIN COMPONENT ---

const ComicStudio: React.FC = () => {
    const { session, showToast, updateUserDiamonds, supabase } = useAuth();
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1); 
    const [isLoading, setIsLoading] = useState(false);
    const [generationStatus, setGenerationStatus] = useState<string>(""); 
    const [isPremiseModalOpen, setIsPremiseModalOpen] = useState(false);
    
    // State for Step 1: Setup
    const [characters, setCharacters] = useState<ComicCharacter[]>([]);
    const [storySettings, setStorySettings] = useState({
        genre: GENRES[0],
        artStyle: ART_STYLES[0].value,
        language: LANGUAGES[0],
        dialogueAmount: 'Vừa phải',
        pageCount: 1,
        premise: '',
        colorFormat: COLOR_FORMATS[0].value,
        bubbleFont: BUBBLE_FONTS[0],
        aspectRatio: ASPECT_RATIOS[0].value,
        visualEffect: VISUAL_EFFECTS[0].value,
        pageNumbering: PAGE_NUMBERING[0].value
    });

    // State for Step 2 & 3
    const [panels, setPanels] = useState<ComicPanel[]>([]);
    const [imageLoadStates, setImageLoadStates] = useState<{[key: string]: 'loading' | 'loaded' | 'error'}>({});
    
    // Refs
    const panelRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            supabase?.removeAllChannels();
        };
    }, [supabase]);

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
        setGenerationStatus("Đang lên cấu trúc cốt truyện...");

        try {
            // PHASE 1: GENERATE OUTLINE
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

            const outline = data.outline;
            updateUserDiamonds(data.newDiamondCount);
            
            const initialPanels = outline.map((p: any) => ({
                id: crypto.randomUUID(),
                panel_number: p.panel_number,
                visual_description: `(Đang tạo chi tiết từ ý tưởng: ${p.plot_summary}...)`,
                plot_summary: p.plot_summary,
                dialogue: [],
                is_rendering: false
            }));
            
            setPanels(initialPanels);
            setActiveStep(2);

            // PHASE 2: EXPAND EACH PANEL
            for (let i = 0; i < outline.length; i++) {
                const p = outline[i];
                setGenerationStatus(`Đang viết chi tiết phân cảnh ${p.panel_number}/${outline.length}...`);
                
                try {
                    const expandRes = await fetch('/.netlify/functions/comic-expand-panel', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token}`
                        },
                        body: JSON.stringify({ 
                            plot_summary: p.plot_summary,
                            characters: characters,
                            style: storySettings.artStyle,
                            genre: storySettings.genre,
                            language: storySettings.language // Pass language
                        })
                    });
                    
                    if (expandRes.ok) {
                        const details = await expandRes.json();
                        setPanels(prev => prev.map(panel => 
                            panel.panel_number === p.panel_number 
                            ? { 
                                ...panel, 
                                visual_description: details.visual_description || p.plot_summary, 
                                dialogue: Array.isArray(details.dialogue) ? details.dialogue : [] 
                              }
                            : panel
                        ));
                    } else {
                        throw new Error("API Error");
                    }
                } catch (expandErr) {
                    console.error(`Error expanding panel ${p.panel_number}`, expandErr);
                    setPanels(prev => prev.map(panel => 
                        panel.panel_number === p.panel_number 
                        ? { 
                            ...panel, 
                            visual_description: `[Lỗi] ${p.plot_summary}`, 
                            dialogue: [] 
                          }
                        : panel
                    ));
                }
                
                await new Promise(r => setTimeout(r, 500));
            }

            showToast("Tạo kịch bản chi tiết hoàn tất!", "success");

        } catch (e: any) {
            showToast(e.message, "error");
        } finally {
            setIsLoading(false);
            setGenerationStatus("");
        }
    };

    const handleRetryPanel = async (panelId: string) => {
        const panelToRetry = panels.find(p => p.id === panelId);
        if (!panelToRetry) return;

        const plotSummary = (panelToRetry as any).plot_summary || panelToRetry.visual_description.replace(/^\[Lỗi\]\s*/, '');

        setPanels(prev => prev.map(p => p.id === panelId ? { 
            ...p, 
            visual_description: `(Đang thử lại: ${plotSummary}...)` 
        } : p));

        try {
            const expandRes = await fetch('/.netlify/functions/comic-expand-panel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ 
                    plot_summary: plotSummary,
                    characters: characters,
                    style: storySettings.artStyle,
                    genre: storySettings.genre,
                    language: storySettings.language
                })
            });

            if (expandRes.ok) {
                const details = await expandRes.json();
                setPanels(prev => prev.map(p => p.id === panelId ? { 
                    ...p, 
                    visual_description: details.visual_description || plotSummary, 
                    dialogue: Array.isArray(details.dialogue) ? details.dialogue : [] 
                } : p));
                showToast("Đã sửa lỗi thành công!", "success");
            } else {
                throw new Error("API Error");
            }
        } catch (e) {
            showToast("Thử lại thất bại. Vui lòng thử lại lần nữa.", "error");
            setPanels(prev => prev.map(p => p.id === panelId ? { 
                ...p, 
                visual_description: `[Lỗi] ${plotSummary}` 
            } : p));
        }
    };

    const handleRenderPanel = async (panel: ComicPanel) => {
        if (!supabase) return;
        
        setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: true } : p));
        setImageLoadStates(prev => ({ ...prev, [panel.id]: 'loading' }));
        
        try {
            const triggerRes = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ 
                    panel, 
                    characters, 
                    style: storySettings.artStyle,
                    colorFormat: storySettings.colorFormat,
                    visualEffect: storySettings.visualEffect,
                    aspectRatio: storySettings.aspectRatio
                })
            });

            const triggerData = await triggerRes.json();
            if (!triggerRes.ok) throw new Error(triggerData.error);

            const jobId = triggerData.jobId;
            updateUserDiamonds(triggerData.newDiamondCount);

            const channel = supabase.channel(`comic-job-${jobId}`)
                .on('postgres_changes', { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'generated_images', 
                    filter: `id=eq.${jobId}` 
                }, (payload: any) => {
                    const record = payload.new;
                    if (record.image_url && record.image_url !== 'PENDING') {
                        setPanels(prev => prev.map(p => p.id === panel.id ? { 
                            ...p, 
                            image_url: record.image_url, 
                            is_rendering: false,
                            status: 'completed' 
                        } : p));
                        showToast(`Đã vẽ xong khung tranh #${panel.panel_number}!`, "success");
                        supabase.removeChannel(channel);
                    }
                })
                .on('postgres_changes', {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'generated_images',
                    filter: `id=eq.${jobId}`
                }, () => {
                    setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: false } : p));
                    setImageLoadStates(prev => ({ ...prev, [panel.id]: 'error' }));
                    showToast("Lỗi khi vẽ. Đã hoàn tiền.", "error");
                    supabase.removeChannel(channel);
                })
                .subscribe();

            fetch('/.netlify/functions/comic-render-worker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            });

        } catch (e: any) {
            showToast(e.message, "error");
            setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: false } : p));
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
                    
                    const imgWidth = 190; 
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

    const handleSelectPremise = (premise: string) => {
        setStorySettings({ ...storySettings, premise });
        setIsPremiseModalOpen(false);
    };

    const handleImageLoad = (panelId: string) => {
        setImageLoadStates(prev => ({ ...prev, [panelId]: 'loaded' }));
    };

    const handleImageError = (panelId: string) => {
        setImageLoadStates(prev => ({ ...prev, [panelId]: 'error' }));
    };

    const handleReloadImage = (panelId: string) => {
        setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.image_url) return p;
            try {
                const url = new URL(p.image_url);
                url.searchParams.set('t', Date.now().toString());
                return { ...p, image_url: url.toString() };
            } catch (e) {
                return p;
            }
        }));
        setImageLoadStates(prev => ({ ...prev, [panelId]: 'loading' }));
    };

    // Style for font families
    const fontStyle = storySettings.bubbleFont.family;

    return (
        <div className="animate-fade-in h-[calc(100vh-140px)] min-h-[600px] flex flex-col max-w-7xl mx-auto">
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
                /* Font specific classes via style injection if needed, but inline style used */
            `}</style>

            <Modal isOpen={isPremiseModalOpen} onClose={() => setIsPremiseModalOpen(false)} title={`Gợi ý: ${storySettings.genre}`}>
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {COMIC_PREMISES[storySettings.genre]?.map((p, idx) => (
                        <button 
                            key={idx}
                            onClick={() => handleSelectPremise(p)}
                            className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-pink-500/50 transition-all text-sm text-gray-300 hover:text-white"
                        >
                            <span className="font-bold text-pink-400 mr-2">#{idx + 1}</span>
                            {p}
                        </button>
                    ))}
                    {!COMIC_PREMISES[storySettings.genre] && (
                        <p className="text-center text-gray-500 italic">Chưa có gợi ý cho thể loại này.</p>
                    )}
                </div>
            </Modal>

            {/* Main Box */}
            <div className="flex-grow bg-[#12121A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
                <div className="px-6 py-4 border-b border-white/10 bg-[#181820] flex justify-center">
                    <StepIndicator currentStep={activeStep} />
                </div>

                <div className="flex-grow overflow-y-auto p-6 custom-scrollbar bg-[#0f0f13]">
                    
                    {/* STEP 1: SETUP */}
                    {activeStep === 1 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Left: Detailed Settings */}
                            <div className="lg:col-span-5 space-y-6">
                                <SettingsBlock title="Cấu Hình Truyện" instructionKey="group-studio" onInstructionClick={() => {}} >
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">LOẠI CÂU CHUYỆN</label>
                                                <select className="auth-input w-full" value={storySettings.genre} onChange={e => setStorySettings({...storySettings, genre: e.target.value})}>
                                                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Ngôn ngữ</label>
                                                <select className="auth-input w-full" value={storySettings.language} onChange={e => setStorySettings({...storySettings, language: e.target.value})}>
                                                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Phong cách nghệ thuật</label>
                                            <select className="auth-input w-full" value={storySettings.artStyle} onChange={e => setStorySettings({...storySettings, artStyle: e.target.value})}>
                                                {ART_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Định dạng màu</label>
                                                <select className="auth-input w-full text-xs" value={storySettings.colorFormat} onChange={e => setStorySettings({...storySettings, colorFormat: e.target.value})}>
                                                    {COLOR_FORMATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Kiểu phông chữ bong bóng</label>
                                                <select className="auth-input w-full text-xs" value={storySettings.bubbleFont.value} onChange={e => setStorySettings({...storySettings, bubbleFont: BUBBLE_FONTS.find(f => f.value === e.target.value) || BUBBLE_FONTS[0]})}>
                                                    {BUBBLE_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Tỷ lệ khung hình</label>
                                                <select className="auth-input w-full text-xs" value={storySettings.aspectRatio} onChange={e => setStorySettings({...storySettings, aspectRatio: e.target.value})}>
                                                    {ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Hiệu ứng hình ảnh</label>
                                                <select className="auth-input w-full text-xs" value={storySettings.visualEffect} onChange={e => setStorySettings({...storySettings, visualEffect: e.target.value})}>
                                                    {VISUAL_EFFECTS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Lượng thoại</label>
                                                <select className="auth-input w-full text-xs" value={storySettings.dialogueAmount} onChange={e => setStorySettings({...storySettings, dialogueAmount: e.target.value})}>
                                                    <option value="Ít (Visual Focus)">Ít (Visual)</option>
                                                    <option value="Vừa phải">Vừa phải</option>
                                                    <option value="Nhiều (Story Focus)">Nhiều (Story)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Số trang (Panel)</label>
                                                <input type="number" className="auth-input w-full text-center font-bold" min={1} max={10} value={storySettings.pageCount} onChange={e => setStorySettings({...storySettings, pageCount: parseInt(e.target.value)})} />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">Vị trí số trang</label>
                                            <select className="auth-input w-full text-xs" value={storySettings.pageNumbering} onChange={e => setStorySettings({...storySettings, pageNumbering: e.target.value})}>
                                                {PAGE_NUMBERING.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </SettingsBlock>

                                <div className="bg-gradient-to-b from-indigo-900/30 to-purple-900/30 p-5 rounded-2xl border border-indigo-500/30 shadow-lg">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <i className="ph-fill ph-lightbulb text-indigo-400"></i> Ý Tưởng Cốt Truyện
                                        </h3>
                                        <button onClick={() => setIsPremiseModalOpen(true)} className="text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/50 px-2 py-1 rounded-full flex items-center gap-1 transition-colors">
                                            <i className="ph-fill ph-sparkle"></i> Gợi ý mẫu
                                        </button>
                                    </div>
                                    <textarea 
                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none placeholder-gray-500" 
                                        rows={4}
                                        placeholder="Nhập ý tưởng của bạn..." 
                                        value={storySettings.premise} 
                                        onChange={e => setStorySettings({...storySettings, premise: e.target.value})} 
                                    />
                                </div>
                            </div>

                            {/* Right: Casting */}
                            <div className="lg:col-span-7">
                                <div className="comic-card p-6 h-full flex flex-col">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                            <span className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center text-pink-400">
                                                <i className="ph-fill ph-users-three text-xl"></i>
                                            </span>
                                            Casting Nhân Vật
                                        </h3>
                                        <button onClick={handleAddCharacter} className="themed-button-secondary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-white/10">
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
                                                    <label className="w-28 flex-shrink-0 bg-black/50 cursor-pointer relative border-r border-white/5">
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

                                                    <div className="flex-grow p-3 flex flex-col min-w-0">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <input type="text" value={char.name} onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} className="bg-transparent border-b border-white/10 focus:border-pink-500 text-white font-bold text-sm focus:outline-none w-32 pb-0.5 transition-colors placeholder-gray-600" placeholder="Tên..." />
                                                            <button onClick={() => handleRemoveCharacter(char.id)} className="text-gray-500 hover:text-red-400 transition"><i className="ph-fill ph-x"></i></button>
                                                        </div>
                                                        <div className="relative flex-grow">
                                                            <textarea className={`w-full h-full bg-white/5 border border-white/5 rounded-lg p-2 text-xs text-gray-400 focus:text-white focus:bg-black/40 transition resize-none ${char.is_analyzing ? 'opacity-30' : ''}`} placeholder="Mô tả ngoại hình (AI tự điền)..." value={char.description} onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} />
                                                            {char.is_analyzing && (
                                                                <div className="absolute inset-0 flex items-center justify-center"><i className="ph-bold ph-spinner animate-spin text-pink-500 text-xl"></i></div>
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
                        <div className="max-w-5xl mx-auto space-y-6">
                            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400"><i className="ph-fill ph-magic-wand text-xl"></i></div>
                                <div>
                                    <h4 className="font-bold text-blue-100">{generationStatus ? generationStatus : 'Kịch bản AI đã sẵn sàng'}</h4>
                                    <p className="text-xs text-blue-200/60">Hãy kiểm tra và chỉnh sửa lời thoại trước khi vẽ.</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {panels.map((panel) => {
                                    const isGeneratingDetails = panel.visual_description.startsWith('(Đang tạo chi tiết');
                                    const isError = panel.visual_description.startsWith('[Lỗi');
                                    return (
                                        <div key={panel.id} className="comic-card p-0 flex flex-col md:flex-row relative overflow-hidden">
                                            {isError && (
                                                <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                                                    <div className="text-center mb-3"><i className="ph-fill ph-warning-circle text-3xl text-red-400 mb-1"></i><p className="text-red-200 font-bold">Lỗi tạo nội dung</p><p className="text-red-300/70 text-xs">Vui lòng thử lại phân cảnh này</p></div>
                                                    <button onClick={() => handleRetryPanel(panel.id)} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full shadow-lg transition-transform transform hover:scale-105 active:scale-95 flex items-center gap-2"><i className="ph-bold ph-arrow-clockwise"></i> Thử lại</button>
                                                </div>
                                            )}
                                            <div className="md:w-1/2 p-4 border-b md:border-b-0 md:border-r border-white/10 bg-black/20">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">PANEL {panel.panel_number}</span>
                                                    <span className="text-[10px] text-gray-500">Visual Description</span>
                                                </div>
                                                <textarea className="w-full h-32 bg-transparent border-none focus:ring-0 text-sm text-gray-300 leading-relaxed resize-none p-0" value={panel.visual_description} onChange={(e) => handleUpdatePanel(panel.id, 'visual_description', e.target.value)} disabled={isGeneratingDetails} />
                                            </div>
                                            <div className="md:w-1/2 p-4 bg-skin-fill-secondary">
                                                <div className="mb-2 text-[10px] font-bold text-gray-500 uppercase">Hội thoại</div>
                                                <div className="space-y-3">
                                                    {Array.isArray(panel.dialogue) && panel.dialogue.map((dia, dIndex) => (
                                                        <div key={dIndex} className="flex gap-2 items-start group">
                                                            <div className="w-24 pt-1"><input className="w-full bg-transparent border-b border-white/10 text-xs font-bold text-yellow-400 focus:border-yellow-500 focus:outline-none text-right px-1 py-1" value={dia.speaker} onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'speaker', e.target.value)} placeholder="Tên" /></div>
                                                            <div className="flex-grow"><textarea className="w-full bg-white/5 border border-white/5 rounded-lg p-2 text-sm text-white focus:border-green-500/50 focus:outline-none transition resize-none" value={dia.text} onChange={(e) => handleUpdateDialogue(panel.id, dIndex, 'text', e.target.value)} rows={2} /></div>
                                                        </div>
                                                    ))}
                                                    {isGeneratingDetails && (!panel.dialogue || panel.dialogue.length === 0) && (
                                                        <div className="flex items-center justify-center py-4 text-xs text-gray-500 gap-2"><i className="ph-bold ph-spinner animate-spin text-pink-500"></i> Đang viết lời thoại...</div>
                                                    )}
                                                    {!isGeneratingDetails && !isError && (!panel.dialogue || panel.dialogue.length === 0) && (
                                                        <p className="text-xs text-gray-600 italic pl-2">Không có lời thoại (Cảnh tĩnh/Hành động)</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: RENDER & EXPORT */}
                    {activeStep === 3 && (
                        <div className="max-w-5xl mx-auto space-y-8">
                            <div className="grid grid-cols-1 gap-8">
                                {panels.map((panel) => {
                                    const isPending = panel.image_url === 'PENDING';
                                    const hasUrl = !!panel.image_url && !isPending;
                                    const loadState = imageLoadStates[panel.id] || 'loading';
                                    const isLoadingImage = loadState === 'loading' && hasUrl;
                                    const isErrorImage = loadState === 'error';

                                    // Dynamic style based on Aspect Ratio
                                    const ratioStyle = { aspectRatio: storySettings.aspectRatio.replace(':', '/') };

                                    return (
                                        <div key={panel.id} className="bg-[#1a1a1a] p-2 shadow-2xl rounded-sm">
                                            <div 
                                                ref={(el) => { panelRefs.current[panel.id] = el; }}
                                                className="relative w-full bg-white overflow-hidden border border-black flex items-center justify-center group mx-auto"
                                                style={ratioStyle}
                                            >
                                                {(!hasUrl && !panel.is_rendering && !isPending) && (
                                                    <div className="absolute inset-0 bg-skin-fill-secondary/90 flex flex-col items-center justify-center z-20">
                                                        <p className="text-gray-400 text-sm mb-4 max-w-md text-center px-4 line-clamp-2">{panel.visual_description}</p>
                                                        <button onClick={() => handleRenderPanel(panel)} className="themed-button-primary px-8 py-3 rounded-full font-bold text-white shadow-xl flex items-center gap-2 transform hover:scale-105 transition-all"><i className="ph-fill ph-paint-brush-broad text-xl"></i> Vẽ Panel Này ({RENDER_COST} 💎)</button>
                                                    </div>
                                                )}
                                                {(panel.is_rendering || isPending || isLoadingImage) && !isErrorImage && (
                                                    <div className="absolute inset-0 bg-skin-fill-secondary/90 flex flex-col items-center justify-center z-20">
                                                        <i className="ph-bold ph-spinner animate-spin text-3xl text-pink-500 mb-2"></i>
                                                        <p className="text-sm text-gray-300">{isLoadingImage ? 'Đang tải ảnh...' : 'AI đang vẽ...'}</p>
                                                    </div>
                                                )}
                                                {isErrorImage && hasUrl && (
                                                     <div className="absolute inset-0 bg-skin-fill-secondary/95 flex flex-col items-center justify-center z-20 p-4 text-center">
                                                        <i className="ph-fill ph-warning-circle text-4xl text-red-500 mb-2"></i>
                                                        <p className="text-sm font-bold text-white mb-1">Không thể tải ảnh</p>
                                                        <div className="flex flex-wrap justify-center gap-2"><button onClick={() => handleReloadImage(panel.id)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold text-white flex items-center gap-2"><i className="ph-bold ph-arrow-clockwise"></i> Tải lại ảnh</button><button onClick={() => handleRenderPanel(panel)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-gray-300 flex items-center gap-2"><i className="ph-bold ph-paint-brush-broad"></i> Vẽ lại</button></div>
                                                    </div>
                                                )}
                                                {hasUrl && (
                                                    <img src={panel.image_url} alt="Panel" className={`w-full h-full object-cover ${isLoadingImage || isErrorImage ? 'opacity-0' : 'opacity-100'}`} onLoad={() => handleImageLoad(panel.id)} onError={() => handleImageError(panel.id)} />
                                                )}
                                                {hasUrl && !isLoadingImage && !isErrorImage && Array.isArray(panel.dialogue) && panel.dialogue.map((dia, idx) => (
                                                    <DraggableBubble key={idx} text={`${dia.speaker && dia.speaker !== 'Lời dẫn' ? dia.speaker + ': ' : ''}${dia.text}`} initialX={50 + (idx * 50)} initialY={50 + (idx * 50)} onUpdate={() => {}} fontFamily={fontStyle} />
                                                ))}
                                                {/* Page Numbering */}
                                                <div className={`absolute bg-white border border-black text-black text-[10px] font-bold px-1.5 py-0.5 z-10 pointer-events-none select-none ${
                                                    storySettings.pageNumbering === 'none' ? 'hidden' : 
                                                    storySettings.pageNumbering === 'bottom-left' ? 'bottom-2 left-2' :
                                                    storySettings.pageNumbering === 'bottom-center' ? 'bottom-2 left-1/2 -translate-x-1/2' :
                                                    'bottom-2 right-2'
                                                }`}>
                                                    {panel.panel_number}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <div className="px-6 py-4 border-t border-white/10 bg-[#181820] flex flex-col md:flex-row items-center justify-between gap-4 z-20">
                    <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-start">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ước tính chi phí</span>
                            <div className="text-white font-bold flex items-center gap-1.5">
                                {activeStep === 1 ? (
                                    <><span className="text-pink-400 text-xl">2</span><i className="ph-fill ph-diamonds-four text-pink-400 text-xs"></i><span className="text-xs font-medium text-gray-500 ml-1">cho Kịch bản</span></>
                                ) : (
                                    <><span className="text-purple-400 text-xl">{RENDER_COST}</span><i className="ph-fill ph-diamonds-four text-purple-400 text-xs"></i><span className="text-xs font-medium text-gray-500 ml-1">/ 1 Ảnh</span></>
                                )}
                            </div>
                        </div>
                        {isLoading && activeStep === 1 && (
                            <span className="text-xs text-yellow-400 animate-pulse ml-4 flex items-center gap-1"><i className="ph-bold ph-spinner animate-spin"></i> {generationStatus || "Đang xử lý..."}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-end">
                        {activeStep > 1 && (
                            <button onClick={() => setActiveStep(prev => (prev - 1) as any)} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-sm transition-colors flex items-center gap-2 border border-white/5"><i className="ph-bold ph-caret-left"></i> Quay lại</button>
                        )}
                        {activeStep === 3 && (
                            <button onClick={handleExportPDF} disabled={isLoading} className="px-5 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-bold text-sm transition-all shadow-lg shadow-red-900/20 flex items-center gap-2">{isLoading ? <i className="ph-bold ph-spinner animate-spin"></i> : <i className="ph-bold ph-file-pdf"></i>} Xuất PDF</button>
                        )}
                        <button onClick={activeStep === 1 ? handleGenerateScript : () => setActiveStep(3)} disabled={isLoading || (activeStep === 3)} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 shadow-lg ${activeStep === 3 ? 'bg-green-600 text-white cursor-default opacity-50' : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-pink-500/25'} disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}>
                            {isLoading ? <i className="ph-bold ph-spinner animate-spin text-lg"></i> : activeStep === 3 ? <>Hoàn Tất <i className="ph-bold ph-check"></i></> : <>{activeStep === 1 ? 'Tạo Kịch Bản' : 'Vào Xưởng Vẽ'} <i className="ph-bold ph-arrow-right"></i></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComicStudio;