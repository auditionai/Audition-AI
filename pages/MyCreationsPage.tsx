import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';
import ImageModal from '../components/common/ImageModal';
import ConfirmationModal from '../components/ConfirmationModal';

const MyCreationsPage: React.FC = () => {
    const { session, showToast, updateUserDiamonds } = useAuth();
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
    const [imageToShare, setImageToShare] = useState<GalleryImage | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const fetchUserGallery = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/user-gallery', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải các tác phẩm của bạn.');
            const data = await response.json();
            setImages(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchUserGallery();
    }, [fetchUserGallery]);
    
    const handleDeleteImage = async () => {
        if (!imageToDelete || !session) return;
        setIsProcessing(true);
        try {
            const response = await fetch('/.netlify/functions/delete-image', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ imageId: imageToDelete.id }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Xóa ảnh thất bại.');

            setImages(prev => prev.filter(img => img.id !== imageToDelete.id));
            showToast('Đã xóa tác phẩm thành công!', 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsProcessing(false);
            setImageToDelete(null);
        }
    };
    
    const handleShareImage = async () => {
        if (!imageToShare || !session) return;
        setIsProcessing(true);
        try {
            const response = await fetch('/.netlify/functions/share-image', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}` 
                },
                body: JSON.stringify({ imageId: imageToShare.id }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Chia sẻ ảnh thất bại.');

            updateUserDiamonds(result.newDiamondCount);
            setImages(prev => prev.map(img => img.id === imageToShare.id ? { ...img, is_public: true } : img));
            showToast('Đã chia sẻ tác phẩm lên thư viện cộng đồng!', 'success');

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsProcessing(false);
            setImageToShare(null);
        }
    };

    if (isLoading) {
        return <div className="text-center p-12">Đang tải các tác phẩm của bạn...</div>;
    }
    
    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
             {imageToDelete && (
                <ConfirmationModal
                    isOpen={!!imageToDelete}
                    onClose={() => setImageToDelete(null)}
                    onConfirm={handleDeleteImage}
                    cost={0}
                    isLoading={isProcessing}
                />
            )}
             {imageToShare && (
                <ConfirmationModal
                    isOpen={!!imageToShare}
                    onClose={() => setImageToShare(null)}
                    onConfirm={handleShareImage}
                    cost={1} // Cost is defined in share-image.ts
                    isLoading={isProcessing}
                />
            )}
            <ImageModal 
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                image={selectedImage}
                showInfoPanel={false} // Custom actions for user's own images
                onShare={setImageToShare}
            />
            <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 text-transparent bg-clip-text">Tác Phẩm Của Tôi</h1>
                <p className="text-lg text-gray-400">Quản lý tất cả các hình ảnh bạn đã tạo bằng Audition AI.</p>
                <p className="mt-4 text-cyan-300 bg-cyan-500/10 p-3 rounded-lg border border-cyan-500/20 text-sm">
                    ✨ Nhấn vào một tác phẩm và chọn nút <span className="font-bold">Chia sẻ</span> để đưa tác phẩm đẹp nhất của bạn ra Thư viện Cộng đồng! (Chi phí: 1 💎)
                </p>
            </div>

            {images.length === 0 ? (
                <div className="text-center py-16 bg-white/5 rounded-2xl">
                    <i className="ph-fill ph-image-square text-6xl text-gray-500"></i>
                    <h3 className="mt-4 text-2xl font-bold">Bạn chưa có tác phẩm nào</h3>
                    <p className="text-gray-400 mt-2">Hãy vào mục "Tạo ảnh" và bắt đầu sáng tạo ngay!</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {images.map(image => (
                        <div 
                            key={image.id} 
                            className="group relative rounded-xl overflow-hidden cursor-pointer interactive-3d aspect-[3/4]"
                            onClick={() => setSelectedImage(image)}
                        >
                            <img 
                                src={image.image_url} 
                                alt={image.prompt || 'User creation'}
                                className="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                             {image.is_public && (
                                <div className="absolute top-2 right-2 bg-blue-500/80 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                    <i className="ph-fill ph-globe"></i>
                                    <span>Công khai</span>
                                </div>
                            )}
                            <div className="absolute inset-0 p-3 w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center">
                                <div className="flex items-center gap-4 justify-center">
                                    <button onClick={(e) => { e.stopPropagation(); setImageToDelete(image); }} className="p-3 bg-red-500/80 rounded-full text-white hover:bg-red-600 transition-colors"><i className="ph-fill ph-trash text-xl"></i></button>
                                     {!image.is_public && (
                                        <button onClick={(e) => { e.stopPropagation(); setImageToShare(image); }} className="p-3 bg-green-500/80 rounded-full text-white hover:bg-green-600 transition-colors"><i className="ph-fill ph-share-network text-xl"></i></button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyCreationsPage;