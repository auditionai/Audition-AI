import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface LogoProps {
    onClick: () => void;
}

const Logo: React.FC<LogoProps> = ({ onClick }) => {
    const { theme } = useTheme();

    return (
        <div className="cursor-pointer logo-container" data-theme={theme} onClick={onClick}>
             <h1 className="logo-text">
                Audition AI
             </h1>
             <p className="logo-subtext">Sáng tạo không giới hạn</p>
        </div>
    );
};

export default Logo;
