import React, { useState, useRef, useCallback } from 'react';
import Modal from '../common/Modal';
import { base64ToFile } from '../../utils/imageUtils';
import { ReactCrop, centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import { useTranslation } from '../../hooks/useTranslation';

interface ProcessedImage {
    processedUrl: string;
    fileName: string;
    mimeType: string;
    imageBase64: string; 
}

interface ProcessedImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: ProcessedImage | null;
  onUseFull: () => void;
  onUseCropped: (croppedImage: { url: string; file: File }) => void;
  onDownload: () => void;
}

const ProcessedImageModal: React.FC<ProcessedImageModalProps> = ({ isOpen, onClose, image, onUseFull, onUseCropped, onDownload }) => {
  const { t } = useTranslation();
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 50 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
    // The onComplete handler will be called with the pixel values for this initial crop,
    // so we do not need to set the completedCrop here. Doing so causes a type error.
  }
  
  const getCroppedImg = useCallback(async () => {
    const imageElement = imgRef.current;
    if (!completedCrop || !imageElement || !image) return;

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
    const file = base64ToFile(base64Url.split(',')[1], `cropped_${image.fileName || 'face'}.png`, 'image/png');
    
    onUseCropped({ url: base64Url, file });
  }, [completedCrop, image, onUseCropped]);


  const handleClose = () => {
    setIsCropping(false);
    setCrop(undefined);
    setCompletedCrop(null);
    onClose();
  };

  if (!isOpen || !image) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isCropping ? t('modals.processedImage.title_crop') : t('modals.processedImage.title')}>
        <div className="flex flex-col items-center">
            <div className="w-full max-w-md bg-black/30 rounded-lg p-2 mb-6 relative">
                 {isCropping ? (
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        aspect={1}
                        circularCrop={true}
                    >
                        <img 
                            ref={imgRef}
                            src={`data:${image.mimeType};base64,${image.imageBase64}`} 
                            alt="Crop target"
                            crossOrigin="anonymous" 
                            className="w-full h-auto object-contain rounded-md max-h-[60vh]"
                            onLoad={onImageLoad}
                        />
                    </ReactCrop>
                ) : (
                    <img 
                        src={`data:${image.mimeType};base64,${image.imageBase64}`} 
                        alt="Processed result"
                        className="w-full h-auto object-contain rounded-md max-h-[60vh]"
                    />
                )}
            </div>
            {isCropping ? (
                <div className="w-full flex flex-col sm:flex-row gap-4">
                    <button onClick={() => setIsCropping(false)} className="flex-1 py-3 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center justify-center gap-2">
                         <i className="ph-fill ph-x text-xl"></i> {t('modals.processedImage.cancel_crop')}
                    </button>
                    <button onClick={getCroppedImg} disabled={!completedCrop} className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50">
                        <i className="ph-fill ph-check text-xl"></i> {t('modals.processedImage.use_cropped')}
                    </button>
                </div>
            ) : (
                <div className="w-full flex flex-col sm:flex-row gap-4">
                    <button onClick={onDownload} className="flex-1 py-3 font-bold text-white bg-green-500/80 hover:bg-green-600 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i className="ph-fill ph-download-simple text-xl"></i> {t('common.download')}
                    </button>
                     <button onClick={() => setIsCropping(true)} className="flex-1 py-3 font-bold text-white bg-cyan-500/80 hover:bg-cyan-600 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i className="ph-fill ph-crop text-xl"></i> {t('modals.processedImage.crop_face')}
                    </button>
                    <button onClick={onUseFull} className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2">
                        <i className="ph-fill ph-magic-wand text-xl"></i> {t('modals.processedImage.use_full')}
                    </button>
                </div>
            )}
      </div>
    </Modal>
  );
};

export default ProcessedImageModal;
