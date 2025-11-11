import React from 'react';

interface CtaProps {
  onCtaClick: () => void;
}

const Cta: React.FC<CtaProps> = ({ onCtaClick }) => {
  return (
    <section id="cta" className="py-16 sm:py-24 text-white">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">Sẵn sàng tỏa sáng cùng Audition AI?</span>
        </h2>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
          Bắt đầu tạo những bức ảnh 3D độc đáo của bạn ngay hôm nay!
        </p>
        <button 
          onClick={onCtaClick}
          className="themed-button-primary px-8 py-4 font-bold text-lg"
        >
          Bắt đầu sáng tạo
        </button>
      </div>
    </section>
  );
};

export default Cta;