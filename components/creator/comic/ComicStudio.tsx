
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import SettingsBlock from '../ai-tool/SettingsBlock';
import Modal from '../../common/Modal';
import { COMIC_PREMISES } from '../../../constants/comicPremises';

// --- CONSTANTS ---

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

const DIALOGUE_AMOUNTS = [
    { label: 'Ít (Visual Focus)', value: 'Ít (Visual Focus)' },
    { label: 'Vừa phải', value: 'Vừa phải' },
    { label: 'Nhiều (Story Focus)', value: 'Nhiều (Story Focus)' }
];

const COVER_OPTIONS = [
    { label: 'Không có', value: 'none' },
    { label: 'Bắt đầu (Trang 1)', value: 'start' },
    { label: 'Kết thúc (Trang cuối)', value: 'end' },
    { label: 'Bắt đầu - Kết thúc', value: 'both' }
];

const RENDER_COST = 10; 
const MAX_CHARACTERS = 12; // Updated limit per user request

// --- SUB-COMPONENTS ---

interface ComicSelectProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: (string | { label: string, value: string, family?: string })[];
    className?: string;
    previewFont?: boolean;
}

const ComicSelect: React.FC<ComicSelectProps> = ({ label, value, onChange, options, className = "", previewFont = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const normalizedOptions = options.map(opt => 
        typeof opt === 'string' ? { label: opt, value: opt } : opt
    );

    const selectedOption = normalizedOptions.find(o => o.value === value) || normalizedOptions[0] || { label: 'Select', value: '' };

    return (
        <div className={`relative ${className}`} ref={ref}>
            <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">{label}</label>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between bg-[#1E1B25] border ${isOpen ? 'border-pink-500 ring-1 ring-pink-500/50' : 'border-white/10 hover:border-white/30'} rounded-lg px-3 py-2.5 text-sm text-white transition-all duration-200`}
            >
                <span className="truncate" style={previewFont && (selectedOption as any).family ? { fontFamily: (selectedOption as any).family } : {}}>
                    {selectedOption.label}
                </span>
                <i className={`ph-fill ph-caret-down text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-pink-500' : ''}`}></i>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#181820]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar animate-fade-in-up">
                    {normalizedOptions.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between group
                                ${value === opt.value 
                                    ? 'bg-pink-500/20 text-pink-300 font-semibold' 
                                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                                }
                            `}
                            style={previewFont && (opt as any).family ? { fontFamily: (opt as any).family } : {}}
                        >
                            <span>{opt.label}</span>
                            {value === opt.value && <i className="ph-fill ph-check text-pink-500"></i>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

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

interface DraggableBubbleProps {
    text: string;
    initialX: number;
    initialY: number;
    onUpdate: (x: number, y: number) => void;
    fontFamily: string;
}

const DraggableBubble: React.FC<DraggableBubbleProps> = ({ 
    text, 
    initialX, 
    initialY, 
    onUpdate,
    fontFamily
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

interface ComicStudioProps {
    onInstructionClick?: () => void;
}

const ComicStudio: React.FC<ComicStudioProps> = ({ onInstructionClick }) => {
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
        dialogueAmount: DIALOGUE_AMOUNTS[1].value,
        pageCount: 1,
        premise: '',
        colorFormat: COLOR_FORMATS[0].value,
        bubbleFont: BUBBLE_FONTS[0],
        aspectRatio: ASPECT_RATIOS[0].value,
        visualEffect: VISUAL_EFFECTS[0].value,
        pageNumbering: PAGE_NUMBERING[0].value,
        coverPage: COVER_OPTIONS[0].value
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
        if (characters.length >= MAX_CHARACTERS) {
            showToast(`Tối đa ${MAX_CHARACTERS} nhân vật.`, "error");
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

            // PHASE 2: EXPAND EACH PANEL WITH MEMORY
            const completedPanelsData: any[] = [];

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
                            language: storySettings.language,
                            previous_panels: completedPanelsData // PASS PREVIOUS CONTEXT
                        })
                    });
                    
                    if (expandRes.ok) {
                        const details = await expandRes.json();
                        
                        const completedPanel = {
                            panel_number: p.panel_number,
                            visual_description: details.visual_description,
                            dialogue: details.dialogue
                        };
                        completedPanelsData.push(completedPanel);

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
                    language: storySettings.language,
                    previous_panels: panels.filter(p => p.panel_number < panelToRetry.panel_number && !p.visual_description.startsWith('(')).map(p => ({
                        panel_number: p.panel_number,
                        visual_description: p.visual_description,
                        dialogue: p.dialogue
                    }))
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

    const capturePanel = async (panelId: string, panelEl: HTMLElement): Promise<string | null> => {
        const imgEl = panelEl.querySelector('img');
        if (!imgEl) return null;

        const originalSrc = imgEl.src;
        try {
            const response = await fetch(originalSrc);
            const blob = await response.blob();
            
            const base64Url = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });

            imgEl.src = base64Url;
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(panelEl, { 
                useCORS: true, 
                scale: 2,
                logging: false,
                backgroundColor: null
            });

            imgEl.src = originalSrc;
            return canvas.toDataURL('image/png', 0.9);
        } catch (e) {
            console.error(`Failed to capture panel ${panelId}`, e);
            imgEl.src = originalSrc;
            return null;
        }
    };

    const handleExportPDF = async () => {
        setIsLoading(true);
        showToast("Đang tạo PDF, vui lòng đợi...", "success");
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            let yOffset = 10;
            
            for (let i = 0; i < panels.length; i++) {
                const panelEl = panelRefs.current[panels[i].id];
                if (panelEl && panels[i].image_url) {
                    const imgData = await capturePanel(panels[i].id, panelEl);
                    if (imgData) {
                        const imgProps = pdf.getImageProperties(imgData);
                        const pdfWidth = 190;
                        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                        if (yOffset + pdfHeight > 280) {
                            pdf.addPage();
                            yOffset = 10;
                        }
                        pdf.addImage(imgData, 'PNG', 10, yOffset, pdfWidth, pdfHeight);
                        yOffset += pdfHeight + 10;
                    }
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

    const handleDownloadZip = async () => {
        setIsLoading(true);
        showToast("Đang nén ảnh, vui lòng đợi...", "success");
        
        try {
            const zip = new JSZip();
            const folder = zip.folder("audition-comic");
            let count = 0;
            for (let i = 0; i < panels.length; i++) {
                const panel = panels[i];
                const panelEl = panelRefs.current[panel.id];
                if (panelEl && panel.image_url) {
                    const imgData = await capturePanel(panel.id, panelEl);
                    if (imgData) {
                        const base64Data = imgData.split(',')[1];
                        folder?.file(`panel-${panel.panel_number}.png`, base64Data, { base64: true });
                        count++;
                    }
                }
            }

            if (count > 0) {
                const content = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement("a");
                a.href = url;
                a.download = `audition-comic-${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("Tải xuống thành công!", "success");
            } else {
                showToast("Không có ảnh nào để tải.", "error");
            }
        } catch (e: any) {
            console.error("ZIP generation failed:", e);
            showToast("Lỗi khi tạo file ZIP.", "error");
        } finally {
            setIsLoading(false);
        }
    }

    const handleSelectPremise = (premise: string) => {
        setStorySettings({ ...storySettings, premise });
        setIsPremiseModalOpen(false);
    };

    const handleImageLoad = (panelId: string) => setImageLoadStates(prev => ({ ...prev, [panelId]: 'loaded' }));
    const handleImageError = (panelId: string) => setImageLoadStates(prev => ({ ...prev, [panelId]: 'error' }));
    const handleReloadImage = (panelId: string) => {
        setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.image_url) return p;
            try {
                const url = new URL(p.image_url);
                url.searchParams.set('t', Date.now().toString());
                return { ...p, image_url: url.toString() };
            } catch (e) { return p; }
        }));
        setImageLoadStates(prev => ({ ...prev, [panelId]: 'loading' }));
    };

    const fontStyle = storySettings.bubbleFont.family;

    return (
        <div className="animate-fade-in h-[calc(100vh-140px)] min-h-[600px] flex flex-col max-w-7xl mx-auto">
            <style>{`
                .bubble-tail::after { content: ''; position: absolute; bottom: -8px; left: 20px; border-width: 8px 8px 0; border-style: solid; border-color: black transparent; display: block; width: 0; }
                .bubble-tail::before { content: ''; position: absolute; bottom: -5px; left: 22px; border-width: 6px 6px 0; border-style: solid; border-color: white transparent; display: block; width: 0; z-index: 1; }
                .comic-card { background: var(--color-fill-secondary); border: 1px solid var(--color-border); border-radius: 1rem; overflow: hidden; transition: all 0.3s ease; }
                .comic-card:hover { border-color: var(--color-border-accent); box-shadow: var(--shadow-accent); }
            `}</style>

            <Modal isOpen={isPremiseModalOpen} onClose={() => setIsPremiseModalOpen(false)} title={`Gợi ý: ${storySettings.genre}`}>
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {COMIC_PREMISES[storySettings.genre]?.map((p, idx) => (
                        <button key={idx} onClick={() => handleSelectPremise(p)} className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-pink-500/50 transition-all text-sm text-gray-300 hover:text-white">
                            <span className="font-bold text-pink-400 mr-2">#{idx + 1}</span>{p}
                        </button>
                    ))}
                    {!COMIC_PREMISES[storySettings.genre] && <p className="text-center text-gray-500 italic">Chưa có gợi ý cho thể loại này.</p>}
                </div>
            </Modal>

            <div className="flex-grow bg-[#12121A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
                <div className="px-6 py-4 border-b border-white/10 bg-[#181820] flex justify-center">
                    <StepIndicator currentStep={activeStep} />
                </div>

                <div className="flex-grow overflow-y-auto p-6 custom-scrollbar bg-[#0f0f13]">
                    {/* FEATURE BADGES */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex items-center gap-3 shadow-lg shadow-emerald-500/5">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shrink-0">
                                <i className="ph-fill ph-lightning text-xl"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-emerald-100 text-sm">Story Memory & Plot Logic</h4>
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">HOT</span>
                                </div>
                                <p className="text-[11px] text-emerald-200/70 leading-tight">AI ghi nhớ diễn biến cốt truyện để phát triển tâm lý nhân vật sâu sắc hơn.</p>
                            </div>
                        </div>
                        <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl flex items-center gap-3 shadow-lg shadow-orange-500/5">
                            <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 shrink-0">
                                <i className="ph-fill ph-fire text-xl"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-orange-100 text-sm">Character Consistency</h4>
                                    <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">ESSENTIAL</span>
                                </div>
                                <p className="text-[11px] text-orange-200/70 leading-tight">Hệ thống hỗ trợ tối đa <strong>{MAX_CHARACTERS} nhân vật</strong> tham chiếu. Độ đồng bộ 95-100%.</p>
                            </div>
                        </div>
                    </div>

                    {/* STEP 1: SETUP */}
                    {activeStep === 1 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-5 space-y-6">
                                <SettingsBlock title="Cấu Hình Truyện" instructionKey="comic-studio" onInstructionClick={() => onInstructionClick && onInstructionClick()}>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="THỂ LOẠI" value={storySettings.genre} onChange={(val) => setStorySettings({...storySettings, genre: val})} options={GENRES} />
                                            <ComicSelect label="NGÔN NGỮ" value={storySettings.language} onChange={(val) => setStorySettings({...storySettings, language: val})} options={LANGUAGES} />
                                        </div>
                                        <ComicSelect label="PHONG CÁCH VẼ" value={storySettings.artStyle} onChange={(val) => setStorySettings({...storySettings, artStyle: val})} options={ART_STYLES} />
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="ĐỊNH DẠNG MÀU" value={storySettings.colorFormat} onChange={(val) => setStorySettings({...storySettings, colorFormat: val})} options={COLOR_FORMATS} />
                                            <ComicSelect label="KIỂU PHÔNG CHỮ BONG BÓNG" value={storySettings.bubbleFont.value} onChange={(val) => setStorySettings({...storySettings, bubbleFont: BUBBLE_FONTS.find(f => f.value === val) || BUBBLE_FONTS[0]})} options={BUBBLE_FONTS} previewFont={true} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="TỶ LỆ KHUNG HÌNH" value={storySettings.aspectRatio} onChange={(val) => setStorySettings({...storySettings, aspectRatio: val})} options={ASPECT_RATIOS} />
                                            <ComicSelect label="HIỆU ỨNG HÌNH ẢNH" value={storySettings.visualEffect} onChange={(val) => setStorySettings({...storySettings, visualEffect: val})} options={VISUAL_EFFECTS} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="LƯỢNG THOẠI" value={storySettings.dialogueAmount} onChange={(val) => setStorySettings({...storySettings, dialogueAmount: val})} options={DIALOGUE_AMOUNTS} />
                                            <div>
                                                <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">SỐ TRANG</label>
                                                <div className="flex items-center bg-[#1E1B25] border border-white/10 rounded-lg px-3 py-2.5">
                                                    <input type="number" className="bg-transparent text-white text-sm w-full focus:outline-none font-bold text-center" min={1} max={10} value={storySettings.pageCount} onChange={e => setStorySettings({...storySettings, pageCount: parseInt(e.target.value)})} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="VỊ TRÍ SỐ TRANG" value={storySettings.pageNumbering} onChange={(val) => setStorySettings({...storySettings, pageNumbering: val})} options={PAGE_NUMBERING} />
                                            <ComicSelect label="TẠO TRANG BÌA" value={storySettings.coverPage} onChange={(val) => setStorySettings({...storySettings, coverPage: val})} options={COVER_OPTIONS} />
                                        </div>
                                    </div>
                                </SettingsBlock>

                                <div className="bg-gradient-to-b from-indigo-900/30 to-purple-900/30 p-5 rounded-2xl border border-indigo-500/30 shadow-lg">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2"><i className="ph-fill ph-lightbulb text-indigo-400"></i> Ý Tưởng Cốt Truyện</h3>
                                        <button onClick={() => setIsPremiseModalOpen(true)} className="text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/50 px-2 py-1 rounded-full flex items-center gap-1 transition-colors"><i className="ph-fill ph-sparkle"></i> Gợi ý mẫu</button>
                                    </div>
                                    <textarea className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none placeholder-gray-500" rows={4} placeholder="Nhập ý tưởng của bạn..." value={storySettings.premise} onChange={e => setStorySettings({...storySettings, premise: e.target.value})} />
                                </div>
                            </div>

                            <div className="lg:col-span-7">
                                <div className="comic-card p-6 h-full flex flex-col">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                            <span className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center text-pink-400"><i className="ph-fill ph-users-three text-xl"></i></span> Casting Nhân Vật
                                        </h3>
                                        <button onClick={handleAddCharacter} className="themed-button-secondary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-white/10"><i className="ph-bold ph-plus"></i> Thêm</button>
                                    </div>

                                    {characters.length === 0 ? (
                                        <div className="flex-grow flex flex-col items-center justify-center text-center py-20 border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
                                            <div className="w-20 h-20 bg-skin-fill-secondary rounded-full flex items-center justify-center mb-4 animate-bounce"><i className="ph-fill ph-user-plus text-4xl text-skin-muted"></i></div>
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
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-1"><i className="ph-fill ph-camera text-2xl"></i><span className="text-[10px] font-bold">UPLOAD</span></div>
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
                                                                <div className="absolute inset-0 flex items-center justify-center flex-col bg-black/60 backdrop-blur-sm text-white">
                                                                    <i className="ph-bold ph-scan animate-spin text-pink-500 text-xl mb-1"></i>
                                                                    <span className="text-[10px] font-bold">Đang phân tích...</span>
                                                                </div>
                                                            )}
                                                            {/* New Retry Button */}
                                                            {!char.is_analyzing && !char.description && char.image_url && (
                                                                <button 
                                                                    onClick={() => char.image_file && handleCharacterImageUpload(char.id, char.image_file)}
                                                                    className="absolute bottom-2 right-2 text-[10px] bg-red-500/20 text-red-300 px-2 py-1 rounded border border-red-500/50 hover:bg-red-500/30 flex items-center gap-1 z-10 transition-all"
                                                                >
                                                                    <i className="ph-bold ph-arrow-clockwise"></i> Thử lại
                                                                </button>
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
                                                    {isGeneratingDetails && (!panel.dialogue || panel.dialogue.length === 0) && <div className="flex items-center justify-center py-4 text-xs text-gray-500 gap-2"><i className="ph-bold ph-spinner animate-spin text-pink-500"></i> Đang viết lời thoại...</div>}
                                                    {!isGeneratingDetails && !isError && (!panel.dialogue || panel.dialogue.length === 0) && <p className="text-xs text-gray-600 italic pl-2">Không có lời thoại (Cảnh tĩnh/Hành động)</p>}
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
                                    const ratioStyle = { aspectRatio: storySettings.aspectRatio.replace(':', '/') };

                                    return (
                                        <div key={panel.id} className="bg-[#1a1a1a] p-2 shadow-2xl rounded-sm">
                                            <div ref={(el) => { panelRefs.current[panel.id] = el; }} className="relative w-full bg-white overflow-hidden border border-black flex items-center justify-center group mx-auto" style={ratioStyle}>
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
                                                {hasUrl && <img src={panel.image_url} alt="Panel" className={`w-full h-full object-cover ${isLoadingImage || isErrorImage ? 'opacity-0' : 'opacity-100'}`} onLoad={() => handleImageLoad(panel.id)} onError={() => handleImageError(panel.id)} />}
                                                {hasUrl && !isLoadingImage && !isErrorImage && Array.isArray(panel.dialogue) && panel.dialogue.map((dia, idx) => (
                                                    <DraggableBubble key={idx} text={`${dia.speaker && dia.speaker !== 'Lời dẫn' ? dia.speaker + ': ' : ''}${dia.text}`} initialX={50 + (idx * 50)} initialY={50 + (idx * 50)} onUpdate={() => {}} fontFamily={fontStyle} />
                                                ))}
                                                <div className={`absolute bg-white border border-black text-black text-[10px] font-bold px-1.5 py-0.5 z-10 pointer-events-none select-none ${storySettings.pageNumbering === 'none' ? 'hidden' : storySettings.pageNumbering === 'bottom-left' ? 'bottom-2 left-2' : storySettings.pageNumbering === 'bottom-center' ? 'bottom-2 left-1/2 -translate-x-1/2' : 'bottom-2 right-2'}`}>{panel.panel_number}</div>
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
                            <>
                                <button onClick={handleDownloadZip} disabled={isLoading} className="px-5 py-2.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2">{isLoading ? <i className="ph-bold ph-spinner animate-spin"></i> : <i className="ph-bold ph-file-archive"></i>} Tải Ảnh (ZIP)</button>
                                <button onClick={handleExportPDF} disabled={isLoading} className="px-5 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-bold text-sm transition-all shadow-lg shadow-red-900/20 flex items-center gap-2">{isLoading ? <i className="ph-bold ph-spinner animate-spin"></i> : <i className="ph-bold ph-file-pdf"></i>} Xuất PDF</button>
                            </>
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
