import React from 'react';
import { CreditPackage } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';

interface PricingProps {
  onCtaClick: () => void;
  packages: CreditPackage[];
  isLoading: boolean;
}

const PricingCard: React.FC<{ pkg: CreditPackage; onCtaClick: () => void }> = ({ pkg, onCtaClick }) => {
    const { t } = useTranslation();
    const totalCredits = pkg.credits_amount + pkg.bonus_credits;
    const hasTag = pkg.tag && pkg.tag.trim() !== '';

    return (
        <div
            className={`relative bg-[#12121A]/80 p-6 rounded-2xl border ${
            hasTag ? 'border-pink-500 shadow-lg shadow-pink-500/20' : 'border-pink-500/20'
            } flex flex-col items-center text-center interactive-3d`}
        >
            {hasTag && (
            <div className="absolute top-0 -translate-y-1/2 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase">
                {pkg.tag}
            </div>
            )}
            <div className="glowing-border"></div>
            <h3 className="text-xl font-bold mb-2 text-white">{pkg.name}</h3>
            <p className="text-4xl font-extrabold my-4">
                <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">
                    {pkg.price_vnd.toLocaleString('vi-VN')}đ
                </span>
            </p>
            <div className="bg-white/5 px-4 py-2 rounded-full mb-6">
                <p className="font-semibold text-white flex items-center gap-2">
                    <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                    {t('landing.pricing.card.get')} {totalCredits.toLocaleString('vi-VN')} {t('landing.pricing.card.diamonds')}
                </p>
            </div>
            <button
                onClick={onCtaClick}
                className={`w-full py-3 font-bold rounded-lg transition-all mt-auto ${
                    hasTag ? 'bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white hover:opacity-90' : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                }`}
            >
                {t('landing.pricing.cta')}
            </button>
        </div>
    );
};

const Pricing: React.FC<PricingProps> = ({ onCtaClick, packages, isLoading }) => {
  const { t } = useTranslation();
  // Now displays all packages passed in (which are the featured ones)
  const featuredPackages = packages;

  return (
    <section id="pricing" className="py-16 sm:py-24 text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{t('landing.pricing.title')}</span>
          </h2>
          <p className="text-lg text-gray-400">
            {t('landing.pricing.description')}
          </p>
        </div>
        
        {isLoading ? (
            <div className="flex justify-center items-center py-12">
                <div className="w-12 h-12 border-4 border-t-pink-400 border-white/20 rounded-full animate-spin"></div>
            </div>
        ) : featuredPackages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-12">
                {featuredPackages.map((pkg) => (
                    <PricingCard key={pkg.id} pkg={pkg} onCtaClick={onCtaClick} />
                ))}
            </div>
        ) : (
            <p className="text-center text-gray-500">{t('landing.pricing.loading')}</p>
        )}
        
        <div className="text-center">
            <button
                onClick={onCtaClick}
                className="px-8 py-4 font-bold text-lg text-white bg-white/10 backdrop-blur-sm border border-white/20 rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1 flex items-center justify-center gap-2 mx-auto"
            >
                <i className="ph-fill ph-diamonds-four"></i>
                {t('landing.pricing.viewAll')}
            </button>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
