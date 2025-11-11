import React from 'react';
import { CreditPackage } from '../../types';

interface PricingProps {
  onCtaClick: () => void;
  packages: CreditPackage[];
  isLoading: boolean;
}

const Pricing: React.FC<PricingProps> = ({ onCtaClick, packages, isLoading }) => {
  return (
    <div className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Bảng Giá Kim Cương</h2>
          <p className="text-lg text-gray-400">
            Nạp kim cương để tiếp tục hành trình sáng tạo của bạn. Gói càng lớn, ưu đãi càng nhiều.
          </p>
        </div>
        {isLoading ? (
          <div className="text-center">Đang tải bảng giá...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {packages.map((plan) => (
              <div key={plan.id} className="landing-card flex flex-col p-8">
                {plan.is_featured && <div className="absolute -top-3 left-8 px-4 py-1 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white font-bold text-sm rounded-full shadow-lg">Phổ biến</div>}
                <h3 className="text-xl font-bold mb-2 text-gray-400">Tên Gói</h3>
                <p className="text-4xl font-bold my-4 text-white">{plan.price_vnd.toLocaleString('vi-VN')}đ</p>
                <div className="space-y-3 w-full text-left bg-black/20 p-4 rounded-lg text-sm mb-6 flex-grow">
                    <p className="flex justify-between items-center"><span className="flex items-center gap-2 text-gray-300">Gói chính:</span> <span className="font-bold text-white">{plan.credits_amount.toLocaleString()} 💎</span></p>
                    <p className="flex justify-between items-center"><span className="flex items-center gap-2 text-yellow-400">Thưởng:</span> <span className="font-bold text-yellow-400">+{plan.bonus_credits.toLocaleString()} 💎</span></p>
                    <hr className="border-white/10"/>
                    <p className="flex justify-between items-center text-base font-bold text-cyan-400"><span className="flex items-center gap-2">Tổng nhận:</span> <span>{(plan.credits_amount + plan.bonus_credits).toLocaleString()} 💎</span></p>
                </div>
                <button 
                  onClick={onCtaClick} 
                  className="w-full mt-auto py-3 font-bold text-white bg-white/5 border border-white/20 rounded-lg transition-colors hover:bg-white/10"
                >
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