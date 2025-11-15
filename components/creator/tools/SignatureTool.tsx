import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import { DiamondIcon } from '../../common/DiamondIcon';
import { useTranslation } from '../../../hooks/useTranslation';

const COST_MANUAL = 0;
const COST_AI = 1;

const FONTS = [
    { name: 'Poppins', class: 'font-["Poppins"]' },
    { name: 'Barlow', class: 'font-["Barlow"]' },
    { name: 'Montserrat', class: 'font-["Montserrat"]' },
    { name: 'Orbitron', class: 'font-["Orbitron"]' },
    { name: 'Playfair Display', class: 'font-["Playfair_Display"]' },
    { name: 'Dancing Script', class: 'font-["Dancing_Script"]' },
    { name: 'Lobster', class: 'font-["Lobster"]' },
    { name: 'Pacifico', class: 'font-["Pacifico"]' },
    { name: 'Caveat', class: 'font-["Caveat"]' },
    { name: 'Bebas Neue', class: 'font-["Bebas_Neue"]' },
];


type ToolMode = 'manual' | 'ai';
type AiStyle = 'neon' | '3d' | 'graffiti' | 'typography' | 'outline' | 'metallic' | 'glowing' | 'shadow';
type AiColor = 'custom' | 'rainbow' | 'fire' | 'ice' | 'gold' | 'pastel' | 'vaporwave' | 'monochrome';


interface SignatureToolProps {
    initialImage: string | null;
    onClearInitialImage: () => void;
    onInstructionClick: () => void;
}

interface SignatureState {
    mode: ToolMode;
    text: string;
    // Manual
    font: string;
    size: number;
    color: string;
    // AI
    aiStyle: AiStyle;
    aiColor: AiColor;
    aiFont: string;
    aiSize: number;
    aiIsBold: boolean;
    aiIsItalic: boolean;
    aiCustomColor: string;
}

const SignatureTool: React.FC<SignatureToolProps> = ({ initialImage, onClearInitialImage, onInstructionClick }) => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const { t } = useTranslation();
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);

    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [signaturePosition, setSignaturePosition] = useState({ x: 0.9, y: 0.9 }); // Percentages
    const [isDragging, setIsDragging] = useState(false);

    const [state, setState] = useState<SignatureState>({
        mode: 'ai',
        text: 'Audition AI',
        font: 'Poppins',
        size: 48,
        color: '#FFFFFF',
        aiStyle: 'neon',
        aiColor: 'rainbow',
        aiFont: 'Orbitron',
        aiSize: 64,
        aiIsBold: true,
        aiIsItalic: false,
        aiCustomColor: '#FF007F',
    });

    useEffect(() => {
        try {
            const savedState = sessionStorage.getItem('signatureToolState');
            if (savedState) setState(prev => ({ ...prev, ...JSON.parse(savedState) }));
        } catch (e) { console.error("Failed to load state:", e); }
    }, []);

    useEffect(() => {
        try {
            sessionStorage.setItem('signatureToolState', JSON.stringify(state));
        } catch (e) { console.error("Failed to save state:", e); }
    }, [state]);

    const updateState = (updates: Partial<SignatureState>) => {
        setState(prev => ({ ...prev, ...updates }));
        setResultImage(null); // Reset result on any change
    };

    const drawManualSignature = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const img = imageRef.current;
        if (!canvas || !ctx || !img || !img.complete) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const x = canvas.width * signaturePosition.x;
        const y = canvas.height * signaturePosition.y;

        ctx.font = `${state.size}px "${state.font}"`;
        ctx.fillStyle = state.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add a subtle shadow for better readability
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText(state.text, x, y);

        setResultImage(canvas.toDataURL('image/png'));
    }, [signaturePosition, state.size, state.font, state.color, state.text]);
    
    // --- Drag Handlers ---
    const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !imageContainerRef.current) return;
        const rect = imageContainerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        setSignaturePosition({ x, y });
        setResultImage(null); // Reset result while dragging
    }, [isDragging]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);


    useEffect(() => {
        if (sourceImage) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                imageRef.current = img;
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext('2d');
                if (canvas && ctx) {
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    ctx.drawImage(img, 0, 0);
                }
            };
            img.src = sourceImage;
        }
    }, [sourceImage]);

    useEffect(() => {
        if (initialImage) {
            setSourceImage(initialImage);
            setResultImage(null);
            onClearInitialImage();
        }
    }, [initialImage, onClearInitialImage]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSourceImage(event.target?.result as string);
                setResultImage(null);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const cost = state.mode === 'ai' ? COST_AI : COST_MANUAL;

    const handleApplyClick = () => {
        if (!sourceImage) return showToast(t('creator.aiTool.signature.error.noImage'), 'error');
        if (cost > 0) {
            if (user && user.diamonds < cost) return showToast(t('creator.aiTool.signature.error.noCredits', { cost }), 'error');
            setConfirmOpen(true);
        } else {
            drawManualSignature();
            showToast('Áp dụng chữ ký thành công!', 'success');
        }
    };

    const handleConfirmApplyAI = async () => {
        if (!sourceImage) return;
        setConfirmOpen(false);
        setIsProcessing(true);

        try {
            const res = await fetch('/.netlify/functions/add-signature-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ 
                    image: sourceImage, 
                    text: state.text,
                    aiStyle: state.aiStyle,
                    aiColor: state.aiColor,
                    signaturePosition,
                    cost,
                    aiFont: state.aiFont,
                    aiSize: state.aiSize,
                    aiIsBold: state.aiIsBold,
                    aiIsItalic: state.aiIsItalic,
                    aiCustomColor: state.aiCustomColor
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            
            updateUserProfile({ diamonds: result.newDiamondCount });
            setResultImage(`data:image/png;base64,${result.imageBase64}`);
            showToast('AI đã chèn chữ ký thành công!', 'success');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (!resultImage) return;
        const link = document.createElement('a');
        link.download = `audition-ai-signed-${Date.now()}.png`;
        link.href = resultImage;
        link.click();
    };
    
    const displayImage = resultImage || sourceImage;

    return (
        <div className="h-full">
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmApplyAI} cost={cost} isLoading={isProcessing} />
            <div className="flex justify-between items-center mb-4">
                 <h3 className="themed-heading text-lg font-bold themed-title-glow">{t('creator.aiTool.signature.title')}</h3>
                 <button onClick={onInstructionClick} className="flex items-center gap-1 text-xs text-skin-accent hover:opacity-80 transition-all px-2 py-1 rounded-md bg-skin-accent/10 border border-skin-border-accent hover:bg-skin-accent/20 shadow-accent hover:shadow-accent-lg flex-shrink-0">
                    <i className="ph-fill ph-book-open"></i> {t('creator.aiTool.common.help')}
                </button>
            </div>
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-2/3">
                    <div ref={imageContainerRef} className="relative w-full aspect-square bg-black/20 rounded-lg border border-skin-border flex items-center justify-center p-2">
                        {displayImage ? (
                            <>
                                <img src={displayImage} className="max-w-full max-h-full object-contain" alt="Preview"/>
                                <div 
                                    onMouseDown={handleDragStart}
                                    style={{
                                        left: `${signaturePosition.x * 100}%`,
                                        top: `${signaturePosition.y * 100}%`,
                                    }}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-dashed border-white/80 cursor-move bg-black/40 rounded-md flex items-center justify-center text-white text-xs font-bold shadow-lg"
                                >
                                    {t('creator.aiTool.signature.position')}
                                </div>
                            </>
                        ) : (
                             <label className="flex flex-col items-center justify-center text-center text-gray-400 cursor-pointer h-full w-full">
                                <i className="ph-fill ph-upload-simple text-4xl"></i>
                                <p className="font-semibold mt-2">{t('creator.aiTool.signature.uploadPlaceholder')}</p>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            </label>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                </div>
                <div className="w-full lg:w-1/3">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <button
                            onClick={() => updateState({ mode: 'manual'})}
                            className={`w-full py-3 text-sm font-bold rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                                state.mode === 'manual'
                                    ? 'border-skin-border-accent bg-skin-accent/10 text-skin-base shadow-accent'
                                    : 'border-skin-border bg-skin-fill-secondary text-skin-muted hover:border-skin-border-accent/50'
                            }`}
                        >
                            {t('creator.aiTool.signature.manualMode')}
                        </button>
                        <button
                            onClick={() => updateState({ mode: 'ai'})}
                            className={`w-full py-3 text-sm font-bold rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                                state.mode === 'ai'
                                    ? 'border-skin-border-accent bg-skin-accent/10 text-skin-base shadow-accent'
                                    : 'border-skin-border bg-skin-fill-secondary text-skin-muted hover:border-skin-border-accent/50'
                            }`}
                        >
                            {t('creator.aiTool.signature.aiMode')} <DiamondIcon className="w-4 h-4 inline-block ml-1" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.signature.textLabel')}</label>
                            <input type="text" value={state.text} onChange={e => updateState({ text: e.target.value })} className="auth-input" />
                        </div>
                        {state.mode === 'manual' ? (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.signature.fontLabel')}</label>
                                        <select value={state.font} onChange={e => updateState({ font: e.target.value })} className="auth-input">
                                            {FONTS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.signature.colorLabel')}</label>
                                        <input type="color" value={state.color} onChange={e => updateState({ color: e.target.value })} className="w-full h-[46px] bg-skin-fill-secondary rounded-md border border-skin-border cursor-pointer" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.signature.sizeLabel', { size: state.size })}</label>
                                    <input type="range" min="12" max="128" value={state.size} onChange={e => updateState({ size: Number(e.target.value) })} className="w-full accent-skin-accent" />
                                </div>
                            </>
                        ) : (
                           <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.signature.fontLabel')}</label>
                                        <select value={state.aiFont} onChange={e => updateState({ aiFont: e.target.value })} className="auth-input">
                                            {FONTS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <button onClick={() => updateState({ aiIsBold: !state.aiIsBold })} className={`flex-1 h-[46px] text-sm font-bold rounded-md border-2 ${state.aiIsBold ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary'}`}>B</button>
                                        <button onClick={() => updateState({ aiIsItalic: !state.aiIsItalic })} className={`flex-1 h-[46px] text-sm font-bold italic rounded-md border-2 ${state.aiIsItalic ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary'}`}>I</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-1 block">{t('creator.aiTool.signature.sizeLabel', { size: state.aiSize })}</label>
                                    <input type="range" min="16" max="256" value={state.aiSize} onChange={e => updateState({ aiSize: Number(e.target.value) })} className="w-full accent-skin-accent" />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.signature.aiStyleLabel')}</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['neon', '3d', 'graffiti', 'typography', 'outline', 'metallic', 'glowing', 'shadow'] as AiStyle[]).map(s => (
                                            <button key={s} onClick={() => updateState({aiStyle: s})} className={`p-2 text-xs font-bold rounded-md border-2 transition ${state.aiStyle === s ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary'}`}>{t(`creator.aiTool.signature.styles.${s}`)}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-2 block">{t('creator.aiTool.signature.aiColorLabel')}</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['rainbow', 'fire', 'ice', 'gold', 'pastel', 'vaporwave', 'monochrome', 'custom'] as AiColor[]).map(c => (
                                            <button key={c} onClick={() => updateState({aiColor: c})} className={`p-2 text-xs font-bold rounded-md border-2 transition ${state.aiColor === c ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary'}`}>{t(`creator.aiTool.signature.colors.${c}`)}</button>
                                        ))}
                                    </div>
                                     {state.aiColor === 'custom' && (
                                        <div className="mt-2">
                                            <input type="color" value={state.aiCustomColor} onChange={e => updateState({ aiCustomColor: e.target.value })} className="w-full h-[46px] bg-skin-fill-secondary rounded-md border border-skin-border cursor-pointer" />
                                        </div>
                                    )}
                                </div>
                           </>
                        )}
                         <p className="text-xs text-skin-muted p-2 bg-skin-fill rounded-md text-center">{t('creator.aiTool.signature.positionHelp')}</p>
                    </div>
                    <div className="mt-6 pt-6 border-t border-skin-border space-y-3">
                         <button onClick={handleApplyClick} disabled={isProcessing || !sourceImage} className="w-full py-3 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isProcessing ? <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <>
                                {cost > 0 && <DiamondIcon className="w-6 h-6" />}
                                <span>{state.mode === 'ai' ? t('creator.aiTool.signature.applyAiButton', { cost }) : t('creator.aiTool.signature.applyButton')}</span>
                            </>}
                        </button>
                        <button onClick={handleDownload} disabled={!resultImage} className="w-full py-3 font-bold bg-green-500/80 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i className="ph-fill ph-download-simple"></i>
                            {t('creator.aiTool.signature.downloadButton')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignatureTool;