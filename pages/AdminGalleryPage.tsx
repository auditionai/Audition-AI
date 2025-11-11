import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';
import ImageModal from '../components/common/ImageModal';
import ConfirmationModal from '../components/ConfirmationModal';

const AdminGalleryPage: React.FC = () => {
    const { session, showToast } = useAuth();
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const fetchAdminGallery = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/admin-public-gallery', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error('Không thể tải thư viện.');
            setImages(await response.json());
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast]);

    useEffect(() => {
        fetchAdminGallery();
    }, [fetchAdminGallery]);

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
            showToast('Xóa ảnh thành công!', 'success');
            setImages(images.filter(img => img.id !== imageToDelete.id));
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsActionLoading(false);
            setImageToDelete(null);
        }
    };

    if (isLoading) {
        return <div className="text-center p-12">Đang tải thư viện công khai...</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <ConfirmationModal 
                isOpen={!!imageToDelete}
                onClose={() => setImageToDelete(null)}
                onConfirm={handleDelete}
                cost={0}
                isLoading={isActionLoading}
            />
            <ImageModal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} image={selectedImage} />
            <div className="max-w-7xl mx-auto">
                 <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">
                        <span className="bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">Quản lý Gallery</span>
                    </h1>
                    <p className="text-lg text-gray-400">
                        Xem và xóa các ảnh được chia sẻ công khai.
                    </p>
                </div>
                {images.length === 0 ? (
                    <div className="text-center py-20 bg-black/20 rounded-lg">
                        <p className="mt-4 text-gray-400">Chưa có ảnh nào được chia sẻ công khai.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {images.map(image => (
                            <div key={image.id} className="group relative rounded-xl overflow-hidden cursor-pointer interactive-3d aspect-[3/4]">
                                <img src={image.image_url} alt={image.prompt} onClick={() => setSelectedImage(image)} className="w-full h-full object-cover transition-transform duration-500 ease-in-out group-hover:scale-110"/>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-100 transition-opacity duration-300"></div>
                                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                    <button onClick={() => setImageToDelete(image)} className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full" title="Xóa ảnh"><i className="ph-fill ph-trash"></i></button>
                                </div>
                                <div className="absolute bottom-0 left-0 p-3 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                                     <div className="flex items-center gap-2">
                                          <img src={image.creator.photo_url} alt={image.creator.display_name} className="w-8 h-8 rounded-full border-2 border-white/80 flex-shrink-0" />
                                          <p className="text-white text-xs truncate font-semibold">{image.creator.display_name}</p>
                                      </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminGalleryPage;
