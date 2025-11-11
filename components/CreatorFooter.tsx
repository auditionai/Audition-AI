import React, { useState, useEffect } from 'react';
import ThemeSwitcher from './common/ThemeSwitcher';
import { useTheme, THEMES } from '../contexts/ThemeContext';

interface CreatorFooterProps {
  onInfoLinkClick: (key: 'terms' | 'policy' | 'contact') => void;
}

const CreatorFooter: React.FC<CreatorFooterProps> = ({ onInfoLinkClick }) => {
  const { theme } = useTheme();
  const [highlight, setHighlight] = useState(false);
  const currentThemeName = THEMES.find(t => t.id === theme)?.name || 'Mặc định';

  useEffect(() => {
      setHighlight(true);
      const timer = setTimeout(() => setHighlight(false), 1500); // Duration of the animation
      return () => clearTimeout(timer);
  }, [theme]);

  return (
    <footer className="bg-skin-fill-secondary border-t border-skin-border text-skin-base hidden md:block">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col items-center">
            <div className="mb-4 flex items-center gap-3">
                <span className="text-sm font-semibold text-skin-muted">Giao diện:</span>
                <span className={`text-sm font-bold text-skin-accent ${highlight ? 'theme-display-highlight' : ''}`}>
                    {currentThemeName}
                </span>
            </div>
            <ThemeSwitcher />
            <div className="flex gap-2 items-center text-skin-muted mt-6">
                <a onClick={() => onInfoLinkClick('terms')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm font-semibold">Điều khoản</a>
                <a onClick={() => onInfoLinkClick('policy')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm font-semibold">Chính sách</a>
                <a onClick={() => onInfoLinkClick('contact')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-skin-accent/10 text-skin-muted hover:text-skin-base border border-transparent hover:border-skin-border-accent transition-all duration-300 cursor-pointer text-sm font-semibold">Hỗ trợ</a>
            </div>
             <p className="font-semibold text-base my-6 footer-neon-text">
                &copy; {new Date().getFullYear()} AUDITION AI Studio.
            </p>
        </div>
        <div className="mt-8 flex flex-wrap justify-center items-center gap-4 border-t border-gray-800 pt-6">
            <a href="https://caulenhau.io.vn/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-skin-base rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-scroll text-lg text-yellow-300"></i>
                Câu Lệnh AU
            </a>
            <a href="https://byvn.net/codycn-prompt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-skin-base rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-robot text-lg text-cyan-300"></i>
                PROMPT GPT
            </a>
            <a href="https://m.me/cm/AbZT2-fW9wJlrX7M/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 font-bold text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-skin-base rounded-full transition-all duration-300 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10 hover:-translate-y-1">
                <i className="ph-fill ph-users-three text-lg text-pink-300"></i>
                Cộng Đồng AU AI
            </a>
        </div>
      </div>
    </footer>
  );
};

export default CreatorFooter;
