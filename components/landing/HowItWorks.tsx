import React from 'react';
import { HOW_IT_WORKS } from '../../constants/landingPageData';

const HowItWorks: React.FC = () => {
  return (
    <div className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">4 Bước Đơn Giản Để Tỏa Sáng</h2>
          <p className="text-lg text-gray-400">
            Quy trình sáng tạo được tối ưu hóa để bạn có thể dễ dàng tạo ra những tác phẩm nghệ thuật chỉ trong vài phút.
          </p>
        </div>
        <div className="relative">
          <div className="hidden lg:block absolute top-10 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-pink-500/30 to-transparent"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="landing-card text-center p-8 flex flex-col items-center">
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center text-white mb-6">
                  {step.icon}
                   <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-skin-fill border-2 border-pink-500 flex items-center justify-center font-bold text-pink-400">{step.step}</span>
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;