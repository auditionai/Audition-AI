import React from 'react';
import { useTheme, Theme } from '../../contexts/ThemeContext';

interface LogoProps {
  onClick?: () => void;
}

// Configuration object to define unique logo styles for each theme
const logoConfig: Record<Theme, { icon: string; fontClass: string; accentColorVar: string; }> = {
  'cyber-punk': { icon: 'ph-crown-simple', fontClass: 'font-orbitron', accentColorVar: '--color-accent' },
  'solar-flare': { icon: 'ph-sun', fontClass: 'font-poppins font-black', accentColorVar: '--color-accent' },
  'dreamy-galaxy': { icon: 'ph-planet', fontClass: 'font-playfair-display italic font-bold tracking-normal', accentColorVar: '--color-accent' },
  'classic-dark': { icon: 'ph-tree', fontClass: 'font-playfair-display font-bold', accentColorVar: '--color-accent-secondary' },
  'neon-vibe': { icon: 'ph-diamond', fontClass: 'font-barlow font-bold', accentColorVar: '--color-accent' }
};

const Logo: React.FC<LogoProps> = ({ onClick }) => {
  const { theme } = useTheme();
  // Fallback to cyber-punk if theme is somehow invalid
  const currentConfig = logoConfig[theme] || logoConfig['cyber-punk']; 
  const accentColor = `rgb(var(${currentConfig.accentColorVar}))`;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer group flex items-center gap-3"
      aria-label="Audition AI Home"
    >
      <div 
        className="transition-all duration-300"
        style={{ 
          color: accentColor,
          filter: `drop-shadow(0 0 8px ${accentColor})` 
        }}
      >
        <i className={`ph-fill ${currentConfig.icon} text-3xl`}></i>
      </div>
      <h1 
        className={`text-2xl tracking-wider text-white uppercase ${currentConfig.fontClass}`}
        style={{ filter: `drop-shadow(0 0 10px ${accentColor})` }}
      >
        AUDITION<span style={{ color: accentColor }}>AI</span>
      </h1>
    </div>
  );
};

export default Logo;
