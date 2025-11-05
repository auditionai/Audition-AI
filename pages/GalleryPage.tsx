import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import Gallery from '../components/Gallery.tsx';
import ImageModal from '../components/common/ImageModal.tsx';
import { GalleryImage } from '../types.ts';

const GalleryPage: React.FC = () => {
    const { session, showToast } = useAuth();
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

    useEffect(() => {
        const fetchImages = async () => {
            if (!session) {
                setIsLoading(false);
                return;
            };

            try {
                const response = await fetch('/.netlify/functions/user-gallery', {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`
                    }
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Không thể tải thư viện ảnh.');
                }
                const data = await response.json();
                
                // Mock creator data as the function doesn't return it
                const augmentedData = data.map((img: any) => ({
                    ...img,
                    creator: {
                        display_name: 'Bạn',
                        photo_url: 'https://i.pravatar.cc/150?u=current-user', // Placeholder
                        level: 1, // Placeholder
                    }
                }));

                setImages(augmentedData);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsLoading(false);
            }
        };

        fetchImages();
    }, [session, showToast]);

    return (
        <div className="container mx-auto px-4 py-8 animate-fade-in">
             <div className="text-center max-w-2xl mx-auto mb-12">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 via-fuchsia-400 to-cyan-500 text-transparent bg-clip-text">Thư Viện Của Bạn</h1>
                <p className="text-lg text-gray-400">Tất cả những tác phẩm bạn đã sáng tạo cùng Audition AI.</p>
            </div>
            
            {isLoading && <div className="text-center p-12 text-white">Đang tải...</div>}
            
            {!isLoading && images.length === 0 && (
                <div className="text-center p-12 text-gray-400 bg-[#12121A]/50 rounded-2xl">
                    <i className="ph-fill ph-image-square text-6xl text-gray-600 mb-4"></i>
                    <h3 className="text-xl font-semibold text-white">Thư viện còn trống</h3>
                    <p>Hãy bắt đầu tạo những bức ảnh đầu tiên trong Studio Sáng Tạo!</p>
                </div>
            )}

            {!isLoading && images.length > 0 && (
                <Gallery images={images} onImageClick={setSelectedImage} />
            )}
            
            <ImageModal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} image={selectedImage} />
        </div>
    );
};

export default GalleryPage;
