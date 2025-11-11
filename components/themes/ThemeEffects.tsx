import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    // This component is now responsible for rendering the correct background
    // and any associated visual effects for the current theme.
    // The page container that uses this should have a transparent background.

    if (theme === 'dreamy-galaxy') {
        return (
            <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-skin-fill">
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
            <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-skin-fill">
                <div className="snowfall-bg">
                    {snowflakes}
                </div>
            </div>
        );
    }
    
    // Default case for themes without special particle/animation effects.
    // This ensures they still get their intended background color from the CSS variables.
    return (
        <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-skin-fill" />
    );
};

export default ThemeEffects;
