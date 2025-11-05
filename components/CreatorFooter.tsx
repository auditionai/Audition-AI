import React from 'react';

interface CreatorFooterProps {
  onInfoLinkClick: (key: 'terms' | 'policy' | 'contact') => void;
}

const CreatorFooter: React.FC<CreatorFooterProps> = ({ onInfoLinkClick }) => {
  return (
    <footer className="bg-[#0B0B0F] border-t border-pink-500/10 text-white">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center text-center sm:text-left">
          <p className="font-semibold text-base mb-4 sm:mb-0 footer-neon-text">
            &copy; {new Date().getFullYear()} AUDITION AI Studio.
          </p>
          <div className="flex gap-2 text-gray-400">
            <a onClick={() => onInfoLinkClick('terms')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm font-semibold">Điều khoản</a>
            <a onClick={() => onInfoLinkClick('policy')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm font-semibold">Chính sách</a>
            <a onClick={() => onInfoLinkClick('contact')} className="px-4 py-2 rounded-full bg-white/5 hover:bg-pink-500/10 text-gray-300 hover:text-white border border-transparent hover:border-pink-500/20 transition-all duration-300 cursor-pointer text-sm font-semibold">Hỗ trợ</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default CreatorFooter;