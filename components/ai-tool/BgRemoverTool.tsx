import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackgroundRemover } from '../../hooks/useBackgroundRemover';
import { DiamondIcon } from '../common/DiamondIcon';
import ConfirmationModal from '../ConfirmationModal';

// Helper function to convert a base64 string back to a File object
const base64ToFile = (base64: string, filename: string, mimeType: string): File => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
};


// Helper function to resize an image file before uploading
const resizeImage = (file: File, maxSize: number): Promise<{ file: File; dataUrl: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) return reject(new Error('FileReader did not return a result.'));
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Could not get canvas context'));
                
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('Canvas to Blob conversion failed'));
                    const resizedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve({ file: resizedFile, dataUrl });
                }, 'image/jpeg', 0.9);
            };
            img.onerror = reject;
            img.src = event.target.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

interface BgRemoverToolProps {
    onMoveToGenerator: (image: { url: string; file: File }) => void;
}

const BgRemoverTool: React.FC<BgRemoverToolProps> = ({ onMoveToGenerator }) => {
    const { user, showToast } = useAuth();
    const { isProcessing, removeBackground, COST_PER_REMOVAL } = useBackgroundRemover();

    const [imagesForBgRemoval, setImagesForBgRemoval] = useState<Array<{id: string, url: string, file: File}>>([]);
    const [processedImages, setProcessedImages] = useState<Array<{id: string, originalUrl: string, processedUrl: string, file: File}>>([]);
    const [isConfirmOpen, setConfirmOpen] = useState(false);

    const handleBgRemovalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        files.forEach((file: File) => {
             resizeImage(file, 1024).then(({ file: resizedFile, dataUrl: resizedDataUrl }) => {
                const newImage = { id: crypto.randomUUID(), url: resizedDataUrl, file: resizedFile };
                setImagesForBgRemoval(prev => [...prev, newImage]);
            }).catch(err => {
                console.error("Error resizing image for background removal:", err);
                showToast("Lỗi khi xử lý ảnh.", "error");
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
                // Directly convert base64 to a File object, bypassing the CORS-inducing fetch call.
                const processedFile = base64ToFile(imageBase64, `processed_${image.file.name}`, mimeType);
                setProcessedImages(prev => [...prev, { id: image.id, originalUrl: image.url, processedUrl, file: processedFile }]);
            }
        }
    };

    const handleInternalMove = (image: {processedUrl: string, file: File}) => {
        onMoveToGenerator({ url: image.processedUrl, file: image.file });
        showToast('Đã chuyển ảnh sang trình tạo AI!', 'success');
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
            <div className="flex-grow flex flex-col lg:grid lg:grid-cols-2 gap-6">
            
                {/* Left Column: Upload */}
                <div className="flex flex-col">
                    <h3 className="font-semibold mb-3 text-lg">1. Tải ảnh lên</h3>
                    <div className="p-4 bg-black/20 rounded-lg border border-white/10 flex-grow flex flex-col aspect-square">
                        <label className="relative w-full flex-grow min-h-[12rem] flex flex-col items-center justify-center text-center text-gray-400 rounded-lg border-2 border-dashed border-gray-600 hover:border-pink-500 cursor-pointer bg-black/20">
                            <i className="ph-fill ph-upload-simple text-4xl"></i>
                            <p className="font-semibold mt-2">Nhấn để chọn hoặc kéo thả</p>
                            <p className="text-xs">Có thể chọn nhiều ảnh</p>
                            <input type="file" multiple accept="image/*" onChange={handleBgRemovalImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        </label>
                        {imagesForBgRemoval.length > 0 && (
                            <div className="mt-4">
                            <h4 className="text-sm font-semibold mb-2 text-gray-300">Sẵn sàng xử lý: {imagesForBgRemoval.length} ảnh</h4>
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
                                <span>Tách nền ({imagesForBgRemoval.length} ảnh)</span>
                            </>}
                        </button>
                    </div>
                </div>
        
                {/* Right Column: Results */}
                <div className="flex flex-col">
                    <h3 className="font-semibold mb-3 text-lg">2. Kết quả</h3>
                    <div className="bg-black/20 rounded-lg border border-white/10 flex-grow p-4 aspect-square">
                        {processedImages.length === 0 && !isProcessing ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center">
                            <i className="ph-fill ph-image text-5xl"></i>
                            <p className="mt-2">Ảnh sau khi xử lý sẽ hiện ở đây</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-3 gap-4 h-full overflow-y-auto custom-scrollbar">
                            {processedImages.map(img => (
                                <div key={img.id} className="group relative aspect-square">
                                <img src={img.processedUrl} alt="Processed" className="w-full h-full object-cover rounded-md" />
                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                                    <button onClick={() => handleInternalMove({ processedUrl: img.processedUrl, file: img.file })} className="px-3 py-2 bg-pink-600 text-white font-semibold rounded-lg text-sm hover:bg-pink-700 transition">
                                    Sử dụng
                                    </button>
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