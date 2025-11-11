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
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256">
          <path d="M136.2,28.2a8,8,0,0,0-10.4,0L96,52,66.8,42.2a8,8,0,0,0-9.6,9.6L67,80.8,43.8,110a8,8,0,0,0,0,10.4L67,144.2,57.2,173.4a8,8,0,0,0,9.6,9.6L96,173.2l29.8,29.8a8,8,0,0,0,10.4,0L160,173.2l29.2,9.8a8,8,0,0,0,9.6-9.6L189,144.2,212.2,110a8,8,0,0,0,0-10.4L189,71.2l9.8-29.2a8,8,0,0,0-9.6-9.6L160,52ZM176,101.37l-42.63,42.63a8,8,0,0,1-11.32-11.32L164.68,80H120a8,8,0,0,1,0-16h56a8,8,0,0,1,5.66,13.66Z"></path>
        </svg>
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