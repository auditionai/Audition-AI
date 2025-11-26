
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ConfirmationModal from '../../ConfirmationModal';
import { resizeImage } from '../../../utils/imageUtils';
import Modal from '../../common/Modal';
import { useTranslation } from '../../../hooks/useTranslation';

interface ImageEnhancerToolProps {
    onSendToBgRemover: (image: { url: string; file: File }) => void;
}

interface EnhancedImage {
    id: string;
    originalUrl: string;
    processedUrl: string;
    mimeType: string;
    fileName: string;
    mode: 'flash' | 'pro';
}

const ImageEnhancerTool: React.FC<ImageEnhancerToolProps> = ({ onSendToBgRemover }) => {
    const { user, showToast, session, updateUserDiamonds } = useAuth();
    const { t } = useTranslation();
    
    const [inputImage, setInputImage] = useState<{ url: string; file: File } | null>(null);
    const [enhancedImages, setEnhancedImages] = useState<EnhancedImage[]>([]);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedMode, setSelectedMode] = useState<'flash' | 'pro'>('flash');
    const [viewingImage, setViewingImage] = useState<EnhancedImage | null>(null);

    // Load Session
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem('enhancedImages');
            if (saved) setEnhancedImages(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }, []);

    // Save Session
    useEffect(() => {
        try {
            // Limit history to last 5 images to strictly prevent storage overflow/browser lag
            const historyToSave = enhancedImages.slice(0, 5); 
            sessionStorage.setItem('enhancedImages', JSON.stringify(historyToSave));
        } catch (e) {
            console.warn("Session storage full or error.", e);
        }
    }, [enhancedImages]);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            resizeImage(file, 1024).then(({ file: resizedFile, dataUrl }) => {
                setInputImage({ url: dataUrl, file: resizedFile });
            });
        }
        e.target.value = '';
    };

    const handleEnhanceClick = (mode: 'flash' | 'pro') => {
        if (!inputImage) return showToast('Vui lòng chọn ảnh.', 'error');
        const cost = mode === 'pro' ? 10 : 1;
        if (user && user.diamonds < cost) {
            showToast(t('creator.aiTool.common.errorCredits', { cost, balance: user.diamonds }), 'error');
            return;
        }
        setSelectedMode(mode);
        setConfirmOpen(true);
    };

    const handleConfirmEnhance = async () => {
        if (!inputImage || !session) return;
        setConfirmOpen(false);
        setIsProcessing(true);

        try {
            const res = await fetch('/.netlify/functions/enhance-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ image: inputImage.url, mode: selectedMode }),
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Lỗi xử lý ảnh.');
            }

            const data = await res.json();
            updateUserDiamonds(data.newDiamondCount);
            
            // Only store metadata and URL. No heavy base64 strings.
            const newImage: EnhancedImage = {
                id: crypto.randomUUID(),
                originalUrl: inputImage.url,
                processedUrl: data.imageUrl,
                mimeType: data.mimeType,
                fileName: `enhanced_${Date.now()}.png`,
                mode: selectedMode
            };
            
            // Keep only latest 5 images in state to keep DOM light
            setEnhancedImages(prev => [newImage, ...prev].slice(0, 5));
            showToast('Làm nét thành công!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Lỗi kết nối.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = (img: EnhancedImage) => {
        // Use the proxy endpoint to force download instead of opening in new tab
        const downloadUrl = `/.netlify/functions/download-image?url=${encodeURIComponent(img.processedUrl)}`;
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = img.fileName;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
        }, 1000);
    };

    const handleTransferToBg = async (img: EnhancedImage) => {
        try {
            showToast('Đang tải dữ liệu ảnh...', 'success');
            // Fetch the image blob from the URL
            const response = await fetch(img.processedUrl);
            if (!response.ok) throw new Error("Không thể tải ảnh từ server.");
            
            const blob = await response.blob();
            const file = new File([blob], img.fileName, { type: img.mimeType });
            const url = URL.createObjectURL(blob);

            onSendToBgRemover({ url, file });
            setViewingImage(null);
            showToast('Đã chuyển ảnh sang công cụ Tách Nền!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Không thể tải dữ liệu ảnh. Vui lòng thử lại.', 'error');
        }
    };

    return (
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-full">
            <ConfirmationModal isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmEnhance} cost={selectedMode === 'pro' ? 10 : 1} isLoading={isProcessing} />

            {/* Left: Upload */}
            <div className="flex flex-col">
                <h3 className="themed-heading text-lg font-bold themed-title-glow mb-3">{t('creator.aiTool.enhancer.uploadTitle')}</h3>
                <div className="p-4 bg-black/20 rounded-lg border border-white/10 flex-grow flex flex-col aspect-square relative">
                     {inputImage ? (
                        <>
                            <img src={inputImage.url} className="w-full h-full object-contain rounded" alt="Input" />
                            <button onClick={() => setInputImage(null)} className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-500"><i className="ph-fill ph-x"></i></button>
                        </>
                    ) : (
                        <label className="flex-grow flex flex-col items-center justify-center text-center text-gray-400 rounded-lg border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer">
                            <i className="ph-fill ph-sparkle text-4xl mb-2"></i>
                            <p className="font-bold">{t('creator.aiTool.enhancer.uploadButton')}</p>
                            <p className="text-xs">{t('creator.aiTool.enhancer.uploadDesc')}</p>
                            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                        </label>
                    )}
                    
                    <div className="flex gap-3 mt-4">
                        <button onClick={() => handleEnhanceClick('flash')} disabled={isProcessing || !inputImage} className="flex-1 py-3 font-bold text-sm text-cyan-300 bg-cyan-500/20 border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg disabled:opacity-50">
                            {t('creator.aiTool.enhancer.flashButton')}
                        </button>
                        <button onClick={() => handleEnhanceClick('pro')} disabled={isProcessing || !inputImage} className="flex-1 py-3 font-bold text-sm text-yellow-300 bg-yellow-500/20 border border-yellow-500/50 hover:bg-yellow-500/30 rounded-lg disabled:opacity-50 shadow-lg shadow-yellow-500/10">
                            {t('creator.aiTool.enhancer.proButton')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Right: Results */}
            <div className="flex flex-col">
                <h3 className="themed-heading text-lg font-bold themed-title-glow mb-1">{t('creator.aiTool.enhancer.resultTitle')}</h3>
                <p className="text-xs text-skin-muted mb-2">{t('creator.aiTool.enhancer.resultDesc')}</p>
                <div className="bg-black/20 rounded-lg border border-white/10 flex-grow p-4 aspect-square">
                     {enhancedImages.length === 0 && !isProcessing ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                            <i className="ph-fill ph-image text-5xl mb-2"></i>
                            <p>{t('creator.aiTool.enhancer.placeholder')}</p>
                        </div>
                     ) : (
                        <div className="grid grid-cols-3 gap-3 overflow-y-auto max-h-full custom-scrollbar pr-1">
                            {isProcessing && (
                                <div className="aspect-square bg-white/5 rounded animate-pulse flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div></div>
                            )}
                            {enhancedImages.map(img => (
                                <div key={img.id} className="aspect-square relative group cursor-pointer rounded overflow-hidden border border-transparent hover:border-pink-500" onClick={() => setViewingImage(img)}>
                                    <img src={img.processedUrl} className="w-full h-full object-cover" alt="Enhanced" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-center text-white py-0.5 font-bold uppercase">{img.mode}</div>
                                </div>
                            ))}
                        </div>
                     )}
                </div>
            </div>

            {/* Result Modal */}
            {viewingImage && (
                <Modal isOpen={!!viewingImage} onClose={() => setViewingImage(null)} title="Ảnh đã làm nét">
                    <div className="space-y-4">
                        <div className="bg-black/50 rounded-lg overflow-hidden border border-white/10 relative">
                            <img src={viewingImage.processedUrl} alt="Full" className="w-full h-auto max-h-[60vh] object-contain" />
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => handleDownload(viewingImage)} className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-lg font-bold text-white flex items-center justify-center gap-2">
                                <i className="ph-fill ph-download-simple"></i> {t('creator.aiTool.enhancer.download')}
                            </button>
                            <button onClick={() => handleTransferToBg(viewingImage)} className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg font-bold text-white hover:opacity-90 flex items-center justify-center gap-2 shadow-lg">
                                <i className="ph-fill ph-scissors"></i> {t('creator.aiTool.enhancer.sendToBg')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ImageEnhancerTool;
