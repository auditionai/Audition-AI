import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackgroundRemover } from '../../hooks/useBackgroundRemover';
import { DiamondIcon } from '../common/DiamondIcon';
import ConfirmationModal from '../ConfirmationModal';
import { resizeImage, base64ToFile } from '../../utils/imageUtils';
import ProcessedImageModal from './ProcessedImageModal';
import { useTranslation } from '../../hooks/useTranslation';

interface BgRemoverToolProps {
    onMoveToGenerator: (image: { url: string; file: File }) => void;
    onMoveFaceToGenerator: (image: { url: string; file: File }) => void;
    onInstructionClick: () => void;
}

// Define a serializable structure for session storage
interface ProcessedImageData {
    id: string;
    originalUrl: string;
    processedUrl: string; // R2 URL
    imageBase64: string; // Base64 data of the processed image
    mimeType: string;
    fileName: string;
}

const BgRemoverTool: React.FC<BgRemoverToolProps> = ({ onMoveToGenerator, onMoveFaceToGenerator, onInstructionClick }) => {
    const { user, showToast } = useAuth();
    const { t } = useTranslation();
    const { isProcessing, removeBackground, COST_PER_REMOVAL } = useBackgroundRemover();

    const [imagesForBgRemoval, setImagesForBgRemoval] = useState<Array<{id: string, url: string, file: File}>>([]);
    const [processedImages, setProcessedImages] = useState<ProcessedImageData[]>([]);
    const [isConfirmOpen, setConfirmOpen] = useState(false);
    const [selectedProcessedImage, setSelectedProcessedImage] = useState<ProcessedImageData | null>(null);
    
    // Load processed images from sessionStorage on component mount
    useEffect(() => {
        try {
            const storedImages = sessionStorage.getItem('processedBgImages');
            if (storedImages) {
                setProcessedImages(JSON.parse(storedImages));
            }
        } catch (e) {
            console.error("Failed to parse processed images from sessionStorage", e);
            sessionStorage.removeItem('processedBgImages');
        }
    }, []);

    // Save processed images to sessionStorage whenever they change
    useEffect(() => {
        sessionStorage.setItem('processedBgImages', JSON.stringify(processedImages));
    }, [processedImages]);


    const handleBgRemovalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        files.forEach((file: File) => {
             resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                const newImage = { id: crypto.randomUUID(), url: resizedDataUrl, file: resizedFile };
                setImagesForBgRemoval(prev => [...prev, newImage]);
            }).catch((err: any) => {
                console.error("Error resizing image for background removal:", err);
                showToast(t('creator.aiTool.common.errorProcessImage'), "error");
            });
        });
        e.target.value = '';
    };

    const handleProcessClick = () => {
        if (imagesForBgRemoval.length === 0) {
            showToast('Vui lòng tải lên ảnh để xử lý.', 'error');
            return;
        }
        const totalCost = imagesForBgRemoval.length * COST_PER_REMOVAL;
        if (user && user.diamonds < totalCost) {
            showToast(`Bạn cần ${totalCost} kim cương, nhưng chỉ có ${user.diamonds}. Vui lòng nạp thêm.`, 'error');
            return;
        }
        setConfirmOpen(true);
    };
    
    const handleConfirmProcess = async () => {
        setConfirmOpen(false);
        const imagesToProcessNow = [...imagesForBgRemoval];
        setImagesForBgRemoval([]);
    
        for (const image of imagesToProcessNow) {
            const result = await removeBackground(image.file);
            if (result) {
                const { processedUrl, imageBase64, mimeType } = result;
                setProcessedImages(prev => [...prev, {
                    id: image.id,
                    originalUrl: image.url,
                    processedUrl,
                    imageBase64,
                    mimeType,
                    fileName: image.file.name,
                }]);
            }
        }
    };

    const handleUseInGenerator = (image: ProcessedImageData) => {
        const file = base64ToFile(image.imageBase64, `processed_${image.fileName}`, image.mimeType);
        onMoveToGenerator({ url: `data:${image.mimeType};base64,${image.imageBase64}`, file: file });
        setSelectedProcessedImage(null); // Close modal
        showToast(t('modals.processedImage.success.full'), 'success');
    };

    const handleDownload = (imageUrl: string, fileName: string) => {
        const downloadUrl = `/.netlify/functions/download-image?url=${encodeURIComponent(imageUrl)}`;
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = `audition-ai-bg-removed-${fileName}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };


    const totalCost = imagesForBgRemoval.length * COST_PER_REMOVAL;

    return (
        <div className="h-full flex flex-col">
             <ConfirmationModal
                isOpen={isConfirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleConfirmProcess}
                cost={totalCost}
                isLoading={isProcessing}
            />
             <ProcessedImageModal
                isOpen={!!selectedProcessedImage}
                onClose={() => setSelectedProcessedImage(null)}
                image={selectedProcessedImage}
                onUseFull={() => {
                    if (selectedProcessedImage) handleUseInGenerator(selectedProcessedImage);
                }}
                onUseCropped={(croppedImage) => {
                    onMoveFaceToGenerator(croppedImage);
                    setSelectedProcessedImage(null);
                    showToast(t('modals.processedImage.success.cropped'), 'success');
                }}
                onDownload={() => {
                    if (selectedProcessedImage) handleDownload(selectedProcessedImage.processedUrl, selectedProcessedImage.fileName);
                }}
            />
            <div className="flex-grow flex flex-col lg:grid lg:grid-cols-2 gap-6">
            
                {/* Left Column: Upload */}
                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="themed-heading text-lg font-bold themed-title-glow">{t('creator.aiTool.bgRemover.uploadTitle')}</h3>
                        <button onClick={onInstructionClick} className="flex items-center gap-1 text-xs text-skin-accent hover:opacity-80 transition-all px-2 py-1 rounded-md bg-skin-accent/10 border border-skin-border-accent hover:bg-skin-accent/20 shadow-accent hover:shadow-accent-lg flex-shrink-0">
                            <i className="ph-fill ph-book-open"></i> {t('creator.aiTool.common.help')}
                        </button>
                    </div>
                    <div className="p-4 bg-black/20 rounded-lg border border-white/10 flex-grow flex flex-col aspect-square">
                        <label className="relative w-full flex-grow min-h-[12rem] flex flex-col items-center justify-center text-center text-gray-400 rounded-lg border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer bg-black/20">
                            <i className="ph-fill ph-upload-simple text-4xl"></i>
                            <p className="font-semibold mt-2">{t('creator.aiTool.bgRemover.uploadButton')}</p>
                            <p className="text-xs">{t('creator.aiTool.bgRemover.uploadDesc')}</p>
                            <input type="file" multiple accept="image/*" onChange={handleBgRemovalImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        </label>
                        {imagesForBgRemoval.length > 0 && (
                            <div className="mt-4">
                            <h4 className="text-sm font-semibold mb-2 text-gray-300">{t('creator.aiTool.bgRemover.readyToProcess', { count: imagesForBgRemoval.length })}</h4>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                {imagesForBgRemoval.map(img => (
                                <div key={img.id} className="relative flex-shrink-0 w-20 h-20 rounded-md">
                                    <img src={img.url} className="w-full h-full object-cover rounded" alt="To process" />
                                    <button onClick={() => setImagesForBgRemoval(p => p.filter(i => i.id !== img.id))} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 z-10 text-xs"><i className="ph-fill ph-x"></i></button>
                                </div>
                                ))}
                            </div>
                            </div>
                        )}
                        <button onClick={handleProcessClick} disabled={isProcessing || imagesForBgRemoval.length === 0} className="w-full mt-4 py-3 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isProcessing ? <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div> : <>
                                <DiamondIcon className="w-6 h-6" />
                                <span>{t('creator.aiTool.bgRemover.processButton', { cost: totalCost })}</span>
                            </>}
                        </button>
                    </div>
                </div>
        
                {/* Right Column: Results */}
                <div className="flex flex-col">
                    <h3 className="themed-heading text-lg font-bold themed-title-glow mb-1">{t('creator.aiTool.bgRemover.resultTitle')}</h3>
                    <p className="text-xs text-skin-muted mb-2">{t('creator.aiTool.bgRemover.resultDesc')}</p>
                    <div className="bg-black/20 rounded-lg border border-white/10 flex-grow p-4 aspect-square">
                        {processedImages.length === 0 && !isProcessing ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                            <i className="ph-fill ph-image text-5xl"></i>
                            <p className="mt-2">{t('creator.aiTool.bgRemover.placeholder')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-3 gap-4 h-full overflow-y-auto custom-scrollbar">
                            {processedImages.map(img => (
                                <div 
                                    key={img.id} 
                                    className="group relative aspect-square cursor-pointer"
                                    onClick={() => setSelectedProcessedImage(img)}
                                >
                                    <img src={img.processedUrl} alt="Processed" className="w-full h-full object-cover rounded-md" />
                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                                        <i className="ph-fill ph-eye text-3xl text-white"></i>
                                        <p className="text-xs text-white mt-1">{t('creator.aiTool.bgRemover.viewDetails')}</p>
                                    </div>
                                </div>
                            ))}
                            {isProcessing && Array(imagesForBgRemoval.length > 0 ? imagesForBgRemoval.length : 1).fill(0).map((_, i) => (
                                <div key={i} className="aspect-square bg-white/5 rounded-md flex items-center justify-center animate-pulse">
                                <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                </div>
                            ))}
                            </div>
                        )}
                    </div>
                </div>
        
            </div>
        </div>
    );
};

export default BgRemoverTool;
