import React from 'react';

interface LogoProps {
  onClick?: () => void;
}

const Logo: React.FC<LogoProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer group flex items-center gap-3"
      aria-label="Audition AI Home"
    >
      <div 
        className="text-pink-400 group-hover:text-white transition-all duration-300"
        style={{ filter: 'drop-shadow(0 0 8px rgb(var(--color-accent) / 0.7))' }}
      >
        <i className="ph-fill ph-crown-simple text-3xl"></i>
      </div>
      <h1 
        className="text-2xl font-bold tracking-wider text-white font-orbitron uppercase"
        style={{ filter: 'drop-shadow(0 0 10px rgb(var(--color-accent) / 0.5))' }}
      >
        AUDITION<span className="text-pink-400">AI</span>
      </h1>
    </div>
  );
};

export default Logo;