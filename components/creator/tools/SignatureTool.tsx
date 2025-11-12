
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import { DiamondIcon } from '../../common/DiamondIcon';

const COST_MANUAL = 0;
const COST_AI = 1;

const FONTS = [
    { name: 'Poppins', class: 'font-["Poppins"]' },
    { name: 'Barlow', class: 'font-["Barlow"]' },
    { name: 'Montserrat', class: 'font-["Montserrat"]' },
    { name: 'Orbitron', class: 'font-["Orbitron"]' },
    { name: 'Playfair Display', class: 'font-["Playfair_Display"]' },
    { name: 'Be Vietnam Pro', class: 'font-["Be_Vietnam_Pro"]' },
    { name: 'Inter', class: 'font-["Inter"]' },
    { name: 'Roboto', class: 'font-["Roboto"]' },
];

type Position = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type ToolMode = 'manual' | 'ai';
type AiStyle = 'none' | 'neon' | '3d' | 'graffiti' | 'typography';
type AiColor = 'custom' | 'rainbow' | 'fire' | 'ice' | 'gold';

interface SignatureToolProps {
    initialImage: string | null;
    onClearInitialImage: () => void;
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
    // Common
    position: Position;
}

const SignatureTool: React.FC<SignatureToolProps> = ({ initialImage, onClearInitialImage }) => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);

    const [state, setState] = useState<SignatureState>({
        mode: 'manual',
        text: 'Audition AI',
        font: 'Poppins',
        size: 48,
        color: '#FFFFFF',
        aiStyle: 'neon',
        aiColor: 'rainbow',
        position: 'bottom-right',
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

        const padding = state.size * 0.5;
        let x = 0, y = 0;

        if (state.position.includes('left')) { x = padding; }
        else if (state.position.includes('center')) { x = canvas.width / 2; }
        else if (state.position.includes('right')) { x = canvas.width - padding; }
        
        if (state.position.startsWith('top')) { y = padding; }
        else if (state.position.startsWith('middle')) { y = canvas.height / 2; }
        else if (state.position.startsWith('bottom')) { y = canvas.height - padding; }

        ctx.font = `${state.size}px "${state.font}"`;
        ctx.fillStyle = state.color;
        if (state.position.includes('center')) ctx.textAlign = 'center';
        else if (state.position.includes('right')) ctx.textAlign = 'right';
        else ctx.textAlign = 'left';
        if (state.position.startsWith('middle')) ctx.textBaseline = 'middle';
        else if (state.position.startsWith('bottom')) ctx.textBaseline = 'bottom';
        else ctx.textBaseline = 'top';
        ctx.fillText(state.text, x, y);

        setResultImage(canvas.toDataURL('image/png'));
    }, [state.size, state.position, state.font, state.color, state.text]);

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
        if (!sourceImage) return showToast('Vui lòng tải ảnh lên trước.', 'error');
        if (cost > 0) {
            if (user && user.diamonds < cost) return showToast(`Bạn cần ${cost} kim cương.`, 'error');
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

        const positionMap = {
            'top-left': 'in the top left corner', 'top-center': 'at the top center', 'top-right': 'in the top right corner',
            'middle-left': 'on the middle left', 'middle-center': 'in the exact center', 'middle-right': 'on the middle right',
            'bottom-left': 'in the bottom left corner', 'bottom-center': 'at the bottom center', 'bottom-right': 'in the bottom right corner',
        };
        const aiPrompt = `Add the text "${state.text}" to the image. The text MUST be placed ${positionMap[state.position]}. Style the text as ${state.aiStyle} with a ${state.aiColor} color scheme. It is crucial that the text is spelled correctly and is legible. Do not alter any other part of the original image.`;

        try {
            const res = await fetch('/.netlify/functions/add-signature-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ image: sourceImage, prompt: aiPrompt, cost }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            
            updateUserProfile({ diamonds: result.newDiamondCount });
            setResultImage(result.imageUrl);
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
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-2/3">
                    <div className="relative w-full aspect-square bg-black/20 rounded-lg border border-skin-border flex items-center justify-center p-2">
                        {displayImage ? (
                            <img ref={imageRef} src={displayImage} className="max-w-full max-h-full object-contain" alt="Preview"/>
                        ) : (
                             <label className="flex flex-col items-center justify-center text-center text-gray-400 cursor-pointer h-full w-full">
                                <i className="ph-fill ph-upload-simple text-4xl"></i>
                                <p className="font-semibold mt-2">Nhấn để chọn ảnh</p>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            </label>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                </div>
                <div className="w-full lg:w-1/3">
                    <div className="flex bg-skin-fill p-1 rounded-full border border-skin-border mb-4">
                        <button onClick={() => updateState({ mode: 'manual'})} className={`flex-1 py-2 text-sm font-bold rounded-full transition ${state.mode === 'manual' ? 'bg-skin-accent text-skin-accent-text' : 'text-skin-muted'}`}>Thủ công (Miễn phí)</button>
                        <button onClick={() => updateState({ mode: 'ai'})} className={`flex-1 py-2 text-sm font-bold rounded-full transition ${state.mode === 'ai' ? 'bg-skin-accent text-skin-accent-text' : 'text-skin-muted'}`}>AI Style (1 💎)</button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-semibold text-skin-base mb-1 block">Nội dung Chữ ký</label>
                            <input type="text" value={state.text} onChange={e => updateState({ text: e.target.value })} className="auth-input" />
                        </div>
                        {state.mode === 'manual' ? (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-semibold text-skin-base mb-1 block">Font chữ</label>
                                        <select value={state.font} onChange={e => updateState({ font: e.target.value })} className="auth-input">
                                            {FONTS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-skin-base mb-1 block">Màu chữ</label>
                                        <input type="color" value={state.color} onChange={e => updateState({ color: e.target.value })} className="w-full h-[46px] bg-skin-fill-secondary rounded-md border border-skin-border cursor-pointer" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-1 block">Kích thước ({state.size}px)</label>
                                    <input type="range" min="12" max="128" value={state.size} onChange={e => updateState({ size: Number(e.target.value) })} className="w-full accent-skin-accent" />
                                </div>
                            </>
                        ) : (
                           <>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-2 block">Phong cách GenZ</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['neon', '3d', 'graffiti', 'typography'] as AiStyle[]).map(s => (
                                            <button key={s} onClick={() => updateState({aiStyle: s})} className={`p-3 text-xs font-bold rounded-md border-2 transition ${state.aiStyle === s ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary'}`}>{s.toUpperCase()}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-skin-base mb-2 block">Bảng màu</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['rainbow', 'fire', 'ice', 'gold'] as AiColor[]).map(c => (
                                            <button key={c} onClick={() => updateState({aiColor: c})} className={`p-3 text-xs font-bold rounded-md border-2 transition ${state.aiColor === c ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary'}`}>{c.toUpperCase()}</button>
                                        ))}
                                    </div>
                                </div>
                           </>
                        )}
                        <div>
                            <label className="text-sm font-semibold text-skin-base mb-2 block">Vị trí</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as Position[]).map(p => (
                                    <button key={p} onClick={() => updateState({ position: p })} className={`h-10 rounded-md border-2 transition ${state.position === p ? 'border-skin-border-accent bg-skin-accent/10' : 'border-skin-border bg-skin-fill-secondary hover:bg-white/5'}`}></button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-skin-border space-y-3">
                         <button onClick={handleApplyClick} disabled={isProcessing || !sourceImage} className="w-full py-3 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isProcessing ? <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <>
                                {cost > 0 && <DiamondIcon className="w-6 h-6" />}
                                <span>{state.mode === 'ai' ? `Áp dụng AI Style (${cost} 💎)` : 'Áp dụng Chữ ký (Miễn phí)'}</span>
                            </>}
                        </button>
                        <button onClick={handleDownload} disabled={!resultImage} className="w-full py-3 font-bold bg-green-500/80 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i className="ph-fill ph-download-simple"></i>
                            Tải ảnh
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignatureTool;
