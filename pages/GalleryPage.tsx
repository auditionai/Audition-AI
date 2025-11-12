import React, { useState, useEffect } from 'react';
// FIX: Corrected import paths for components.
import LandingHeader from '../components/landing/Header';
import Footer from '../components/landing/Footer';
import Gallery from '../components/landing/Gallery';
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';
import ImageModal from '../components/common/ImageModal';
// FIX: Corrected import paths for components.
import TopUpModal from '../components/landing/TopUpModal';
import AuthModal from '../components/landing/AuthModal';
import InfoModal from '../components/landing/InfoModal';
import AuroraBackground from '../components/common/AuroraBackground';

const GalleryPage: React.FC = () => {
    const { navigate, user, updateUserDiamonds, showToast } = useAuth();
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [publicGalleryImages, setPublicGalleryImages] = useState<GalleryImage[]>([]);
    const [isGalleryLoading, setIsGalleryLoading] = useState(true);
    
    // Modal states for header/footer actions
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);

     useEffect(() => {
        const fetchPublicGallery = async () => {
            try {
                const response = await fetch('/.netlify/functions/public-gallery');
                if (!response.ok) throw new Error('Không thể tải thư viện cộng đồng.');
                const data = await response.json();
                setPublicGalleryImages(data);
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsGalleryLoading(false);
            }
        };
        fetchPublicGallery();
    }, [showToast]);

    return (
        <>
            <AuroraBackground />
            <LandingHeader
                user={user}
                onTopUpClick={() => user ? setIsTopUpModalOpen(true) : setIsAuthModalOpen(true)}
                onScrollTo={(_id) => navigate('home')} // Navigate home on logo/nav clicks
            />
            <main className="pt-24">
                <section id="full-gallery" className="py-12 sm:py-16">
                    <div className="container mx-auto px-4">
                    <div className="text-center max-w-3xl mx-auto mb-12 animate-fade-in-down">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">
                        <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Thư Viện Cộng Đồng</span>
                        </h1>
                        <p className="text-lg text-gray-400">
                        Khám phá tất cả những sáng tạo độc đáo từ cộng đồng Audition AI.
                        </p>
                    </div>
                    <div className="animate-fade-in-up">
                         <div className="container mx-auto px-4">
                            {isGalleryLoading ? (
                                <div className="text-center p-12">Đang tải thư viện...</div>
                            ) : (
                                <Gallery images={publicGalleryImages} onImageClick={setSelectedImage} />
                            )}
                        </div>
                    </div>
                    </div>
                </section>
            </main>
            <Footer 
                onInfoLinkClick={setInfoModalKey}
            />
            
            {/* Modals */}
            <ImageModal 
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                image={selectedImage}
            />
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
            <TopUpModal
                isOpen={isTopUpModalOpen}
                onClose={() => setIsTopUpModalOpen(false)}
                onTopUpSuccess={(amount) => {
                    if (user) {
                        updateUserDiamonds(user.diamonds + amount);
                    }
                    setIsTopUpModalOpen(false);
                    showToast(`Nạp thành công ${amount} kim cương!`, 'success');
                }}
            />
            <InfoModal
                isOpen={!!infoModalKey}
                onClose={() => setInfoModalKey(null)}
                contentKey={infoModalKey}
            />
        </>
    );
};

export default GalleryPage;