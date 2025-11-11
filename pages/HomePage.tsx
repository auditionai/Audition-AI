import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Import Landing Page Sections
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Community from '../components/Community';
import Pricing from '../components/Pricing';
import FAQ from '../components/FAQ';
import Stats from '../components/Stats';
import Cta from '../components/Cta';

// Import Common Components
import LandingHeader from '../components/Header';
import Footer from '../components/Footer';
import AuthModal from '../components/AuthModal';
import TopUpModal from '../components/TopUpModal';
import InfoModal from '../components/InfoModal';
import ImageModal from '../components/common/ImageModal';
import AuroraBackground from '../components/common/AuroraBackground'; // NEW
import AnimatedSection from '../components/common/AnimatedSection';

// Import types and data
import { GalleryImage, CreditPackage, Stats as StatsType } from '../types';

const HomePage: React.FC = () => {
    const { user, login, navigate, showToast, updateUserDiamonds } = useAuth();
    
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
    const [stats, setStats] = useState<StatsType>({ users: 1250, visits: 8700, images: 25000 });
    
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

        // Fetch public stats for footer
        const fetchStats = async () => {
            try {
                // Use the admin dashboard stats endpoint as the single source of truth for all stats.
                const response = await fetch('/.netlify/functions/admin-dashboard-stats');
                if (!response.ok) {
                    console.error('Could not load public stats.');
                    return; // Silently fail and keep mock data
                }
                const dashboardStats = await response.json();
                // Map the detailed stats to the simpler structure needed for the homepage.
                setStats({
                    users: dashboardStats.totalUsers,
                    visits: dashboardStats.totalVisits,
                    images: dashboardStats.totalImages,
                });
            } catch (error) {
                console.error('Could not load public stats:', error);
            }
        };

        fetchPackages();
        fetchPublicGallery();
        fetchStats();
    }, [showToast]);

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
            <AuroraBackground />

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
                     {isGalleryLoading ? (
                        <div className="text-center p-12 h-96"></div>
                     ) : (
                        <Community
                            images={publicGalleryImages}
                            onLoginClick={handleCtaClick}
                            onImageClick={setSelectedImage}
                            onSeeMoreClick={() => navigate('gallery')}
                        />
                     )}
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

                <AnimatedSection id="stats">
                    <Stats stats={stats} />
                </AnimatedSection>

                <AnimatedSection id="cta">
                    <Cta onCtaClick={handleCtaClick} />
                </AnimatedSection>
            </main>
            
            <Footer 
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