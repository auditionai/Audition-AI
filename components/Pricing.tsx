import React from 'react';
import { PRICING_PLANS } from '../constants/landingPageData.ts';
import { PricingPlan } from '../types.ts';

interface PricingProps {
    onPlanClick: (plan: PricingPlan) => void;
}

const Pricing: React.FC<PricingProps> = ({ onPlanClick }) => {
  return (
    <section id="pricing" className="py-20 sm:py-32 bg-gradient-to-b from-[#12121A] to-[#0B0B0F] text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Bảng giá Kim Cương</span>
          </h2>
          <p className="text-lg text-gray-400">
            Chọn gói phù hợp để bắt đầu hành trình sáng tạo của bạn. Mỗi lần tạo ảnh chỉ tốn 1 Kim Cương.
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {PRICING_PLANS.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative bg-[#12121A]/80 p-8 rounded-2xl border ${plan.bestValue ? 'border-pink-500 shadow-2xl shadow-pink-500/20' : 'border-pink-500/20'} flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-pink-500/20 interactive-3d`}
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {plan.bestValue && (
                <div className="absolute -top-4 bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  Phổ biến nhất
                </div>
              )}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-4xl font-extrabold my-4">
                <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">{plan.price}</span>
              </p>
              <div className="flex items-center gap-2 text-xl font-bold mb-6">
                <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                <span>{plan.diamonds} Kim Cương</span>
              </div>
              <button
                onClick={() => onPlanClick(plan)}
                className={`w-full mt-auto py-3 font-bold rounded-lg transition-all duration-300 ${plan.bestValue ? 'bg-gradient-to-r from-[#F72585] to-[#CA27FF] text-white hover:opacity-90 shadow-lg shadow-[#F72585]/30' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                Chọn gói này
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
