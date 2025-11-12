import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import { DiamondIcon } from '../../common/DiamondIcon';

const COST = 1;
const FONTS = [
    { name: 'Barlow', class: 'font-barlow' },
    { name: 'Montserrat', class: 'font-montserrat' },
    { name: 'Orbitron', class: 'font-orbitron' },
    { name: 'Playfair Display', class: 'font-playfair-display' },
    { name: 'Poppins', class: 'font-poppins font-semibold' },
];

type Position = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface SignatureToolProps {
    initialImage: string | null;
    onClearInitialImage: () => void;
}

interface SignatureState {
    sourceImage: string | null;
    text: string;
    font: string;
    size: number;
    color: string;
    position: Position;
    isPaid: boolean;
}

const SignatureTool: React.FC<SignatureToolProps> = ({ initialImage, onClearInitialImage }) => {
    const { user, session, showToast, updateUserProfile } = useAuth();
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const [state, setState] = useState<SignatureState>({
        sourceImage: null,
        text: 'Audition AI',
        font: 'Poppins',
        size: 48,
        color: '#FFFFFF',
        position: 'bottom-right',
        isPaid: false,
    });

    // Load from session storage on mount
    useEffect(() => {
        try {
            const savedState = sessionStorage.getItem('signatureToolState');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                setState(parsed);
            }
        } catch (e) {
            console.error("Failed to load state from session storage:", e);
        }
    }, []);

    // Save to session storage on change
    useEffect(() => {
        try {
            sessionStorage.setItem('signatureToolState', JSON.stringify(state));
        } catch (e) {
            console.error("Failed to save state to session storage:", e);
        }
    }, [state]);

    const updateState = (updates: Partial<SignatureState>) => {
        setState(prev => ({ ...prev, ...updates, isPaid: false })); // Reset paid status on any change
    };

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const img = imageRef.current;
        if (!canvas || !ctx || !img || !img.complete) return;

        // Set canvas size to match image
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw image
        ctx.drawImage(img, 0, 0);

        // Draw signature
        ctx.font = `${state.size}px ${state.font}`;
        ctx.fillStyle = state.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const textMetrics = ctx.measureText(state.text);
        const padding = state.size * 0.5;
        let x = 0, y = 0;

        // Horizontal alignment
        if (state.position.includes('left')) { x = padding; ctx.textAlign = 'left'; }
        else if (state.position.includes('center')) { x = canvas.width / 2; ctx.textAlign = 'center'; }
        else if (state.position.includes('right')) { x = canvas.width - padding; ctx.textAlign = 'right'; }

        // Vertical alignment
        if (state.position.startsWith('top')) { y = padding; ctx.textBaseline = 'top'; }
        else if (state.position.startsWith('middle')) { y = canvas.height / 2; ctx.textBaseline = 'middle'; }
        else if (state.position.startsWith('bottom')) { y = canvas.height - padding; ctx.textBaseline = 'bottom'; }

        ctx.fillText(state.text, x, y);

    }, [state.text, state.font, state.size, state.color, state.position]);

    useEffect(() => {
        if (state.sourceImage) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                imageRef.current = img;
                drawCanvas();
            };
            img.src = state.sourceImage;
        }
    }, [state.sourceImage, drawCanvas]);
    
    // Handle initial image from generator
    useEffect(() => {
        if (initialImage) {
            updateState({ sourceImage: initialImage });
            onClearInitialImage();
        }
    }, [initialImage, onClearInitialImage]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                updateState({ sourceImage: event.target?.result as string });
            };
            reader.readAsDataURL(file);
        }
        e.target.value = ''; // Allow re-uploading the same file
    };
    
    const handleApplyClick = () => {
        if (!state.sourceImage) return showToast('Vui lòng tải ảnh lên trước.', 'error');
        if (user && user.diamonds < COST) return showToast(`Bạn cần ${COST} kim cương để thực hiện.`, 'error');
        setConfirmOpen(true);
    };

    const handleConfirmApply = async () => {
        setConfirmOpen(false);
        setIsProcessing(true);
        try {
            const res = await fetch('/.netlify/functions/charge-for-tool-use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ tool: 'signature', cost: COST })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            
            updateUserProfile({ diamonds: result.newDiamondCount });
            setState(prev => ({...prev, isPaid: true}));
            showToast('Áp dụng chữ ký thành công!', 'success');

        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleDownload = () => {
        const canvas = canvasRef.current;
        if (!canvas || !state.isPaid) return;
        const link = document.createElement('a');
        link.download = `audition-ai-signed-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    return (
        <div className="h-full">
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmApply} cost={COST} isLoading={isProcessing} />
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Left: Preview */}
                <div className="w-full lg:w-2/3">
                    <div className="relative w-full aspect-square bg-black/20 rounded-lg border border-skin-border flex items-center justify-center p-2">
                        {state.sourceImage ? (
                            <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
                        ) : (
                             <label className="flex flex-col items-center justify-center text-center text-gray-400 cursor-pointer">
                                <i className="ph-fill ph-upload-simple text-4xl"></i>
                                <p className="font-semibold mt-2">Nhấn để chọn ảnh</p>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            </label>
                        )}
                    </div>
                </div>
                {/* Right: Controls */}
                <div className="w-full lg:w-1/3">
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-semibold text-skin-base mb-1 block">Nội dung Chữ ký</label>
                            <input type="text" value={state.text} onChange={e => updateState({ text: e.target.value })} className="auth-input" />
                        </div>
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
                            <input type="range" min="12" max="128" value={state.size} onChange={e => updateState({ size: Number(e.target.value) })} className="w-full" />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-skin-base mb-2 block">Vị trí</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as Position[]).map(p => (
                                    <button key={p} onClick={() => updateState({ position: p })} className={`p-3 rounded-md border-2 transition ${state.position === p ? 'border-pink-500 bg-pink-500/10' : 'border-gray-600 bg-white/5 hover:bg-white/10'}`}></button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-skin-border space-y-3">
                         <button onClick={handleApplyClick} disabled={isProcessing || !state.sourceImage} className="w-full py-3 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isProcessing ? <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <>
                                <DiamondIcon className="w-6 h-6" />
                                <span>Áp dụng chữ ký ({COST} 💎)</span>
                            </>}
                        </button>
                        <button onClick={handleDownload} disabled={!state.isPaid} className="w-full py-3 font-bold bg-green-500/80 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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
