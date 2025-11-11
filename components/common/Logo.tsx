import React from 'react';

interface LogoProps {
  onClick?: () => void;
}

const Logo: React.FC<LogoProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer group flex flex-col items-start"
      aria-label="Audition AI Home"
    >
      <h1 className="text-2xl font-black tracking-wider font-poppins uppercase bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">
        Audition AI
      </h1>
      <p className="text-xs text-skin-muted -mt-1 tracking-wide">Sáng tạo không giới hạn</p>
    </div>
  );
};

export default Logo;