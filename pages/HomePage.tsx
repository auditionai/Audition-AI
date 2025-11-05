import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header.tsx';
import Hero from '../components/Hero.tsx';
import Features from '../components/Features.tsx';
import HowItWorks from '../components/HowItWorks.tsx';
import Gallery from '../components/Gallery.tsx';
import Pricing from '../components/Pricing.tsx';
import FAQ from '../components/FAQ.tsx';
import Footer from '../components/Footer.tsx';
import ImageModal from '../components/common/ImageModal.tsx';
import AnimatedSection from '../components/common/AnimatedSection.tsx';
import DynamicBackground from '../components/common/DynamicBackground.tsx';

import { useAuth } from '../contexts/AuthContext.tsx';
import { GalleryImage, PricingPlan } from '../types.ts';
import { InfoKey } from '../App.tsx';

interface HomePageProps {
    onCtaClick: () => void;
    onTopUpClick: () => void;
    onInfoLinkClick: (key: InfoKey) => void;
    onNavigateToCreator: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onCtaClick, onTopUpClick, onInfoLinkClick, onNavigateToCreator }) => {
    const { user } = useAuth();
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [activeSection, setActiveSection] = useState('hero');

    const sectionRefs = {
        hero: useRef<HTMLDivElement>(null),
        features: useRef<HTMLDivElement>(null),
        'how-it-works': useRef<HTMLDivElement>(null),
        gallery: useRef<HTMLDivElement>(null),
        pricing: useRef<HTMLDivElement>(null),
        faq: useRef<HTMLDivElement>(null),
    };

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
        );

        Object.values(sectionRefs).forEach(ref => {
            if (ref.current) observer.observe(ref.current);
        });

        return () => {
            Object.values(sectionRefs).forEach(ref => {
                if (ref.current) observer.unobserve(ref.current);
            });
        };
    }, []);

    const handleScrollTo = (id: string) => {
        const element = document.getElementById(id);
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handlePlanClick = (plan: PricingPlan) => {
        console.log("Selected plan:", plan.name);
        onTopUpClick();
    };

    return (
        <div className="bg-[#0B0B0F] text-white">
            <DynamicBackground activeSection={activeSection} />
            <Header user={user} onTopUpClick={onTopUpClick} onScrollTo={handleScrollTo} />
            <main>
                <div id="hero" ref={sectionRefs.hero}>
                    <Hero onCtaClick={onCtaClick} onGoogleLoginClick={onCtaClick} />
                </div>

                <AnimatedSection id="features" ref={sectionRefs.features}>
                    <Features />
                </AnimatedSection>

                <AnimatedSection id="how-it-works" ref={sectionRefs['how-it-works']}>
                    <HowItWorks />
                </AnimatedSection>

                <AnimatedSection id="gallery" ref={sectionRefs.gallery}>
                    <section className="py-20 sm:py-32 bg-[#0B0B0F] text-white w-full">
                        <div className="text-center max-w-3xl mx-auto mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Thư Viện Sáng Tạo</span>
                            </h2>
                            <p className="text-lg text-gray-400">
                                Khám phá những tác phẩm độc đáo được tạo ra bởi cộng đồng Audition AI.
                            </p>
                        </div>
                        <Gallery onImageClick={setSelectedImage} limit={8} showSeeMore onSeeMoreClick={onNavigateToCreator} />
                    </section>
                </AnimatedSection>
                
                 <AnimatedSection id="gallery-slider" >
                     <Gallery onImageClick={setSelectedImage} displayMode="slider" />
                </AnimatedSection>

                <AnimatedSection id="pricing" ref={sectionRefs.pricing}>
                    <Pricing onPlanClick={handlePlanClick} />
                </AnimatedSection>

                <AnimatedSection id="faq" ref={sectionRefs.faq}>
                    <FAQ />
                </AnimatedSection>
            </main>
            <Footer 
                onCtaClick={onCtaClick} 
                stats={{ users: 1573, visits: 8420, images: 4219 }} 
                onInfoLinkClick={onInfoLinkClick}
            />
            <ImageModal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)} image={selectedImage} />
        </div>
    );
};

export default HomePage;
