import React, { useState, useEffect } from 'react';
import Modal from '../../common/Modal';
import { useTranslation } from '../../../hooks/useTranslation';

interface ProcessedImageData {
    id: string;
    originalUrl: string;
    processedUrl: string; // R2 URL
    imageBase64: string; // Base64 data of the processed image
    mimeType: string;
    fileName: string;
}

interface ProcessedImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (image: ProcessedImageData) => void;
}

const ProcessedImagePickerModal: React.FC<ProcessedImagePickerModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { t } = useTranslation();
    const [processedImages, setProcessedImages] = useState<ProcessedImageData[]>([]);

    useEffect(() => {
        if (isOpen) {
            try {
                const storedImages = sessionStorage.getItem('processedBgImages');
                if (storedImages) {
                    setProcessedImages(JSON.parse(storedImages));
                } else {
                    setProcessedImages([]);
                }
            } catch (e) {
                console.error("Failed to parse processed images from sessionStorage", e);
                setProcessedImages([]);
            }
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('modals.picker.title')}>
            {processedImages.length === 0 ? (
                <div className="text-center py-8 text-skin-muted">
                    <i className="ph-fill ph-archive-box text-5xl mb-4"></i>
                    <p>{t('modals.picker.empty')}</p>
                    <p className="text-xs mt-2">{t('modals.picker.empty_desc')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    {processedImages.map(img => (
                        <div
                            key={img.id}
                            className="group relative aspect-square cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-pink-500"
                            onClick={() => onSelect(img)}
                        >
                            <img src={img.processedUrl} alt="Processed" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <i className="ph-fill ph-check-circle text-4xl text-white"></i>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
};

export default ProcessedImagePickerModal;
