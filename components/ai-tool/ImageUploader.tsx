
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
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white p-2 animate-fade-in rounded-lg">
            <p className="font-semibold text-xs text-center leading-relaxed text-gray-300">{t('creator.aiTool.singlePhoto.styleDesc')}</p>
        </div>
    );
};


const ImageUploader: React.FC<ImageUploaderProps> = ({ onUpload, image, onRemove, text, processType, disabled = false, onPickFromProcessed, className }) => {
    const { t } = useTranslation();
    
    // Default classes: Removed min-h-48 to allow compact designs
    const containerClass = className || "w-full h-full";

    return (
        <div className={`relative group rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center bg-black/20 ${!disabled ? 'hover:border-pink-500 hover:bg-white/5' : ''} transition-all p-1 ${disabled ? 'group-disabled opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${containerClass}`}>
            {image && !disabled ? (
                <>
                    <img src={image.url} alt="Uploaded" className={`w-full h-full object-cover rounded-lg shadow-sm`}/>
                    {processType === 'style' && <StyleProcessOverlay />}
                    <button onClick={onRemove} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 hover:bg-red-500 transition-colors z-10 shadow-lg backdrop-blur-sm">
                        <i className="ph-fill ph-x text-[10px]"></i>
                    </button>
                </>
            ) : (
                <div className="text-center text-gray-400 p-2 flex flex-col items-center justify-center h-full gap-2">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 group-hover:bg-pink-500/20 group-hover:text-pink-400">
                         <i className="ph-fill ph-upload-simple text-xl"></i>
                    </div>
                    {text && <p className="font-semibold text-[10px] uppercase tracking-wide opacity-70 group-hover:opacity-100 transition-opacity">{text}</p>}
                </div>
            )}
            {disabled && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white p-2 rounded-lg text-center z-10 backdrop-blur-[1px]">
                    <i className="ph-fill ph-prohibit text-2xl text-gray-500 mb-1"></i>
                </div>
            )}
            <input type="file" accept="image/*" onChange={onUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={disabled}/>
            {onPickFromProcessed && !disabled && !image && (
                <button 
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPickFromProcessed();
                    }}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 hover:bg-pink-600/90 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg backdrop-blur-md transition flex items-center gap-1 z-20 border border-white/10 whitespace-nowrap"
                    title={t('creator.aiTool.groupStudio.pickFromProcessedTooltip')}
                >
                    <i className="ph-bold ph-images"></i> Kho ảnh
                </button>
            )}
        </div>
    );
};

export default ImageUploader;
