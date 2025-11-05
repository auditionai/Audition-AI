import React from 'react';
import { User } from '../types';

interface LandingHeaderProps {
  user: User | null;
  onLoginRegisterClick: () => void;
  onTopUpClick: () => void;
  onScrollTo: (id: string) => void;
}

const LandingHeader: React.FC<LandingHeaderProps> = ({ user, onLoginRegisterClick, onTopUpClick, onScrollTo }) => {
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 w-full z-40 transition-all duration-300 ${isScrolled ? 'bg-[#0B0B0F]/80 backdrop-blur-lg border-b border-pink-500/10' : 'bg-transparent'}`}>
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          <div className="cursor-pointer" onClick={() => onScrollTo('hero')}>
             <h1 className="text-3xl font-bold">
                <span className="bg-gradient-to-r from-[#FF3FA4] to-[#CA27FF] text-transparent bg-clip-text">Audition AI</span>
             </h1>
             <p className="text-xs neon-text-flow -mt-1" style={{ animationDuration: '5s' }}>Sáng tạo không giới hạn</p>
          </div>
          <nav className="hidden md:flex items-center gap-2">
            <a onClick={() => onScrollTo('features')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm">Tính năng</a>
            <a onClick={() => onScrollTo('how-it-works')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm">Cách hoạt động</a>
            <a onClick={() => onScrollTo('pricing')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm">Bảng giá</a>
            <a onClick={() => onScrollTo('faq')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm">FAQ</a>
          </nav>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <div 
                    onClick={onTopUpClick}
                    className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full cursor-pointer hover:bg-white/20 transition">
                  <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                  <span className="font-bold">{user.diamonds}</span>
                </div>
                 {/* Fix: Use snake_case properties `photo_url` and `display_name` to match the User type. */}
                 <img src={user.photo_url || undefined} alt={user.display_name || 'User'} className="w-10 h-10 rounded-full" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={onLoginRegisterClick} className="px-4 py-2 font-semibold bg-white/10 border border-transparent text-white rounded-full hover:bg-white/20 transition-colors duration-300 text-sm">
                    Đăng nhập
                </button>
                <button onClick={onLoginRegisterClick} className="px-4 py-2 font-bold text-sm text-white bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full transition-transform hover:scale-105 shadow-lg shadow-[#F72585]/20">
                    Đăng ký
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;