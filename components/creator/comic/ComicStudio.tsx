
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import SettingsBlock from '../ai-tool/SettingsBlock';
import { COMIC_PREMISES } from '../../../constants/comicPremises';
import { useTranslation } from '../../../hooks/useTranslation';
import ImageUploader from '../../ai-tool/ImageUploader';
import Modal from '../../common/Modal';

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

const LANGUAGES = [
    'Tiếng Việt',
    'English',
    'Japanese',
    'Korean',
    'Chinese'
];

const MAX_CHARACTERS = 5;

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

const COVER_OPTIONS = [
    { label: 'Tự động tạo bìa', value: 'start' },
    { label: 'Không có', value: 'none' }
];

const RENDER_COST = 10; 

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
        <div className="bg-[#12121A]/50 border border-white/5 p-1 rounded-full flex items-center shadow-inner mb-6">
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

// --- PREMISE SELECTION MODAL ---
const PremiseSelectionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSelect: (premise: string) => void;
    genre: string;
}> = ({ isOpen, onClose, onSelect, genre }) => {
    const premises = COMIC_PREMISES[genre] || COMIC_PREMISES['Mặc định (Sáng tạo)'];

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Chọn Ý Tưởng Kịch Bản">
            <div className="p-2">
                <div className="bg-skin-fill-secondary p-3 rounded-lg mb-4 text-xs text-skin-muted border border-skin-border">
                    <i className="ph-fill ph-info mr-1"></i>
                    Danh sách gợi ý dựa trên thể loại: <span className="font-bold text-skin-accent">{genre}</span>
                </div>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                    {premises.map((item, idx) => (
                        <div 
                            key={idx}
                            onClick={() => { onSelect(item); onClose(); }}
                            className="p-3 bg-black/20 border border-white/5 rounded-lg hover:border-pink-500/50 hover:bg-pink-500/5 cursor-pointer transition-all group"
                        >
                            <div className="flex gap-3">
                                <span className="text-pink-500 font-bold text-xs mt-0.5 flex-shrink-0">{idx + 1}.</span>
                                <p className="text-sm text-gray-300 group-hover:text-white leading-relaxed">{item}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
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
    onExpand: () => Promise<void>; 
    isExpanding: boolean;
    pageIndex: number;
}> = ({ panel, onUpdate, onExpand, isExpanding, pageIndex }) => {
    const [pageData, setPageData] = useState<ScriptPage | null>(null);

    // SYNC STATE WITH PROP - ROBUST VERSION
    useEffect(() => {
        const desc = panel.visual_description || '';
        
        if (!desc || desc.trim() === "") {
            setPageData(null); 
            return;
        }

        try {
            const parsed = JSON.parse(desc);
            // Robust Check: Ensure panels array exists
            let cleanData: ScriptPage = { layout_note: "Standard", panels: [] };
            
            if (parsed.panels && Array.isArray(parsed.panels)) {
                cleanData = parsed;
            } else if (Array.isArray(parsed)) {
                // If root is array (some older versions), wrap it
                cleanData.panels = parsed;
            } else if (typeof parsed === 'object') {
                // Try to salvage object if structure is slightly off
                cleanData = { ...cleanData, ...parsed };
                if (!cleanData.panels) cleanData.panels = [];
            } else {
                throw new Error("Structure mismatch");
            }
            
            setPageData(cleanData);
        } catch (e) {
            console.warn("JSON Parse Failed, falling back to raw text mode:", e);
            // FALLBACK: Treat the entire string as the description for Panel 1
            // This ensures the user ALWAYS sees the content to edit, even if AI messed up the format.
            setPageData({
                layout_note: "Recovered Layout",
                panels: [{
                    panel_id: 1,
                    description: desc, // Use the raw string here
                    dialogues: []
                }]
            });
        }
    }, [panel.visual_description]);

    const updatePage = (newData: ScriptPage) => {
        setPageData(newData);
        onUpdate(JSON.stringify(newData));
    };

    const handlePanelDescChange = (idx: number, val: string) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        if (newPanels[idx]) {
            newPanels[idx] = { ...newPanels[idx], description: val }; 
            updatePage({ ...pageData, panels: newPanels });
        }
    };

    const handleDialogueChange = (panelIdx: number, diaIdx: number, field: 'speaker' | 'text', val: string) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        const panelToUpdate = { ...newPanels[panelIdx] };
        
        if (panelToUpdate.dialogues && panelToUpdate.dialogues[diaIdx]) {
            const newDialogues = [...panelToUpdate.dialogues];
            newDialogues[diaIdx] = { ...newDialogues[diaIdx], [field]: val };
            panelToUpdate.dialogues = newDialogues;
            newPanels[panelIdx] = panelToUpdate;
            updatePage({ ...pageData, panels: newPanels });
        }
    };

    const addDialogue = (panelIdx: number) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        const panelToUpdate = { ...newPanels[panelIdx] };
        
        if (!panelToUpdate.dialogues) panelToUpdate.dialogues = [];
        panelToUpdate.dialogues = [...panelToUpdate.dialogues, { speaker: 'Nhân vật', text: '...' }];
        
        newPanels[panelIdx] = panelToUpdate;
        updatePage({ ...pageData, panels: newPanels });
    }

    const removeDialogue = (panelIdx: number, diaIdx: number) => {
        if (!pageData) return;
        const newPanels = [...pageData.panels];
        const panelToUpdate = { ...newPanels[panelIdx] };
        
        if (panelToUpdate.dialogues) {
            const newDialogues = [...panelToUpdate.dialogues];
            newDialogues.splice(diaIdx, 1);
            panelToUpdate.dialogues = newDialogues;
            newPanels[panelIdx] = panelToUpdate;
            updatePage({ ...pageData, panels: newPanels });
        }
    }

    // --- EMPTY STATE (Not Analyzed Yet) ---
    if (!pageData) {
        return (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-white/20 rounded-xl bg-white/5 min-h-[300px]">
                <div className="text-center max-w-md">
                    <i className="ph-fill ph-file-text text-5xl text-gray-500 mb-4"></i>
                    <h4 className="font-bold text-white text-xl mb-2">
                        {pageIndex === 0 ? 'Nội dung Trang Bìa' : `Kịch bản chi tiết Trang ${pageIndex + 1}`}
                    </h4>
                    <p className="text-sm text-gray-400 mb-8 italic bg-black/30 p-4 rounded-lg border border-white/10">
                        "{panel.plot_summary || 'Trang này chưa có nội dung tóm tắt.'}"
                    </p>
                    
                    <button 
                        onClick={onExpand}
                        disabled={isExpanding}
                        className={`themed-button-primary px-8 py-4 rounded-xl font-bold flex items-center gap-3 mx-auto shadow-xl hover:shadow-pink-500/40 transition-all transform hover:-translate-y-1 ${panel.visual_description ? 'bg-red-500 hover:bg-red-600 border-red-500' : ''}`}
                    >
                        {isExpanding ? (
                            <>
                                <div className="w-6 h-6 border-3 border-white/50 border-t-white rounded-full animate-spin"></div>
                                AI đang viết kịch bản...
                            </>
                        ) : (
                            <>
                                {panel.visual_description ? <i className="ph-fill ph-arrow-counter-clockwise text-xl"></i> : <i className="ph-fill ph-magic-wand text-xl"></i>}
                                {panel.visual_description ? 'Thử lại (Phân tích lại)' : 'Phân tích chi tiết (AI)'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // --- EDITOR STATE ---
    return (
        <div className="space-y-4 animate-fade-in pb-20">
            {/* Plot Summary Display */}
            <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg flex items-start gap-3">
                <i className="ph-fill ph-info text-blue-400 mt-0.5 flex-shrink-0"></i>
                <div>
                    <p className="text-xs font-bold text-blue-300 uppercase mb-1">Cốt truyện gốc (Tóm tắt)</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{panel.plot_summary || 'Không có tóm tắt.'}</p>
                </div>
                {/* Add explicit Retry Button here as well for easier access */}
                <button onClick={onExpand} disabled={isExpanding} className="ml-auto text-xs text-blue-300 hover:text-white underline whitespace-nowrap">
                    {isExpanding ? 'Đang tải...' : 'Phân tích lại'}
                </button>
            </div>

            {/* Panels List */}
            {pageData.panels.map((p, pIdx) => (
                <div key={pIdx} className="bg-[#1E1B25] border border-white/10 rounded-xl overflow-hidden shadow-sm transition-colors hover:border-white/20">
                    {/* Panel Header */}
                    <div className="bg-white/5 px-4 py-2 border-b border-white/10 flex justify-between items-center">
                        <span className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-2">
                            <i className="ph-fill ph-frame-corners"></i> Khung tranh (Panel) {p.panel_id || (pIdx + 1)}
                        </span>
                    </div>
                    
                    {/* Panel Content */}
                    <div className="p-4 space-y-4">
                        {/* Visual Description */}
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-1.5 block flex justify-between">
                                <span>Mô tả hình ảnh / Hành động (Prompt cho AI)</span>
                                <span className="text-cyan-500 cursor-help" title="AI sẽ vẽ dựa trên mô tả này">?</span>
                            </label>
                            <textarea 
                                className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition resize-none h-24 leading-relaxed"
                                value={p.description}
                                onChange={(e) => handlePanelDescChange(pIdx, e.target.value)}
                                placeholder="Mô tả bối cảnh, nhân vật, góc máy..."
                            />
                        </div>

                        {/* Dialogues */}
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block">Lời thoại</label>
                                <button onClick={() => addDialogue(pIdx)} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-500/10 transition">
                                    <i className="ph-bold ph-plus"></i> Thêm thoại
                                </button>
                            </div>
                            
                            <div className="space-y-2">
                                {p.dialogues && p.dialogues.map((d, dIdx) => (
                                    <div key={dIdx} className="flex gap-2 items-start group">
                                        <div className="w-1/3">
                                            <input 
                                                type="text" 
                                                className="w-full bg-black/30 border border-white/10 rounded p-2 text-xs text-yellow-300 font-bold placeholder-gray-600 focus:border-yellow-500 transition"
                                                placeholder="Nhân vật"
                                                value={d.speaker}
                                                onChange={(e) => handleDialogueChange(pIdx, dIdx, 'speaker', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-grow relative">
                                            <textarea 
                                                className="w-full bg-black/30 border border-white/10 rounded p-2 text-xs text-white placeholder-gray-600 focus:border-white/50 transition resize-none overflow-hidden min-h-[34px]"
                                                rows={1}
                                                placeholder="Nội dung thoại..."
                                                value={d.text}
                                                onChange={(e) => {
                                                    handleDialogueChange(pIdx, dIdx, 'text', e.target.value);
                                                    // Auto-grow height
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = e.target.scrollHeight + 'px';
                                                }}
                                                style={{ height: 'auto' }}
                                            />
                                            <button 
                                                onClick={() => removeDialogue(pIdx, dIdx)}
                                                className="absolute top-1/2 -right-8 -translate-y-1/2 text-gray-600 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition"
                                                title="Xóa thoại"
                                            >
                                                <i className="ph-fill ph-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {(!p.dialogues || p.dialogues.length === 0) && (
                                    <div className="text-xs text-gray-600 italic pl-2 py-1 border-l-2 border-gray-700">Không có lời thoại (Panel câm)</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- MAIN COMPONENT ---

const ComicStudio: React.FC<{ onInstructionClick: () => void }> = ({ onInstructionClick }) => {
    const { user, session, showToast, updateUserDiamonds, supabase } = useAuth();
    const { t } = useTranslation();
    
    // STEP CONTROL
    const [currentStep, setCurrentStep] = useState(1);

    // DATA STATES
    const [comicTitle, setComicTitle] = useState('');
    const [premise, setPremise] = useState('');
    const [genre, setGenre] = useState(GENRES[0]);
    const [artStyle, setArtStyle] = useState(ART_STYLES[0].value);
    const [characters, setCharacters] = useState<ComicCharacter[]>([]);
    const [comicPages, setComicPages] = useState<ComicPanel[]>([]);
    
    // CONFIG STATES
    const [pageCount, setPageCount] = useState(1);
    const [language, setLanguage] = useState('Tiếng Việt');
    const [colorFormat, setColorFormat] = useState(COLOR_FORMATS[0].value);
    const [pageNumbering, setPageNumbering] = useState(PAGE_NUMBERING[2].value);
    const [bubbleFont, setBubbleFont] = useState(BUBBLE_FONTS[0].value);
    const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0].value);
    const [visualEffect, setVisualEffect] = useState(VISUAL_EFFECTS[0].value);
    const [coverOption, setCoverOption] = useState(COVER_OPTIONS[0].value);

    // PROCESSING STATES
    const [isGeneratingScript, setIsGeneratingScript] = useState(false);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [expandingPageId, setExpandingPageId] = useState<string | null>(null);
    const [renderingPageId, setRenderingPageId] = useState<string | null>(null);
    const [isPremiseModalOpen, setIsPremiseModalOpen] = useState(false);

    // QUEUE STATE FOR SEQUENTIAL AUTO-EXPANSION
    const [expansionQueue, setExpansionQueue] = useState<number[]>([]);

    // --- STEP 1: SETUP & CASTING ---

    const handleAddCharacter = () => {
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

    const handleCharacterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // 1. Update UI preview immediately
            const { dataUrl } = await resizeImage(file, 512);
            setCharacters(prev => prev.map(c => c.id === id ? { ...c, image_url: dataUrl, image_file: file, is_analyzing: true } : c));

            // 2. Analyze Character (Gemini Vision)
            const response = await fetch('/.netlify/functions/comic-analyze-character', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ image: dataUrl })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Analysis failed');

            setCharacters(prev => prev.map(c => c.id === id ? { ...c, description: data.description, is_analyzing: false } : c));
            showToast(t('creator.aiTool.singlePhoto.superFaceLockProcessed') || 'Phân tích thành công!', 'success');

        } catch (error: any) {
            showToast(error.message, 'error');
            setCharacters(prev => prev.map(c => c.id === id ? { ...c, is_analyzing: false } : c));
        }
    };

    const handleApplyPremise = (p: string) => {
        setPremise(p);
    };

    // --- STEP 2: SCRIPT GENERATION (OUTLINE) ---

    const handleGenerateScript = async () => {
        if (!premise.trim()) return showToast('Vui lòng nhập ý tưởng cốt truyện.', 'error');
        if (characters.length === 0) return showToast('Vui lòng thêm ít nhất 1 nhân vật.', 'error');
        if (user && user.diamonds < 2) return showToast('Không đủ kim cương (Cần 2).', 'error');

        setIsGeneratingScript(true);
        try {
            const response = await fetch('/.netlify/functions/comic-generate-script', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    premise,
                    genre,
                    artStyle,
                    pageCount,
                    characters: characters.map(c => ({ name: c.name, description: c.description })),
                    language,
                    coverPage: coverOption
                })
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error("Lỗi kết nối server (Timeout hoặc sai định dạng JSON).");
            }

            if (!response.ok) throw new Error(data.error || 'Failed to generate script');

            // SAFE GUARD: Ensure outline is an array
            if (!data || !data.outline || !Array.isArray(data.outline)) {
                console.error("Invalid AI Response:", data);
                throw new Error("AI trả về định dạng không hợp lệ. Vui lòng thử lại.");
            }

            // Initialize panels from outline
            const newPages: ComicPanel[] = data.outline.map((outlineItem: any) => ({
                id: crypto.randomUUID(),
                panel_number: outlineItem.panel_number || 1,
                visual_description: "", // Empty initially
                plot_summary: outlineItem.plot_summary || "Đang tải...", // Store summary for lazy expansion
                dialogue: [],
                status: 'draft'
            }));

            setComicPages(newPages);
            updateUserDiamonds(data.newDiamondCount);
            setCurrentStep(2); // Move to Step 2
            showToast('Đã tạo khung kịch bản! Hệ thống sẽ tự động phân tích chi tiết từng trang.', 'success');

            // TRIGGER AUTO EXPANSION QUEUE FOR ALL PAGES
            const queue = Array.from({ length: newPages.length }, (_, i) => i);
            setExpansionQueue(queue);

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsGeneratingScript(false);
        }
    };

    // --- STEP 2.5: LAZY EXPANSION (DETAIL) ---

    const handleExpandPage = async (pageIndex: number) => {
        const page = comicPages[pageIndex];
        if (!page) return;

        setExpandingPageId(page.id);
        try {
            const response = await fetch('/.netlify/functions/comic-expand-panel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    plot_summary: page.plot_summary || '',
                    characters: characters.map(c => ({ name: c.name, description: c.description })),
                    genre,
                    style: artStyle,
                    language
                })
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error("Lỗi kết nối server (Timeout hoặc sai định dạng).");
            }

            if (!response.ok) throw new Error(data.error || 'Failed to expand page');

            // --- CRITICAL FIX: FUNCTIONAL STATE UPDATE ---
            // Using prev state ensures we don't overwrite changes from other async operations (like queue)
            setComicPages(prev => {
                const next = [...prev];
                if (next[pageIndex]) {
                    next[pageIndex] = {
                        ...next[pageIndex],
                        visual_description: JSON.stringify(data.script_data) // Store full JSON here
                    };
                }
                return next;
            });
            
            // Only show toast if user clicked manually (queue is empty)
            if (expansionQueue.length === 0) {
                showToast(`Đã phân tích chi tiết trang ${pageIndex + 1}`, 'success');
            }

        } catch (error: any) {
            // If manual click, show error. If auto queue, log it but don't break the app flow
            if (expansionQueue.length === 0) {
                 showToast(error.message, 'error');
            } else {
                console.error("Auto-expand failed for page " + pageIndex, error);
            }
        } finally {
            setExpandingPageId(null);
        }
    };
    
    // --- AUTO-PROCESS QUEUE EFFECT ---
    useEffect(() => {
        if (expansionQueue.length === 0 || expandingPageId) return;

        const processNext = async () => {
            const nextIndex = expansionQueue[0];
            
            // Safety check: index exists
            if (!comicPages[nextIndex]) {
                setExpansionQueue(prev => prev.slice(1));
                return;
            }
            
            // Optional: Auto-focus visual
            setActivePageIndex(nextIndex);

            // Trigger expansion
            await handleExpandPage(nextIndex);
            
            // Remove from queue to process next
            setExpansionQueue(prev => prev.slice(1));
        };
        
        processNext();

    }, [expansionQueue, expandingPageId]);

    // --- STEP 3: RENDERING ---

    const handleRenderPage = async (index: number) => {
        const page = comicPages[index];
        if (!page.visual_description) return showToast('Vui lòng phân tích chi tiết kịch bản trước.', 'error');
        if (user && user.diamonds < RENDER_COST) return showToast(`Cần ${RENDER_COST} kim cương.`, 'error');

        setRenderingPageId(page.id);
        
        try {
            // 1. Call Panel Init (Synchronous)
            const response = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    panel: page,
                    // Include premise to ensure context consistency across pages
                    premise: premise, 
                    characters: characters.map(c => ({ name: c.name, image_url: c.image_url })), // Send base64 for reference
                    storyTitle: comicTitle,
                    style: artStyle,
                    aspectRatio,
                    colorFormat,
                    visualEffect,
                    isCover: index === 0 && coverOption === 'start',
                    pageNumbering, 
                    bubbleFont
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            const jobId = data.jobId;

            // 2. Trigger Background Worker (Fire and Forget or Async wait)
            fetch('/.netlify/functions/comic-render-background', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            }).catch(err => console.error("Background trigger failed", err));

            // 3. Update UI & Start Polling
            updateUserDiamonds(data.newDiamondCount);
            
            // Mark as rendering locally
            setComicPages(prev => {
                const next = [...prev];
                if (next[index]) {
                    next[index] = { ...next[index], is_rendering: true, status: 'rendering' };
                }
                return next;
            });
            
            showToast('Đã gửi yêu cầu vẽ. AI đang xử lý ngầm (có thể mất vài phút)...', 'success');

            // Start polling for this specific job
            startPolling(jobId, index);

        } catch (error: any) {
            showToast(error.message, 'error');
            setRenderingPageId(null);
        }
    };

    const startPolling = (jobId: string, pageIndex: number) => {
        const interval = setInterval(async () => {
            if (!supabase) {
                clearInterval(interval);
                return;
            }
            
            // Check if image is generated or if row deleted (failed)
            const { data, error } = await supabase
                .from('generated_images')
                .select('image_url')
                .eq('id', jobId)
                .single();
            
            if (error) {
                // If row is gone, it means it failed/refunded (based on worker logic)
                clearInterval(interval);
                setRenderingPageId(null);
                setComicPages(prev => {
                    const next = [...prev];
                    if(next[pageIndex]) {
                         next[pageIndex] = { ...next[pageIndex], is_rendering: false, status: 'draft' };
                    }
                    return next;
                });
                showToast(`Vẽ trang ${pageIndex + 1} thất bại. Đã hoàn tiền.`, 'error');
                return;
            }

            if (data && data.image_url && data.image_url !== 'PENDING') {
                clearInterval(interval);
                setComicPages(prev => {
                    const next = [...prev];
                    if (next[pageIndex]) {
                        next[pageIndex] = { 
                            ...next[pageIndex],
                            image_url: data.image_url,
                            is_rendering: false,
                            status: 'completed'
                        };
                    }
                    return next;
                });
                setRenderingPageId(null);
                showToast(`Trang ${pageIndex + 1} đã hoàn tất!`, 'success');
            }
        }, 5000); // Poll every 5 seconds
    };

    // --- EXPORT ---
    const handleExport = async () => {
        const completedPages = comicPages.filter(p => p.image_url);
        if (completedPages.length === 0) return showToast('Chưa có trang nào hoàn tất.', 'error');

        const zip = new JSZip();
        const pdf = new jsPDF();
        
        for (let i = 0; i < completedPages.length; i++) {
            const page = completedPages[i];
            const imgData = await fetch(page.image_url!).then(res => res.blob());
            
            // Add to ZIP
            zip.file(`page_${i + 1}.png`, imgData);

            // Add to PDF
            if (i > 0) pdf.addPage();
            const imgProps = pdf.getImageProperties(page.image_url!);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(page.image_url!, 'PNG', 0, 0, pdfWidth, pdfHeight);
        }

        // Download ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipLink = document.createElement('a');
        zipLink.href = URL.createObjectURL(zipBlob);
        zipLink.download = `${comicTitle || 'comic'}_images.zip`;
        zipLink.click();

        // Download PDF
        pdf.save(`${comicTitle || 'comic'}.pdf`);
    };

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto animate-fade-in">
            {/* Modal */}
            <PremiseSelectionModal 
                isOpen={isPremiseModalOpen}
                onClose={() => setIsPremiseModalOpen(false)}
                onSelect={handleApplyPremise}
                genre={genre}
            />

            {/* Header Step Indicator */}
            <div className="flex justify-center">
                <StepIndicator currentStep={currentStep} />
            </div>

            {/* --- STEP 1: SETUP --- */}
            {currentStep === 1 && (
                <>
                    {/* Feature Highlights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                        {/* Story Memory */}
                        <div className="bg-[#12121A]/80 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-4 shadow-lg shadow-emerald-500/5 relative overflow-hidden group interactive-3d">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/30 shadow-inner">
                                <i className="ph-fill ph-lightning text-2xl text-emerald-400 animate-pulse"></i>
                            </div>
                            <div>
                                <h4 className="font-bold text-emerald-100 flex items-center gap-2 text-sm">
                                    Story Memory & Plot Logic
                                    <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase shadow-sm">HOT</span>
                                </h4>
                                <p className="text-xs text-emerald-200/60 mt-1 leading-relaxed font-medium">
                                    AI ghi nhớ diễn biến cốt truyện để phát triển tâm lý nhân vật sâu sắc hơn.
                                </p>
                            </div>
                        </div>

                        {/* Character Consistency */}
                        <div className="bg-[#12121A]/80 border border-orange-500/20 p-4 rounded-xl flex items-center gap-4 shadow-lg shadow-orange-500/5 relative overflow-hidden group interactive-3d">
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 border border-orange-500/30 shadow-inner">
                                <i className="ph-fill ph-fire text-2xl text-orange-400 animate-pulse"></i>
                            </div>
                            <div>
                                <h4 className="font-bold text-orange-100 flex items-center gap-2 text-sm">
                                    Character Consistency
                                    <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase shadow-sm">ESSENTIAL</span>
                                </h4>
                                <p className="text-xs text-orange-200/60 mt-1 leading-relaxed font-medium">
                                    Hệ thống hỗ trợ tối đa 12 nhân vật tham chiếu. Độ đồng bộ 95-100%.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left: Config */}
                        <div className="lg:col-span-1 space-y-4">
                            <SettingsBlock title="Cấu Hình Truyện" instructionKey="comic-studio" onInstructionClick={onInstructionClick}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block">Tên Truyện</label>
                                        <input 
                                            type="text" 
                                            className="auth-input" 
                                            placeholder="VD: Trùm Trường Sợ Gián"
                                            value={comicTitle}
                                            onChange={(e) => setComicTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <ComicSelect label="Thể loại" value={genre} onChange={setGenre} options={GENRES} />
                                        <ComicSelect label="Ngôn ngữ" value={language} onChange={setLanguage} options={LANGUAGES} />
                                    </div>
                                    <ComicSelect label="Phong cách vẽ" value={artStyle} onChange={setArtStyle} options={ART_STYLES} />
                                    <div className="grid grid-cols-2 gap-3">
                                        <ComicSelect label="Màu sắc" value={colorFormat} onChange={setColorFormat} options={COLOR_FORMATS} />
                                        <ComicSelect label="Tỷ lệ" value={aspectRatio} onChange={setAspectRatio} options={ASPECT_RATIOS} />
                                    </div>
                                    
                                    {/* NEW CONFIG OPTIONS - Using state variables */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <ComicSelect label="Số trang" value={pageNumbering} onChange={setPageNumbering} options={PAGE_NUMBERING} />
                                        <ComicSelect label="Font thoại" value={bubbleFont} onChange={setBubbleFont} options={BUBBLE_FONTS} previewFont={true} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <ComicSelect label="Hiệu ứng" value={visualEffect} onChange={setVisualEffect} options={VISUAL_EFFECTS} />
                                        <ComicSelect label="Trang bìa" value={coverOption} onChange={setCoverOption} options={COVER_OPTIONS} />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block">Số lượng trang NỘI DUNG</label>
                                        <div className="flex items-center gap-4 bg-[#1E1B25] p-2 rounded-lg border border-white/10">
                                            <input 
                                                type="range" min="1" max="10" 
                                                value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))} 
                                                className="flex-grow accent-pink-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="font-bold text-white w-8 text-center">{pageCount}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-1 italic">*Hệ thống sẽ tự cộng thêm 1 Trang Bìa.</p>
                                    </div>
                                </div>
                            </SettingsBlock>
                            
                            <SettingsBlock title="Ý Tưởng Cốt Truyện">
                                <div className="relative">
                                    <textarea 
                                        className="auth-input min-h-[150px] text-sm leading-relaxed resize-none"
                                        placeholder="Nhập tóm tắt câu chuyện của bạn..."
                                        value={premise}
                                        onChange={(e) => setPremise(e.target.value)}
                                    />
                                    <div className="absolute bottom-2 right-2">
                                        <button 
                                            onClick={() => setIsPremiseModalOpen(true)}
                                            className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/40 transition flex items-center gap-1"
                                        >
                                            <i className="ph-fill ph-lightbulb"></i> Gợi ý kịch bản
                                        </button>
                                    </div>
                                </div>
                            </SettingsBlock>
                        </div>

                        {/* Right: Characters */}
                        <div className="lg:col-span-2">
                            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl p-6 h-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <i className="ph-fill ph-users-three text-pink-500"></i> Nhân Vật ({characters.length}/{MAX_CHARACTERS})
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        {/* MOVED HELP BUTTON HERE AS REQUESTED PREVIOUSLY */}
                                        <button onClick={onInstructionClick} className="flex items-center gap-1 text-xs text-skin-accent hover:opacity-80 transition-all px-2 py-1 rounded-md bg-skin-accent/10 border border-skin-border-accent hover:bg-skin-accent/20 shadow-accent hover:shadow-accent-lg">
                                            <i className="ph-fill ph-book-open"></i> Hướng dẫn
                                        </button>
                                        <button 
                                            onClick={handleAddCharacter}
                                            disabled={characters.length >= MAX_CHARACTERS}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <i className="ph-bold ph-plus"></i> Thêm
                                        </button>
                                    </div>
                                </div>

                                {characters.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl text-skin-muted">
                                        <i className="ph-fill ph-user-plus text-4xl mb-2 opacity-50"></i>
                                        <p>Thêm nhân vật để AI nhận diện khuôn mặt & trang phục</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                                        {characters.map((char, idx) => (
                                            <div key={char.id} className="bg-[#1E1B25] p-4 rounded-xl border border-white/5 relative group">
                                                <button 
                                                    onClick={() => handleRemoveCharacter(char.id)}
                                                    className="absolute top-2 right-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"
                                                >
                                                    <i className="ph-fill ph-x"></i>
                                                </button>
                                                
                                                <div className="flex gap-4">
                                                    {/* Image Upload - Adjusted sizing */}
                                                    <div className="w-20 h-20 flex-shrink-0">
                                                        <ImageUploader
                                                            onUpload={(e) => handleCharacterImageUpload(e, char.id)}
                                                            image={char.image_url ? { url: char.image_url } : null}
                                                            onRemove={() => {
                                                                setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, image_url: undefined, image_file: undefined } : c));
                                                            }}
                                                            text=""
                                                            className="w-full h-full min-h-0" // Force size to container
                                                        />
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-grow space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-gray-500 font-bold uppercase">Nhân vật {idx + 1}</span>
                                                        </div>
                                                        <input 
                                                            type="text" 
                                                            className="w-full bg-transparent border-b border-white/10 focus:border-pink-500 text-sm font-bold text-white px-1 py-0.5 outline-none transition"
                                                            value={char.name}
                                                            onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))}
                                                            placeholder="Tên nhân vật"
                                                        />
                                                        
                                                        {char.is_analyzing ? (
                                                            <div className="text-xs text-pink-400 flex items-center gap-1 animate-pulse">
                                                                <i className="ph-fill ph-spinner animate-spin"></i> Đang phân tích...
                                                            </div>
                                                        ) : (
                                                            <textarea 
                                                                className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-gray-300 h-16 resize-none focus:border-white/30 outline-none"
                                                                placeholder="Mô tả ngoại hình..."
                                                                value={char.description}
                                                                onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))}
                                                            />
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
                </>
            )}

            {/* --- STEP 2 & 3: SCRIPT & RENDER --- */}
            {currentStep >= 2 && (
                <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)]">
                    {/* Left: Page List */}
                    <div className="w-full lg:w-1/4 bg-[#12121A]/80 border border-white/10 rounded-2xl p-4 flex flex-col h-full">
                        <h3 className="text-lg font-bold text-white mb-4 px-2">Danh sách trang ({comicPages.length})</h3>
                        
                        {/* Auto Expansion Indicator */}
                        {expansionQueue.length > 0 && (
                            <div className="mb-3 p-2 bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center gap-2 text-xs text-blue-300 animate-pulse">
                                <div className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
                                <span>Đang tự động phân tích ({comicPages.length - expansionQueue.length + 1}/{comicPages.length})...</span>
                            </div>
                        )}

                        <div className="flex-grow overflow-y-auto custom-scrollbar space-y-2 pr-1">
                            {comicPages.map((page, idx) => (
                                <button
                                    key={page.id}
                                    onClick={() => setActivePageIndex(idx)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all relative group
                                        ${activePageIndex === idx 
                                            ? 'bg-pink-500/20 border-pink-500 text-white shadow-lg shadow-pink-500/10' 
                                            : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white'
                                        }
                                        ${expansionQueue.includes(idx) ? 'opacity-70' : ''}
                                    `}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold uppercase">
                                            {idx === 0 ? '⭐ Trang Bìa' : `Trang ${idx} (Nội dung)`}
                                        </span>
                                        {page.status === 'completed' && <i className="ph-fill ph-check-circle text-green-400"></i>}
                                        {page.status === 'rendering' && <i className="ph-fill ph-spinner animate-spin text-yellow-400"></i>}
                                        
                                        {/* Show loading for expansion */}
                                        {expandingPageId === page.id ? (
                                            <i className="ph-fill ph-dots-three text-blue-400 animate-bounce"></i>
                                        ) : !page.visual_description ? (
                                            <i className="ph-fill ph-circle-dashed text-gray-600 text-[10px]"></i>
                                        ) : null}
                                    </div>
                                    <p className="text-[10px] opacity-70 line-clamp-2">
                                        {page.plot_summary || 'Chưa có nội dung'}
                                    </p>
                                </button>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <div className="flex justify-between text-xs text-gray-400 mb-2">
                                <span>Ước tính chi phí:</span>
                                <span className="text-white font-bold">{RENDER_COST} 💎 / trang</span>
                            </div>
                            <button onClick={handleExport} className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                                <i className="ph-fill ph-download-simple"></i> Xuất file (PDF/Zip)
                            </button>
                        </div>
                    </div>

                    {/* Center: Script Editor & Preview */}
                    <div className="w-full lg:w-3/4 bg-[#12121A]/80 border border-white/10 rounded-2xl p-6 h-full overflow-y-auto custom-scrollbar relative">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">
                                {activePageIndex === 0 ? 'Trang Bìa' : `Trang Nội Dung ${activePageIndex}`}
                            </h2>
                            <div className="flex gap-3">
                                {currentStep === 2 && (
                                    <button 
                                        onClick={() => handleRenderPage(activePageIndex)}
                                        disabled={!!renderingPageId || comicPages[activePageIndex]?.status === 'rendering' || !comicPages[activePageIndex]?.visual_description}
                                        className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-full shadow-lg hover:shadow-pink-500/30 transition transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {comicPages[activePageIndex]?.status === 'rendering' ? (
                                            <><i className="ph-fill ph-spinner animate-spin"></i> Đang vẽ...</>
                                        ) : (
                                            <><i className="ph-fill ph-paint-brush-broad"></i> Vẽ Trang Này (10💎)</>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Editor Area */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Script Column */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                                    <i className="ph-fill ph-text-aa"></i> Kịch bản chi tiết
                                </h4>
                                
                                {comicPages[activePageIndex] && (
                                    <ProfessionalScriptEditor 
                                        pageIndex={activePageIndex}
                                        panel={comicPages[activePageIndex]} 
                                        onUpdate={(jsonStr) => {
                                            setComicPages(prev => {
                                                const next = [...prev];
                                                if (next[activePageIndex]) {
                                                    next[activePageIndex] = {
                                                        ...next[activePageIndex],
                                                        visual_description: jsonStr
                                                    };
                                                }
                                                return next;
                                            });
                                        }}
                                        onExpand={() => handleExpandPage(activePageIndex)}
                                        isExpanding={expandingPageId === comicPages[activePageIndex].id}
                                    />
                                )}
                            </div>

                            {/* Preview / Result Column */}
                            <div className="bg-black/40 rounded-xl border border-white/10 flex items-center justify-center min-h-[500px] relative overflow-hidden group">
                                {comicPages[activePageIndex]?.image_url && comicPages[activePageIndex]?.image_url !== 'PENDING' ? (
                                    <>
                                        <img 
                                            src={comicPages[activePageIndex].image_url} 
                                            alt="Result" 
                                            className="w-full h-full object-contain"
                                        />
                                        <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <a 
                                                href={comicPages[activePageIndex].image_url} 
                                                download={`page_${activePageIndex + 1}.png`}
                                                className="p-2 bg-black/60 text-white rounded-full hover:bg-pink-500 transition"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <i className="ph-fill ph-download-simple text-xl"></i>
                                            </a>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-gray-500 p-8">
                                        {comicPages[activePageIndex]?.status === 'rendering' ? (
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                                                <p className="text-pink-400 font-bold animate-pulse">AI đang vẽ tác phẩm của bạn...</p>
                                                <p className="text-xs">Quá trình này có thể mất 1-2 phút.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <i className="ph-fill ph-image text-6xl mb-4 opacity-30"></i>
                                                <p>Kết quả hình ảnh sẽ hiển thị tại đây</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FOOTER ACTION (Step 1 Only) */}
            {currentStep === 1 && (
                <div className="flex justify-center mt-8 pb-12">
                    <div className="bg-[#1E1B25] p-4 rounded-2xl border border-white/10 flex items-center gap-6 shadow-2xl">
                        <div className="text-right">
                            <p className="text-xs text-gray-400">Tổng chi phí dự kiến</p>
                            {/* Calculation update: Total pages = pageCount + 1 (Cover) */}
                            <p className="text-xl font-black text-pink-400">2 💎 <span className="text-sm font-normal text-white">+ {(pageCount + 1) * RENDER_COST} 💎 (Vẽ {pageCount+1} trang)</span></p>
                        </div>
                        <button 
                            onClick={handleGenerateScript}
                            disabled={isGeneratingScript}
                            className="themed-button-primary px-10 py-4 text-lg font-bold rounded-xl shadow-lg hover:shadow-pink-500/40 transition transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                        >
                            {isGeneratingScript ? (
                                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Đang tạo kịch bản...</>
                            ) : (
                                <>Tạo Kịch Bản <i className="ph-fill ph-arrow-right"></i></>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComicStudio;
