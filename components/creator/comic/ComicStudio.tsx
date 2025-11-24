
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
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
    { label: 'Manga (Đen Trắng)', value: 'Manga Black and White, Screen tones, High Contrast' },
    { label: 'Webtoon (Hàn Quốc)', value: 'Korean Webtoon Manhwa, Full Color, Digital Art, High Quality' },
    { label: 'Comic (Âu Mỹ)', value: 'American Comic Book, Bold Lines, Dynamic Colors' },
    { label: 'Anime (Nhật Bản)', value: 'Anime Style, Kyoto Animation Quality' },
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
    'Tiếng Việt', 'Tiếng Anh', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc'
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
    { label: 'AI Tự Động (Khuyên dùng)', value: 'auto', family: 'sans-serif' },
    { label: 'Dễ thương / Tròn', value: 'font-mali', family: '"Mali", cursive' },
    { label: 'Anime Standard', value: 'font-anime', family: 'sans-serif' }
];

const ASPECT_RATIOS = [
    { label: '9:16 (Điện thoại)', value: '9:16' },
    { label: '1:1 (Vuông)', value: '1:1' },
    { label: '3:4 (Chân dung)', value: '3:4' },
    { label: '4:3 (Phong cảnh)', value: '4:3' },
    { label: '16:9 (Điện ảnh)', value: '16:9' }
];

const VISUAL_EFFECTS = [
    { label: 'Tự động (Theo ngữ cảnh)', value: 'auto' },
    { label: 'Không có', value: 'none' },
    { label: 'Vụ nổ hoành tráng', value: 'Epic Explosion background' },
    { label: 'Đường Tốc Độ (Anime)', value: 'Anime Speed Lines' },
    { label: 'Máu me/Tối', value: 'Dark and Gore atmosphere' },
    { label: 'Hạt ma thuật', value: 'Magical Particles' },
    { label: 'Hiệu ứng trục trặc', value: 'Glitch Effect' },
    { label: 'Làm mờ chuyển động', value: 'Dynamic Motion Blur' },
    { label: 'Kinh dị tâm lý', value: 'Psychological Horror vignette' }
];

const DIALOGUE_AMOUNTS = [
    { label: 'Ít (Visual Focus)', value: 'Minimal' },
    { label: 'Vừa phải', value: 'Moderate' },
    { label: 'Nhiều (Story Focus)', value: 'Heavy' }
];

const COVER_OPTIONS = [
    { label: 'Tự động tạo bìa', value: 'start' },
    { label: 'Không có', value: 'none' }
];

const RENDER_COST = 10; 
const MAX_CHARACTERS = 12;

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

// --- SCRIPT EDITOR COMPONENTS ---

interface PanelData {
    panel_id: number;
    description: string;
    dialogues: { speaker: string; text: string }[];
}

interface ScriptPage {
    layout_note: string;
    panels: PanelData[];
}

const ProfessionalScriptEditor: React.FC<{ 
    panel: ComicPanel; 
    onUpdate: (updatedJsonString: string) => void;
}> = ({ panel, onUpdate }) => {
    const [pageData, setPageData] = useState<ScriptPage | null>(null);
    const [isParsingError, setIsParsingError] = useState(false);

    useEffect(() => {
        try {
            if (!panel.visual_description || panel.visual_description.startsWith('(') || panel.visual_description.startsWith('[')) {
                setPageData(null); // Still generating or error string
                setIsParsingError(true);
                return;
            }
            const parsed = JSON.parse(panel.visual_description);
            setPageData(parsed);
            setIsParsingError(false);
        } catch (e) {
            setPageData(null);
            setIsParsingError(true);
        }
    }, [panel.visual_description]);

    const updatePage = (newData: ScriptPage) => {
        setPageData(newData);
        onUpdate(JSON.stringify(newData));
    };

    const handlePanelDescChange = (idx: number, val: string) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        newPanels[idx].description = val;
        updatePage({ ...pageData, panels: newPanels });
    };

    const handleDialogueChange = (panelIdx: number, diaIdx: number, field: 'speaker' | 'text', val: string) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        const newDialogues = [...newPanels[panelIdx].dialogues];
        newDialogues[diaIdx] = { ...newDialogues[diaIdx], [field]: val };
        newPanels[panelIdx].dialogues = newDialogues;
        updatePage({ ...pageData, panels: newPanels });
    };

    const addDialogue = (panelIdx: number) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        newPanels[panelIdx].dialogues.push({ speaker: 'Nhân vật', text: '...' });
        updatePage({ ...pageData, panels: newPanels });
    }

    const removeDialogue = (panelIdx: number, diaIdx: number) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        newPanels[panelIdx].dialogues.splice(diaIdx, 1);
        updatePage({ ...pageData, panels: newPanels });
    }

    if (isParsingError || !pageData) {
        return (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10 text-center">
                <p className="text-gray-400 text-sm mb-2">Dữ liệu kịch bản dạng thô (Raw) hoặc đang tạo...</p>
                <textarea 
                    className="w-full h-64 bg-black/30 text-gray-300 p-2 rounded border border-white/10 text-xs font-mono"
                    value={panel.visual_description}
                    onChange={(e) => onUpdate(e.target.value)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Layout Note */}
            <div className="bg-[#1E1B25] p-3 rounded-lg border border-white/10 flex items-center gap-2">
                <i className="ph-fill ph-layout text-purple-400"></i>
                <input 
                    className="bg-transparent w-full text-sm text-purple-200 focus:outline-none font-semibold"
                    value={pageData.layout_note || ''}
                    onChange={(e) => updatePage({ ...pageData, layout_note: e.target.value })}
                    placeholder="Mô tả bố cục trang..."
                />
            </div>

            {/* Panels List */}
            {pageData.panels.map((p, idx) => (
                <div key={idx} className="bg-[#1E1B25] border border-white/10 rounded-xl overflow-hidden shadow-sm hover:border-pink-500/30 transition-colors">
                    <div className="bg-black/20 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                        <span className="text-xs font-bold text-pink-400 uppercase tracking-wider">Khung {p.panel_id}</span>
                        <span className="text-[10px] text-gray-600 uppercase font-bold">Kịch bản chi tiết</span>
                    </div>
                    
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Description */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Mô tả hình ảnh (Visual)</label>
                            <textarea 
                                className="w-full h-24 bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition resize-none"
                                value={p.description}
                                onChange={(e) => handlePanelDescChange(idx, e.target.value)}
                                placeholder="Mô tả bối cảnh, hành động, góc máy..."
                            />
                        </div>

                        {/* Right: Dialogues */}
                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block">Lời thoại (Dialogue)</label>
                                <button onClick={() => addDialogue(idx)} className="text-[10px] bg-green-600/20 text-green-400 px-2 py-0.5 rounded hover:bg-green-600/40 transition">+ Thêm thoại</button>
                            </div>
                            
                            <div className="space-y-2 max-h-24 overflow-y-auto custom-scrollbar">
                                {p.dialogues.map((d, dIdx) => (
                                    <div key={dIdx} className="flex gap-2 items-center">
                                        <input 
                                            className="w-1/3 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-yellow-400 font-bold focus:border-yellow-500 outline-none text-right"
                                            value={d.speaker}
                                            onChange={(e) => handleDialogueChange(idx, dIdx, 'speaker', e.target.value)}
                                            placeholder="Tên"
                                        />
                                        <input 
                                            className="flex-grow bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-white outline-none"
                                            value={d.text}
                                            onChange={(e) => handleDialogueChange(idx, dIdx, 'text', e.target.value)}
                                            placeholder="Nội dung..."
                                        />
                                        <button onClick={() => removeDialogue(idx, dIdx)} className="text-red-500 hover:text-red-400 text-xs px-1"><i className="ph-fill ph-x"></i></button>
                                    </div>
                                ))}
                                {p.dialogues.length === 0 && <p className="text-xs text-gray-600 italic text-center py-2">Không có lời thoại</p>}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
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
        title: '', 
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

    // Helper: Process a SINGLE panel/page
    const processSinglePanelScript = async (panel: any, previousPanelsData: any[]) => {
        try {
            const expandRes = await fetch('/.netlify/functions/comic-expand-panel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ 
                    plot_summary: panel.plot_summary,
                    characters: characters,
                    style: storySettings.artStyle,
                    genre: storySettings.genre,
                    language: storySettings.language,
                    previous_panels: previousPanelsData 
                })
            });
            
            if (expandRes.ok) {
                const data = await expandRes.json();
                // Ensure we get stringified JSON back for storage consistency
                const scriptData = data.script_data; 
                return {
                    // Store JSON object as string for visual_description field
                    visual_description: JSON.stringify(scriptData) 
                };
            } else {
                throw new Error(`Server Error: ${expandRes.status}`);
            }
        } catch (e: any) {
            console.error(`Error expanding page ${panel.panel_number}`, e);
            throw e;
        }
    };

    const handleGenerateScript = async () => {
        if (characters.length === 0) return showToast("Cần ít nhất 1 nhân vật.", "error");
        if (!storySettings.premise.trim()) return showToast("Vui lòng nhập ý tưởng câu chuyện.", "error");
        if (!storySettings.title.trim()) return showToast("Vui lòng nhập Tên Truyện.", "error");
        
        const missingDesc = characters.find(c => !c.description);
        if (missingDesc) return showToast(`Vui lòng upload ảnh cho ${missingDesc.name} để AI phân tích ngoại hình.`, "error");

        setIsLoading(true);
        setGenerationStatus("Đang lên cấu trúc cốt truyện (Gemini 2.5 Pro)...");

        try {
            // PHASE 1: GENERATE OUTLINE (PAGES)
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
                visual_description: `(Đang chờ xử lý: ${p.plot_summary}...)`,
                plot_summary: p.plot_summary,
                dialogue: [],
                is_rendering: false
            }));
            
            setPanels(initialPanels);
            setActiveStep(2);

            // PHASE 2: EXPAND EACH PAGE WITH SEQUENTIAL QUEUE
            const completedPanelsData: any[] = [];

            for (let i = 0; i < outline.length; i++) {
                const p = outline[i];
                setGenerationStatus(`Đang viết chi tiết TRANG ${p.panel_number}/${outline.length}... (Gemini 2.5 Pro)`);
                
                if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    const recentContext = completedPanelsData.slice(-3);
                    const details = await processSinglePanelScript(p, recentContext);
                    
                    completedPanelsData.push(details); // Store for context

                    setPanels(prev => prev.map(panel => 
                        panel.panel_number === p.panel_number 
                        ? { 
                            ...panel, 
                            visual_description: details.visual_description, // Stores JSON string
                            dialogue: [] // Dialogues are now inside JSON
                          }
                        : panel
                    ));
                } catch (expandErr) {
                    setPanels(prev => prev.map(panel => 
                        panel.panel_number === p.panel_number 
                        ? { ...panel, visual_description: `[Lỗi kết nối] Không thể tạo kịch bản.` }
                        : panel
                    ));
                }
            }

            showToast("Quy trình tạo kịch bản đã kết thúc.", "success");

        } catch (e: any) {
            showToast(e.message, "error");
        } finally {
            setIsLoading(false);
            setGenerationStatus("");
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
                    storyTitle: storySettings.title, 
                    style: storySettings.artStyle,
                    colorFormat: storySettings.colorFormat,
                    visualEffect: storySettings.visualEffect,
                    aspectRatio: storySettings.aspectRatio,
                    isCover: panel.panel_number === 1 && storySettings.coverPage !== 'none'
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
                        showToast(`Đã vẽ xong trang #${panel.panel_number}!`, "success");
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

    const handleDownloadZip = async () => {
        setIsLoading(true);
        showToast("Đang nén ảnh...", "success");
        try {
            const zip = new JSZip();
            const folder = zip.folder("audition-comic");
            let count = 0;
            for (let i = 0; i < panels.length; i++) {
                const panel = panels[i];
                if (panel.image_url) {
                    const response = await fetch(panel.image_url);
                    const blob = await response.blob();
                    folder?.file(`page-${panel.panel_number}.png`, blob);
                    count++;
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
            }
        } catch (e: any) {
            showToast("Lỗi khi tải.", "error");
        } finally {
            setIsLoading(false);
        }
    }

    const handleDownloadPDF = async () => {
        setIsLoading(true);
        showToast("Đang tạo PDF...", "success");
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let hasContent = false;

            for (let i = 0; i < panels.length; i++) {
                const panel = panels[i];
                if (panel.image_url && panel.image_url !== 'PENDING') {
                    if (hasContent) pdf.addPage();
                    
                    const imgData = await fetch(panel.image_url)
                        .then(res => res.blob())
                        .then(blob => new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        }));

                    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight); // Fit to page for simplicity or maintain ratio
                    hasContent = true;
                }
            }

            if (hasContent) pdf.save(`comic-${Date.now()}.pdf`);
        } catch (e) {
            showToast("Lỗi tạo PDF.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectPremise = (premise: string) => {
        setStorySettings({ ...storySettings, premise });
        setIsPremiseModalOpen(false);
    };

    return (
        <div className="animate-fade-in h-[calc(100vh-140px)] min-h-[600px] flex flex-col max-w-7xl mx-auto">
            <Modal isOpen={isPremiseModalOpen} onClose={() => setIsPremiseModalOpen(false)} title={`Gợi ý: ${storySettings.genre}`}>
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {COMIC_PREMISES[storySettings.genre]?.map((p, idx) => (
                        <button key={idx} onClick={() => handleSelectPremise(p)} className="w-full text-left p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-pink-500/50 transition-all text-sm text-gray-300 hover:text-white">
                            <span className="font-bold text-pink-400 mr-2">#{idx + 1}</span>{p}
                        </button>
                    ))}
                </div>
            </Modal>

            <div className="flex-grow bg-[#12121A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
                <div className="px-6 py-4 border-b border-white/10 bg-[#181820] flex justify-center">
                    <StepIndicator currentStep={activeStep} />
                </div>

                <div className="flex-grow overflow-y-auto p-6 custom-scrollbar bg-[#0f0f13]">
                    {/* STEP 1: SETUP */}
                    {activeStep === 1 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-5 space-y-6">
                                <SettingsBlock title="Cấu Hình Truyện" instructionKey="comic-studio" onInstructionClick={() => onInstructionClick && onInstructionClick()}>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">TÊN TRUYỆN</label>
                                            <input 
                                                type="text" 
                                                className="w-full bg-[#1E1B25] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none font-bold"
                                                placeholder="Nhập tên bộ truyện..."
                                                value={storySettings.title}
                                                onChange={e => setStorySettings({...storySettings, title: e.target.value})}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="THỂ LOẠI" value={storySettings.genre} onChange={(val) => setStorySettings({...storySettings, genre: val})} options={GENRES} />
                                            <ComicSelect label="NGÔN NGỮ" value={storySettings.language} onChange={(val) => setStorySettings({...storySettings, language: val})} options={LANGUAGES} />
                                        </div>
                                        <ComicSelect label="PHONG CÁCH VẼ" value={storySettings.artStyle} onChange={(val) => setStorySettings({...storySettings, artStyle: val})} options={ART_STYLES} />
                                        <div className="grid grid-cols-2 gap-4">
                                            <ComicSelect label="MÀU SẮC" value={storySettings.colorFormat} onChange={(val) => setStorySettings({...storySettings, colorFormat: val})} options={COLOR_FORMATS} />
                                            <ComicSelect label="TỶ LỆ" value={storySettings.aspectRatio} onChange={(val) => setStorySettings({...storySettings, aspectRatio: val})} options={ASPECT_RATIOS} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">SỐ TRANG (PAGE)</label>
                                            <div className="flex items-center bg-[#1E1B25] border border-white/10 rounded-lg px-3 py-2.5">
                                                <input type="number" className="bg-transparent text-white text-sm w-full focus:outline-none font-bold text-center" min={1} max={20} value={storySettings.pageCount} onChange={e => setStorySettings({...storySettings, pageCount: parseInt(e.target.value)})} />
                                            </div>
                                        </div>
                                    </div>
                                </SettingsBlock>

                                <div className="bg-gradient-to-b from-indigo-900/30 to-purple-900/30 p-5 rounded-2xl border border-indigo-500/30 shadow-lg">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2"><i className="ph-fill ph-lightbulb text-indigo-400"></i> Ý Tưởng Cốt Truyện</h3>
                                        <button onClick={() => setIsPremiseModalOpen(true)} className="text-xs bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/50 px-2 py-1 rounded-full flex items-center gap-1 transition-colors"><i className="ph-fill ph-sparkle"></i> Gợi ý</button>
                                    </div>
                                    <textarea className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition resize-none placeholder-gray-500" rows={4} placeholder="Nhập ý tưởng của bạn..." value={storySettings.premise} onChange={e => setStorySettings({...storySettings, premise: e.target.value})} />
                                </div>
                            </div>

                            <div className="lg:col-span-7">
                                <div className="bg-[#1E1B25] p-6 rounded-xl border border-white/10 h-full flex flex-col">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                            <span className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center text-pink-400"><i className="ph-fill ph-users-three text-xl"></i></span> Nhân Vật
                                        </h3>
                                        <button onClick={handleAddCharacter} className="themed-button-secondary px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-white/10"><i className="ph-bold ph-plus"></i> Thêm</button>
                                    </div>

                                    {characters.length === 0 ? (
                                        <div className="flex-grow flex flex-col items-center justify-center text-center py-20 border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
                                            <p className="text-skin-muted font-medium">Thêm nhân vật để bắt đầu.</p>
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
                                                            <textarea className={`w-full h-full bg-white/5 border border-white/5 rounded-lg p-2 text-xs text-gray-400 focus:text-white focus:bg-black/40 transition resize-none ${char.is_analyzing ? 'opacity-30' : ''}`} placeholder="Mô tả ngoại hình..." value={char.description} onChange={(e) => setCharacters(chars => chars.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} />
                                                            {char.is_analyzing && (
                                                                <div className="absolute inset-0 flex items-center justify-center flex-col bg-black/60 backdrop-blur-sm text-white">
                                                                    <i className="ph-bold ph-scan animate-spin text-pink-500 text-xl mb-1"></i>
                                                                    <span className="text-[10px] font-bold">Đang phân tích...</span>
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

                    {/* STEP 2: SCRIPT EDITOR - PROFESSIONAL UI */}
                    {activeStep === 2 && (
                        <div className="max-w-5xl mx-auto space-y-6">
                            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400"><i className="ph-fill ph-magic-wand text-xl"></i></div>
                                <div>
                                    <h4 className="font-bold text-blue-100">{generationStatus ? generationStatus : 'Kịch bản đã sẵn sàng'}</h4>
                                    <p className="text-xs text-blue-200/60">Chỉnh sửa nội dung chi tiết cho từng khung hình (Panel) bên dưới trước khi vẽ.</p>
                                </div>
                            </div>
                            <div className="space-y-8">
                                {panels.map((panel) => (
                                    <div key={panel.id} className="bg-[#12121A] border border-white/10 rounded-xl overflow-hidden">
                                        <div className="bg-[#1E1B25] px-4 py-3 border-b border-white/10 flex justify-between items-center">
                                            <span className="font-bold text-white flex items-center gap-2"><i className="ph-fill ph-file-text text-pink-500"></i> TRANG {panel.panel_number}</span>
                                            <span className="text-xs text-gray-500 italic">{panel.plot_summary.substring(0, 50)}...</span>
                                        </div>
                                        <div className="p-4">
                                            <ProfessionalScriptEditor 
                                                panel={panel} 
                                                onUpdate={(newVal) => handleUpdatePanel(panel.id, 'visual_description', newVal)} 
                                            />
                                        </div>
                                    </div>
                                ))}
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
                                            <div ref={() => {}} className="relative w-full bg-white overflow-hidden border border-black flex items-center justify-center group mx-auto" style={ratioStyle}>
                                                {(!hasUrl && !panel.is_rendering && !isPending) && (
                                                    <div className="absolute inset-0 bg-skin-fill-secondary/90 flex flex-col items-center justify-center z-20 p-6 text-center">
                                                        <h4 className="text-xl font-bold text-white mb-2">TRANG {panel.panel_number}</h4>
                                                        <p className="text-gray-400 text-sm mb-6 max-w-md line-clamp-3 opacity-80 italic">
                                                            {panel.plot_summary}
                                                        </p>
                                                        <button onClick={() => handleRenderPanel(panel)} className="themed-button-primary px-8 py-3 rounded-full font-bold text-white shadow-xl flex items-center gap-2 transform hover:scale-105 transition-all">
                                                            <i className="ph-fill ph-paint-brush-broad text-xl"></i> Vẽ Trang Này ({RENDER_COST} 💎)
                                                        </button>
                                                        <p className="text-[10px] text-gray-500 mt-3">Model: Gemini 3 Pro (Nano Banana)</p>
                                                    </div>
                                                )}
                                                {(panel.is_rendering || isPending || isLoadingImage) && !isErrorImage && (
                                                    <div className="absolute inset-0 bg-skin-fill-secondary/90 flex flex-col items-center justify-center z-20">
                                                        <i className="ph-bold ph-spinner animate-spin text-3xl text-pink-500 mb-2"></i>
                                                        <p className="text-sm text-gray-300">{isLoadingImage ? 'Đang tải ảnh...' : 'AI đang vẽ & chèn thoại...'}</p>
                                                    </div>
                                                )}
                                                {isErrorImage && hasUrl && (
                                                     <div className="absolute inset-0 bg-skin-fill-secondary/95 flex flex-col items-center justify-center z-20 p-4 text-center">
                                                        <i className="ph-fill ph-warning-circle text-4xl text-red-500 mb-2"></i>
                                                        <p className="text-sm font-bold text-white mb-1">Không thể tải ảnh</p>
                                                        <button onClick={() => handleRenderPanel(panel)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-gray-300 flex items-center gap-2 mt-2"><i className="ph-bold ph-paint-brush-broad"></i> Vẽ lại</button>
                                                    </div>
                                                )}
                                                {hasUrl && <img src={panel.image_url} alt="Panel" className={`w-full h-full object-cover ${isLoadingImage || isErrorImage ? 'opacity-0' : 'opacity-100'}`} onLoad={() => setImageLoadStates(prev => ({...prev, [panel.id]: 'loaded'}))} onError={() => setImageLoadStates(prev => ({...prev, [panel.id]: 'error'}))} />}
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
                                    <><span className="text-purple-400 text-xl">{RENDER_COST}</span><i className="ph-fill ph-diamonds-four text-purple-400 text-xs"></i><span className="text-xs font-medium text-gray-500 ml-1">/ 1 Trang</span></>
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
                                <button onClick={handleDownloadPDF} disabled={isLoading} className="px-5 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-bold text-sm transition-all shadow-lg flex items-center gap-2"><i className="ph-bold ph-file-pdf"></i> PDF</button>
                                <button onClick={handleDownloadZip} disabled={isLoading} className="px-5 py-2.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"><i className="ph-bold ph-file-archive"></i> ZIP</button>
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
