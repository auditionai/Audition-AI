import React from 'react';

interface ImageUploaderProps {
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    image: { url: string } | null;
    onRemove: () => void;
    text: string;
    processType?: 'style';
    disabled?: boolean;
    onPickFromProcessed?: () => void; // NEW: Callback to open the processed image picker
}

const StyleProcessOverlay: React.FC = () => (
    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white p-2 animate-fade-in">
        <p className="font-semibold text-sm mb-2">AI đang phân tích:</p>
        <ul className="text-xs text-gray-300 space-y-1">
            <li><i className="ph-fill ph-check-circle text-green-400 mr-1"></i>Bố cục & Góc nhìn</li>
            <li><i className="ph-fill ph-check-circle text-green-400 mr-1"></i>Dải màu & Ánh sáng</li>
            <li><i className="ph-fill ph-check-circle text-green-400 mr-1"></i>Phong cách nghệ thuật</li>
        </ul>
        <div className="absolute bottom-2 text-xs text-gray-500 font-bold p-1 bg-cyan-500/20 rounded">
            <i className="ph-fill ph-check-circle mr-1"></i>
            ĐÃ PHÂN TÍCH
        </div>
    </div>
);

const ImageUploader: React.FC<ImageUploaderProps> = ({ onUpload, image, onRemove, text, processType, disabled = false, onPickFromProcessed }) => (
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
                <p className="text-xs">PNG, JPG, GIF</p>
            </div>
        )}
        {disabled && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white p-2 rounded-lg text-center z-10">
                <i className="ph-fill ph-prohibit text-4xl text-yellow-400 mb-2"></i>
                <p className="font-semibold text-sm">Không khả dụng</p>
                <p className="text-xs text-gray-400">Model này không hỗ trợ ảnh đầu vào.</p>
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
                title="Chọn ảnh đã xử lý"
            >
                <i className="ph-fill ph-archive-box"></i>
                Chọn
            </button>
        )}
    </div>
);

export default ImageUploader;