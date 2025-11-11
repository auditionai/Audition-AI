import React from 'react';

interface LogoProps {
  onClick?: () => void;
}

const Logo: React.FC<LogoProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer group flex items-center gap-2"
      aria-label="Audition AI Home"
    >
      <div className="relative w-10 h-10 flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-fuchsia-600 rounded-full blur-sm opacity-60 group-hover:opacity-80 transition-opacity"></div>
        <i className="ph-fill ph-shooting-star text-2xl text-white relative z-10"></i>
      </div>
      <h1 className="text-xl font-bold text-white tracking-wide group-hover:text-pink-300 transition-colors">
        <span className="font-light">AUDITION</span>
        <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">AI</span>
      </h1>
    </div>
  );
};

export default Logo;
