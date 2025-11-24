
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import SettingsBlock from '../ai-tool/SettingsBlock';
import ImageUploader from '../../ai-tool/ImageUploader';
import { useTranslation } from '../../../hooks/useTranslation';

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
    { label: 'Pixel Art', value: 'Pixel Art' }, 
    { label: 'Cyberpunk', value: 'Cyberpunk Neon' }
];

const LANGUAGES = ['Tiếng Việt', 'Tiếng Anh', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc'];

const COLOR_FORMATS = [
    { label: 'Đầy đủ màu sắc', value: 'Full Color' }, 
    { label: 'Đen trắng / Manga', value: 'Black and White, Screen tones' }, 
    { label: 'Bản phác thảo thô', value: 'Rough Sketch, Pencil' }
];

const ASPECT_RATIOS = [
    { label: '9:16 (Điện thoại)', value: '9:16' }, 
    { label: '1:1 (Vuông)', value: '1:1' }, 
    { label: '3:4 (Chân dung)', value: '3:4' }, 
    { label: '4:3 (Phong cảnh)', value: '4:3' }, 
    { label: '16:9 (Điện ảnh)', value: '16:9' }
];

const DIALOGUE_AMOUNTS = [
    { label: 'Ít', value: 'Minimal' }, 
    { label: 'Vừa phải', value: 'Moderate' }, 
    { label: 'Nhiều', value: 'Heavy' }
];

const COVER_OPTIONS = [
    { label: 'Tự động tạo bìa', value: 'start' }, 
    { label: 'Không có', value: 'none' }
];

const RENDER_COST = 10; 
const MAX_CHARACTERS = 12;

// --- TYPES ---
interface PanelData {
    id: number;
    visual: string;
    dialogue: { speaker: string; text: string }[];
}

interface PageScriptData {
    layout_description: string;
    panels: PanelData[];
}

interface ComicSettings {
    title: string;
    genre: string;
    artStyle: string;
    language: string;
    dialogueAmount: string;
    pageCount: number;
    premise: string;
    colorFormat: string;
    aspectRatio: string;
    coverPage: string;
}

// --- SUB-COMPONENTS ---

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
    const steps = [
        { num: 1, label: 'Thiết lập', icon: 'ph-sliders' }, 
        { num: 2, label: 'Kịch bản', icon: 'ph-scroll' }, 
        { num: 3, label: 'Sản xuất', icon: 'ph-paint-brush-broad' }
    ];
    return (
        <div className="bg-[#12121A]/50 border border-white/5 p-1 rounded-full flex items-center shadow-inner justify-center w-full max-w-2xl mx-auto mb-6">
            {steps.map((step, idx) => (
                <div key={step.num} className="flex items-center">
                    <div className={`flex items-center px-4 py-2 rounded-full gap-2 transition-all duration-300 ${step.num === currentStep ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold shadow-lg' : step.num < currentStep ? 'text-green-400' : 'text-gray-600'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step.num === currentStep ? 'bg-white text-pink-600' : 'border border-current'}`}>
                            {step.num < currentStep ? <i className="ph-bold ph-check"></i> : step.num}
                        </div>
                        <span className={`${step.num === currentStep ? 'block' : 'hidden md:block'}`}>{step.label}</span>
                    </div>
                    {idx < steps.length - 1 && (
                        <div className={`h-0.5 w-8 md:w-16 mx-2 ${step.num < currentStep ? 'bg-green-500/50' : 'bg-gray-800'}`}></div>
                    )}
                </div>
            ))}
        </div>
    );
};

const ComicSelect = ({ label, value, onChange, options }: any) => (
    <div className="relative group">
        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block group-hover:text-pink-400 transition-colors">{label}</label>
        <div className="relative">
            <select 
                className="w-full bg-[#0F0F13] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:border-pink-500 outline-none appearance-none transition-all hover:bg-white/5" 
                value={value} 
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((opt: any) => (
                    <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                        {typeof opt === 'string' ? opt : opt.label}
                    </option>
                ))}
            </select>
            <i className="ph-fill ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"></i>
        </div>
    </div>
);

// --- SCRIPT EDITOR COMPONENT ---
interface ScriptEditorProps {
    pageId: string;
    scriptData: PageScriptData;
    onUpdate: (newData: PageScriptData) => void;
    pageNumber: number;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ scriptData, onUpdate, pageNumber }) => {
    
    const handleLayoutChange = (val: string) => {
        onUpdate({ ...scriptData, layout_description: val });
    };

    const handlePanelChange = (idx: number, field: 'visual', val: string) => {
        const newPanels = [...scriptData.panels];
        newPanels[idx] = { ...newPanels[idx], [field]: val };
        onUpdate({ ...scriptData, panels: newPanels });
    };

    const handleDialogueChange = (panelIdx: number, diaIdx: number, field: 'speaker' | 'text', val: string) => {
        const newPanels = [...scriptData.panels];
        const newDialogue = [...newPanels[panelIdx].dialogue];
        newDialogue[diaIdx] = { ...newDialogue[diaIdx], [field]: val };
        newPanels[panelIdx].dialogue = newDialogue;
        onUpdate({ ...scriptData, panels: newPanels });
    };

    const addDialogue = (panelIdx: number) => {
        const newPanels = [...scriptData.panels];
        newPanels[panelIdx].dialogue.push({ speaker: 'Nhân vật', text: '' });
        onUpdate({ ...scriptData, panels: newPanels });
    };

    const removeDialogue = (panelIdx: number, diaIdx: number) => {
        const newPanels = [...scriptData.panels];
        newPanels[panelIdx].dialogue.splice(diaIdx, 1);
        onUpdate({ ...scriptData, panels: newPanels });
    };

    return (
        <div className="animate-fade-in">
            {/* Page Layout Description */}
            <div className="mb-6 bg-blue-900/10 border border-blue-500/20 p-4 rounded-lg flex gap-3 items-start">
                <div className="mt-1 text-blue-400"><i className="ph-fill ph-layout text-xl"></i></div>
                <div className="flex-grow">
                    <label className="text-xs font-bold text-blue-300 uppercase mb-1 block">Bố cục trang (Page Layout)</label>
                    <textarea 
                        className="w-full bg-transparent border-b border-blue-500/30 text-sm text-blue-100 focus:outline-none py-1 resize-none h-16"
                        value={scriptData.layout_description}
                        onChange={(e) => handleLayoutChange(e.target.value)}
                        placeholder="Mô tả cách sắp xếp các khung tranh trên trang này..."
                    />
                </div>
            </div>

            {/* Panels Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {scriptData.panels.map((panel, pIdx) => (
                    <div key={pIdx} className="bg-[#18181C] border border-white/5 rounded-xl overflow-hidden hover:border-pink-500/30 transition-colors group">
                        {/* Panel Header */}
                        <div className="bg-black/40 px-3 py-2 border-b border-white/5 flex justify-between items-center">
                            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <span className="bg-pink-600 text-white w-5 h-5 rounded flex items-center justify-center text-[10px]">{panel.id}</span>
                                Khung Tranh (Panel)
                            </span>
                        </div>

                        <div className="p-3 flex flex-col h-full gap-3">
                            {/* Visual Prompt */}
                            <div className="flex-grow">
                                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Mô tả hình ảnh (Visual)</label>
                                <textarea 
                                    className="w-full h-24 bg-[#0F0F13] border border-white/10 rounded-lg p-2 text-sm text-gray-300 resize-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition placeholder-gray-700"
                                    value={panel.visual}
                                    onChange={(e) => handlePanelChange(pIdx, 'visual', e.target.value)}
                                    placeholder="Mô tả chi tiết hình ảnh trong khung này..."
                                />
                            </div>

                            {/* Dialogue List */}
                            <div className="bg-[#0F0F13] rounded-lg border border-white/5 p-2">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block">Lời thoại</label>
                                    <button onClick={() => addDialogue(pIdx)} className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white transition flex items-center gap-1">
                                        <i className="ph-bold ph-plus"></i> Thêm
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                                    {panel.dialogue.length === 0 && <p className="text-xs text-gray-600 italic text-center py-2">Chưa có lời thoại</p>}
                                    {panel.dialogue.map((dia, dIdx) => (
                                        <div key={dIdx} className="flex gap-2 items-center bg-black/20 p-1.5 rounded border border-white/5">
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                                                {dia.speaker.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-grow min-w-0 flex flex-col">
                                                <input 
                                                    className="bg-transparent text-[10px] font-bold text-yellow-400 focus:outline-none w-full"
                                                    value={dia.speaker}
                                                    onChange={(e) => handleDialogueChange(pIdx, dIdx, 'speaker', e.target.value)}
                                                    placeholder="Tên NV"
                                                />
                                                <input 
                                                    className="bg-transparent text-xs text-white focus:outline-none w-full"
                                                    value={dia.text}
                                                    onChange={(e) => handleDialogueChange(pIdx, dIdx, 'text', e.target.value)}
                                                    placeholder="Nội dung thoại..."
                                                />
                                            </div>
                                            <button onClick={() => removeDialogue(pIdx, dIdx)} className="text-gray-600 hover:text-red-400 p-1"><i className="ph-fill ph-trash"></i></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const ComicStudio: React.FC<{ onInstructionClick?: () => void }> = ({ onInstructionClick }) => {
    const { session, showToast, updateUserDiamonds, supabase, user } = useAuth();
    const { t } = useTranslation();
    
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1); 
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");
    
    // Step 1 Data
    const [characters, setCharacters] = useState<ComicCharacter[]>([]);
    const [settings, setSettings] = useState<ComicSettings>({
        title: '', 
        genre: GENRES[0], 
        artStyle: ART_STYLES[0].value, 
        language: LANGUAGES[0],
        dialogueAmount: DIALOGUE_AMOUNTS[1].value, 
        pageCount: 1, 
        premise: '',
        colorFormat: COLOR_FORMATS[0].value, 
        aspectRatio: ASPECT_RATIOS[0].value, 
        coverPage: COVER_OPTIONS[0].value
    });

    // Step 2 & 3 Data
    // Panels here act as PAGES container for the top level logic, but each "ComicPanel" object will contain the JSON for the whole page
    const [pages, setPages] = useState<ComicPanel[]>([]); 

    const handleAddCharacter = () => {
        if (characters.length >= MAX_CHARACTERS) return showToast("Đạt giới hạn nhân vật.", "error");
        setCharacters([...characters, { id: crypto.randomUUID(), name: `Nhân vật ${characters.length+1}`, description: '', is_analyzing: false }]);
    };

    const handleUploadChar = async (id: string, file: File) => {
        const { dataUrl } = await resizeImage(file, 512);
        setCharacters(prev => prev.map(c => c.id === id ? { ...c, image_url: dataUrl, is_analyzing: true } : c));
        try {
            const res = await fetch('/.netlify/functions/comic-analyze-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ image: dataUrl })
            });
            const data = await res.json();
            setCharacters(prev => prev.map(c => c.id === id ? { ...c, description: data.description, is_analyzing: false } : c));
        } catch (e) { setCharacters(prev => prev.map(c => c.id === id ? { ...c, is_analyzing: false } : c)); }
    };

    const handleDeleteChar = (id: string) => {
        setCharacters(prev => prev.filter(c => c.id !== id));
    };

    const handleGenerateScript = async () => {
        if (!settings.premise || characters.length === 0) return showToast("Thiếu thông tin cốt truyện hoặc nhân vật.", "error");
        setIsLoading(true); 
        setStatusMsg("Đang phân tích ý tưởng & lên kịch bản...");
        
        try {
            // 1. Get Outline (List of Pages)
            const res = await fetch('/.netlify/functions/comic-generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ ...settings, characters })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            updateUserDiamonds(data.newDiamondCount);

            // 2. Initialize Pages
            const outline = data.outline;
            const initialPages = outline.map((p: any) => ({
                id: crypto.randomUUID(),
                panel_number: p.panel_number,
                visual_description: JSON.stringify({ 
                    layout_description: "Đang tải...", 
                    panels: [{ id: 1, visual: "Đang tạo chi tiết...", dialogue: [] }] 
                }), 
                plot_summary: p.plot_summary,
                dialogue: [],
                is_rendering: false
            }));
            setPages(initialPages);
            setActiveStep(2);

            // 3. Expand Each Page into Structured Panels sequentially to maintain context
            const completedPages: any[] = [];
            for (let i = 0; i < outline.length; i++) {
                setStatusMsg(`Đang viết chi tiết Trang ${i+1}/${outline.length}...`);
                try {
                    const expandRes = await fetch('/.netlify/functions/comic-expand-panel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                        body: JSON.stringify({ 
                            plot_summary: outline[i].plot_summary, 
                            characters, 
                            style: settings.artStyle, 
                            genre: settings.genre, 
                            language: settings.language,
                            previous_panels: completedPages.slice(-1) // Context from prev page
                        })
                    });
                    const details = await expandRes.json();
                    // Update state for this page
                    setPages(prev => prev.map(p => p.panel_number === outline[i].panel_number ? { ...p, visual_description: details.visual_description } : p));
                    completedPages.push(details);
                } catch (e) { console.error(e); }
            }
            setStatusMsg("");
        } catch (e: any) { showToast(e.message, "error"); } finally { setIsLoading(false); }
    };

    const handleUpdateScript = (pageId: string, newData: PageScriptData) => {
        setPages(prev => prev.map(p => p.id === pageId ? { ...p, visual_description: JSON.stringify(newData) } : p));
    };

    const handleRenderPage = async (page: ComicPanel) => {
        if (!user) return;
        if (user.diamonds < RENDER_COST) return showToast(`Cần ${RENDER_COST} kim cương để vẽ trang này.`, 'error');

        setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_rendering: true } : p));
        try {
            const res = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ 
                    panel: page, // Contains the JSON string in visual_description
                    characters, 
                    storyTitle: settings.title, 
                    style: settings.artStyle,
                    colorFormat: settings.colorFormat,
                    aspectRatio: settings.aspectRatio,
                    isCover: page.panel_number === 1 && settings.coverPage !== 'none'
                })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error);
            
            updateUserDiamonds(data.newDiamondCount);
            
            // Subscribe to result
            const channel = supabase!.channel(`comic-job-${data.jobId}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'generated_images', filter: `id=eq.${data.jobId}` }, (payload: any) => {
                    if (payload.new.image_url && payload.new.image_url !== 'PENDING') {
                        setPages(prev => prev.map(p => p.id === page.id ? { ...p, image_url: payload.new.image_url, is_rendering: false } : p));
                        supabase!.removeChannel(channel);
                        showToast(`Đã vẽ xong Trang ${page.panel_number}!`, 'success');
                    }
                }).subscribe();
            
            // Trigger worker
            fetch('/.netlify/functions/comic-render-worker', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ jobId: data.jobId }) });

        } catch (e: any) { 
            showToast(e.message, "error"); 
            setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_rendering: false } : p));
        }
    };

    const handleDownload = (url: string) => {
        const a = document.createElement('a');
        a.href = `/.netlify/functions/download-image?url=${encodeURIComponent(url)}`;
        a.download = `comic-page.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    return (
        <div className="animate-fade-in w-full flex flex-col h-[calc(100vh-100px)] bg-[#12121A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
            
            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="relative w-24 h-24 mb-6">
                        <div className="absolute inset-0 border-4 border-pink-500/20 rounded-full animate-ping"></div>
                        <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
                        <i className="ph-fill ph-magic-wand absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl text-pink-400"></i>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Comic Studio AI</h3>
                    <p className="text-pink-300 animate-pulse">{statusMsg}</p>
                </div>
            )}

            {/* Header Steps */}
            <div className="p-4 border-b border-white/10 bg-[#181820] z-10 shadow-md">
                <StepIndicator currentStep={activeStep} />
            </div>
            
            {/* Main Scrollable Content */}
            <div className="flex-grow overflow-y-auto p-4 lg:p-8 custom-scrollbar bg-[#0F0F13] bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                
                {/* STEP 1: SETUP */}
                {activeStep === 1 && (
                    <div className="grid lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
                        {/* Left: Settings */}
                        <div className="lg:col-span-5 space-y-6">
                            <SettingsBlock title="Cấu Hình Truyện" instructionKey="comic-studio" onInstructionClick={onInstructionClick || (() => {})}>
                                <div className="space-y-5">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Tên Truyện</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-[#1E1B25] border border-white/10 rounded-lg p-3 text-white font-bold focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" 
                                            placeholder="Nhập tên bộ truyện..." 
                                            value={settings.title} 
                                            onChange={e => setSettings({...settings, title: e.target.value})} 
                                        />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <ComicSelect label="Thể loại" value={settings.genre} onChange={(v: string) => setSettings({...settings, genre: v})} options={GENRES} />
                                        <ComicSelect label="Ngôn ngữ" value={settings.language} onChange={(v: string) => setSettings({...settings, language: v})} options={LANGUAGES} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <ComicSelect label="Phong cách vẽ" value={settings.artStyle} onChange={(v: string) => setSettings({...settings, artStyle: v})} options={ART_STYLES} />
                                        <ComicSelect label="Màu sắc" value={settings.colorFormat} onChange={(v: string) => setSettings({...settings, colorFormat: v})} options={COLOR_FORMATS} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <ComicSelect label="Số trang dự kiến" value={settings.pageCount} onChange={(v: any) => setSettings({...settings, pageCount: v})} options={[1,2,3,4,5].map(n => ({label: n+' Trang', value: n}))} />
                                        <ComicSelect label="Tỷ lệ khung hình" value={settings.aspectRatio} onChange={(v: string) => setSettings({...settings, aspectRatio: v})} options={ASPECT_RATIOS} />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block flex justify-between">
                                            <span>Cốt truyện (Premise)</span>
                                            <button className="text-pink-400 hover:text-pink-300 flex items-center gap-1" onClick={() => setSettings({...settings, premise: "Một nhóm bạn thân cùng nhau tham gia giải đấu Audition toàn quốc để cứu CLB của trường khỏi bị giải thể."})}><i className="ph-bold ph-magic-wand"></i> Gợi ý mẫu</button>
                                        </label>
                                        <textarea 
                                            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white h-32 resize-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition" 
                                            placeholder="Mô tả ngắn gọn về nội dung câu chuyện, bối cảnh, và các sự kiện chính..." 
                                            value={settings.premise} 
                                            onChange={e => setSettings({...settings, premise: e.target.value})} 
                                        />
                                    </div>
                                    
                                    <div className="pt-4 border-t border-white/10">
                                        <ComicSelect label="Tùy chọn trang bìa" value={settings.coverPage} onChange={(v: string) => setSettings({...settings, coverPage: v})} options={COVER_OPTIONS} />
                                    </div>
                                </div>
                            </SettingsBlock>
                        </div>

                        {/* Right: Characters */}
                        <div className="lg:col-span-7 h-full flex flex-col">
                            <div className="bg-[#1E1B25] rounded-xl border border-white/10 p-5 h-full shadow-lg flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                            <i className="ph-fill ph-users-three text-pink-500"></i> Casting Nhân Vật
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1">Tải ảnh để AI học đặc điểm nhân vật ({characters.length}/{MAX_CHARACTERS})</p>
                                    </div>
                                    <button onClick={handleAddCharacter} className="text-sm bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg transition transform hover:-translate-y-0.5 flex items-center gap-2">
                                        <i className="ph-bold ph-plus"></i> Thêm Nhân Vật
                                    </button>
                                </div>
                                
                                {characters.length === 0 ? (
                                    <div className="flex-grow flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-700 rounded-xl p-8">
                                        <i className="ph-fill ph-user-focus text-6xl mb-4 opacity-50"></i>
                                        <p>Chưa có diễn viên nào.</p>
                                        <p className="text-sm">Nhấn "Thêm Nhân Vật" để bắt đầu.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar pr-2 max-h-[600px]">
                                        {characters.map(c => (
                                            <div key={c.id} className="flex bg-black/40 rounded-xl p-3 gap-4 border border-white/5 hover:border-pink-500/30 transition group">
                                                <label className="w-20 h-20 bg-black rounded-lg cursor-pointer overflow-hidden relative flex-shrink-0 border border-white/10 group-hover:border-pink-500/50 transition">
                                                    {c.image_url ? (
                                                        <img src={c.image_url} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 hover:text-white transition bg-white/5 hover:bg-white/10">
                                                            <i className="ph-bold ph-camera text-2xl mb-1"></i>
                                                            <span className="text-[10px] font-bold">Upload</span>
                                                        </div>
                                                    )}
                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUploadChar(c.id, e.target.files[0])} />
                                                    {c.is_analyzing && (
                                                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                                            <i className="ph-bold ph-spinner animate-spin text-pink-500"></i>
                                                        </div>
                                                    )}
                                                </label>
                                                <div className="flex-grow flex flex-col justify-center min-w-0">
                                                    <input 
                                                        type="text" 
                                                        value={c.name} 
                                                        onChange={e => setCharacters(prev => prev.map(ch => ch.id === c.id ? {...ch, name: e.target.value} : ch))} 
                                                        className="bg-transparent text-sm font-bold text-white mb-2 w-full outline-none border-b border-transparent focus:border-pink-500 transition px-1" 
                                                        placeholder="Tên nhân vật..." 
                                                    />
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[10px] px-2 py-1 rounded border ${c.description ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
                                                            {c.is_analyzing ? 'Đang phân tích...' : c.description ? 'Đã học xong' : 'Cần ảnh mẫu'}
                                                        </span>
                                                        <button onClick={() => handleDeleteChar(c.id)} className="text-gray-600 hover:text-red-500 p-1 transition"><i className="ph-fill ph-trash"></i></button>
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

                {/* STEP 2: SCRIPT EDITING */}
                {activeStep === 2 && (
                    <div className="max-w-5xl mx-auto space-y-8">
                        <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/20 p-6 rounded-xl mb-8 text-center">
                            <h2 className="text-2xl font-bold text-white mb-2">Kịch Bản Chi Tiết</h2>
                            <p className="text-gray-400">AI đã chia cốt truyện thành các trang. Hãy kiểm tra và chỉnh sửa chi tiết từng khung hình trước khi vẽ.</p>
                        </div>

                        {pages.map((page) => {
                            let parsedScript: PageScriptData = { layout_description: "", panels: [] };
                            try { 
                                parsedScript = JSON.parse(page.visual_description); 
                            } catch (e) { 
                                // Fallback if parsing fails (legacy data)
                                parsedScript = { layout_description: "Standard", panels: [] };
                            }
                            
                            return (
                                <div key={page.id} className="bg-[#12121A] border border-white/10 rounded-xl overflow-hidden shadow-xl hover:shadow-pink-500/5 transition-shadow duration-300">
                                    <div className="bg-[#1E1B25] p-4 border-b border-white/10 flex justify-between items-start gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-pink-600 text-white font-black px-3 py-1 rounded text-lg">
                                                P.{page.panel_number}
                                            </div>
                                            <div>
                                                <h3 className="text-white font-bold text-lg">TRANG {page.panel_number}</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">Script ID: {page.id.substring(0, 8)}</p>
                                            </div>
                                        </div>
                                        <div className="bg-black/30 px-4 py-2 rounded-lg border border-white/5 text-sm text-gray-300 max-w-lg italic">
                                            "{page.plot_summary}"
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 bg-[#15151a]">
                                        {page.visual_description.startsWith('(') ? (
                                            <div className="text-center py-12 text-yellow-400 animate-pulse font-mono bg-yellow-900/10 rounded-xl border border-yellow-500/20">
                                                <i className="ph-bold ph-warning-circle text-2xl mb-2 block"></i>
                                                Dữ liệu cũ (Text thuần). Vui lòng tạo lại kịch bản để có tính năng chia khung mới.
                                            </div>
                                        ) : (
                                            <ScriptEditor 
                                                pageId={page.id} 
                                                scriptData={parsedScript} 
                                                onUpdate={(newData) => handleUpdateScript(page.id, newData)} 
                                                pageNumber={page.panel_number}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* STEP 3: PRODUCTION */}
                {activeStep === 3 && (
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-500/20 p-6 rounded-xl mb-8 text-center">
                            <h2 className="text-2xl font-bold text-white mb-2">Xưởng Vẽ Truyện</h2>
                            <p className="text-gray-400">Nhấn "Vẽ" để AI biến kịch bản thành trang truyện hoàn chỉnh. Chất lượng 2K.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-10">
                            {pages.map(page => (
                                <div key={page.id} className="bg-[#1a1a1a] p-4 shadow-2xl rounded-xl border border-gray-800 group relative">
                                    {/* Page Header */}
                                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/80 to-transparent rounded-t-xl">
                                        <span className="text-white font-bold bg-black/50 px-3 py-1 rounded-full backdrop-blur-md border border-white/10">Trang {page.panel_number}</span>
                                        {page.image_url && page.image_url !== 'PENDING' && (
                                            <button onClick={() => handleDownload(page.image_url!)} className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm hover:bg-gray-200 transition shadow-lg flex items-center gap-2">
                                                <i className="ph-bold ph-download-simple"></i> Tải HD
                                            </button>
                                        )}
                                    </div>

                                    <div className="relative w-full bg-[#2a2a2a] rounded-lg overflow-hidden shadow-inner flex items-center justify-center min-h-[400px]" style={{aspectRatio: settings.aspectRatio.replace(':', '/')}}>
                                        {page.image_url && page.image_url !== 'PENDING' ? (
                                            <img src={page.image_url} className="w-full h-full object-contain" alt={`Page ${page.panel_number}`} />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1E1B25] text-center p-6 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')]">
                                                {page.is_rendering ? (
                                                    <div className="flex flex-col items-center">
                                                        <div className="relative w-20 h-20 mb-4">
                                                            <div className="absolute inset-0 border-4 border-pink-500/30 rounded-full animate-ping"></div>
                                                            <div className="absolute inset-0 border-4 border-t-pink-500 rounded-full animate-spin"></div>
                                                            <i className="ph-fill ph-paint-brush-broad absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-white"></i>
                                                        </div>
                                                        <p className="text-white font-bold text-lg animate-pulse">Đang vẽ trang {page.panel_number}...</p>
                                                        <p className="text-gray-500 text-sm mt-1">Sử dụng Gemini 3 Pro Vision</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="w-24 h-32 border-2 border-dashed border-gray-600 rounded-lg mb-4 flex items-center justify-center">
                                                            <i className="ph-fill ph-image text-4xl text-gray-700"></i>
                                                        </div>
                                                        <h3 className="text-xl font-bold text-gray-300 mb-2">Trang {page.panel_number} chưa được vẽ</h3>
                                                        <p className="text-gray-500 text-sm mb-6 max-w-xs">Kịch bản đã sẵn sàng. Nhấn nút bên dưới để AI bắt đầu làm việc.</p>
                                                        <button onClick={() => handleRenderPage(page)} className="themed-button-primary px-8 py-3 font-bold shadow-lg hover:scale-105 transition transform flex items-center gap-2">
                                                            <i className="ph-fill ph-paint-brush"></i> Vẽ Ngay ({RENDER_COST} 💎)
                                                        </button>
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

            {/* Footer Actions */}
            <div className="p-4 border-t border-white/10 bg-[#181820] flex justify-between items-center z-20">
                <div className="flex items-center gap-4">
                    <div className="text-sm font-bold text-white bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                        💎 Số dư: <span className="text-pink-400">{user?.diamonds}</span>
                    </div>
                    {isLoading && <span className="text-yellow-400 text-xs animate-pulse flex items-center gap-2"><i className="ph-bold ph-spinner animate-spin"></i> {statusMsg}</span>}
                </div>
                
                <div className="flex gap-3">
                    {activeStep > 1 && (
                        <button 
                            onClick={() => setActiveStep(prev => (prev-1) as any)} 
                            className="px-6 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-bold border border-white/10 transition"
                        >
                            Quay lại
                        </button>
                    )}
                    
                    <button 
                        onClick={activeStep === 1 ? handleGenerateScript : () => setActiveStep(prev => (prev+1) as any)} 
                        disabled={isLoading || activeStep === 3} 
                        className="themed-button-primary px-8 py-2.5 font-bold text-sm disabled:opacity-50 flex items-center gap-2 shadow-lg"
                    >
                        {activeStep === 1 ? <><i className="ph-bold ph-magic-wand"></i> Tạo Kịch Bản (2 💎)</> : activeStep === 2 ? <><i className="ph-bold ph-paint-brush-broad"></i> Vào Xưởng Vẽ</> : 'Hoàn Tất'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComicStudio;
