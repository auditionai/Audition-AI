import React, { useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// --- Snowfall Effect Component ---
// This component and its styles are self-contained here to avoid creating new files.
const SnowfallEffect: React.FC = () => {
    const snowflakes = useMemo(() => {
        const snowflakeArray = [];
        const numSnowflakes = 150; // Density of snowflakes
        for (let i = 0; i < numSnowflakes; i++) {
            const size = Math.random() * 4 + 1; // 1px to 5px
            const style: React.CSSProperties = {
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                animationDuration: `${Math.random() * 10 + 5}s`, // 5s to 15s
                animationDelay: `${Math.random() * 10}s`,
            };
            snowflakeArray.push(<div key={i} className="snowflake" style={style} />);
        }
        return snowflakeArray;
    }, []);

    return (
        <>
            <style>{`
                .snowfall-container {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: 0;
                }
                .snowflake {
                    position: absolute; top: -10px;
                    background-color: rgba(255, 255, 255, 0.8);
                    border-radius: 50%;
                    animation-name: snowfall-anim; animation-timing-function: linear;
                    animation-iteration-count: infinite;
                    box-shadow: 0 0 8px rgba(255, 255, 255, 0.9);
                    will-change: transform;
                }
                @keyframes snowfall-anim {
                    from { transform: translateY(0vh) translateX(0); opacity: 1; }
                    to { transform: translateY(105vh) translateX(20px); opacity: 0; }
                }
            `}</style>
            <div className="snowfall-container" aria-hidden="true">{snowflakes}</div>
        </>
    );
};

// --- NEW: Shooting Star Effect Component ---
const ShootingStarEffect: React.FC = () => {
    const stars = useMemo(() => {
        const starArray = [];
        const numStars = 20; // Density of shooting stars
        for (let i = 0; i < numStars; i++) {
            const style: React.CSSProperties = {
                top: `${Math.random() * 100}%`,
                animationDuration: `${Math.random() * 5 + 3}s`, // 3s to 8s
                animationDelay: `${Math.random() * 10}s`,
            };
            starArray.push(<div key={i} className="shooting-star" style={style} />);
        }
        return starArray;
    }, []);

    return (
        <>
            <style>{`
                .shooting-star-container {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: 0; overflow: hidden;
                }
                .shooting-star {
                    position: absolute;
                    right: -200px; /* Start off-screen */
                    width: 2px;
                    height: 2px;
                    background-color: #fff;
                    border-radius: 50%;
                    box-shadow: 0 0 6px #fff, 0 0 10px #BB86FC;
                    animation-name: shooting-star-anim;
                    animation-timing-function: linear;
                    animation-iteration-count: infinite;
                    will-change: transform;
                }
                .shooting-star::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    right: 1px;
                    width: 150px;
                    height: 1px;
                    background: linear-gradient(to right, rgba(255, 255, 255, 0.8), transparent);
                }
                @keyframes shooting-star-anim {
                    from {
                        transform: translateX(0) translateY(0) rotate(-45deg);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(-120vw) translateY(120vh) rotate(-45deg);
                        opacity: 0;
                    }
                }
            `}</style>
            <div className="shooting-star-container" aria-hidden="true">{stars}</div>
        </>
    );
};


// --- Main ThemeEffects Component ---
// This component dynamically renders effects based on the selected theme.
const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    switch (theme) {
        case 'classic-dark':
            return <SnowfallEffect />;
        case 'dreamy-galaxy':
            return <ShootingStarEffect />;
        // Other theme effects can be added here in the future
        default:
            return null;
    }
};

export default ThemeEffects;
