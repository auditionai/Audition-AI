import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';
import ImageModal from '../components/common/ImageModal';
import ConfirmationModal from '../components/ConfirmationModal';

const MyCreationsPage: React.FC = () => {
    const { session, showToast, updateUserProfile, user } = useAuth();
    const [userImages, setUserImages] = useState<GalleryImage[]>([]);
    const [isImagesLoading, setIsImagesLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [imageToShare, setImageToShare] = useState<GalleryImage | null>(null);
    const [isShareConfirmOpen, setShareConfirmOpen] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    const COST_PER_SHARE = 1;

    useEffect(() => {
        const fetchUserImages = async () => {
            if (!session) {
                setIsImagesLoading(false);
                return;
            };
            try {
                const response = await fetch('/.netlify/functions/user-gallery', { 
                    headers: { Authorization: `Bearer ${session.access_token}` },
                    cache: 'no-cache'
                });
                if (!response.ok) throw new Error('Không thể tải ảnh của bạn.');
                setUserImages(await response.json());
            } catch (error: any) { 
                showToast(error.message, 'error'); 
            } finally { 
                setIsImagesLoading(false); 
            }
        };

        fetchUserImages();
    }, [session, showToast]);

    const handleShareClick = (image: GalleryImage) => {
        if (user && user.diamonds < COST_PER_SHARE) {
            showToast('Bạn không đủ kim cương để chia sẻ.', 'error');
            return;
        }
        setImageToShare(image);
        setShareConfirmOpen(true);
    };
    
    const handleConfirmShare = async () => {
        if (!imageToShare || !session) return;
        
        setIsSharing(true);
        setShareConfirmOpen(false);

        try {
            const response = await fetch('/.netlify/functions/share-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ imageId: imageToShare.id }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Chia sẻ ảnh thất bại.');

            updateUserProfile({ diamonds: result.newDiamondCount });
            showToast('Chia sẻ tác phẩm thành công!', 'success');
            
            // Mark the image as shared in the local state to hide the share button
            setUserImages(prevImages => prevImages.map(img => 
                img.id === imageToShare.id ? { ...img, is_public: true } : img
            ));

        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsSharing(false);
            setImageToShare(null);
            setSelectedImage(null);
        }
    };


    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
            <ImageModal 
                isOpen={!!selectedImage} 
                onClose={() => setSelectedImage(null)} 
                image={selectedImage} 
                showInfoPanel={false}
                onShare={handleShareClick}
            />
            <ConfirmationModal
                isOpen={isShareConfirmOpen}
                onClose={() => setShareConfirmOpen(false)}
                onConfirm={handleConfirmShare}
                cost={COST_PER_SHARE}
            />
            
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Bộ Sưu Tập Của Bạn</h1>
                <p className="text-lg text-gray-400">Tất cả những tác phẩm bạn đã tạo bằng Audition AI.</p>
            </div>
            
            <div className="bg-[#12121A]/80 border border-white/10 rounded-2xl shadow-lg p-6">
                {isImagesLoading ? (
                    <div className="text-center text-gray-400 py-12">
                        <div className="w-10 h-10 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin mx-auto mb-4"></div>
                        Đang tải tác phẩm...
                    </div>
                ) : userImages.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {userImages.map(img => (
                            <div key={img.id} className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer interactive-3d" onClick={() => setSelectedImage(img)}>
                                <img src={img.image_url} alt={img.prompt} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                                    <div className="flex flex-col items-center text-white p-2">
                                        <i className="ph-fill ph-eye text-3xl"></i>
                                        <span className="text-xs font-semibold mt-1">Xem</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-gray-400 py-16">
                        <i className="ph-fill ph-image text-6xl text-gray-600 mb-4"></i>
                        <h3 className="text-xl font-semibold text-white">Chưa có tác phẩm nào</h3>
                        <p>Bạn chưa tạo ảnh nào. Hãy bắt đầu sáng tạo ngay!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyCreationsPage;