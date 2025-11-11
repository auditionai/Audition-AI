import React from 'react';
import { CreditPackage } from '../../types';

interface PricingProps {
  onCtaClick: () => void;
  packages: CreditPackage[];
  isLoading: boolean;
}

const Pricing: React.FC<PricingProps> = ({ onCtaClick, packages, isLoading }) => {
  return (
    <div className="py-12 sm:py-24 bg-black/20">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Bảng Giá Kim Cương</h2>
          <p className="text-lg text-gray-400">
            Nạp kim cương để tiếp tục hành trình sáng tạo của bạn. Gói càng lớn, ưu đãi càng nhiều.
          </p>
        </div>
        {isLoading ? (
          <div className="text-center">Đang tải bảng giá...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {packages.map((plan) => (
              <div key={plan.id} className={`bg-[#12121A] border border-white/10 rounded-2xl p-8 text-center flex flex-col transition-all duration-300 hover:-translate-y-2 ${plan.is_featured ? 'border-2 border-pink-500 shadow-accent-lg' : ''}`}>
                {plan.is_featured && <div className="absolute top-0 right-0 px-4 py-1 bg-pink-500 text-white font-bold text-sm rounded-bl-lg">Phổ biến</div>}
                <h3 className="text-2xl font-bold mb-2 text-white">{plan.name}</h3>
                <p className="text-5xl font-bold my-6 text-pink-400">{plan.price_vnd.toLocaleString('vi-VN')}đ</p>
                <div className="space-y-3 w-full text-left bg-black/20 p-4 rounded-lg">
                    <p className="flex justify-between items-center text-lg"><span className="flex items-center gap-2 text-gray-300">Gói chính:</span> <span className="font-bold">{plan.credits_amount.toLocaleString()} 💎</span></p>
                    <p className="flex justify-between items-center text-lg"><span className="flex items-center gap-2 text-yellow-400">Thưởng:</span> <span className="font-bold text-yellow-400">+{plan.bonus_credits.toLocaleString()} 💎</span></p>
                    <hr className="border-white/10"/>
                    <p className="flex justify-between items-center text-lg font-bold text-cyan-400"><span className="flex items-center gap-2">Tổng nhận:</span> <span className="neon-text-glow">{(plan.credits_amount + plan.bonus_credits).toLocaleString()} 💎</span></p>
                </div>
                <button onClick={onCtaClick} className="w-full mt-8 py-3 font-bold themed-button-primary">
                  Chọn Gói Này
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Pricing;
