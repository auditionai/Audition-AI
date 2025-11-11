
import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    if (theme === 'dreamy-galaxy') {
        return (
            <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
                <div className="galaxy-bg">
                    <div id="stars"></div>
                    <div id="stars2"></div>
                    <div id="stars3"></div>
                </div>
            </div>
        );
    }
    
    // Can add more effects for other themes here

    return null;
};

export default ThemeEffects;
