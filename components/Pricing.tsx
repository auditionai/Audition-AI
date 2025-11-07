import React from 'react';
import { PRICING_PLANS } from '../constants/landingPageData';
import { PricingPlan } from '../types';

interface PricingProps {
  onCtaClick: () => void;
}

const PricingCard: React.FC<{ plan: PricingPlan }> = ({ plan }) => (
  <div
    className={`relative bg-[#12121A]/80 p-6 rounded-2xl border ${
      plan.bestValue ? 'border-pink-500 shadow-lg shadow-pink-500/20' : 'border-pink-500/20'
    } flex flex-col items-center text-center interactive-3d`}
  >
    {plan.bestValue && (
      <div className="absolute top-0 -translate-y-1/2 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase">
        Best Value
      </div>
    )}
    <div className="glowing-border"></div>
    <h3 className="text-xl font-bold mb-2 text-white">{plan.name}</h3>
    <p className="text-4xl font-extrabold my-4">
      <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">
        {plan.diamonds}
      </span>
      <span className="text-lg text-gray-400"> KC</span>
    </p>
    <p className="text-lg font-semibold text-gray-300 mb-6">{plan.price}</p>
    <p className="text-sm text-gray-500">~1.000đ / ảnh</p>
  </div>
);

const Pricing: React.FC<PricingProps> = ({ onCtaClick }) => {
  return (
    <section id="pricing" className="py-20 sm:py-32 bg-[#0B0B0F] text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Bảng Giá Kim Cương</span>
          </h2>
          <p className="text-lg text-gray-400">
            Chọn gói kim cương phù hợp với nhu cầu sáng tạo của bạn. Mỗi ảnh chỉ tốn 1 kim cương.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12">
          {PRICING_PLANS.map((plan, index) => (
            <PricingCard key={index} plan={plan} />
          ))}
        </div>
        
        <div className="text-center">
            <button
                onClick={onCtaClick}
                className="px-8 py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1.5 hover:scale-105 flex items-center justify-center gap-2 mx-auto"
            >
                <i className="ph-fill ph-diamonds-four"></i>
                Nạp Kim Cương Ngay
            </button>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
