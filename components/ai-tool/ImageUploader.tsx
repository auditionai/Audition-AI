import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface ImageUploaderProps {
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    image: { url: string } | null;
    onRemove: () => void;
    text: string;
    processType?: 'style';
    disabled?: boolean;
    onPickFromProcessed?: () => void; // NEW: Callback to open the processed image picker
}

const StyleProcessOverlay: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white p-2 animate-fade-in">
            <p className="font-semibold text-sm mb-2">{t('creator.aiTool.singlePhoto.styleDesc').split(' ').slice(0, 4).join(' ')}...</p>
        </div>
    );
};


const ImageUploader: React.FC<ImageUploaderProps> = ({ onUpload, image, onRemove, text, processType, disabled = false, onPickFromProcessed }) => {
    const { t } = useTranslation();
    return (
        <div className={`relative group w-full aspect-square min-h-48 rounded-lg border-2 border-dashed border-gray-600 flex flex-col items-center justify-center bg-black/20 ${!disabled ? 'hover:border-pink-500' : ''} transition-colors p-1 ${disabled ? 'group-disabled' : ''}`}>
            {image && !disabled ? (
                <>
                    <img src={image.url} alt="Uploaded" className={`w-full h-full object-contain rounded-md`}/>
                    {processType === 'style' && <StyleProcessOverlay />}
                    <button onClick={onRemove} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-red-500 transition-colors z-10">
                        <i className="ph-fill ph-x text-lg"></i>
                    </button>
                </>
            ) : (
                <div className="text-center text-gray-400 p-4">
                    <i className="ph-fill ph-upload-simple text-4xl mb-2"></i>
                    <p className="font-semibold">{text}</p>
                    <p className="text-xs">{t('creator.aiTool.common.fileTypes')}</p>
                </div>
            )}
            {disabled && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white p-2 rounded-lg text-center z-10">
                    <i className="ph-fill ph-prohibit text-4xl text-yellow-400 mb-2"></i>
                    <p className="font-semibold text-sm">{t('creator.aiTool.common.unavailable')}</p>
                    <p className="text-xs text-gray-400">{t('creator.aiTool.common.unavailableDesc')}</p>
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
                    className="absolute bottom-2 right-2 bg-cyan-500/20 text-cyan-300 rounded-md px-2 py-1 text-xs font-bold hover:bg-cyan-500/30 transition-colors z-10 flex items-center gap-1.5"
                    title={t('creator.aiTool.groupStudio.pickFromProcessedTooltip')}
                >
                    <i className="ph-fill ph-archive-box"></i>
                    {t('creator.aiTool.groupStudio.pickFromProcessed')}
                </button>
            )}
        </div>
    );
};

export default ImageUploader;