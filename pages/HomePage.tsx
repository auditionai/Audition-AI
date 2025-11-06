import React, { useState, useEffect } from 'react';
import LandingHeader from '../components/Header';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Gallery from '../components/Gallery';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import Footer from '../components/Footer';
import AuthModal from '../components/AuthModal';
import AnimatedSection from '../components/common/AnimatedSection';
import { useAuth } from '../contexts/AuthContext';
import InfoModal from '../components/InfoModal';
import DynamicBackground from '../components/common/DynamicBackground';
import { GalleryImage } from '../types';
import ImageModal from '../components/common/ImageModal';

const HomePage: React.FC = () => {
    const { user, login, stats, showToast, navigate } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [activeSection, setActiveSection] = useState('hero');
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [publicGalleryImages, setPublicGalleryImages] = useState<GalleryImage[]>([]);
    const [isGalleryLoading, setIsGalleryLoading] = useState(true);

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

    useEffect(() => {
        const sections = document.querySelectorAll('section[id]');
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-50% 0px -50% 0px' }
        );

        sections.forEach((section) => observer.observe(section));

        return () => sections.forEach((section) => observer.unobserve(section));
    }, []);

    const handleOpenInfoModal = (key: 'terms' | 'policy' | 'contact') => {
        setInfoModalKey(key);
    };
    
    const handleDirectGoogleLogin = () => {
        showToast('Đang đăng nhập bằng Google...', 'success');
        login();
    };

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    
    const handleTopUpClick = () => {
        if (user) {
            navigate('buy-credits');
        } else {
            setIsAuthModalOpen(true);
        }
    };

    return (
        <>
            <div className="hidden lg:block">
                <DynamicBackground activeSection={activeSection} />
            </div>
            <LandingHeader
                user={user}
                onTopUpClick={handleTopUpClick}
                onScrollTo={scrollToSection}
            />
            <main className="relative z-10">
                <section id="hero">
                    <Hero
                        onCtaClick={() => user ? navigate('tool') : setIsAuthModalOpen(true)}
                        onGoogleLoginClick={handleDirectGoogleLogin}
                    />
                </section>
                <AnimatedSection id="features">
                    <Features />
                </AnimatedSection>
                <AnimatedSection id="how-it-works">
                    <HowItWorks />
                </AnimatedSection>
                 <AnimatedSection id="gallery" className="py-20 sm:py-32">
                    <div className="container mx-auto px-4">
                        <div className="text-center max-w-3xl mx-auto mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Thư viện Sáng tạo</span>
                            </h2>
                            <p className="text-lg text-gray-400">
                                Khám phá những tác phẩm độc đáo được tạo ra bởi cộng đồng Audition AI.
                            </p>
                        </div>
                        {isGalleryLoading ? (
                             <div className="text-center p-12">Đang tải thư viện...</div>
                        ) : (
                            <Gallery 
                              images={publicGalleryImages}
                              displayMode="slider"
                              onImageClick={setSelectedImage}
                            />
                        )}
                         <div className="mt-12 text-center">
                            <button
                                onClick={() => navigate('gallery')}
                                className="px-8 py-4 font-bold text-lg text-white bg-white/10 backdrop-blur-sm border border-white/20 rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1"
                            >
                                Xem thêm trong thư viện
                                <i className="ph-fill ph-arrow-right ml-2"></i>
                            </button>
                        </div>
                    </div>
                </AnimatedSection>
                <AnimatedSection id="pricing">
                    <Pricing onTopUpClick={handleTopUpClick} />
                </AnimatedSection>
                <AnimatedSection id="faq">
                    <FAQ />
                </AnimatedSection>
            </main>
            <Footer onCtaClick={() => setIsAuthModalOpen(true)} stats={stats} onInfoLinkClick={handleOpenInfoModal}/>

            {/* Modals */}
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
            <InfoModal
                isOpen={!!infoModalKey}
                onClose={() => setInfoModalKey(null)}
                contentKey={infoModalKey}
            />
            <ImageModal 
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                image={selectedImage}
            />
        </>
    );
};

export default HomePage;
