import React, { useState, useEffect } from 'react';

interface FooterProps {
    onCtaClick: () => void;
    stats: {
        users: number;
        visits: number;
        images: number;
    };
    onInfoLinkClick: (key: 'terms' | 'policy' | 'contact') => void;
}

const AnimatedStat: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const duration = 1500;
        const frameRate = 1000 / 60;
        const totalFrames = Math.round(duration / frameRate);
        let frame = 0;
        
        const counter = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const currentVal = Math.round(value * progress);
            setDisplayValue(currentVal);

            if (frame === totalFrames) {
                clearInterval(counter);
                setDisplayValue(value);
            }
        }, frameRate);

        return () => clearInterval(counter);
    }, [value]);
    
    return <span>{displayValue.toLocaleString('vi-VN')}</span>;
};


const Footer: React.FC<FooterProps> = ({ onCtaClick, stats, onInfoLinkClick }) => {
    const statsData = [
        { label: 'Người dùng đã đăng ký', value: stats.users },
        { label: 'Lượt truy cập ứng dụng', value: stats.visits },
        { label: 'Ảnh đã được tạo', value: stats.images },
    ];

  return (
    <footer className="bg-[#0B0B0F] border-t border-pink-500/10 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center mb-16 border-b border-gray-800 pb-16">
            {statsData.map((stat, index) => (
                 <div key={index} 
                    className="bg-[#12121A]/50 rounded-2xl p-8 interactive-3d"
                    style={{ animation: 'neon-glow 4s infinite alternate', animationDelay: `${index * 250}ms` }}
                >
                    <h3 className="text-4xl font-bold bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text mb-2">
                        <AnimatedStat value={stat.value} />+
                    </h3>
                    <p className="text-gray-400">{stat.label}</p>
                </div>
            ))}
        </div>

        <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-[#FF3FA4] to-[#CA27FF] text-transparent bg-clip-text shimmer-text">Sẵn sàng tỏa sáng cùng Audition AI?</h2>
            <p className="text-lg text-gray-400 mb-8">Bắt đầu tạo những bức ảnh 3D độc đáo của bạn ngay hôm nay!</p>
            <button
                onClick={onCtaClick}
                className="px-8 py-4 font-bold text-lg text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-all duration-300 shadow-xl shadow-[#F72585]/30 hover:shadow-2xl hover:shadow-[#F72585]/40 hover:-translate-y-1.5 hover:scale-105"
                style={{ animation: 'subtle-pulse 3s infinite' }}
            >
                Bắt đầu sáng tạo
            </button>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center text-center md:text-left border-t border-gray-800 pt-8">
          <p className="font-semibold text-base mb-4 md:mb-0 footer-neon-text">
            &copy; {new Date().getFullYear()} AUDITION AI Studio.
          </p>
          <div className="flex gap-2 text-gray-400">
            <a onClick={() => onInfoLinkClick('terms')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm font-semibold">Điều khoản</a>
            <a onClick={() => onInfoLinkClick('policy')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm font-semibold">Chính sách</a>
            <a onClick={() => onInfoLinkClick('contact')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm font-semibold">Liên hệ</a>
          </div>
        </div>
         <div className="mt-8 text-center text-xs text-gray-500">
            <p className="font-semibold mb-2 flex items-center justify-center gap-2">
                <i className="ph-fill ph-warning-circle text-yellow-500"></i>
                Lưu ý pháp lý & an toàn:
            </p>
            <p>Nghiêm cấm nội dung vi phạm pháp luật, 18+, bạo lực, xúc phạm. Người dùng chịu trách nhiệm bản quyền với hình ảnh sử dụng.</p>
        </div>
         <div className="mt-12 flex flex-wrap justify-center items-center gap-4 border-t border-gray-800 pt-8">
            <a href="https://caulenhau.io.vn/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-scroll text-lg text-yellow-300"></i>
                Câu Lệnh AU
            </a>
            <a href="https://byvn.net/codycn-prompt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-robot text-lg text-cyan-300"></i>
                PROMPT GPT
            </a>
            <a href="https://m.me/cm/AbZT2-fW9wJlrX7M/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-users-three text-lg text-pink-300"></i>
                Cộng Đồng AU AI
            </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;