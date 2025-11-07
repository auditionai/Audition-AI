import React, { useState, useEffect, useRef } from 'react';
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
import InfoModal from '../components/InfoModal';
import ImageModal from '../components/common/ImageModal';
import DynamicBackground from '../components/common/DynamicBackground';
import AnimatedSection from '../components/common/AnimatedSection';
import { useAuth } from '../contexts/AuthContext';
import { GalleryImage } from '../types';

const HomePage: React.FC = () => {
  const { user, stats, navigate, updateUserDiamonds, showToast } = useAuth();

  // Modal states
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [infoModalKey, setInfoModalKey] = useState<'terms' | 'policy' | 'contact' | null>(null);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

  // Gallery images
  const [publicGalleryImages, setPublicGalleryImages] = useState<GalleryImage[]>([]);

  useEffect(() => {
    const fetchPublicGallery = async () => {
        try {
            const response = await fetch('/.netlify/functions/public-gallery');
            if (!response.ok) throw new Error('Không thể tải thư viện cộng đồng.');
            const data = await response.json();
            setPublicGalleryImages(data);
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };
    fetchPublicGallery();
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

  const sectionRefs = {
    hero: useRef<HTMLDivElement>(null),
    features: useRef<HTMLDivElement>(null),
    'how-it-works': useRef<HTMLDivElement>(null),
    gallery: useRef<HTMLDivElement>(null),
    pricing: useRef<HTMLDivElement>(null),
    faq: useRef<HTMLDivElement>(null),
  };

  const [activeSection, setActiveSection] = useState('hero');

  useEffect(() => {
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

    const refs = Object.values(sectionRefs);
    refs.forEach((ref) => {
      if (ref.current) {
        observer.observe(ref.current);
      }
    });

    return () => {
      refs.forEach((ref) => {
        if (ref.current) {
          observer.unobserve(ref.current);
        }
      });
    };
  }, []);

  const handleScrollTo = (id: keyof typeof sectionRefs) => {
    sectionRefs[id].current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="bg-[#0B0B0F]">
      <DynamicBackground activeSection={activeSection} />
      <LandingHeader
        user={user}
        onTopUpClick={handleTopUpClick}
        onScrollTo={handleScrollTo}
      />
      <main>
        <div id="hero" ref={sectionRefs.hero}>
          <Hero onCtaClick={handleCtaClick} onGoogleLoginClick={() => setIsAuthModalOpen(true)} />
        </div>
        <AnimatedSection className="relative z-10" id="features" >
          <div ref={sectionRefs.features}><Features /></div>
        </AnimatedSection>
        <AnimatedSection className="relative z-10" id="how-it-works" >
           <div ref={sectionRefs['how-it-works']}><HowItWorks /></div>
        </AnimatedSection>
        <AnimatedSection className="relative z-10" id="gallery">
            <div ref={sectionRefs.gallery}>
                <section className="py-20 sm:py-32 bg-[#12121A] text-white w-full">
                    <div className="container mx-auto px-4">
                        <div className="text-center max-w-3xl mx-auto mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Tác Phẩm Nổi Bật</span>
                            </h2>
                            <p className="text-lg text-gray-400">
                                Chiêm ngưỡng những sáng tạo tuyệt vời từ cộng đồng Audition AI.
                            </p>
                        </div>
                        <Gallery 
                            images={publicGalleryImages} 
                            onImageClick={setSelectedImage} 
                            limit={8} 
                            showSeeMore={true}
                            onSeeMoreClick={() => navigate('gallery')}
                        />
                    </div>
                </section>
            </div>
        </AnimatedSection>
        <AnimatedSection className="relative z-10" id="pricing">
            <div ref={sectionRefs.pricing}><Pricing onCtaClick={handleTopUpClick} /></div>
        </AnimatedSection>
        <AnimatedSection className="relative z-10" id="faq">
           <div ref={sectionRefs.faq}><FAQ /></div>
        </AnimatedSection>
      </main>
      <Footer
        onCtaClick={handleCtaClick}
        stats={stats}
        onInfoLinkClick={setInfoModalKey}
      />

      {/* Modals */}
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
