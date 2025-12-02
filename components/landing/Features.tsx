import React from 'react';
import { FEATURES } from '../../constants/landingPageData';
import { useTranslation } from '../../hooks/useTranslation';

const Features: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="features" className="py-16 sm:py-24 text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{t('landing.features.title')}</span>
          </h2>
          <p className="text-lg text-gray-400">
            {t('landing.features.description')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {FEATURES.map((feature, index) => (
            <div
              key={index}
              className="relative bg-[#12121A]/80 p-6 rounded-2xl border border-pink-500/20 group interactive-3d"
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="glowing-border"></div>
              <div className="mb-4 text-pink-400 group-hover:text-fuchsia-400 transition-colors duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-2 text-white">{t(`landing.features.items.${index}.title`)}</h3>
              <p className="text-gray-400">{t(`landing.features.items.${index}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
