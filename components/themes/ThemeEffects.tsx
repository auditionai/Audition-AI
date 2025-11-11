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

    if (theme === 'classic-dark') {
        // Generate 200 snowflakes for a dense effect
        const snowflakes = Array.from({ length: 200 }).map((_, i) => (
            <div className="snow" key={i}></div>
        ));

        return (
            <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
                <div className="snowfall-bg">
                    {snowflakes}
                </div>
            </div>
        );
    }
    
    // For themes without special effects, render nothing. The background color
    // is now handled by the 'body' tag via CSS variables.
    return null;
};

export default ThemeEffects;