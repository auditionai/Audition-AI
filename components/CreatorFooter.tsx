import React from 'react';

interface CreatorFooterProps {
  onInfoLinkClick: (key: 'terms' | 'policy' | 'contact') => void;
}

const CreatorFooter: React.FC<CreatorFooterProps> = ({ onInfoLinkClick }) => {
  return (
    <footer className="fixed bottom-16 md:bottom-0 left-0 w-full z-40 bg-[#0B0B0F]/90 backdrop-blur-sm border-t border-pink-500/10 text-white">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center text-center sm:text-left">
          <p className="text-gray-400 text-sm mb-4 sm:mb-0">
            &copy; {new Date().getFullYear()} AUDITION AI Studio.
          </p>
          <div className="flex gap-6 text-gray-400">
            <a onClick={() => onInfoLinkClick('terms')} className="hover:text-pink-400 transition-colors text-sm cursor-pointer">Điều khoản</a>
            <a onClick={() => onInfoLinkClick('policy')} className="hover:text-pink-400 transition-colors text-sm cursor-pointer">Chính sách</a>
            <a onClick={() => onInfoLinkClick('contact')} className="hover:text-pink-400 transition-colors text-sm cursor-pointer">Hỗ trợ</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default CreatorFooter;