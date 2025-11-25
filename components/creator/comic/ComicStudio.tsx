
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
        { num: 2, label: 'Sản xuất (Kịch bản & Vẽ)', icon: 'ph-paint-brush-broad' },
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
                        {step.num < 2 && (
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

    useEffect(() => {
        const desc = panel.visual_description || '';
        
        if (!desc || desc.trim() === "") {
            setPageData(null); 
            return;
        }

        try {
            const parsed = JSON.parse(desc);
            let cleanData: ScriptPage = { layout_note: "Standard", panels: [] };
            
            if (parsed.panels && Array.isArray(parsed.panels)) {
                cleanData = parsed;
            } else if (Array.isArray(parsed)) {
                cleanData.panels = parsed;
            } else if (typeof parsed === 'object') {
                cleanData = { ...cleanData, ...parsed };
                if (!cleanData.panels) cleanData.panels = [];
            }
            
            setPageData(cleanData);
        } catch (e) {
            setPageData({
                layout_note: "Recovered Layout",
                panels: [{
                    panel_id: 1,
                    description: desc, 
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

    if (!pageData) {
        return (
            <div className="flex flex-col items-center justify-center p-4 bg-black/30 rounded-lg border border-white/10 min-h-[200px]">
                <p className="text-sm text-gray-400 mb-4 italic text-center">
                    "{panel.plot_summary || 'Trang này chưa có nội dung tóm tắt.'}"
                </p>
                <button 
                    onClick={onExpand}
                    disabled={isExpanding}
                    className={`themed-button-primary px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm ${panel.visual_description ? 'bg-red-500' : ''}`}
                >
                    {isExpanding ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-magic-wand"></i>}
                    {isExpanding ? 'Đang phân tích...' : 'Phân tích chi tiết'}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-lg text-xs text-gray-300 mb-2">
                <strong className="text-blue-300">Tóm tắt:</strong> {panel.plot_summary}
            </div>
            {pageData.panels.map((p, pIdx) => (
                <div key={pIdx} className="bg-[#1E1B25] border border-white/10 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-pink-400 uppercase">Panel {p.panel_id}</span>
                    </div>
                    <div className="mb-3">
                        <textarea 
                            className="w-full bg-black/30 border border-white/10 rounded-md p-2 text-xs text-white focus:border-pink-500 transition resize-none h-16"
                            value={p.description}
                            onChange={(e) => handlePanelDescChange(pIdx, e.target.value)}
                            placeholder="Mô tả hành động, bối cảnh..."
                        />
                    </div>
                    <div className="space-y-2">
                        {p.dialogues && p.dialogues.map((d, dIdx) => (
                            <div key={dIdx} className="flex gap-2 items-center group">
                                <input 
                                    type="text" 
                                    className="w-1/4 bg-black/30 border border-white/10 rounded p-1.5 text-[10px] text-yellow-300 font-bold"
                                    value={d.speaker}
                                    onChange={(e) => handleDialogueChange(pIdx, dIdx, 'speaker', e.target.value)}
                                />
                                <input 
                                    className="flex-grow bg-black/30 border border-white/10 rounded p-1.5 text-[10px] text-white"
                                    value={d.text}
                                    onChange={(e) => handleDialogueChange(pIdx, dIdx, 'text', e.target.value)}
                                />
                                <button onClick={() => removeDialogue(pIdx, dIdx)} className="text-gray-600 hover:text-red-500"><i className="ph-fill ph-trash"></i></button>
                            </div>
                        ))}
                        <button onClick={() => addDialogue(pIdx)} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold">+ Thêm thoại</button>
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

    const [isGeneratingScript, setIsGeneratingScript] = useState(false);
    const [expandingPageId, setExpandingPageId] = useState<string | null>(null);
    const [renderingPageId, setRenderingPageId] = useState<string | null>(null);
    const [isPremiseModalOpen, setIsPremiseModalOpen] = useState(false);
    const [expansionQueue, setExpansionQueue] = useState<number[]>([]);
    const [isBatchRendering, setIsBatchRendering] = useState(false);

    const handleAddCharacter = () => {
        const newChar: ComicCharacter = { id: crypto.randomUUID(), name: `Nhân vật ${characters.length + 1}`, description: '', is_analyzing: false };
        setCharacters([...characters, newChar]);
    };

    const handleRemoveCharacter = (id: string) => {
        setCharacters(characters.filter(c => c.id !== id));
    };

    const handleCharacterImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const { dataUrl } = await resizeImage(file, 512);
            setCharacters(prev => prev.map(c => c.id === id ? { ...c, image_url: dataUrl, image_file: file, is_analyzing: true } : c));
            const response = await fetch('/.netlify/functions/comic-analyze-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
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

    const handleApplyPremise = (p: string) => setPremise(p);

    const handleGenerateScript = async () => {
        if (!premise.trim()) return showToast('Vui lòng nhập ý tưởng cốt truyện.', 'error');
        if (characters.length === 0) return showToast('Vui lòng thêm ít nhất 1 nhân vật.', 'error');
        if (user && user.diamonds < 2) return showToast('Không đủ kim cương (Cần 2).', 'error');

        setIsGeneratingScript(true);
        try {
            const response = await fetch('/.netlify/functions/comic-generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ premise, genre, artStyle, pageCount, characters: characters.map(c => ({ name: c.name, description: c.description })), language, coverPage: coverOption })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate script');

            const newPages: ComicPanel[] = data.outline.map((outlineItem: any) => ({
                id: crypto.randomUUID(),
                panel_number: outlineItem.panel_number || 1,
                visual_description: "",
                plot_summary: outlineItem.plot_summary || "Đang tải...",
                dialogue: [],
                status: 'draft'
            }));

            setComicPages(newPages);
            updateUserDiamonds(data.newDiamondCount);
            setCurrentStep(2);
            showToast('Đã tạo khung kịch bản! Hệ thống sẽ tự động phân tích chi tiết từng trang.', 'success');
            setExpansionQueue(Array.from({ length: newPages.length }, (_, i) => i));

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsGeneratingScript(false);
        }
    };

    const handleExpandPage = async (pageIndex: number) => {
        const page = comicPages[pageIndex];
        if (!page) return;
        setExpandingPageId(page.id);
        try {
            const response = await fetch('/.netlify/functions/comic-expand-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ plot_summary: page.plot_summary || '', characters: characters.map(c => ({ name: c.name, description: c.description })), genre, style: artStyle, language })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to expand page');
            setComicPages(prev => {
                const next = [...prev];
                if (next[pageIndex]) next[pageIndex] = { ...next[pageIndex], visual_description: JSON.stringify(data.script_data) };
                return next;
            });
        } catch (error: any) {
            if (expansionQueue.length === 0) showToast(error.message, 'error');
        } finally {
            setExpandingPageId(null);
        }
    };
    
    useEffect(() => {
        if (expansionQueue.length === 0 || expandingPageId) return;
        const processNext = async () => {
            const nextIndex = expansionQueue[0];
            if (comicPages[nextIndex]) await handleExpandPage(nextIndex);
            setExpansionQueue(prev => prev.slice(1));
        };
        processNext();
    }, [expansionQueue, expandingPageId]);

    const handleRenderPage = async (index: number) => {
        const page = comicPages[index];
        if (!page.visual_description) return showToast('Vui lòng phân tích chi tiết kịch bản trước.', 'error');
        if (user && user.diamonds < RENDER_COST) return showToast(`Cần ${RENDER_COST} kim cương.`, 'error');

        setRenderingPageId(page.id);
        try {
            const response = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({
                    panel: page,
                    premise: premise,
                    characters: characters.map(c => ({ name: c.name, image_url: c.image_url })),
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

            fetch('/.netlify/functions/comic-render-background', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: data.jobId }) });
            updateUserDiamonds(data.newDiamondCount);
            
            setComicPages(prev => {
                const next = [...prev];
                if (next[index]) next[index] = { ...next[index], is_rendering: true, status: 'rendering' };
                return next;
            });
            showToast('Đã gửi yêu cầu vẽ...', 'success');
            startPolling(data.jobId, index);
        } catch (error: any) {
            showToast(error.message, 'error');
            setRenderingPageId(null);
        }
    };

    const startPolling = (jobId: string, pageIndex: number) => {
        const interval = setInterval(async () => {
            if (!supabase) { clearInterval(interval); return; }
            const { data, error } = await supabase.from('generated_images').select('image_url').eq('id', jobId).single();
            
            if (error) {
                clearInterval(interval);
                setRenderingPageId(null);
                setComicPages(prev => {
                    const next = [...prev];
                    if(next[pageIndex]) next[pageIndex] = { ...next[pageIndex], is_rendering: false, status: 'draft' };
                    return next;
                });
                showToast(`Vẽ trang ${pageIndex + 1} thất bại. Đã hoàn tiền.`, 'error');
                return;
            }

            if (data && data.image_url && data.image_url !== 'PENDING') {
                clearInterval(interval);
                setComicPages(prev => {
                    const next = [...prev];
                    if (next[pageIndex]) next[pageIndex] = { ...next[pageIndex], image_url: data.image_url, is_rendering: false, status: 'completed' };
                    return next;
                });
                setRenderingPageId(null);
                showToast(`Trang ${pageIndex + 1} đã hoàn tất!`, 'success');
                
                // Handle Batch Logic
                if (isBatchRendering) {
                    // Find next page that needs rendering
                    const nextPageIdx = comicPages.findIndex((p, idx) => idx > pageIndex && p.status !== 'completed' && p.status !== 'rendering');
                    if (nextPageIdx !== -1) {
                        // Small delay to be safe
                        setTimeout(() => handleRenderPage(nextPageIdx), 1000);
                    } else {
                        setIsBatchRendering(false);
                        showToast('Đã hoàn thành toàn bộ truyện!', 'success');
                    }
                }
            }
        }, 5000);
    };

    const handleRenderAll = () => {
        if (isBatchRendering) return;
        // Find first non-completed page
        const firstPageToRender = comicPages.findIndex(p => p.status !== 'completed' && p.status !== 'rendering');
        if (firstPageToRender === -1) return showToast("Tất cả các trang đã được vẽ!", "success");
        
        if (user && user.diamonds < RENDER_COST) return showToast(`Cần ${RENDER_COST} kim cương để bắt đầu.`, 'error');
        
        setIsBatchRendering(true);
        handleRenderPage(firstPageToRender);
    };

    const handleExport = async () => {
        const completedPages = comicPages.filter(p => p.image_url);
        if (completedPages.length === 0) return showToast('Chưa có trang nào hoàn tất.', 'error');
        const zip = new JSZip();
        const pdf = new jsPDF();
        for (let i = 0; i < completedPages.length; i++) {
            const page = completedPages[i];
            const imgData = await fetch(page.image_url!).then(res => res.blob());
            zip.file(`page_${i + 1}.png`, imgData);
            if (i > 0) pdf.addPage();
            const imgProps = pdf.getImageProperties(page.image_url!);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(page.image_url!, 'PNG', 0, 0, pdfWidth, pdfHeight);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipLink = document.createElement('a');
        zipLink.href = URL.createObjectURL(zipBlob);
        zipLink.download = `${comicTitle || 'comic'}_images.zip`;
        zipLink.click();
        pdf.save(`${comicTitle || 'comic'}.pdf`);
    };

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto animate-fade-in">
            <PremiseSelectionModal isOpen={isPremiseModalOpen} onClose={() => setIsPremiseModalOpen(false)} onSelect={handleApplyPremise} genre={genre} />
            <div className="flex justify-center">
                <StepIndicator currentStep={currentStep} />
            </div>

            {currentStep === 1 && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                        <div className="bg-[#12121A]/80 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-4 shadow-lg shadow-emerald-500/5 relative overflow-hidden group interactive-3d">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/30 shadow-inner">
                                <i className="ph-fill ph-lightning text-2xl text-emerald-400 animate-pulse"></i>
                            </div>
                            <div>
                                <h4 className="font-bold text-emerald-100 flex items-center gap-2 text-sm">Story Memory & Plot Logic <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase shadow-sm">HOT</span></h4>
                                <p className="text-xs text-emerald-200/60 mt-1 leading-relaxed font-medium">AI ghi nhớ diễn biến cốt truyện để phát triển tâm lý nhân vật sâu sắc hơn.</p>
                            </div>
                        </div>
                        <div className="bg-[#12121A]/80 border border-orange-500/20 p-4 rounded-xl flex items-center gap-4 shadow-lg shadow-orange-500/5 relative overflow-hidden group interactive-3d">
                            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 border border-orange-500/30 shadow-inner">
                                <i className="ph-fill ph-fire text-2xl text-orange-400 animate-pulse"></i>
                            </div>
                            <div>
                                <h4 className="font-bold text-orange-100 flex items-center gap-2 text-sm">Character Consistency <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase shadow-sm">ESSENTIAL</span></h4>
                                <p className="text-xs text-orange-200/60 mt-1 leading-relaxed font-medium">Hệ thống hỗ trợ tối đa 12 nhân vật tham chiếu. Độ đồng bộ 95-100%.</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-4">
                            <SettingsBlock title="Cấu Hình Truyện" instructionKey="comic-studio" onInstructionClick={onInstructionClick}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-skin-muted uppercase mb-1.5 block">Tên Truyện</label>
                                        <input type="text" className="auth-input" placeholder="VD: Trùm Trường Sợ Gián" value={comicTitle} onChange={(e) => setComicTitle(e.target.value)} />
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
                                            <input type="range" min="1" max="10" value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))} className="flex-grow accent-pink-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                            <span className="font-bold text-white w-8 text-center">{pageCount}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-1 italic">*Hệ thống sẽ tự cộng thêm 1 Trang Bìa.</p>
                                    </div>
                                </div>
                            </SettingsBlock>
                            <SettingsBlock title="Ý Tưởng Cốt Truyện">
                                <div className="relative">
                                    <textarea className="auth-input min-h-[150px] text-sm leading-relaxed resize-none" placeholder="Nhập tóm tắt câu chuyện của bạn..." value={premise} onChange={(e) => setPremise(e.target.value)} />
                                    <div className="absolute bottom-2 right-2">
                                        <button onClick={() => setIsPremiseModalOpen(true)} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/40 transition flex items-center gap-1">
                                            <i className="ph-fill ph-lightbulb"></i> Gợi ý kịch bản
                                        </button>
                                    </div>
                                </div>
                            </SettingsBlock>
                        </div>
                        <div className="lg:col-span-2">
                            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl p-6 h-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><i className="ph-fill ph-users-three text-pink-500"></i> Nhân Vật ({characters.length}/{MAX_CHARACTERS})</h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={onInstructionClick} className="flex items-center gap-1 text-xs text-skin-accent hover:opacity-80 transition-all px-2 py-1 rounded-md bg-skin-accent/10 border border-skin-border-accent hover:bg-skin-accent/20 shadow-accent hover:shadow-accent-lg"><i className="ph-fill ph-book-open"></i> Hướng dẫn</button>
                                        <button onClick={handleAddCharacter} disabled={characters.length >= MAX_CHARACTERS} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition flex items-center gap-2 disabled:opacity-50"><i className="ph-bold ph-plus"></i> Thêm</button>
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
                                                <button onClick={() => handleRemoveCharacter(char.id)} className="absolute top-2 right-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"><i className="ph-fill ph-x"></i></button>
                                                <div className="flex gap-4">
                                                    <div className="w-20 h-20 flex-shrink-0"><ImageUploader onUpload={(e) => handleCharacterImageUpload(e, char.id)} image={char.image_url ? { url: char.image_url } : null} onRemove={() => { setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, image_url: undefined, image_file: undefined } : c)); }} text="" className="w-full h-full min-h-0" /></div>
                                                    <div className="flex-grow space-y-2">
                                                        <div className="flex justify-between items-center"><span className="text-xs text-gray-500 font-bold uppercase">Nhân vật {idx + 1}</span></div>
                                                        <input type="text" className="w-full bg-transparent border-b border-white/10 focus:border-pink-500 text-sm font-bold text-white px-1 py-0.5 outline-none transition" value={char.name} onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} placeholder="Tên nhân vật" />
                                                        {char.is_analyzing ? (<div className="text-xs text-pink-400 flex items-center gap-1 animate-pulse"><i className="ph-fill ph-spinner animate-spin"></i> Đang phân tích...</div>) : (<textarea className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-gray-300 h-16 resize-none focus:border-white/30 outline-none" placeholder="Mô tả ngoại hình..." value={char.description} onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} />)}
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

            {currentStep >= 2 && (
                <div className="w-full max-w-5xl mx-auto">
                    {/* Main Action Bar */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 bg-[#1E1B25] p-4 rounded-xl border border-white/10 shadow-xl">
                        <div className="text-white">
                            <h2 className="text-xl font-bold">{comicTitle || 'Truyện Tranh Của Tôi'}</h2>
                            <p className="text-xs text-gray-400 mt-1">{comicPages.filter(p => p.status === 'completed').length} / {comicPages.length} trang hoàn tất</p>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={handleRenderAll}
                                disabled={isBatchRendering}
                                className={`px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-lg shadow-lg transition flex items-center gap-2 ${isBatchRendering ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-pink-500/30 hover:-translate-y-1'}`}
                            >
                                {isBatchRendering ? (
                                    <><i className="ph-fill ph-spinner animate-spin"></i> Đang vẽ tự động...</>
                                ) : (
                                    <><i className="ph-fill ph-paint-bucket"></i> Vẽ tất cả (Auto)</>
                                )}
                            </button>
                            <button onClick={handleExport} className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition flex items-center gap-2">
                                <i className="ph-fill ph-download-simple"></i> Xuất bản (PDF)
                            </button>
                        </div>
                    </div>

                    {/* Unified Page List */}
                    <div className="space-y-8">
                        {comicPages.map((page, idx) => (
                            <div key={page.id} className="bg-[#12121A]/90 border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-pink-500 to-purple-600"></div>
                                
                                <div className="flex justify-between items-center mb-6 pl-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="bg-white/10 px-2 py-1 rounded text-sm">#{idx === 0 ? 'COVER' : idx}</span>
                                        {idx === 0 ? 'Trang Bìa' : `Trang Nội Dung`}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        {page.status === 'rendering' && <span className="text-xs text-yellow-400 animate-pulse flex items-center gap-1"><i className="ph-fill ph-spinner animate-spin"></i> Đang vẽ...</span>}
                                        {page.status === 'completed' && <span className="text-xs text-green-400 flex items-center gap-1"><i className="ph-fill ph-check-circle"></i> Hoàn tất</span>}
                                        
                                        <button 
                                            onClick={() => handleRenderPage(idx)} 
                                            disabled={!!renderingPageId || page.status === 'rendering' || !page.visual_description}
                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold transition disabled:opacity-50 disabled:bg-gray-700"
                                        >
                                            {page.status === 'completed' ? 'Vẽ lại (10💎)' : 'Vẽ Trang Này (10💎)'}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pl-4">
                                    {/* Script Editor */}
                                    <div className="flex flex-col h-full">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                            <i className="ph-fill ph-text-aa"></i> Kịch bản & Lời thoại
                                        </h4>
                                        <ProfessionalScriptEditor 
                                            pageIndex={idx}
                                            panel={page} 
                                            onUpdate={(jsonStr) => {
                                                setComicPages(prev => {
                                                    const next = [...prev];
                                                    if (next[idx]) next[idx] = { ...next[idx], visual_description: jsonStr };
                                                    return next;
                                                });
                                            }}
                                            onExpand={() => handleExpandPage(idx)}
                                            isExpanding={expandingPageId === page.id}
                                        />
                                    </div>

                                    {/* Image Preview */}
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                            <i className="ph-fill ph-image"></i> Minh họa
                                        </h4>
                                        <div className="bg-black/40 rounded-xl border border-white/10 aspect-[3/4] flex items-center justify-center relative overflow-hidden group-hover:border-white/30 transition-colors">
                                            {page.image_url && page.image_url !== 'PENDING' ? (
                                                <>
                                                    <img src={page.image_url} alt={`Page ${idx}`} className="w-full h-full object-contain" />
                                                    <a href={page.image_url} download={`page_${idx}.png`} target="_blank" rel="noreferrer" className="absolute bottom-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-pink-500 transition opacity-0 group-hover:opacity-100">
                                                        <i className="ph-fill ph-download-simple text-xl"></i>
                                                    </a>
                                                </>
                                            ) : (
                                                <div className="text-center text-gray-600 p-8">
                                                    {page.status === 'rendering' ? (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                                                            <p className="text-xs">AI đang xử lý...</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <i className="ph-fill ph-image-square text-4xl mb-2 opacity-30"></i>
                                                            <p className="text-xs">Chưa có hình ảnh</p>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {currentStep === 1 && (
                <div className="flex justify-center mt-8 pb-12">
                    <div className="bg-[#1E1B25] p-4 rounded-2xl border border-white/10 flex items-center gap-6 shadow-2xl">
                        <div className="text-right">
                            <p className="text-xs text-gray-400">Tổng chi phí dự kiến</p>
                            <p className="text-xl font-black text-pink-400">2 💎 <span className="text-sm font-normal text-white">+ {(pageCount + 1) * RENDER_COST} 💎 (Vẽ {pageCount+1} trang)</span></p>
                        </div>
                        <button onClick={handleGenerateScript} disabled={isGeneratingScript} className="themed-button-primary px-10 py-4 text-lg font-bold rounded-xl shadow-lg hover:shadow-pink-500/40 transition transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3">
                            {isGeneratingScript ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Đang tạo kịch bản...</>) : (<>Tạo Kịch Bản <i className="ph-fill ph-arrow-right"></i></>)}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComicStudio;
