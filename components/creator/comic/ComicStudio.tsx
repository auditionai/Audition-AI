
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
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

const MAX_CHARACTERS = 10; // Increased limit for better layout

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

const DIALOGUE_DENSITY = [
    { label: 'Bình thường', value: 'normal' },
    { label: 'Ít thoại (Tập trung ảnh)', value: 'low' },
    { label: 'Nhiều thoại (Dẫn truyện)', value: 'high' }
];

const IMAGE_QUALITY = [
    { label: '1K (Tiêu chuẩn)', value: '1K', cost: 0 },
    { label: '2K (Sắc nét)', value: '2K', cost: 10 },
    { label: '4K (Siêu nét)', value: '4K', cost: 15 }
];

const BASE_RENDER_COST = 10; 

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
            <label className="text-[10px] font-bold text-skin-muted uppercase mb-1 block tracking-wide">{label}</label>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-center bg-[#1E1B25] border ${isOpen ? 'border-pink-500 ring-1 ring-pink-500/50' : 'border-white/10 hover:border-white/30'} rounded-lg px-3 py-2 text-xs text-white transition-all duration-200 h-10`}
            >
                <span className="truncate" style={previewFont && (selectedOption as any).family ? { fontFamily: (selectedOption as any).family } : {}}>
                    {selectedOption.label}
                </span>
                <i className={`ph-fill ph-caret-down text-gray-400 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180 text-pink-500' : ''}`}></i>
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
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center justify-between group
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
        { num: 2, label: 'Kịch bản', icon: 'ph-text-aa' },
        { num: 3, label: 'Sản xuất', icon: 'ph-paint-brush-broad' },
    ];

    return (
        <div className="bg-[#12121A]/50 border border-white/5 p-1 rounded-full flex items-center shadow-inner mb-6">
            {steps.map((step, idx) => {
                const isActive = step.num === currentStep;
                const isPast = step.num < currentStep;
                return (
                    <div key={step.num} className="flex items-center">
                        <div 
                            className={`
                                flex items-center gap-2 px-6 py-2 rounded-full transition-all duration-300 select-none
                                ${isActive 
                                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md font-bold scale-105' 
                                    : isPast 
                                        ? 'text-pink-300 hover:text-white bg-white/5' 
                                        : 'text-gray-600'
                                }
                            `}
                        >
                            <i className={`ph-fill ${step.icon} text-lg ${isActive ? 'animate-pulse' : ''}`}></i>
                            <span className={`text-sm ${isActive ? 'block' : 'hidden sm:block'}`}>{step.label}</span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={`w-8 h-0.5 mx-1 transition-colors duration-300 ${isPast ? 'bg-purple-500/50' : 'bg-white/5'}`}></div>
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
}> = ({ panel, onUpdate, onExpand, isExpanding }) => {
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
            <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-lg border border-white/10 min-h-[200px]">
                <p className="text-sm text-gray-400 mb-6 italic text-center max-w-md">
                    "{panel.plot_summary || 'Trang này chưa có nội dung tóm tắt.'}"
                </p>
                <button 
                    onClick={onExpand}
                    disabled={isExpanding}
                    className={`themed-button-primary px-6 py-2 rounded-full font-bold flex items-center gap-2 text-sm shadow-lg ${panel.visual_description ? 'bg-red-500' : ''}`}
                >
                    {isExpanding ? <i className="ph-fill ph-spinner animate-spin"></i> : <i className="ph-fill ph-magic-wand"></i>}
                    {isExpanding ? 'Đang phân tích...' : 'Phân tích chi tiết (Miễn phí)'}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in p-4 bg-white text-gray-900 rounded-lg shadow-xl border border-gray-300 font-serif">
            <div className="border-b-2 border-gray-800 pb-4 mb-4">
                <h4 className="text-center font-bold uppercase tracking-widest text-gray-500 text-xs">Kịch Bản Phân Cảnh</h4>
                <div className="mt-2 text-sm text-gray-700">
                    <strong>Tóm tắt cốt truyện:</strong> {panel.plot_summary}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                    <strong>Layout:</strong> {pageData.layout_note}
                </div>
            </div>

            {pageData.panels.map((p, pIdx) => (
                <div key={pIdx} className="mb-6 pl-4 border-l-4 border-gray-300">
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="font-black text-lg text-gray-900 uppercase">Panel {p.panel_id}</span>
                    </div>
                    
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Mô tả hình ảnh (Visual Description)</label>
                        <textarea 
                            className="w-full bg-gray-100 border border-gray-300 rounded p-3 text-sm text-gray-900 focus:border-gray-500 focus:ring-0 resize-none h-24 leading-relaxed font-sans"
                            value={p.description}
                            onChange={(e) => handlePanelDescChange(pIdx, e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Thoại (Dialogue)</label>
                        {p.dialogues && p.dialogues.map((d, dIdx) => (
                            <div key={dIdx} className="flex gap-3 items-start group">
                                <div className="w-1/4 pt-1">
                                    <input 
                                        type="text" 
                                        className="w-full bg-transparent border-none p-0 text-xs font-bold text-gray-800 uppercase text-right focus:ring-0"
                                        value={d.speaker}
                                        placeholder="NHÂN VẬT"
                                        onChange={(e) => handleDialogueChange(pIdx, dIdx, 'speaker', e.target.value)}
                                    />
                                </div>
                                <div className="flex-grow">
                                    <textarea 
                                        className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm text-gray-800 focus:border-gray-400 focus:ring-0 resize-none h-auto min-h-[40px]"
                                        value={d.text}
                                        placeholder="Nội dung thoại..."
                                        rows={2}
                                        onChange={(e) => handleDialogueChange(pIdx, dIdx, 'text', e.target.value)}
                                    />
                                </div>
                                <button onClick={() => removeDialogue(pIdx, dIdx)} className="text-gray-400 hover:text-red-500 p-1 pt-2 opacity-0 group-hover:opacity-100 transition-opacity"><i className="ph-fill ph-x"></i></button>
                            </div>
                        ))}
                        <div className="flex justify-center mt-2">
                            <button onClick={() => addDialogue(pIdx)} className="text-[10px] text-gray-400 hover:text-gray-600 font-bold border border-dashed border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition">
                                + Thêm thoại
                            </button>
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
    
    // New Features
    const [dialogueDensity, setDialogueDensity] = useState(DIALOGUE_DENSITY[0].value);
    const [imageQuality, setImageQuality] = useState(IMAGE_QUALITY[0].value);

    const [isGeneratingScript, setIsGeneratingScript] = useState(false);
    const [expandingPageId, setExpandingPageId] = useState<string | null>(null);
    const [renderingPageId, setRenderingPageId] = useState<string | null>(null);
    const [isPremiseModalOpen, setIsPremiseModalOpen] = useState(false);
    const [expansionQueue, setExpansionQueue] = useState<number[]>([]);
    const [isBatchRendering, setIsBatchRendering] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);

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
                body: JSON.stringify({ 
                    premise, genre, artStyle, pageCount, 
                    characters: characters.map(c => ({ name: c.name, description: c.description })), 
                    language, coverPage: coverOption,
                    dialogueDensity 
                })
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
            setCurrentStep(2); // Move to Scripting Step
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

    // Render Cost Logic
    const getRenderCost = () => {
        const selectedQuality = IMAGE_QUALITY.find(q => q.value === imageQuality);
        return BASE_RENDER_COST + (selectedQuality?.cost || 0);
    };

    const handleRenderPage = async (index: number) => {
        const page = comicPages[index];
        if (!page.visual_description) return showToast('Vui lòng phân tích chi tiết kịch bản trước.', 'error');
        
        const cost = getRenderCost();
        if (user && user.diamonds < cost) return showToast(`Cần ${cost} kim cương.`, 'error');

        setRenderingPageId(page.id);
        try {
            // Collect Global Context (Summaries of all pages)
            const globalContext = comicPages.map((p, i) => `Page ${i+1}: ${p.plot_summary}`).join('\n');

            const response = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({
                    panel: page,
                    premise: premise,
                    globalContext: globalContext, // NEW: Send full context
                    characters: characters.map(c => ({ name: c.name, image_url: c.image_url })),
                    storyTitle: comicTitle,
                    style: artStyle,
                    aspectRatio,
                    colorFormat,
                    visualEffect,
                    isCover: index === 0 && coverOption === 'start',
                    pageNumbering, 
                    bubbleFont,
                    imageQuality
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
                // Stop Batch if error
                setIsBatchRendering(false);
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
                
                // FIX: Robust Batch Render Logic
                // We verify if batch rendering is active via state ref check (in effect) or simple state logic
                // However, state updates in interval closure might be stale.
                // We rely on a functional update check in a useEffect or just check a ref.
                // Simpler approach: Use a flag in localstorage or just chain here carefully.
                // Since state inside interval is stale, we use the callback pattern or re-check.
                // BETTER: Use a useEffect to watch comicPages changes and trigger next if batch is on.
            }
        }, 5000);
    };

    // Batch Rendering Effect Queue
    useEffect(() => {
        if (!isBatchRendering) return;

        // Find the first non-completed, non-rendering page
        const nextPageIndex = comicPages.findIndex(p => p.status !== 'completed' && p.status !== 'rendering');
        
        // If no pages left to render, stop batch
        if (nextPageIndex === -1) {
            setIsBatchRendering(false);
            showToast('Đã hoàn thành toàn bộ truyện!', 'success');
            return;
        }

        // If we are not currently rendering any page (renderingPageId is null), start the next one
        // We need a small delay to ensure state updates propagate
        if (!renderingPageId) {
            const cost = getRenderCost();
            if (user && user.diamonds < cost) {
                setIsBatchRendering(false);
                showToast('Không đủ kim cương để tiếp tục vẽ tự động.', 'error');
                return;
            }
            
            const timer = setTimeout(() => {
                handleRenderPage(nextPageIndex);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [isBatchRendering, comicPages, renderingPageId]);

    const handleRenderAll = () => {
        const firstPageToRender = comicPages.findIndex(p => p.status !== 'completed' && p.status !== 'rendering');
        if (firstPageToRender === -1) return showToast("Tất cả các trang đã được vẽ!", "success");
        
        const cost = getRenderCost();
        if (user && user.diamonds < cost) return showToast(`Cần ${cost} kim cương để bắt đầu.`, 'error');
        
        setIsBatchRendering(true);
        // The useEffect above will pick it up
    };

    const handleDownloadAllImages = async () => {
        const completedPages = comicPages.filter(p => p.image_url);
        if (completedPages.length === 0) return showToast('Chưa có trang nào hoàn tất.', 'error');
        
        showToast('Đang tải xuống...', 'success');
        
        for (let i = 0; i < completedPages.length; i++) {
            const page = completedPages[i];
            // Create a download link for each image
            const a = document.createElement('a');
            // Clean title for filename
            const cleanTitle = (comicTitle || 'comic').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${cleanTitle}_Page_${page.panel_number}.png`;
            
            // Use the download proxy function
            a.href = `/.netlify/functions/download-image?url=${encodeURIComponent(page.image_url!)}`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Small delay between downloads
            await new Promise(r => setTimeout(r, 500));
        }
    };

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto animate-fade-in">
            <PremiseSelectionModal isOpen={isPremiseModalOpen} onClose={() => setIsPremiseModalOpen(false)} onSelect={handleApplyPremise} genre={genre} />
            
            {/* Lightbox */}
            {viewingImage && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage} alt="Fullsize" className="max-w-full max-h-full object-contain rounded shadow-2xl" />
                    <button className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300">&times;</button>
                </div>
            )}

            <div className="flex justify-center">
                <StepIndicator currentStep={currentStep} />
            </div>

            {/* --- STEP 1: SETUP --- */}
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
                                        <label className="text-[10px] font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">Tên Truyện</label>
                                        <input type="text" className="auth-input h-10 text-sm" placeholder="VD: Trùm Trường Sợ Gián" value={comicTitle} onChange={(e) => setComicTitle(e.target.value)} />
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
                                    
                                    {/* New Options */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <ComicSelect label="Lượng lời thoại" value={dialogueDensity} onChange={setDialogueDensity} options={DIALOGUE_DENSITY} />
                                        <div>
                                            <label className="text-[10px] font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">Chất lượng ảnh</label>
                                            <div className="grid grid-cols-3 gap-1 bg-[#1E1B25] p-1 rounded-lg border border-white/10">
                                                {IMAGE_QUALITY.map(q => (
                                                    <button 
                                                        key={q.value}
                                                        onClick={() => setImageQuality(q.value)}
                                                        className={`text-[10px] py-1.5 rounded font-bold transition ${imageQuality === q.value ? 'bg-pink-500 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                                                        title={`Phí thêm: ${q.cost} Kim cương`}
                                                    >
                                                        {q.value}
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[9px] text-pink-400 mt-1 text-right">Phụ phí: +{IMAGE_QUALITY.find(q=>q.value===imageQuality)?.cost}💎/trang</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-skin-muted uppercase mb-1.5 block tracking-wide">Số lượng trang NỘI DUNG</label>
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
                                        <button onClick={() => setIsPremiseModalOpen(true)} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/40 transition flex items-center gap-1 font-bold">
                                            <i className="ph-fill ph-lightbulb"></i> Gợi ý kịch bản
                                        </button>
                                    </div>
                                </div>
                            </SettingsBlock>
                        </div>
                        <div className="lg:col-span-2 flex flex-col gap-4">
                            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl p-6 flex-grow flex flex-col">
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
                                    // Grid fixed to match card aspect ratio
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2 flex-grow content-start">
                                        {characters.map((char, idx) => (
                                            <div key={char.id} className="bg-[#1E1B25] p-2 rounded-xl border border-white/5 relative group flex flex-col h-full">
                                                <button onClick={() => handleRemoveCharacter(char.id)} className="absolute top-1 right-1 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1 z-10 bg-black/50 rounded-full"><i className="ph-fill ph-x text-xs"></i></button>
                                                <div className="aspect-[3/4] w-full mb-2">
                                                    <ImageUploader onUpload={(e) => handleCharacterImageUpload(e, char.id)} image={char.image_url ? { url: char.image_url } : null} onRemove={() => { setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, image_url: undefined, image_file: undefined } : c)); }} text="Ảnh" className="w-full h-full" />
                                                </div>
                                                <div className="flex-grow space-y-1">
                                                    <div className="flex justify-between items-center"><span className="text-[10px] text-gray-500 font-bold uppercase">NV {idx + 1}</span></div>
                                                    <input type="text" className="w-full bg-transparent border-b border-white/10 focus:border-pink-500 text-xs font-bold text-white px-1 py-0.5 outline-none transition" value={char.name} onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, name: e.target.value } : c))} placeholder="Tên NV" />
                                                    {char.is_analyzing ? (<div className="text-[10px] text-pink-400 flex items-center gap-1 animate-pulse"><i className="ph-fill ph-spinner animate-spin"></i> Đang phân tích...</div>) : (<textarea className="w-full bg-black/20 border border-white/10 rounded p-1 text-[10px] text-gray-300 h-12 resize-none focus:border-white/30 outline-none" placeholder="Mô tả ngoại hình..." value={char.description} onChange={(e) => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, description: e.target.value } : c))} />)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            {/* Separate Create Script Button */}
                            <div className="bg-[#1E1B25] p-4 rounded-xl border border-white/10 flex items-center justify-between shadow-lg">
                                <div>
                                    <p className="text-xs text-gray-400">Chi phí tạo kịch bản</p>
                                    <p className="text-2xl font-black text-pink-400">2 💎</p>
                                </div>
                                <button onClick={handleGenerateScript} disabled={isGeneratingScript} className="themed-button-primary px-8 py-4 text-lg font-bold rounded-full shadow-lg hover:shadow-pink-500/40 transition transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 w-full md:w-auto justify-center">
                                    {isGeneratingScript ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Đang viết kịch bản...</>) : (<>TẠO KỊCH BẢN NGAY <i className="ph-fill ph-arrow-right"></i></>)}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* --- STEP 2: SCRIPTING (TEXT ONLY) --- */}
            {currentStep === 2 && (
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6 bg-[#1E1B25] p-4 rounded-xl border border-white/10 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-white">Biên Tập Kịch Bản</h2>
                            <p className="text-xs text-gray-400">Phân tích chi tiết và chỉnh sửa lời thoại trước khi vẽ.</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentStep(1)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold">Quay lại</button>
                            <button onClick={() => setCurrentStep(3)} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold flex items-center gap-2">
                                Xong, chuyển sang Vẽ <i className="ph-bold ph-arrow-right"></i>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {comicPages.map((page, idx) => (
                            <div key={page.id} className="bg-[#12121A]/90 border border-white/10 rounded-xl p-6 relative">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <span className="bg-white/10 px-2 py-1 rounded text-sm">#{idx === 0 ? 'COVER' : idx}</span>
                                        {idx === 0 ? 'Kịch bản Trang Bìa' : `Kịch bản Trang ${idx}`}
                                    </h3>
                                </div>
                                <ProfessionalScriptEditor 
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
                        ))}
                    </div>
                    
                    <div className="flex justify-center mt-8">
                        <button onClick={() => setCurrentStep(3)} className="themed-button-primary px-10 py-3 text-lg font-bold rounded-full shadow-lg">
                            Hoàn tất kịch bản & Chuyển sang Vẽ
                        </button>
                    </div>
                </div>
            )}

            {/* --- STEP 3: PRODUCTION (IMAGE ONLY) --- */}
            {currentStep === 3 && (
                <div className="w-full max-w-6xl mx-auto">
                    {/* Main Action Bar */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 bg-[#1E1B25] p-4 rounded-xl border border-white/10 shadow-xl sticky top-20 z-30">
                        <div className="text-white">
                            <h2 className="text-xl font-bold">{comicTitle || 'Phòng Tranh & Xuất Bản'}</h2>
                            <p className="text-xs text-gray-400 mt-1">{comicPages.filter(p => p.status === 'completed').length} / {comicPages.length} trang hoàn tất</p>
                        </div>
                        <div className="flex gap-3 items-center">
                             {/* Re-add script edit for quick fixes */}
                            <button onClick={() => setCurrentStep(2)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold">Sửa kịch bản</button>
                            
                            <div className="h-8 w-px bg-white/10 mx-1"></div>
                            
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
                            <button onClick={handleDownloadAllImages} className="px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition flex items-center gap-2 shadow-lg">
                                <i className="ph-fill ph-download-simple"></i> Tải tất cả ảnh
                            </button>
                        </div>
                    </div>

                    {/* Unified Grid View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {comicPages.map((page, idx) => (
                            <div key={page.id} className="bg-[#12121A]/90 border border-white/10 rounded-2xl p-4 relative overflow-hidden group flex flex-col h-full shadow-lg">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                        <span className="bg-white/10 px-2 py-0.5 rounded text-xs">#{idx === 0 ? 'COVER' : idx}</span>
                                        {page.status === 'completed' && <span className="text-green-400 text-xs flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded"><i className="ph-fill ph-check-circle"></i> Xong</span>}
                                        {page.status === 'rendering' && <span className="text-yellow-400 text-xs flex items-center gap-1 animate-pulse bg-yellow-500/10 px-2 py-0.5 rounded"><i className="ph-fill ph-spinner animate-spin"></i> Đang vẽ...</span>}
                                    </h3>
                                    <button 
                                        onClick={() => handleRenderPage(idx)} 
                                        disabled={!!renderingPageId || page.status === 'rendering' || !page.visual_description}
                                        className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded font-bold transition disabled:opacity-50 disabled:bg-gray-700 shadow-md"
                                    >
                                        {page.status === 'completed' ? `Vẽ lại (${getRenderCost()}💎)` : `Vẽ Trang Này (${getRenderCost()}💎)`}
                                    </button>
                                </div>

                                <div className="flex-grow bg-black/40 rounded-xl border border-white/10 aspect-[2/3] flex items-center justify-center relative overflow-hidden group-hover:border-white/30 transition-colors">
                                    {page.image_url && page.image_url !== 'PENDING' ? (
                                        <>
                                            <img 
                                                src={page.image_url} 
                                                alt={`Page ${idx}`} 
                                                className="w-full h-full object-contain cursor-zoom-in" 
                                                onClick={() => setViewingImage(page.image_url!)}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 pointer-events-none">
                                                <p className="text-white text-xs line-clamp-3 italic mb-2 text-shadow-md">{page.plot_summary}</p>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center text-gray-600 p-8">
                                            {page.status === 'rendering' ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-10 h-10 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                                                    <p className="text-xs font-semibold animate-pulse text-pink-400">AI đang vẽ...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <i className="ph-fill ph-image-square text-4xl mb-2 opacity-30"></i>
                                                    <p className="text-xs font-medium">Chưa có hình ảnh</p>
                                                    {/* Fix: Handle possibly undefined plot_summary safely */}
                                                    <p className="text-[10px] mt-1 text-gray-700 italic max-w-xs mx-auto">{(page.plot_summary || '').substring(0, 50)}...</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComicStudio;
