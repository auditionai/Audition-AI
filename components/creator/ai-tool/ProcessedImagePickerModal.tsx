
import React, { useState, useEffect } from 'react';
import Modal from '../../common/Modal';
import { useTranslation } from '../../../hooks/useTranslation';
import { base64ToFile } from '../../../utils/imageUtils';
import { ReactCrop, centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';

interface ProcessedImageData {
    id: string;
    originalUrl?: string;
    processedUrl: string; // R2 URL or DataURL
    imageBase64?: string; // Base64 might be missing for Enhanced images to save storage
    mimeType?: string;
    fileName: string;
    mode?: string; // 'flash' or 'pro' (from enhancer)
}

interface ProcessedImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (image: ProcessedImageData) => void;
  onCropSelect?: (croppedImage: { url: string; file: File }) => void;
  onProcessAction?: (image: ProcessedImageData, action: 'bg-remover' | 'enhancer') => void;
}

type TabType = 'bg-removed' | 'enhanced' | 'edited';

const ProcessedImagePickerModal: React.FC<ProcessedImagePickerModalProps> = ({ isOpen, onClose, onSelect, onCropSelect, onProcessAction }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TabType>('bg-removed');
    const [images, setImages] = useState<ProcessedImageData[]>([]);
    
    // Selection & Detail View State
    const [selectedImage, setSelectedImage] = useState<ProcessedImageData | null>(null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null); // For rendering blob if base64 missing

    // Cropper State
    const [isCropping, setIsCropping] = useState(false);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const imgRef = React.useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadImagesForTab(activeTab);
            setSelectedImage(null);
            setIsCropping(false);
        }
    }, [isOpen, activeTab]);

    const loadImagesForTab = (tab: TabType) => {
        try {
            let key = '';
            if (tab === 'bg-removed') key = 'processedBgImages';
            else if (tab === 'enhanced') key = 'enhancedImages';
            else if (tab === 'edited') key = 'editedImages';

            const stored = sessionStorage.getItem(key);
            if (stored) {
                setImages(JSON.parse(stored));
            } else {
                setImages([]);
            }
        } catch (e) {
            console.error("Failed to load images", e);
            setImages([]);
        }
    };

    // When selecting an image, if base64 is missing (Enhanced images), fetch blob
    const handleImageClick = async (img: ProcessedImageData) => {
        setSelectedImage(img);
        setIsCropping(false);
        
        // Determine MIME type if missing (fallback for Edited images which are usually PNG dataURLs)
        const mime = img.mimeType || (img.processedUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png');

        if (img.imageBase64) {
            setImageBlobUrl(`data:${mime};base64,${img.imageBase64}`);
        } else if (img.processedUrl.startsWith('data:')) {
            // Already a data URL (common for Edited tab)
            setImageBlobUrl(img.processedUrl);
        } else {
            setIsLoadingImage(true);
            try {
                const response = await fetch(img.processedUrl);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                setImageBlobUrl(url);
            } catch (e) {
                console.error("Failed to load full image", e);
            } finally {
                setIsLoadingImage(false);
            }
        }
    };

    // --- Actions ---

    const handleUseFull = () => {
        if (!selectedImage) return;
        // If base64 is missing, we need to construct full object. But for now, pass what we have.
        // Ideally `onSelect` handler handles fetching blob if needed. 
        // But to keep consistency, we can ensure base64 if we fetched blob.
        
        let finalImage = { ...selectedImage };
        // Note: converting blob url back to base64 is heavy, better to pass url if possible
        // But parent component expects ProcessedImageData structure.
        // For simplicity, we pass the object. The parent handles it.
        
        // If we have a blob URL but no base64, we might want to convert it if parent strictly needs base64.
        // But let's assume parent handles `processedUrl`.
        onSelect(finalImage);
    };

    // Cropper Logic
    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        const initialCrop = centerCrop(
          makeAspectCrop({ unit: '%', width: 50 }, 1, width, height),
          width,
          height
        );
        setCrop(initialCrop);
    }
    
    const handleCropConfirm = async () => {
        const imageElement = imgRef.current;
        if (!completedCrop || !imageElement || !selectedImage) return;
    
        const canvas = document.createElement("canvas");
        const scaleX = imageElement.naturalWidth / imageElement.width;
        const scaleY = imageElement.naturalHeight / imageElement.height;
        
        canvas.width = Math.floor(completedCrop.width * scaleX);
        canvas.height = Math.floor(completedCrop.height * scaleY);
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        ctx.drawImage(
          imageElement,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          canvas.width,
          canvas.height
        );
    
        const base64Url = canvas.toDataURL("image/png");
        const file = base64ToFile(base64Url.split(',')[1], `cropped_${selectedImage.fileName}.png`, 'image/png');
        
        if (onCropSelect) {
            onCropSelect({ url: base64Url, file });
        } else {
            // Fallback if no specific crop handler, treat as generic selection but updated data
            onSelect({ ...selectedImage, imageBase64: base64Url.split(',')[1], mimeType: 'image/png' });
        }
    };

    const handleProcessAction = (action: 'bg-remover' | 'enhancer') => {
        if (selectedImage && onProcessAction) {
            onProcessAction(selectedImage, action);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={selectedImage ? t('modals.processedImage.title') : t('modals.picker.title')}>
            
            {/* TABS (Only visible if not in detail mode) */}
            {!selectedImage && (
                <div className="flex border-b border-white/10 mb-4 overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('bg-removed')} 
                        className={`flex-1 py-3 px-2 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'bg-removed' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {t('modals.picker.tabs.bgRemoved')}
                        {activeTab === 'bg-removed' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-pink-500"></div>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('enhanced')} 
                        className={`flex-1 py-3 px-2 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'enhanced' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {t('modals.picker.tabs.enhanced')}
                        {activeTab === 'enhanced' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-500"></div>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('edited')} 
                        className={`flex-1 py-3 px-2 text-sm font-bold transition-colors relative whitespace-nowrap ${activeTab === 'edited' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        {t('modals.picker.tabs.edited')}
                        {activeTab === 'edited' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500"></div>}
                    </button>
                </div>
            )}

            {/* GRID VIEW */}
            {!selectedImage ? (
                <>
                    {images.length === 0 ? (
                        <div className="text-center py-12 text-skin-muted">
                            <i className="ph-fill ph-archive-box text-5xl mb-4 opacity-50"></i>
                            <p>{t('modals.picker.empty')}</p>
                            <p className="text-xs mt-2">{t('modals.picker.empty_desc')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                            {images.map(img => (
                                <div
                                    key={img.id}
                                    className="group relative aspect-square cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-pink-500 bg-black/20"
                                    onClick={() => handleImageClick(img)}
                                >
                                    <img src={img.processedUrl} alt="Processed" className="w-full h-full object-cover" loading="lazy" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-white text-center py-0.5 truncate px-1">
                                        {new Date(Number(img.id) || Date.now()).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* DETAIL / ACTION VIEW */
                <div className="flex flex-col h-full">
                    <div className="relative flex-grow bg-black/40 rounded-lg overflow-hidden flex items-center justify-center border border-white/10 min-h-[300px]">
                        {isLoadingImage ? (
                            <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : isCropping && imageBlobUrl ? (
                             <ReactCrop
                                crop={crop}
                                onChange={(_, percentCrop) => setCrop(percentCrop)}
                                onComplete={(c) => setCompletedCrop(c)}
                                aspect={1}
                                circularCrop={true}
                            >
                                <img 
                                    ref={imgRef}
                                    src={imageBlobUrl} 
                                    alt="Crop target"
                                    crossOrigin="anonymous" 
                                    className="max-w-full max-h-[50vh] object-contain"
                                    onLoad={onImageLoad}
                                />
                            </ReactCrop>
                        ) : (
                            <img src={imageBlobUrl || ''} alt="Selected" className="max-w-full max-h-[50vh] object-contain" />
                        )}

                        {/* Back Button */}
                        <button 
                            onClick={() => { setSelectedImage(null); setIsCropping(false); }}
                            className="absolute top-2 left-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full z-10 transition-colors"
                        >
                            <i className="ph-bold ph-arrow-left text-lg"></i>
                        </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        {isCropping ? (
                            <>
                                <button onClick={() => setIsCropping(false)} className="py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-colors">
                                    {t('modals.processedImage.cancel_crop')}
                                </button>
                                <button onClick={handleCropConfirm} disabled={!completedCrop} className="py-3 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {t('modals.processedImage.use_cropped')}
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={handleUseFull} className="py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-lg shadow-lg hover:shadow-pink-500/30 hover:-translate-y-0.5 transition-all col-span-2 flex items-center justify-center gap-2">
                                    <i className="ph-fill ph-check-circle text-xl"></i> {t('modals.picker.actions.use')}
                                </button>
                                
                                <button onClick={() => setIsCropping(true)} className="py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm">
                                    <i className="ph-fill ph-crop text-lg"></i> {t('modals.picker.actions.crop')}
                                </button>

                                {activeTab === 'enhanced' ? (
                                     <button onClick={() => handleProcessAction('bg-remover')} className="py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm border border-blue-500/50">
                                        <i className="ph-fill ph-scissors text-lg"></i> {t('modals.picker.actions.toBg')}
                                    </button>
                                ) : (
                                     <button onClick={() => handleProcessAction('enhancer')} className="py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm border border-yellow-500/50">
                                        <i className="ph-fill ph-sparkle text-lg"></i> {t('modals.picker.actions.toEnhance')}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default ProcessedImagePickerModal;
