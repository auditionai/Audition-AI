
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { resizeImage } from '../../../utils/imageUtils';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';

interface EditedImage {
    id: string;
    processedUrl: string; // dataURL
    fileName: string;
    timestamp: number;
}

const ASPECT_RATIOS = [
    { label: 'Free', value: undefined, icon: 'ph-arrows-out' },
    { label: '1:1', value: 1, icon: 'ph-square' },
    { label: '4:3', value: 4/3, icon: 'ph-rectangle' },
    { label: '16:9', value: 16/9, icon: 'ph-monitor' },
    { label: '3:4', value: 3/4, icon: 'ph-device-mobile' },
];

const ImageEditorTool: React.FC = () => {
    const { showToast } = useAuth();
    const { t } = useTranslation();
    
    const [mode, setMode] = useState<'crop' | 'merge'>('crop');
    const [inputImage, setInputImage] = useState<{ url: string; file: File } | null>(null); // For Crop
    const [mergeImages, setMergeImages] = useState<Array<{ id: string; url: string; file: File }>>([]); // For Merge
    const [editedImages, setEditedImages] = useState<EditedImage[]>([]);
    
    // Crop State
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const [aspect, setAspect] = useState<number | undefined>(undefined);
    const imgRef = useRef<HTMLImageElement>(null);

    // Load History
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem('editedImages');
            if (saved) setEditedImages(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load edited images history", e);
        }
    }, []);

    // Save History
    useEffect(() => {
        try {
            sessionStorage.setItem('editedImages', JSON.stringify(editedImages.slice(0, 10)));
        } catch (e) {
            console.warn("Session storage full", e);
        }
    }, [editedImages]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, isMerge = false) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        try {
            const processed = await Promise.all(files.map(f => resizeImage(f, 1200)));
            
            if (isMerge) {
                const newImages = processed.map(p => ({ 
                    id: crypto.randomUUID(), 
                    url: p.dataUrl, 
                    file: p.file 
                }));
                setMergeImages(prev => [...prev, ...newImages]);
            } else {
                // Single image for crop
                if (processed.length > 0) {
                    setInputImage({ url: processed[0].dataUrl, file: processed[0].file });
                    setCompletedCrop(null); // Reset crop state
                }
            }
        } catch (e) {
            showToast(t('creator.aiTool.common.errorProcessImage'), 'error');
        }
        e.target.value = '';
    };

    // --- CROP LOGIC ---
    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        const initialCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 80 }, aspect || 1, width, height),
            width,
            height
        );
        setCrop(initialCrop);
    }

    const performCrop = async () => {
        const image = imgRef.current;
        if (!image || !completedCrop) return;

        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        
        canvas.width = Math.floor(completedCrop.width * scaleX);
        canvas.height = Math.floor(completedCrop.height * scaleY);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const base64 = canvas.toDataURL('image/png');
        saveResult(base64, `cropped_${Date.now()}.png`);
    };

    // --- MERGE LOGIC ---
    const performMerge = (direction: 'horizontal' | 'vertical' | 'grid') => {
        if (mergeImages.length === 0) return;
        
        const images = mergeImages.map(m => {
            const img = new Image();
            img.src = m.url;
            return img;
        });

        Promise.all(images.map(img => new Promise<HTMLImageElement>((resolve) => {
            if (img.complete) resolve(img);
            else img.onload = () => resolve(img);
        }))).then(loadedImages => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (direction === 'horizontal') {
                const totalWidth = loadedImages.reduce((acc, img) => acc + img.naturalWidth, 0);
                const maxHeight = Math.max(...loadedImages.map(img => img.naturalHeight));
                canvas.width = totalWidth;
                canvas.height = maxHeight;
                
                let currentX = 0;
                loadedImages.forEach(img => {
                    ctx.drawImage(img, currentX, 0);
                    currentX += img.naturalWidth;
                });
            } else if (direction === 'vertical') {
                const maxWidth = Math.max(...loadedImages.map(img => img.naturalWidth));
                const totalHeight = loadedImages.reduce((acc, img) => acc + img.naturalHeight, 0);
                canvas.width = maxWidth;
                canvas.height = totalHeight;

                let currentY = 0;
                loadedImages.forEach(img => {
                    ctx.drawImage(img, 0, currentY);
                    currentY += img.naturalHeight;
                });
            } else if (direction === 'grid') {
                // Simple grid approximation (2 columns)
                const cols = 2;
                const rows = Math.ceil(loadedImages.length / cols);
                
                // Determine cell size based on max dims
                const maxWidth = Math.max(...loadedImages.map(img => img.naturalWidth));
                const maxHeight = Math.max(...loadedImages.map(img => img.naturalHeight));
                
                canvas.width = maxWidth * cols;
                canvas.height = maxHeight * rows;

                loadedImages.forEach((img, idx) => {
                    const c = idx % cols;
                    const r = Math.floor(idx / cols);
                    // Center image in cell
                    const x = (c * maxWidth) + (maxWidth - img.naturalWidth) / 2;
                    const y = (r * maxHeight) + (maxHeight - img.naturalHeight) / 2;
                    ctx.drawImage(img, x, y);
                });
            }

            const base64 = canvas.toDataURL('image/png');
            saveResult(base64, `merged_${Date.now()}.png`);
        });
    };

    const saveResult = (dataUrl: string, fileName: string) => {
        const newImage: EditedImage = {
            id: crypto.randomUUID(),
            processedUrl: dataUrl,
            fileName,
            timestamp: Date.now()
        };
        setEditedImages(prev => [newImage, ...prev]);
        showToast('Đã lưu vào danh sách kết quả!', 'success');
    };

    const handleDownload = (img: EditedImage) => {
        const a = document.createElement('a');
        a.href = img.processedUrl;
        a.download = img.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-full">
            {/* LEFT: EDITOR AREA */}
            <div className="flex flex-col">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="themed-heading text-lg font-bold themed-title-glow">{t('creator.aiTool.editor.title')}</h3>
                    <div className="flex bg-white/10 rounded-lg p-1">
                        <button 
                            onClick={() => setMode('crop')}
                            className={`px-3 py-1 text-xs font-bold rounded transition ${mode === 'crop' ? 'bg-skin-accent text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t('creator.aiTool.editor.crop')}
                        </button>
                        <button 
                            onClick={() => setMode('merge')}
                            className={`px-3 py-1 text-xs font-bold rounded transition ${mode === 'merge' ? 'bg-skin-accent text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t('creator.aiTool.editor.merge')}
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-black/20 rounded-lg border border-white/10 flex-grow flex flex-col min-h-[400px]">
                    {mode === 'crop' ? (
                        <div className="flex flex-col h-full">
                            {!inputImage ? (
                                <label className="flex-grow flex flex-col items-center justify-center text-center text-gray-400 rounded-lg border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer">
                                    <i className="ph-fill ph-crop text-4xl mb-2"></i>
                                    <p className="font-bold">{t('creator.aiTool.editor.uploadButton')}</p>
                                    <input type="file" accept="image/*" onChange={(e) => handleUpload(e, false)} className="hidden" />
                                </label>
                            ) : (
                                <div className="flex flex-col h-full gap-4">
                                    <div className="flex-grow relative flex items-center justify-center bg-black/50 rounded overflow-hidden">
                                         <ReactCrop
                                            crop={crop}
                                            onChange={(_, percentCrop) => setCrop(percentCrop)}
                                            onComplete={(c) => setCompletedCrop(c)}
                                            aspect={aspect}
                                        >
                                            <img 
                                                ref={imgRef}
                                                src={inputImage.url} 
                                                alt="Crop target"
                                                className="max-w-full max-h-[300px] object-contain"
                                                onLoad={onImageLoad}
                                            />
                                        </ReactCrop>
                                        <button onClick={() => setInputImage(null)} className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-500 z-10"><i className="ph-fill ph-x"></i></button>
                                    </div>
                                    
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {ASPECT_RATIOS.map(r => (
                                            <button 
                                                key={r.label}
                                                onClick={() => setAspect(r.value)}
                                                className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold border transition ${aspect === r.value ? 'bg-pink-500 text-white border-pink-500' : 'bg-transparent text-gray-300 border-white/20 hover:bg-white/10'}`}
                                            >
                                                <i className={`ph-fill ${r.icon}`}></i> {r.label}
                                            </button>
                                        ))}
                                    </div>

                                    <button onClick={performCrop} disabled={!completedCrop} className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-lg disabled:opacity-50">
                                        {t('creator.aiTool.editor.cropActions.apply')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* MERGE MODE */
                        <div className="flex flex-col h-full">
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 max-h-[200px] overflow-y-auto custom-scrollbar">
                                {mergeImages.map(img => (
                                    <div key={img.id} className="relative aspect-square group">
                                        <img src={img.url} className="w-full h-full object-cover rounded border border-white/10" alt="merge-part" />
                                        <button onClick={() => setMergeImages(prev => prev.filter(i => i.id !== img.id))} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 z-10 opacity-0 group-hover:opacity-100 transition"><i className="ph-fill ph-x text-xs"></i></button>
                                    </div>
                                ))}
                                <label className="aspect-square flex flex-col items-center justify-center text-gray-400 rounded border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer bg-white/5 hover:bg-white/10 transition">
                                    <i className="ph-fill ph-plus text-2xl"></i>
                                    <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(e, true)} className="hidden" />
                                </label>
                            </div>
                            
                            {mergeImages.length === 0 && (
                                <div className="flex-grow flex items-center justify-center text-gray-500 text-sm italic">
                                    {t('creator.aiTool.editor.emptyMerge')}
                                </div>
                            )}

                            <div className="mt-auto grid grid-cols-2 gap-2">
                                <button onClick={() => performMerge('horizontal')} disabled={mergeImages.length < 2} className="py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded disabled:opacity-50 text-xs flex items-center justify-center gap-1">
                                    <i className="ph-fill ph-arrows-left-right"></i> {t('creator.aiTool.editor.mergeActions.horizontal')}
                                </button>
                                <button onClick={() => performMerge('vertical')} disabled={mergeImages.length < 2} className="py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded disabled:opacity-50 text-xs flex items-center justify-center gap-1">
                                    <i className="ph-fill ph-arrows-down-up"></i> {t('creator.aiTool.editor.mergeActions.vertical')}
                                </button>
                                <button onClick={() => performMerge('grid')} disabled={mergeImages.length < 2} className="py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded disabled:opacity-50 text-xs flex items-center justify-center gap-1 col-span-2">
                                    <i className="ph-fill ph-squares-four"></i> {t('creator.aiTool.editor.mergeActions.grid')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: RESULTS */}
            <div className="flex flex-col">
                <h3 className="themed-heading text-lg font-bold themed-title-glow mb-1">{t('creator.aiTool.editor.resultTitle')}</h3>
                <p className="text-xs text-skin-muted mb-2">{t('creator.aiTool.editor.resultDesc')}</p>
                <div className="bg-black/20 rounded-lg border border-white/10 flex-grow p-4 aspect-square overflow-y-auto custom-scrollbar">
                     {editedImages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                            <i className="ph-fill ph-image text-5xl mb-2"></i>
                            <p>{t('creator.aiTool.editor.placeholder')}</p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {editedImages.map(img => (
                                <div key={img.id} className="group relative rounded overflow-hidden border border-white/10 bg-black/40">
                                    <img src={img.processedUrl} alt="Result" className="w-full h-auto object-contain" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                        <button onClick={() => handleDownload(img)} className="p-2 bg-white/20 hover:bg-green-600 rounded-full text-white transition"><i className="ph-fill ph-download-simple"></i></button>
                                        <button onClick={() => {
                                            setEditedImages(prev => prev.filter(i => i.id !== img.id));
                                        }} className="p-2 bg-white/20 hover:bg-red-600 rounded-full text-white transition"><i className="ph-fill ph-trash"></i></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
};

export default ImageEditorTool;
