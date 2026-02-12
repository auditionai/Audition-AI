
import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface LogoProps {
  onClick?: () => void;
}

const Logo: React.FC<LogoProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer group flex items-center gap-3 logo-3d-container select-none"
      aria-label="Audition AI Home"
    >
      <div className="relative w-10 h-10 md:w-12 md:h-12 flex items-center justify-center">
         {/* Animated BG for Icon */}
         <div className="absolute inset-0 bg-red-600 rounded-xl rotate-45 opacity-20 animate-pulse"></div>
         <div className="absolute inset-0 border-2 border-red-500 rounded-xl rotate-45 transform transition-transform group-hover:rotate-90 duration-700"></div>
         
         <i className="ph-fill ph-music-notes-simple text-3xl md:text-4xl text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)] z-10 transform group-hover:scale-110 transition-transform"></i>
      </div>
      
      <div className="flex flex-col justify-center">
          <h1 className="logo-3d-text text-2xl md:text-3xl leading-none">
            AUDITION <span className="text-red-500">AI</span>
          </h1>
          <span className="text-[9px] md:text-[10px] text-gray-400 font-bold tracking-[0.3em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-500 ml-1">
              Studio
          </span>
      </div>
    </div>
  );
};

export default Logo;
