import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';
import ConfirmationModal from '../components/ConfirmationModal';
import { useTranslation } from '../hooks/useTranslation';

const AdminGalleryPage: React.FC = () => {
    const { session, showToast } = useAuth();
    const { t } = useTranslation();
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const fetchPublicGallery = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const response = await fetch('/.netlify/functions/admin-public-gallery', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!response.ok) throw new Error(t('creator.adminGallery.error.load'));
            const data = await response.json();
            setImages(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [session, showToast, t]);

    useEffect(() => {
        fetchPublicGallery();
    }, [fetchPublicGallery]);
    
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
            if (!response.ok) throw new Error(result.error || t('creator.myCreations.delete.error'));

            setImages(prev => prev.filter(img => img.id !== imageToDelete.id));
            showToast(t('creator.adminGallery.deleteSuccess'), 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsProcessing(false);
            setImageToDelete(null);
        }
    };
    
    if (isLoading) {
        return <div className="text-center p-12">{t('creator.adminGallery.loading')}</div>;
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
            <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-red-400 via-orange-400 to-yellow-500 text-transparent bg-clip-text">{t('creator.adminGallery.title')}</h1>
                <p className="text-lg text-gray-400">{t('creator.adminGallery.description')}</p>
            </div>

            {images.length === 0 ? (
                <div className="text-center py-16 bg-white/5 rounded-2xl">
                    <i className="ph-fill ph-image-square text-6xl text-gray-500"></i>
                    <h3 className="mt-4 text-2xl font-bold">{t('creator.adminGallery.empty.title')}</h3>
                    <p className="text-gray-400 mt-2">{t('creator.adminGallery.empty.description')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {images.map(image => (
                        <div 
                            key={image.id} 
                            className="group relative rounded-xl overflow-hidden interactive-3d aspect-[3/4]"
                        >
                            <img 
                                src={image.image_url} 
                                alt={image.prompt || 'User creation'}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                            <div className="absolute bottom-2 left-2 text-xs text-white p-2">
                                <p className="font-bold">{image.creator.display_name}</p>
                            </div>
                            <div className="absolute inset-0 p-3 w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center bg-black/60">
                                <button onClick={() => setImageToDelete(image)} className="p-4 bg-red-500/80 rounded-full text-white hover:bg-red-600 transition-colors"><i className="ph-fill ph-trash text-3xl"></i></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminGalleryPage;