
import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { ComicCharacter, ComicPanel } from '../../../types';
import { resizeImage } from '../../../utils/imageUtils';
import SettingsBlock from '../ai-tool/SettingsBlock';

// --- CONSTANTS ---
const GENRES = ['Mặc định (Sáng tạo)', 'Hành động / Phiêu lưu', 'Trận chiến / Shonen', 'Lãng mạn / Shoujo', 'Hài hước / Vui nhộn', 'Kinh dị / Ly kỳ', 'Lát cắt cuộc sống', 'Khoa học viễn tưởng / Mecha', 'Giả tưởng / Isekai', 'Bí ẩn / Thám tử', 'Bẩn thỉu và thô tục'];
const ART_STYLES = [{ label: 'Mặc định (Audition)', value: 'Audition 3D Game Style' }, { label: 'Manga (Đen Trắng)', value: 'Manga Black and White, Screen tones, High Contrast' }, { label: 'Webtoon (Hàn Quốc)', value: 'Korean Webtoon Manhwa, Full Color, Digital Art, High Quality' }, { label: 'Comic (Âu Mỹ)', value: 'American Comic Book, Bold Lines, Dynamic Colors' }, { label: 'Anime (Nhật Bản)', value: 'Anime Style, Kyoto Animation Quality' }, { label: 'Pixel Art', value: 'Pixel Art' }, { label: 'Cyberpunk', value: 'Cyberpunk Neon' }];
const LANGUAGES = ['Tiếng Việt', 'Tiếng Anh', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc'];
const COLOR_FORMATS = [{ label: 'Đầy đủ màu sắc', value: 'Full Color' }, { label: 'Đen trắng / Manga', value: 'Black and White, Screen tones' }, { label: 'Bản phác thảo thô', value: 'Rough Sketch, Pencil' }];
const ASPECT_RATIOS = [{ label: '9:16 (Điện thoại)', value: '9:16' }, { label: '1:1 (Vuông)', value: '1:1' }, { label: '3:4 (Chân dung)', value: '3:4' }, { label: '4:3 (Phong cảnh)', value: '4:3' }, { label: '16:9 (Điện ảnh)', value: '16:9' }];
const DIALOGUE_AMOUNTS = [{ label: 'Ít', value: 'Minimal' }, { label: 'Vừa phải', value: 'Moderate' }, { label: 'Nhiều', value: 'Heavy' }];
const COVER_OPTIONS = [{ label: 'Tự động tạo bìa', value: 'start' }, { label: 'Không có', value: 'none' }];
const RENDER_COST = 10; 
const MAX_CHARACTERS = 12;

// --- TYPES FOR STRUCTURED SCRIPT ---
interface PanelData {
    id: number;
    visual: string;
    dialogue: { speaker: string; text: string }[];
}

interface PageScriptData {
    layout_description: string;
    panels: PanelData[];
}

// --- SUB-COMPONENTS ---

const ComicSelect = ({ label, value, onChange, options }: any) => (
    <div className="relative">
        <label className="text-xs font-bold text-skin-muted uppercase mb-1 block">{label}</label>
        <select className="w-full bg-[#1E1B25] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-500 outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map((opt: any) => (
                <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>{typeof opt === 'string' ? opt : opt.label}</option>
            ))}
        </select>
    </div>
);

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
    const steps = [{ num: 1, label: 'Thiết lập', icon: 'ph-sliders' }, { num: 2, label: 'Kịch bản', icon: 'ph-scroll' }, { num: 3, label: 'Sản xuất', icon: 'ph-paint-brush-broad' }];
    return (
        <div className="bg-[#12121A]/50 border border-white/5 p-1 rounded-full flex items-center shadow-inner justify-center">
            {steps.map((step) => (
                <div key={step.num} className={`flex items-center px-4 py-2 rounded-full gap-2 transition-all ${step.num === currentStep ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold' : 'text-gray-500'}`}>
                    <i className={`ph-fill ${step.icon}`}></i>
                    <span className={`${step.num === currentStep ? 'block' : 'hidden md:block'}`}>{step.label}</span>
                </div>
            ))}
        </div>
    );
};

// --- NEW COMPONENT: STRUCTURED PANEL EDITOR ---
interface ScriptEditorProps {
    pageId: string; // Kept in interface but unused in destructuring to fix lint error
    scriptData: PageScriptData;
    onUpdate: (newData: PageScriptData) => void;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({ scriptData, onUpdate }) => {
    
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
        <div className="space-y-4">
            {/* Layout Section */}
            <div className="bg-blue-900/10 border border-blue-500/30 p-3 rounded-lg">
                <label className="text-xs font-bold text-blue-400 uppercase mb-1 flex items-center gap-1"><i className="ph-fill ph-layout"></i> Bố cục Trang (Page Layout)</label>
                <input 
                    className="w-full bg-transparent border-b border-blue-500/30 text-sm text-blue-100 focus:outline-none py-1"
                    value={scriptData.layout_description}
                    onChange={(e) => handleLayoutChange(e.target.value)}
                    placeholder="Mô tả bố cục tổng thể của trang..."
                />
            </div>

            {/* Panels List */}
            <div className="grid grid-cols-1 gap-4">
                {scriptData.panels.map((panel, pIdx) => (
                    <div key={pIdx} className="bg-[#1E1B25] border border-white/10 rounded-xl overflow-hidden shadow-md">
                        {/* Panel Header */}
                        <div className="bg-white/5 px-3 py-2 border-b border-white/5 flex justify-between items-center">
                            <span className="text-xs font-bold text-pink-400 uppercase tracking-wider">
                                <i className="ph-fill ph-frame-corners mr-1"></i> Panel {panel.id}
                            </span>
                        </div>

                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Visuals */}
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Hình ảnh (Visual Prompt)</label>
                                <textarea 
                                    className="w-full h-24 bg-black/20 border border-white/10 rounded-lg p-2 text-xs text-gray-300 resize-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition"
                                    value={panel.visual}
                                    onChange={(e) => handlePanelChange(pIdx, 'visual', e.target.value)}
                                    placeholder="Mô tả hình ảnh..."
                                />
                            </div>

                            {/* Dialogue */}
                            <div className="flex flex-col h-full">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block">Lời thoại (Dialogue)</label>
                                    <button onClick={() => addDialogue(pIdx)} className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-white transition"><i className="ph-bold ph-plus"></i></button>
                                </div>
                                <div className="flex-grow bg-black/20 border border-white/10 rounded-lg p-2 space-y-2 overflow-y-auto max-h-24 custom-scrollbar">
                                    {panel.dialogue.length === 0 && <p className="text-xs text-gray-600 italic text-center pt-2">Không có lời thoại</p>}
                                    {panel.dialogue.map((dia, dIdx) => (
                                        <div key={dIdx} className="flex gap-1 items-center group">
                                            <input 
                                                className="w-20 bg-transparent border-b border-white/10 text-[10px] font-bold text-yellow-400 focus:outline-none"
                                                value={dia.speaker}
                                                onChange={(e) => handleDialogueChange(pIdx, dIdx, 'speaker', e.target.value)}
                                                placeholder="Tên..."
                                            />
                                            <input 
                                                className="flex-grow bg-transparent border-b border-white/10 text-[10px] text-white focus:outline-none"
                                                value={dia.text}
                                                onChange={(e) => handleDialogueChange(pIdx, dIdx, 'text', e.target.value)}
                                                placeholder="Nội dung..."
                                            />
                                            <button onClick={() => removeDialogue(pIdx, dIdx)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><i className="ph-fill ph-x text-xs"></i></button>
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


const ComicStudio: React.FC<{ onInstructionClick?: () => void }> = ({ onInstructionClick }) => {
    const { session, showToast, updateUserDiamonds, supabase } = useAuth();
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1); 
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState("");
    
    // Step 1 Data
    const [characters, setCharacters] = useState<ComicCharacter[]>([]);
    const [settings, setSettings] = useState({
        title: '', genre: GENRES[0], artStyle: ART_STYLES[0].value, language: LANGUAGES[0],
        dialogueAmount: DIALOGUE_AMOUNTS[1].value, pageCount: 1, premise: '',
        colorFormat: COLOR_FORMATS[0].value, aspectRatio: ASPECT_RATIOS[0].value, coverPage: COVER_OPTIONS[0].value
    });

    // Step 2 & 3 Data
    const [panels, setPanels] = useState<ComicPanel[]>([]); // Panels here act as PAGES

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

    const handleGenerateScript = async () => {
        if (!settings.premise || characters.length === 0) return showToast("Thiếu thông tin cốt truyện hoặc nhân vật.", "error");
        setIsLoading(true); setStatusMsg("Đang lên ý tưởng (Gemini)...");
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

            // 2. Expand Each Page into Structured Panels
            const outline = data.outline;
            const initialPanels = outline.map((p: any) => ({
                id: crypto.randomUUID(),
                panel_number: p.panel_number,
                visual_description: JSON.stringify({ layout_description: "Loading...", panels: [] }), // Initial placeholder JSON
                plot_summary: p.plot_summary,
                dialogue: [],
                is_rendering: false
            }));
            setPanels(initialPanels);
            setActiveStep(2);

            // Process Pages
            const completedPanels: any[] = [];
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
                            previous_panels: completedPanels.slice(-2) 
                        })
                    });
                    const details = await expandRes.json();
                    // Note: details is { visual_description: STRING_JSON, dialogue: [] }
                    // We trust backend sent valid JSON string in visual_description
                    setPanels(prev => prev.map(p => p.panel_number === outline[i].panel_number ? { ...p, visual_description: details.visual_description } : p));
                    completedPanels.push(details);
                } catch (e) { console.error(e); }
            }
            setStatusMsg("");
        } catch (e: any) { showToast(e.message, "error"); } finally { setIsLoading(false); }
    };

    const handleUpdateScript = (pageId: string, newData: PageScriptData) => {
        setPanels(prev => prev.map(p => p.id === pageId ? { ...p, visual_description: JSON.stringify(newData) } : p));
    };

    const handleRenderPage = async (panel: ComicPanel) => {
        setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: true } : p));
        try {
            const res = await fetch('/.netlify/functions/comic-render-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ 
                    panel, // Contains the JSON string in visual_description
                    characters, 
                    storyTitle: settings.title, 
                    style: settings.artStyle,
                    colorFormat: settings.colorFormat,
                    aspectRatio: settings.aspectRatio,
                    isCover: panel.panel_number === 1 && settings.coverPage !== 'none'
                })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error);
            
            updateUserDiamonds(data.newDiamondCount);
            const channel = supabase!.channel(`comic-job-${data.jobId}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'generated_images', filter: `id=eq.${data.jobId}` }, (payload: any) => {
                    if (payload.new.image_url !== 'PENDING') {
                        setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, image_url: payload.new.image_url, is_rendering: false } : p));
                        supabase!.removeChannel(channel);
                    }
                }).subscribe();
            
            fetch('/.netlify/functions/comic-render-worker', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ jobId: data.jobId }) });

        } catch (e: any) { 
            showToast(e.message, "error"); 
            setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, is_rendering: false } : p));
        }
    };

    return (
        <div className="animate-fade-in max-w-7xl mx-auto h-[calc(100vh-140px)] min-h-[600px] flex flex-col bg-[#12121A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/10 bg-[#181820] flex justify-center"><StepIndicator currentStep={activeStep} /></div>
            
            <div className="flex-grow overflow-y-auto p-6 custom-scrollbar bg-[#0F0F13]">
                {activeStep === 1 && (
                    <div className="grid lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-5 space-y-6">
                            <SettingsBlock title="Thông Tin Truyện" instructionKey="comic-studio" onInstructionClick={onInstructionClick || (() => {})}>
                                <div className="space-y-4">
                                    <input type="text" className="w-full bg-[#1E1B25] border border-white/10 rounded-lg p-3 text-white font-bold" placeholder="Tên truyện..." value={settings.title} onChange={e => setSettings({...settings, title: e.target.value})} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <ComicSelect label="Thể loại" value={settings.genre} onChange={(v: string) => setSettings({...settings, genre: v})} options={GENRES} />
                                        <ComicSelect label="Số trang" value={settings.pageCount} onChange={(v: any) => setSettings({...settings, pageCount: v})} options={[1,2,3,4,5].map(n => ({label: n+' Trang', value: n}))} />
                                    </div>
                                    <ComicSelect label="Phong cách" value={settings.artStyle} onChange={(v: string) => setSettings({...settings, artStyle: v})} options={ART_STYLES} />
                                    <textarea className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white h-32 resize-none" placeholder="Tóm tắt cốt truyện..." value={settings.premise} onChange={e => setSettings({...settings, premise: e.target.value})} />
                                </div>
                            </SettingsBlock>
                        </div>
                        <div className="lg:col-span-7">
                            <div className="bg-[#1E1B25] rounded-xl border border-white/10 p-4 h-full">
                                <div className="flex justify-between mb-4"><h3 className="font-bold text-white">Nhân vật ({characters.length}/{MAX_CHARACTERS})</h3><button onClick={handleAddCharacter} className="text-xs bg-white/10 px-2 py-1 rounded hover:bg-white/20">+ Thêm</button></div>
                                <div className="grid grid-cols-2 gap-3">
                                    {characters.map(c => (
                                        <div key={c.id} className="flex bg-black/40 rounded-lg p-2 gap-3 border border-white/5">
                                            <label className="w-16 h-16 bg-black rounded cursor-pointer overflow-hidden relative flex-shrink-0">
                                                {c.image_url ? <img src={c.image_url} className="w-full h-full object-cover" alt="" /> : <div className="absolute inset-0 flex items-center justify-center text-gray-600"><i className="ph-bold ph-camera"></i></div>}
                                                <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadChar(c.id, e.target.files[0])} />
                                            </label>
                                            <div className="flex-grow flex flex-col justify-center min-w-0">
                                                <input type="text" value={c.name} onChange={e => setCharacters(prev => prev.map(ch => ch.id === c.id ? {...ch, name: e.target.value} : ch))} className="bg-transparent text-sm font-bold text-white mb-1 w-full outline-none" placeholder="Tên..." />
                                                <div className="text-[10px] text-gray-500 truncate">{c.is_analyzing ? 'Đang phân tích...' : c.description ? 'Đã có thông tin' : 'Cần ảnh'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeStep === 2 && (
                    <div className="max-w-4xl mx-auto space-y-8">
                        {panels.map((panel) => {
                            let parsedScript: PageScriptData = { layout_description: "", panels: [] };
                            try { parsedScript = JSON.parse(panel.visual_description); } catch (e) { /* invalid json */ }
                            
                            return (
                                <div key={panel.id} className="bg-[#12121A] border border-white/10 rounded-xl overflow-hidden shadow-lg">
                                    <div className="bg-[#1E1B25] p-4 border-b border-white/10 flex justify-between items-center">
                                        <h3 className="text-white font-bold flex items-center gap-2"><i className="ph-fill ph-file-text text-blue-400"></i> TRANG {panel.panel_number}</h3>
                                        <span className="text-xs text-gray-500 truncate max-w-xs">{panel.plot_summary}</span>
                                    </div>
                                    <div className="p-4">
                                        {panel.visual_description.startsWith('(') ? (
                                            <div className="text-center py-8 text-yellow-400 animate-pulse">{panel.visual_description}</div>
                                        ) : (
                                            <ScriptEditor 
                                                pageId={panel.id} 
                                                scriptData={parsedScript} 
                                                onUpdate={(newData) => handleUpdateScript(panel.id, newData)} 
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeStep === 3 && (
                    <div className="grid grid-cols-1 gap-8 max-w-3xl mx-auto">
                        {panels.map(panel => (
                            <div key={panel.id} className="bg-[#1a1a1a] p-2 shadow-xl rounded">
                                <div className="relative w-full bg-white flex items-center justify-center" style={{aspectRatio: settings.aspectRatio.replace(':', '/')}}>
                                    {panel.image_url && panel.image_url !== 'PENDING' ? (
                                        <img src={panel.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1E1B25] text-center p-6">
                                            {panel.is_rendering ? (
                                                <><i className="ph-bold ph-spinner animate-spin text-3xl text-pink-500 mb-2"></i><p className="text-white text-sm">Đang vẽ...</p></>
                                            ) : (
                                                <button onClick={() => handleRenderPage(panel)} className="themed-button-primary px-6 py-3 font-bold shadow-lg">Vẽ Trang Này ({RENDER_COST} 💎)</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-white/10 bg-[#181820] flex justify-between items-center">
                <div className="text-xs text-gray-400">{isLoading && <span className="text-yellow-400 animate-pulse flex items-center gap-2"><i className="ph-bold ph-spinner animate-spin"></i> {statusMsg}</span>}</div>
                <div className="flex gap-3">
                    {activeStep > 1 && <button onClick={() => setActiveStep(prev => (prev-1) as any)} className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-sm font-bold">Quay lại</button>}
                    <button onClick={activeStep === 1 ? handleGenerateScript : () => setActiveStep(prev => (prev+1) as any)} disabled={isLoading || activeStep === 3} className="themed-button-primary px-6 py-2 font-bold text-sm disabled:opacity-50">
                        {activeStep === 1 ? 'Tạo Kịch Bản' : activeStep === 2 ? 'Vào Xưởng Vẽ' : 'Hoàn Tất'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComicStudio;
