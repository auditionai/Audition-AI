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

// --- NEW: Dancing Holograms Effect Component ---
const DancingHologramsEffect: React.FC = () => {
    const holograms = useMemo(() => {
        const hologramArray = [];
        const numHolograms = 5;
        const colors = ['#EC4899', '#00FFF9', '#8B5CF6'];
        // Base64 encoded simple stick figure SVG
        const stickFigureSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MCA5MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIyNSIgY3k9IjEwIiByPSI4Ii8+PGxpbmUgeDE9IjI1IiB5MT0iMjAiIHgyPSIyNSIgeTI9IjUwIi8+PGxpbmUgeDE9IjEwIiB5MT0iMzAiIHgyPSI0MCIgeTI9IjQwIi8+PGxpbmUgeDE9IjI1IiB5MT0iNTAiIHgyPSIxMCIgeTI9IjgwIi8+PGxpbmUgeDE9IjI1IiB5MT0iNTAiIHgyPSI0MCIgeTI9IjgwIi8+PC9zdmc+`;

        for (let i = 0; i < numHolograms; i++) {
            const color = colors[i % colors.length];
            const size = Math.random() * 80 + 100; // 100px to 180px height
            const duration = Math.random() * 4 + 4; // 4s to 8s total cycle
            
            const style: React.CSSProperties = {
                height: `${size}px`,
                width: `${size * 0.55}px`, // maintain aspect ratio
                color: color,
                left: `${Math.random() * 90}%`,
                top: `${Math.random() * 70}%`,
                backgroundImage: `url('${stickFigureSvg}')`,
                filter: `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 10px ${color})`,
                animation: `
                    hologram-fade-in 0.5s ease-out forwards,
                    hologram-dance ${duration * 0.2}s ease-in-out ${duration * 0.1}s infinite alternate,
                    hologram-glitch-out 0.4s steps(5, end) ${duration}s infinite
                `,
                animationDelay: `${Math.random() * 5}s`,
            };
            hologramArray.push(<div key={i} className="hologram-dancer" style={style} />);
        }
        return hologramArray;
    }, []);

    return (
        <>
            <style>{`
                .hologram-container {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: 0; overflow: hidden;
                }
                .hologram-dancer {
                    position: absolute;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    opacity: 0;
                    will-change: transform, opacity, clip-path;
                }
                /* Add scanlines effect */
                .hologram-dancer::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: linear-gradient(to bottom, rgba(255,255,255,0.05) 50%, transparent 50%);
                    background-size: 100% 4px;
                    animation: scanlines 0.2s linear infinite;
                }

                @keyframes scanlines {
                    from { background-position: 0 0; }
                    to { background-position: 0 4px; }
                }
                @keyframes hologram-fade-in {
                    to { opacity: 0.4; }
                }
                @keyframes hologram-dance {
                    from { transform: skewX(-5deg); }
                    to { transform: skewX(5deg); }
                }
                @keyframes hologram-glitch-out {
                    0% { transform: translate(0, 0); opacity: 0.4; }
                    10% { transform: translate(-3px, 3px); }
                    20% { transform: translate(3px, -3px); }
                    30% { transform: translate(-3px, -3px); clip-path: inset(80% 0 10% 0); }
                    40% { transform: translate(3px, 3px); }
                    50% { transform: skewX(8deg); }
                    60% { transform: skewX(-8deg); clip-path: inset(20% 0 70% 0); }
                    80% { opacity: 0.2; }
                    100% { opacity: 0; transform: translate(0, 0); clip-path: inset(50% 50% 50% 50%); }
                }
            `}</style>
            <div className="hologram-container" aria-hidden="true">{holograms}</div>
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
        case 'cyber-punk':
            return <DancingHologramsEffect />;
        // Other theme effects can be added here in the future
        default:
            return null;
    }
};

export default ThemeEffects;