import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface CtaProps {
  onCtaClick: () => void;
}

const Cta: React.FC<CtaProps> = ({ onCtaClick }) => {
  const { t } = useTranslation();
  return (
    <section id="cta" className="py-16 sm:py-24 text-white">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{t('landing.cta.title')}</span>
        </h2>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
          {t('landing.cta.description')}
        </p>
        <button 
          onClick={onCtaClick}
          className="themed-button-primary px-8 py-4 font-bold text-lg"
        >
          {t('landing.cta.button')}
        </button>
      </div>
    </section>
  );
};

export default Cta;
