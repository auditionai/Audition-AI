import React from 'react';
import { GalleryImage } from '../../types';
import Gallery from './Gallery';
import { useTranslation } from '../../hooks/useTranslation';

interface CommunityProps {
  images: GalleryImage[];
  onLoginClick: () => void;
  onImageClick: (image: GalleryImage) => void;
  onSeeMoreClick: () => void;
}

const Community: React.FC<CommunityProps> = ({ images, onLoginClick, onImageClick, onSeeMoreClick }) => {
  const { t } = useTranslation();

  return (
    <section id="gallery" className="py-16 sm:py-24 bg-transparent text-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{t('landing.community.title')}</span>
          </h2>
          <p className="text-lg text-gray-400 mb-8">
            {t('landing.community.description')}
          </p>
          <button
            onClick={onLoginClick}
            className="themed-button-secondary px-8 py-3 font-bold text-lg"
          >
            {t('landing.community.cta')} <i className="ph-fill ph-arrow-right ml-2"></i>
          </button>
        </div>
        
        <div className="text-center mb-12">
            <h3 className="text-2xl md:text-3xl font-bold">
                 <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{t('landing.community.featured')}</span>
            </h3>
        </div>

        <Gallery 
            images={images}
            onImageClick={onImageClick}
            displayMode="slider"
            showSeeMore={true}
            onSeeMoreClick={onSeeMoreClick}
        />

      </div>
    </section>
  );
};

export default Community;
