
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface ImageUploaderProps {
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    image: { url: string } | null;
    onRemove: () => void;
    text: string;
    processType?: 'style';
    disabled?: boolean;
    onPickFromProcessed?: () => void;
    className?: string; // New prop for custom styling
}

const StyleProcessOverlay: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white p-2 animate-fade-in">
            <p className="font-semibold text-sm mb-2">{t('creator.aiTool.singlePhoto.styleDesc').split(' ').slice(0, 4).join(' ')}...</p>
        </div>
    );
};


const ImageUploader: React.FC<ImageUploaderProps> = ({ onUpload, image, onRemove, text, processType, disabled = false, onPickFromProcessed, className }) => {
    const { t } = useTranslation();
    
    // Default classes if className is not provided, otherwise use className entirely to allow full override
    const containerClass = className || "w-full aspect-square min-h-48";

    return (
        <div className={`relative group rounded-lg border-2 border-dashed border-gray-600 flex flex-col items-center justify-center bg-black/20 ${!disabled ? 'hover:border-pink-500' : ''} transition-colors p-1 ${disabled ? 'group-disabled' : ''} ${containerClass}`}>
            {image && !disabled ? (
                <>
                    <img src={image.url} alt="Uploaded" className={`w-full h-full object-contain rounded-md`}/>
                    {processType === 'style' && <StyleProcessOverlay />}
                    <button onClick={onRemove} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-red-500 transition-colors z-10">
                        <i className="ph-fill ph-x text-xs"></i>
                    </button>
                </>
            ) : (
                <div className="text-center text-gray-400 p-2 flex flex-col items-center justify-center h-full">
                    <i className="ph-fill ph-upload-simple text-2xl mb-1"></i>
                    {text && <p className="font-semibold text-xs">{text}</p>}
                </div>
            )}
            {disabled && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white p-2 rounded-lg text-center z-10">
                    <i className="ph-fill ph-prohibit text-2xl text-yellow-400 mb-1"></i>
                </div>
            )}
            <input type="file" accept="image/*" onChange={onUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={disabled}/>
            {onPickFromProcessed && !disabled && (
                <button 
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPickFromProcessed();
                    }}
                    className="absolute bottom-1 right-1 bg-cyan-500/20 text-cyan-300 rounded-md px-1.5 py-0.5 text-[10px] font-bold hover:bg-cyan-500/30 transition-colors z-10 flex items-center gap-1"
                    title={t('creator.aiTool.groupStudio.pickFromProcessedTooltip')}
                >
                    <i className="ph-fill ph-archive-box"></i>
                </button>
            )}
        </div>
    );
};

export default ImageUploader;
