import React from 'react';
import { PRICING_PLANS } from '../constants/landingPageData';

interface PricingProps {
  onTopUpClick: () => void;
}

const Pricing: React.FC<PricingProps> = ({ onTopUpClick }) => {
  return (
    <section id="pricing" className="py-20 sm:py-32 bg-[#12121A] text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Giá Siêu Rẻ, Sáng Tạo Vô Hạn</span>
          </h2>
          <p className="text-lg text-gray-400">
            1.000đ = 1 Kim cương = 1 lượt dùng công cụ AI. Chọn gói nạp phù hợp với bạn.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {PRICING_PLANS.map((plan, index) => (
            <div
              key={index}
              className={`relative bg-[#0B0B0F] p-8 rounded-2xl border interactive-3d ${plan.bestValue ? 'border-pink-500 shadow-2xl shadow-pink-500/20' : 'border-gray-800'}`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              {plan.bestValue && (
                <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase">
                  Phổ biến nhất
                </div>
              )}
              <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
              <p className="text-4xl font-bold mb-4">{plan.price}</p>
              <div className="flex items-center justify-center gap-2 text-lg mb-6 font-semibold bg-white/5 p-3 rounded-lg">
                <i className="ph-fill ph-diamonds-four text-xl text-pink-400"></i>
                <span>Nhận {plan.diamonds} Kim cương</span>
              </div>
              <button 
                onClick={onTopUpClick}
                className={`w-full py-3 font-bold rounded-lg transition-all duration-300 hover:-translate-y-1 ${plan.bestValue ? 'bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white hover:shadow-lg hover:shadow-pink-500/30' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                Nạp ngay
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;