import React from 'react';

interface HeroProps {
  onCtaClick: () => void;
  onGoogleLoginClick: () => void;
}

const Hero: React.FC<HeroProps> = ({ onCtaClick, onGoogleLoginClick }) => {
  return (
    <div className="container mx-auto px-4 py-32 sm:py-48 text-center">
      <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
        <span className="sharp-gradient-heading text-5xl md:text-7xl">Biến Ảnh Của Bạn</span><br />
        <span className="text-white">Thành Nhân Vật Audition 3D</span>
      </h1>
      <p className="max-w-2xl mx-auto text-lg md:text-xl text-gray-300 mb-10">
        Trải nghiệm công nghệ AI tạo ảnh hàng đầu từ Google, được tinh chỉnh đặc biệt cho phong cách Audition độc nhất.
      </p>
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
        <button 
          onClick={onCtaClick} 
          className="px-8 py-4 font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-full transition-all duration-300 hover:shadow-lg hover:shadow-fuchsia-500/30 hover:-translate-y-1"
        >
          Bắt đầu Sáng tạo Ngay
          <i className="ph-bold ph-arrow-right ml-2"></i>
        </button>
        <button 
          onClick={onGoogleLoginClick} 
          className="px-8 py-4 font-semibold text-lg text-white bg-black/20 backdrop-blur-sm border border-white/20 rounded-full transition-all duration-300 hover:bg-white/10 hover:-translate-y-1"
        >
          <i className="ph-bold ph-google-logo mr-2"></i>
          Đăng nhập
        </button>
      </div>
    </div>
  );
};

export default Hero;
