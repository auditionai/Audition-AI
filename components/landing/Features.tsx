import React from 'react';
import { FEATURES } from '../../constants/landingPageData';

const Features: React.FC = () => {
  return (
    <div className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Tại Sao Chọn Audition AI?</h2>
          <p className="text-lg text-gray-400">
            Chúng tôi kết hợp công nghệ AI tiên tiến nhất với sự am hiểu sâu sắc về thế giới Audition để mang đến trải nghiệm độc đáo.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {FEATURES.map((feature, index) => (
            <div key={index} className="landing-card p-8 text-center">
              <div className="inline-block p-4 rounded-full bg-gradient-to-br from-pink-500/20 to-fuchsia-500/20 mb-6 text-pink-400">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Features;