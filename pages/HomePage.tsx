import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Import Landing Page Sections
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Gallery from '../components/Gallery';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';

// Import Common Components
import LandingHeader from '../components/Header';
import Footer from '../components/Footer';
import AuthModal from '../components/AuthModal';
import TopUpModal from '../components/TopUpModal';
import InfoModal from '../components/InfoModal';
import ImageModal from '../components/common/ImageModal';
import DynamicBackground from '../components/common/DynamicBackground';
import AnimatedSection from '../components/common/AnimatedSection';

// Import types and data
import { GalleryImage, CreditPackage } from '../types';

const HomePage: React.FC = () => {
    const { user, login, navigate, stats, showToast, updateUserDiamonds } = useAuth();
    
    // State for Modals
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
    const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

    // State for Data
    const [featuredPackages, setFeaturedPackages] = useState<CreditPackage[]>([]);
    const [isPackagesLoading, setIsPackagesLoading] = useState(true);
    const [publicGalleryImages, setPublicGalleryImages] = useState<GalleryImage[]>([]);
    const [isGalleryLoading, setIsGalleryLoading] = useState(true);
    
    // State for dynamic background
    const [activeSection, setActiveSection] = useState('hero');

    useEffect(() => {
        // Fetch featured packages
        const fetchPackages = async () => {
            try {
                const response = await fetch('/.netlify/functions/credit-packages?featured=true');
                if (!response.ok) throw new Error('Could not load pricing plans.');
                setFeaturedPackages(await response.json());
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsPackagesLoading(false);
            }
        };

        // Fetch public gallery images
        const fetchPublicGallery = async () => {
            try {
                const response = await fetch('/.netlify/functions/public-gallery');
                if (!response.ok) throw new Error('Could not load community gallery.');
                setPublicGalleryImages(await response.json());
            } catch (error: any) {
                showToast(error.message, 'error');
            } finally {
                setIsGalleryLoading(false);
            }
        };

        fetchPackages();
        fetchPublicGallery();
    }, [showToast]);

    // Intersection observer for dynamic background
     useEffect(() => {
        const sections = document.querySelectorAll('section[id]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    setActiveSection(entry.target.id);
                }
            });
        }, { threshold: 0.5 });

        sections.forEach(section => observer.observe(section));
        return () => sections.forEach(section => observer.unobserve(section));
    }, []);

    const handleCtaClick = () => {
        if (user) {
            navigate('tool');
        } else {
            setIsAuthModalOpen(true);
        }
    };

    const handleTopUpClick = () => {
        if (user) {
            setIsTopUpModalOpen(true);
        } else {
            setIsAuthModalOpen(true);
        }
    };
    
    const handleScrollTo = (id: 'hero' | 'features' | 'how-it-works' | 'pricing' | 'faq' | 'gallery') => {
        const element = document.getElementById(id);
        element?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="bg-skin-fill text-skin-base font-sans leading-normal tracking-normal">
            <DynamicBackground activeSection={activeSection} />

            <LandingHeader 
                user={user}
                onTopUpClick={handleTopUpClick}
                onScrollTo={handleScrollTo}
            />
            
            <main>
                <section id="hero">
                    <Hero onCtaClick={handleCtaClick} onGoogleLoginClick={login} />
                </section>
                
                <AnimatedSection id="features">
                    <Features />
                </AnimatedSection>
                
                <AnimatedSection id="how-it-works">
                    <HowItWorks />
                </AnimatedSection>
                
                <AnimatedSection id="gallery">
                     <section className="py-16 sm:py-24 bg-transparent text-white w-full">
                        <div className="container mx-auto px-4">
                            <div className="text-center max-w-3xl mx-auto mb-16">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                    <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Tác Phẩm Từ Cộng Đồng</span>
                                </h2>
                                <p className="text-lg text-gray-400">
                                    Khám phá những sáng tạo độc đáo từ cộng đồng Audition AI.
                                </p>
                            </div>
                            {isGalleryLoading ? (
                                <div className="text-center p-12">Đang tải thư viện...</div>
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
                    <Pricing 
                        onCtaClick={handleCtaClick} 
                        packages={featuredPackages}
                        isLoading={isPackagesLoading}
                    />
                </AnimatedSection>
                
                <AnimatedSection id="faq">
                    <FAQ />
                </AnimatedSection>
            </main>
            
            <Footer 
                stats={stats}
                onInfoLinkClick={setInfoModalKey}
            />
            
            {/* All Modals */}
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
            <ImageModal 
                isOpen={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                image={selectedImage}
            />
        </div>
    );
};

export default HomePage;
