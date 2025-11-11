import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// Simple particle effect components, rendered conditionally
const Snowfall: React.FC = () => {
    const flakes = Array.from({ length: 100 }).map((_, i) => {
        const style = {
            left: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 5 + 3}s`,
            animationDelay: `${Math.random() * 5}s`,
            opacity: Math.random(),
        };
        return <div key={i} className="snowflake" style={style}></div>;
    });
    return <div className="snowfall-container">{flakes}</div>;
};

const Bubbles: React.FC = () => {
    const bubbles = Array.from({ length: 25 }).map((_, i) => {
        const style = {
            left: `${Math.random() * 100}%`,
            width: `${Math.random() * 20 + 5}px`,
            height: `${Math.random() * 20 + 5}px`,
            animationDuration: `${Math.random() * 8 + 5}s`,
            animationDelay: `${Math.random() * 7}s`,
        };
        return <div key={i} className="bubble" style={style}></div>;
    });
    return <div className="bubbles-container">{bubbles}</div>;
};

const ShootingStars: React.FC = () => {
    return (
        <div className="shooting-stars-container">
            {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="shooting-star"></div>
            ))}
        </div>
    );
};


const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    return (
        <>
            {theme === 'magical-christmas' && <Snowfall />}
            {theme === 'crystal-palace' && <Bubbles />}
            {theme === 'sweet-pastel' && <Bubbles />} 
            {theme === 'dreamy-galaxy' && <ShootingStars />}
        </>
    );
};

export default ThemeEffects;
