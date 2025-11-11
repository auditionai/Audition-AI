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

const FloatingHearts: React.FC = () => {
    const hearts = Array.from({ length: 20 }).map((_, i) => {
        const style = {
            left: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 8 + 6}s`,
            animationDelay: `${Math.random() * 8}s`,
            fontSize: `${Math.random() * 16 + 10}px`,
        };
        return <div key={i} className="floating-heart" style={style}>♥</div>;
    });
    return <div className="hearts-container">{hearts}</div>;
}


const ShootingStars: React.FC = () => {
    return (
        <div className="shooting-stars-container">
            {Array.from({ length: 15 }).map((_, i) => (
                 <div key={i} className="shooting-star" style={{
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 10}s`,
                 }}></div>
            ))}
        </div>
    );
};

const BokehBackground: React.FC = () => {
    return (
        <div className="bokeh-background">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
        </div>
    )
}

const Sparkles: React.FC = () => {
    const sparkles = Array.from({ length: 50 }).map((_, i) => {
        const style = {
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 2 + 1}s`,
            animationDelay: `${Math.random() * 3}s`,
        };
        return <div key={i} className="sparkle" style={style}></div>;
    });
    return <div className="sparkles-container">{sparkles}</div>;
};


const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    return (
        <div className="fixed inset-0 pointer-events-none z-0">
            {theme === 'magical-christmas' && <> <Snowfall /> <BokehBackground /> </>}
            {theme === 'crystal-palace' && <><Bubbles /><Sparkles /></>}
            {theme === 'sweet-pastel' && <FloatingHearts />} 
            {theme === 'dreamy-galaxy' && <ShootingStars />}
        </div>
    );
};

export default ThemeEffects;