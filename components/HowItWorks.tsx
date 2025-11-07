import React from 'react';
import { HOW_IT_WORKS } from '../constants/landingPageData';

const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-gradient-to-b from-[#0B0B0F] to-[#12121A] text-white w-full">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">4 Bước Đơn Giản Để Có Ảnh Cực Chất</span>
          </h2>
          <p className="text-lg text-gray-400">
            Chỉ vài cú nhấp chuột, bạn đã có ngay một tác phẩm nghệ thuật đậm chất Audition.
          </p>
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-0.5 bg-gradient-to-b from-pink-500/30 via-fuchsia-500/30 to-transparent hidden md:block"></div>
          
          {HOW_IT_WORKS.map((item, index) => (
            <div key={item.step} className={`flex md:items-center mb-12 md:mb-0 ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
              <div className="flex-1 md:w-1/2 md:px-8">
                <div className="bg-[#12121A] p-6 rounded-xl border border-gray-800 shadow-lg hover:border-fuchsia-500/50 interactive-3d">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="bg-gradient-to-br from-pink-500 to-fuchsia-600 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                      {item.step}
                    </div>
                    <h3 className="text-2xl font-bold text-white">{item.title}</h3>
                  </div>
                  <p className="text-gray-400">{item.description}</p>
                </div>
              </div>
              <div className="hidden md:flex flex-shrink-0 w-1/2 justify-center items-center">
                 <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-fuchsia-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-pink-500/30 transform transition-transform duration-500 group-hover:rotate-12">
                     {item.icon}
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;