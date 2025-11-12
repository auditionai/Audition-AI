import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
// Fix: The `RealtimeChannel` type is not exported in Supabase v1.
// The import is removed, and `any` will be used for the channel objects to fix the error.

// Import Landing Page Sections
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import HowItWorks from '../components/landing/HowItWorks';
import Community from '../components/landing/Community';
import Pricing from '../components/landing/Pricing';
import FAQ from '../components/landing/FAQ';
import StatsDisplay from '../components/landing/Stats';
import Cta from '../components/landing/Cta';

// Import Common Components
import LandingHeader from '../components/landing/Header';
import Footer from '../components/landing/Footer';
import AuthModal from '../components/landing/AuthModal';
import TopUpModal from '../components/landing/TopUpModal';
import InfoModal from '../components/landing/InfoModal';
import ImageModal from '../components/common/ImageModal';
import AnimatedSection from '../components/common/AnimatedSection';
import AuroraBackground from '../components/common/AuroraBackground';

// Import types and data
import { GalleryImage, CreditPackage, DashboardStats } from '../types';

const HomePage: React.FC = () => {
    const { user, login, navigate, showToast, updateUserDiamonds, supabase } = useAuth();
    
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
    const [stats, setStats] = useState<DashboardStats | null>(null);
    
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

        // Fetch public stats
        const fetchStats = async () => {
            try {
                const response = await fetch('/.netlify/functions/admin-dashboard-stats');
                if (!response.ok) {
                    console.error('Could not load public stats.');
                    return;
                }
                const dashboardStats = await response.json();
                // Add 1000 to totalVisits to compensate for pre-tracking data
                dashboardStats.totalVisits += 1000;
                setStats(dashboardStats);
            } catch (error) {
                console.error('Could not load public stats:', error);
            }
        };

        fetchPackages();
        fetchPublicGallery();
        fetchStats();
    }, [showToast]);

    // NEW: Real-time subscriptions for stats
    useEffect(() => {
        if (!supabase) return;

        // Fix: Use `any[]` for the channels array as `RealtimeChannel` type is not available in Supabase v1 imports.
        const channels: any[] = [];
        const updateStat = (updater: (prev: DashboardStats) => DashboardStats) => {
            setStats(currentStats => currentStats ? updater(currentStats) : null);
        };

        const visitsChannel = supabase.channel('public:daily_visits')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_visits' },
                () => updateStat(s => ({ ...s, visitsToday: s.visitsToday + 1, totalVisits: s.totalVisits + 1 })))
            .subscribe();
        channels.push(visitsChannel);

        const usersChannel = supabase.channel('public:users')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' },
                () => updateStat(s => ({ ...s, newUsersToday: s.newUsersToday + 1, totalUsers: s.totalUsers + 1 })))
            .subscribe();
        channels.push(usersChannel);

        const imagesChannel = supabase.channel('public:generated_images')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'generated_images' },
                () => updateStat(s => ({ ...s, imagesToday: s.imagesToday + 1, totalImages: s.totalImages + 1 })))
            .subscribe();
        channels.push(imagesChannel);

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [supabase]);

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
        <div className="text-gray-300 font-sans leading-normal tracking-normal">
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
                    <StatsDisplay stats={stats} />
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