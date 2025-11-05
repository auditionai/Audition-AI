import React, { useState } from 'react';
import LandingHeader from '../components/Header';
import Footer from '../components/Footer';
import Gallery from '../components/Gallery';
// Fix: Import `useAuth` from `AuthContext` to get all context functionality.
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';
import ImageModal from '../components/common/ImageModal';
import TopUpModal from '../components/TopUpModal';
import AuthModal from '../components/AuthModal';
import InfoModal from '../components/InfoModal';

const GalleryPage: React.FC = () => {
    // Fix: Remove unused `login` variable.
    const { navigate, stats, user, updateUserDiamonds, showToast } = useAuth();
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    
    // Modal states for header/footer actions
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);

    return (
        <>
            <LandingHeader
                user={user}
                onAuthClick={() => setIsAuthModalOpen(true)}
                onRegisterClick={() => setIsAuthModalOpen(true)}
                onTopUpClick={() => setIsTopUpModalOpen(true)}
                // Fix: Rename unused parameter `id` to `_id` to satisfy linter.
                onScrollTo={(_id) => navigate('home')} // Navigate home on logo/nav clicks
            />
            <main className="pt-24 bg-[#0B0B0F]">
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
                            <Gallery onImageClick={setSelectedImage} />
                        </div>
                    </div>
                    </div>
                </section>
            </main>
            <Footer 
                onCtaClick={() => setIsAuthModalOpen(true)} 
                stats={stats} 
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