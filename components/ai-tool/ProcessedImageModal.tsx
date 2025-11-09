import React, { useState, useRef, useCallback } from 'react';
import Modal from '../common/Modal';
import { base64ToFile } from '../../utils/imageUtils';

interface ProcessedImage {
    processedUrl: string;
    fileName: string;
    mimeType: string;
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
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ aspect: 1, x: 25, y: 25, width: 50, height: 50 });
  
  const imgRef = useRef<HTMLImageElement>(null);
  
  const getCroppedImg = useCallback(async () => {
    const imageElement = imgRef.current;
    if (!imageElement) return;

    const canvas = document.createElement("canvas");
    const scaleX = imageElement.naturalWidth / imageElement.width;
    const scaleY = imageElement.naturalHeight / imageElement.height;
    
    const pixelCrop = {
        x: crop.x * scaleX,
        y: crop.y * scaleY,
        width: crop.width * scaleX,
        height: crop.height * scaleY,
    };
    
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;
    
    ctx.drawImage(
      imageElement,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    const base64Url = canvas.toDataURL("image/png");
    const file = base64ToFile(base64Url.split(',')[1], `cropped_${image?.fileName || 'face'}.png`, 'image/png');
    
    onUseCropped({ url: base64Url, file });
  }, [crop, image, onUseCropped]);


  const handleClose = () => {
    setIsCropping(false);
    onClose();
  };

  if (!isOpen || !image) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isCropping ? "Crop Gương Mặt" : "Xem ảnh đã tách nền"}>
        <div className="flex flex-col items-center">
            <div className="w-full max-w-md bg-black/30 rounded-lg p-2 mb-6 relative">
                {/* We need to load the image from the R2 URL with crossOrigin to use it in canvas */}
                <img 
                    ref={imgRef}
                    src={image.processedUrl} 
                    alt="Processed result"
                    crossOrigin="anonymous" 
                    className="w-full h-auto object-contain rounded-md max-h-[60vh]"
                />
                {isCropping && (
                    <>
                        <div className="absolute inset-0 bg-black/50" />
                        <div
                            className="absolute border-2 border-dashed border-white cursor-move"
                            style={{
                                top: `${crop.y}%`,
                                left: `${crop.x}%`,
                                width: `${crop.width}%`,
                                height: `${crop.height}%`,
                                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                            }}
                        >
                            {/* This is a simplified cropper UI. A full implementation would have drag/resize handles and more complex logic */}
                            <div className="absolute -top-1 -left-1 w-3 h-3 border-2 border-white bg-gray-800 cursor-nwse-resize" />
                            <div className="absolute -top-1 -right-1 w-3 h-3 border-2 border-white bg-gray-800 cursor-nesw-resize" />
                            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-2 border-white bg-gray-800 cursor-nesw-resize" />
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-2 border-white bg-gray-800 cursor-nwse-resize" />
                        </div>
                    </>
                )}
            </div>
            {isCropping ? (
                <div className="w-full flex flex-col sm:flex-row gap-4">
                    <button onClick={() => setIsCropping(false)} className="flex-1 py-3 font-semibold bg-white/10 text-white rounded-lg hover:bg-white/20 transition flex items-center justify-center gap-2">
                         <i className="ph-fill ph-x text-xl"></i> Hủy Crop
                    </button>
                    <button onClick={getCroppedImg} className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2">
                        <i className="ph-fill ph-check text-xl"></i> Sử dụng ảnh đã Crop
                    </button>
                </div>
            ) : (
                <div className="w-full flex flex-col sm:flex-row gap-4">
                    <button onClick={onDownload} className="flex-1 py-3 font-bold text-white bg-green-500/80 hover:bg-green-600 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i className="ph-fill ph-download-simple text-xl"></i> Tải xuống
                    </button>
                     <button onClick={() => setIsCropping(true)} className="flex-1 py-3 font-bold text-white bg-cyan-500/80 hover:bg-cyan-600 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i className="ph-fill ph-crop text-xl"></i> Crop Gương Mặt
                    </button>
                    <button onClick={onUseFull} className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-2">
                        <i className="ph-fill ph-magic-wand text-xl"></i> Sử dụng ảnh này
                    </button>
                </div>
            )}
      </div>
    </Modal>
  );
};

export default ProcessedImageModal;