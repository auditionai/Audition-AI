import React from 'react';

interface HeroProps {
  onCtaClick: () => void;
  onGoogleLoginClick: () => void;
}

const Hero: React.FC<HeroProps> = ({ onCtaClick, onGoogleLoginClick }) => {
  return (
    <section className="relative text-skin-base min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-skin-fill z-0 aurora-background">
            <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-skin-fill to-transparent"></div>
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center">
            <div className="inline-block bg-skin-accent/10 border border-skin-border-accent text-skin-accent text-base font-bold px-6 py-2 rounded-full mb-6 animate-fade-in-down subtle-pulse">
                Tạo ảnh chỉ 1.000đ/ảnh · 1 Kim cương
            </div>
            
            <h1 className="themed-heading text-4xl md:text-6xl lg:text-7xl font-extrabold mb-4 leading-tight animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <span className="bg-gradient-to-r from-white to-gray-400 text-transparent bg-clip-text">Tạo Ảnh 3D AI</span>
                <br/>
                <span className="bg-gradient-to-r from-skin-accent to-skin-accent-secondary text-transparent bg-clip-text shimmer-text">Phong Cách Audition</span>
            </h1>

            <p className="max-w-3xl mx-auto text-lg md:text-xl text-skin-muted mb-8 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                AI hiểu bố cục, màu sắc, phong cách, góc nhìn… tạo ảnh điện ảnh, có chiều sâu, đúng vibe Audition và giữ nguyên danh tính nhân vật.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                <button 
                    onClick={onCtaClick}
                    className="themed-button-primary px-8 py-4 font-bold text-lg flex items-center justify-center gap-2"
                >
                    <i className="ph-fill ph-magic-wand"></i>
                    Bắt đầu sáng tạo
                </button>
                <button
                    onClick={onGoogleLoginClick} 
                    className="themed-button-secondary px-8 py-4 font-bold text-lg"
                >
                    Đăng nhập Google
                </button>
            </div>
        </div>
    </section>
  );
};

export default Hero;