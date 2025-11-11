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
    const [imageToShare, setImageToShare] = useState<GalleryImage | null>(null);
    const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const fetchUserGallery = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/user-gallery', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải các tác phẩm của bạn.');
            setImages(await response.json());
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchUserGallery();
    }, [fetchUserGallery]);
    
    const handleShare = async () => {
        if (!imageToShare) return;
        setIsActionLoading(true);
        try {
             const response = await fetch('/.netlify/functions/share-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ imageId: imageToShare.id }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showToast(result.message, 'success');
            updateUserDiamonds(result.newDiamondCount);
            // Update image state to reflect it's now public
            setImages(images.map(img => img.id === imageToShare.id ? { ...img, is_public: true } : img));
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsActionLoading(false);
            setImageToShare(null);
        }
    };
    
    const handleDelete = async () => {
        if (!imageToDelete) return;
        setIsActionLoading(true);
        try {
             const response = await fetch('/.netlify/functions/delete-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({ imageId: imageToDelete.id }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showToast(result.message, 'success');
            // Remove image from state
            setImages(images.filter(img => img.id !== imageToDelete.id));
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsActionLoading(false);
            setImageToDelete(null);
        }
    };

    if (isLoading) {
        return <div className="text-center p-12">Đang tải tác phẩm của bạn...</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <ConfirmationModal 
                isOpen={!!imageToShare}
                onClose={() => setImageToShare(null)}
                onConfirm={handleShare}
                cost={1} // Cost to share is 1 diamond
                isLoading={isActionLoading}
            />
             <ConfirmationModal 
                isOpen={!!imageToDelete}
                onClose={() => setImageToDelete(null)}
                onConfirm={handleDelete}
                cost={0} // Deleting is free
                isLoading={isActionLoading}
            />
            <ImageModal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} image={selectedImage} />
            <div className="max-w-7xl mx-auto">
                 <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 sharp-gradient-heading">
                        Tác phẩm của tôi
                    </h1>
                    <p className="text-lg text-gray-400">
                        Nơi lưu giữ tất cả những sáng tạo độc đáo của bạn.
                    </p>
                </div>
                {images.length === 0 ? (
                    <div className="text-center py-20 bg-black/20 rounded-lg">
                        <i className="ph-fill ph-image text-6xl text-gray-600"></i>
                        <p className="mt-4 text-gray-400">Bạn chưa tạo ra tác phẩm nào.</p>
                        <p className="text-gray-500">Hãy đến trang "Tạo ảnh" để bắt đầu hành trình sáng tạo!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {images.map(image => (
                            <div key={image.id} className="group relative rounded-xl overflow-hidden cursor-pointer interactive-3d aspect-[3/4]">
                                <img src={image.image_url} alt={image.prompt} onClick={() => setSelectedImage(image)} className="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-110"/>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-100 transition-opacity duration-300"></div>
                                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                   {image.is_public ? (
                                        <div className="flex items-center gap-1.5 bg-green-500/80 text-white px-2 py-1 rounded-full text-xs">
                                            <i className="ph-fill ph-check-circle"></i> Đã chia sẻ
                                        </div>
                                   ) : (
                                        <button onClick={() => setImageToShare(image)} className="bg-blue-500/80 hover:bg-blue-500 text-white p-2 rounded-full" title="Chia sẻ ra cộng đồng (-1 💎)"><i className="ph-fill ph-share-network"></i></button>
                                   )}
                                    <button onClick={() => setImageToDelete(image)} className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full" title="Xóa ảnh"><i className="ph-fill ph-trash"></i></button>
                                </div>
                                <div className="absolute bottom-0 left-0 p-3 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                                    <p className="text-white text-xs truncate">{image.prompt}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyCreationsPage;