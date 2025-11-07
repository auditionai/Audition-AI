import React, { useState, useEffect, useCallback } from 'react';

// Components
import LandingHeader from '../components/Header';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Gallery from '../components/Gallery';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import Footer from '../components/Footer';
import AuthModal from '../components/AuthModal';
import TopUpModal from '../components/TopUpModal';
import ImageModal from '../components/common/ImageModal';
import InfoModal from '../components/InfoModal';
import AnimatedSection from '../components/common/AnimatedSection';
import DynamicBackground from '../components/common/DynamicBackground';

// Hooks & Types
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';

const HomePage: React.FC = () => {
    const { user, stats, navigate, showToast, updateUserDiamonds } = useAuth();
    
    // Modal states
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);
    const [isTopUpModalOpen, setTopUpModalOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);

    // Gallery state
    const [publicGalleryImages, setPublicGalleryImages] = useState<GalleryImage[]>([]);
    const [isGalleryLoading, setIsGalleryLoading] = useState(true);

    // Dynamic background state
    const [activeSection, setActiveSection] = useState('hero');
    
    useEffect(() => {
        const fetchPublicGallery = async () => {
            try {
                const response = await fetch('/.netlify/functions/public-gallery');
                if (!response.ok) throw new Error('Không thể tải thư viện.');
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

    // Scroll handling for background and header
    const handleScrollTo = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                setActiveSection(entry.target.id);
            }
        });
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(observerCallback, {
            rootMargin: '-50% 0px -50% 0px',
            threshold: 0
        });

        const sectionIds = ['hero', 'features', 'how-it-works', 'gallery', 'pricing', 'faq'];
        const elements = sectionIds.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[];

        elements.forEach(el => observer.observe(el));

        return () => {
             elements.forEach(el => observer.unobserve(el));
        };
    }, [observerCallback]);

    const handleCtaClick = () => {
        if (user) {
            navigate('tool');
        } else {
            setAuthModalOpen(true);
        }
    };
    
    const onTopUpClick = () => {
        if (user) {
             setTopUpModalOpen(true);
        } else {
            setAuthModalOpen(true);
        }
    }

    return (
        <>
            <DynamicBackground activeSection={activeSection} />
            <LandingHeader 
                user={user}
                onTopUpClick={onTopUpClick}
                onScrollTo={handleScrollTo}
            />
            
            <main>
                <section id="hero">
                    <Hero onCtaClick={handleCtaClick} onGoogleLoginClick={() => setAuthModalOpen(true)} />
                </section>
                
                <AnimatedSection id="features">
                    <Features />
                </AnimatedSection>
                
                <AnimatedSection id="how-it-works">
                    <HowItWorks />
                </AnimatedSection>
                
                <AnimatedSection id="gallery">
                    <section className="py-20 sm:py-32 bg-transparent text-white w-full">
                        <div className="container mx-auto px-4">
                            <div className="text-center max-w-3xl mx-auto mb-16">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                    <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Tác phẩm từ cộng đồng</span>
                                </h2>
                                <p className="text-lg text-gray-400">
                                    Khám phá những sáng tạo độc đáo từ những người dùng khác.
                                </p>
                            </div>
                            {isGalleryLoading ? (
                                <div className="text-center">Đang tải...</div>
                            ) : (
                                <Gallery 
                                    images={publicGalleryImages} 
                                    onImageClick={setSelectedImage}
                                    limit={8}
                                    showSeeMore={true}
                                    onSeeMoreClick={() => navigate('gallery')}
                                />
                            )}
                        </div>
                    </section>
                </AnimatedSection>
                
                <AnimatedSection id="pricing">
                    <Pricing onTopUpClick={onTopUpClick} />
                </AnimatedSection>

                <AnimatedSection id="faq">
                    <FAQ />
                </AnimatedSection>
            </main>

            <Footer 
                onCtaClick={handleCtaClick}
                stats={stats}
                onInfoLinkClick={setInfoModalKey}
            />

            {/* Modals */}
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
            <TopUpModal 
                isOpen={isTopUpModalOpen}
                onClose={() => setTopUpModalOpen(false)}
                onTopUpSuccess={(amount) => {
                    if (user) {
                        updateUserDiamonds(user.diamonds + amount);
                    }
                    setTopUpModalOpen(false);
                    showToast(`Nạp thành công ${amount} kim cương!`, 'success');
                }}
            />
            <ImageModal
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                image={selectedImage}
            />
            <InfoModal
                isOpen={!!infoModalKey}
                onClose={() => setInfoModalKey(null)}
                contentKey={infoModalKey}
            />
        </>
    );
};

export default HomePage;
