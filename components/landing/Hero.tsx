import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface HeroProps {
  onCtaClick: () => void;
  onGoogleLoginClick: () => void;
}

const Hero: React.FC<HeroProps> = ({ onCtaClick, onGoogleLoginClick }) => {
  const { t } = useTranslation();

  return (
    <section className="relative text-skin-base min-h-screen flex items-center justify-center overflow-hidden">
        {/* The new AuroraBackground is placed in HomePage.tsx, this container remains for content */}
        <div className="relative z-10 container mx-auto px-4 text-center">
            <div 
              className="inline-block bg-pink-500/10 border border-pink-500/30 text-pink-300 text-sm font-bold px-6 py-2 rounded-full mb-6 animate-fade-in-down"
              style={{ animation: 'subtle-pulse-anim 2.5s infinite ease-in-out' }}
            >
                {t('landing.hero.subheading')}
            </div>
            
            <h1 className="themed-heading text-5xl md:text-7xl lg:text-8xl font-black mb-4 leading-tight animate-fade-in-up whitespace-pre-line" style={{ animationDelay: '0.2s' }}>
                <span className="text-neon-pink" style={{ filter: 'drop-shadow(0 2px 15px rgba(0,0,0,0.5))' }}>
                    {t('landing.hero.title')}
                </span>
            </h1>

            <p className="max-w-3xl mx-auto text-lg md:text-xl text-gray-300 mb-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                {t('landing.hero.description')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                <button 
                    onClick={onCtaClick}
                    className="group relative px-8 py-4 font-bold text-lg text-white rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 hover:shadow-[0_0_25px_rgba(88,101,242,0.8)] interactive-3d"
                >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-500 rounded-full blur-md opacity-75 group-hover:opacity-100 transition duration-300"></div>
                    <span className="relative flex items-center justify-center gap-2">
                        <i className="ph-fill ph-magic-wand"></i>
                        {t('landing.hero.cta')}
                    </span>
                </button>
                <button
                    onClick={onGoogleLoginClick} 
                    className="group relative px-8 py-4 font-bold text-lg text-white bg-white/5 backdrop-blur-sm border border-white/20 rounded-full transition-all duration-300 hover:border-white/50 interactive-3d"
                >
                     <div className="absolute -inset-px bg-gradient-to-r from-pink-500 to-purple-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                     <span className="relative">{t('landing.hero.login')}</span>
                </button>
            </div>
        </div>
    </section>
  );
};

export default Hero;
