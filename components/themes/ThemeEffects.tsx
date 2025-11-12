import React, { useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// --- Snowfall Effect Component ---
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

// --- Shooting Star Effect Component ---
const ShootingStarEffect: React.FC = () => {
    const stars = useMemo(() => {
        const starArray = [];
        const numStars = 10; // Reduced density
        for (let i = 0; i < numStars; i++) {
            const isRtl = Math.random() < 0.5; // Randomize direction
            const style: React.CSSProperties = {
                top: `${Math.random() * 100}%`,
                animationName: isRtl ? 'shooting-star-anim-rtl' : 'shooting-star-anim-ltr',
                animationDuration: `${Math.random() * 7 + 5}s`, // Slower: 5s to 12s
                animationDelay: `${Math.random() * 20}s`, // Less frequent: 0s to 20s delay
                ...(isRtl ? { right: '-200px' } : { left: '-200px' })
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
                    width: 2px;
                    height: 2px;
                    background-color: #fff;
                    border-radius: 50%;
                    /* Brighter, more sparkly glow */
                    box-shadow: 0 0 8px #fff, 0 0 14px #BB86FC, 0 0 20px #8A2BE2;
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
                    width: 200px; /* Longer tail */
                    height: 1px;
                    background: linear-gradient(to right, rgba(255, 255, 255, 0.8), transparent);
                }
                @keyframes shooting-star-anim-rtl {
                    from { transform: translateX(0) translateY(0) rotate(-45deg); opacity: 1; }
                    to { transform: translateX(-120vw) translateY(120vh) rotate(-45deg); opacity: 0; }
                }
                @keyframes shooting-star-anim-ltr {
                    from { transform: translateX(0) translateY(0) rotate(45deg); opacity: 1; }
                    to { transform: translateX(120vw) translateY(120vh) rotate(45deg); opacity: 0; }
                }
            `}</style>
            <div className="shooting-star-container" aria-hidden="true">{stars}</div>
        </>
    );
};

// --- Gummy Candy Rain Effect ---
const GummyCandyRainEffect: React.FC = () => {
    const candies = useMemo(() => {
        const candyArray = [];
        const numCandies = 25;
        const colors = ['#FFC1CC', '#FFD700', '#ADD8E6', '#98FB98', '#FFA07A'];
        
        const shapes = [
            `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"/></svg>')}`,
            `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/></svg>')}`
        ];

        for (let i = 0; i < numCandies; i++) {
            const size = Math.random() * 20 + 15; // 15px to 35px
            const color = colors[Math.floor(Math.random() * colors.length)];
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const style: React.CSSProperties = {
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                color: color,
                backgroundImage: `url("${shape}")`,
                animationDuration: `${Math.random() * 8 + 7}s`, // 7s to 15s
                animationDelay: `${Math.random() * 15}s`,
            };
            candyArray.push(<div key={i} className="gummy-candy" style={style} />);
        }
        return candyArray;
    }, []);

    return (
        <>
            <style>{`
                .gummy-candy-container {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: 0; overflow: hidden;
                }
                .gummy-candy {
                    position: absolute;
                    top: -10%;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    opacity: 0.8;
                    filter: blur(1px) drop-shadow(0 0 4px currentColor);
                    animation-name: gummy-fall-anim;
                    animation-timing-function: cubic-bezier(0.6, -0.28, 0.735, 0.045); /* easeInBack for fall */
                    animation-iteration-count: infinite;
                    will-change: transform, opacity;
                }
                @keyframes gummy-fall-anim {
                    0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
                    10% { opacity: 0.7; }
                    85% { animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); transform: translateY(101vh) rotate(360deg); opacity: 0.7; } /* easeOutCubic for bounce */
                    92% { transform: translateY(97vh) rotate(370deg); opacity: 0.7; } /* Bounce up */
                    100% { transform: translateY(101vh) rotate(380deg); opacity: 0; }
                }
            `}</style>
            <div className="gummy-candy-container" aria-hidden="true">{candies}</div>
        </>
    );
};


// --- Caustic Effect ---
const CausticEffect: React.FC = () => {
    return (
        <>
            <style>{`
                .caustic-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 0;
                    overflow: hidden;
                    background-color: transparent;
                }
                .caustic-layer {
                    position: absolute;
                    inset: -50%; /* Make it larger to avoid hard edges */
                    opacity: 0.5;
                    mix-blend-mode: overlay;
                    filter: blur(40px) contrast(1.2);
                    animation: caustic-move 25s infinite alternate ease-in-out;
                }
                .caustic-layer::before,
                .caustic-layer::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background-image: radial-gradient(circle at center, rgba(52, 152, 219, 0.2) 0%, rgba(72, 201, 176, 0.15) 30%, transparent 60%);
                    animation: caustic-spin 35s infinite linear;
                }
                .caustic-layer::after {
                    background-image: radial-gradient(ellipse 80% 120% at 20% 80%, rgba(155, 89, 182, 0.15) 0%, rgba(26, 188, 156, 0.1) 40%, transparent 70%);
                    animation: caustic-spin 45s infinite linear reverse;
                    animation-delay: -5s;
                }
                
                @keyframes caustic-move {
                    from { transform: translate(-10%, -10%) scale(1.2); }
                    to { transform: translate(10%, 10%) scale(1.5); }
                }
                @keyframes caustic-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                /* Specific theme adjustments for the light background of 'neon-vibe' */
                [data-theme='neon-vibe'] .caustic-layer {
                     mix-blend-mode: multiply; /* Darkens the light background, creating a more realistic light pool effect */
                     opacity: 0.7;
                     filter: blur(50px) contrast(1.1);
                }
            `}</style>
            <div className="caustic-container" aria-hidden="true">
                <div className="caustic-layer"></div>
            </div>
        </>
    );
};

// --- Cyberpunk Aurora Effect Component ---
const CyberpunkAuroraEffect: React.FC = () => {
    return (
        <>
            <style>{`
                .cyber-aurora-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 0;
                    overflow: hidden;
                }
                .cyber-aurora-container::before,
                .cyber-aurora-container::after {
                    content: '';
                    position: absolute;
                    width: 150vw;
                    height: 150vh;
                    border-radius: 50%;
                    opacity: 0.2;
                    mix-blend-mode: screen;
                    filter: blur(100px);
                    will-change: transform, opacity;
                }
                .cyber-aurora-container::before {
                    top: -50%;
                    left: -50%;
                    background: radial-gradient(circle at center, #ec4899, transparent 40%);
                    animation: aurora-move-1 25s infinite alternate ease-in-out;
                }
                .cyber-aurora-container::after {
                    bottom: -50%;
                    right: -50%;
                    background: radial-gradient(circle at center, #8b5cf6, transparent 40%);
                    animation: aurora-move-2 30s infinite alternate ease-in-out;
                }
                @keyframes aurora-move-1 {
                    from { transform: translate(0, 0) rotate(0deg); }
                    to { transform: translate(20vw, 20vh) rotate(30deg); }
                }
                @keyframes aurora-move-2 {
                    from { transform: translate(0, 0) rotate(0deg); }
                    to { transform: translate(-20vw, -20vh) rotate(-30deg); }
                }
            `}</style>
            <div className="cyber-aurora-container" aria-hidden="true"></div>
        </>
    );
};


// --- Main ThemeEffects Component ---
// This component dynamically renders effects based on the selected theme.
const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    switch (theme) {
        case 'cyber-punk':
            return <CyberpunkAuroraEffect />;
        case 'classic-dark':
            return <SnowfallEffect />;
        case 'dreamy-galaxy':
            return <ShootingStarEffect />;
        case 'solar-flare':
            return <GummyCandyRainEffect />;
        case 'neon-vibe':
            return <CausticEffect />;
        default:
            return null;
    }
};

export default ThemeEffects;