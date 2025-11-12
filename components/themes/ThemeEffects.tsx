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

// --- NEW: Dynamic Cyberpunk Skyline Effect Component ---
const DynamicCyberpunkSkylineEffect: React.FC = () => {
    const cars = useMemo(() => {
        const carArray = [];
        const numCars = 15;
        const colors = ['#EC4899', '#00FFF9', '#8B5CF6'];
        for (let i = 0; i < numCars; i++) {
            const style: React.CSSProperties = {
                bottom: `${10 + Math.random() * 40}%`,
                animationDuration: `${Math.random() * 5 + 3}s`,
                animationDelay: `${Math.random() * 8}s`,
                backgroundColor: colors[i % colors.length],
                boxShadow: `0 0 8px ${colors[i % colors.length]}, 0 0 12px ${colors[i % colors.length]}`,
            };
            carArray.push(<div key={i} className="flying-car" style={style} />);
        }
        return carArray;
    }, []);

    return (
        <>
            <style>{`
                .skyline-container {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: -1; overflow: hidden;
                    background: linear-gradient(to bottom, #0c0a1a, #1d1a26);
                }
                .skyline-layer {
                    position: absolute; bottom: 0; left: 0; width: 200%; height: 100%;
                    background-repeat: repeat-x;
                    background-position: bottom left;
                    will-change: background-position;
                }
                .skyline-layer-far {
                    background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAwIiBoZWlnaHQ9IjUwMCIgdmlld0JveD0iMCAwIDEwMDAgNTAwIj48ZGVmcz48c3R5bGU+LmF7ZmlsbDojMTExODI3O308L3N0eWxlPjwvZGVmcz48cGF0aCBjbGFzcz0iYSIgZD0iTTAsNTAwVjM1MGw1MC0yMCw1MCwyMFY1MDBaIi8+PHBhdGggY2xhc3M9ImEiIGQ9Ik0xMDAsNTAwVjQwMGw4MC01MCw4MCw1MFY1MDBaIi8+PHBhdGggY2xhc3M9ImEiIGQ9Ik0yNjAsNTAwVjMwMGwxMDAtODAsMTAwLDgwVjUwMFoiLz48cGF0aCBjbGFzcz0iYSIgZD0iTTQ2MCw1MDBWNDIwbDQwLTEwLDQwLDEwVjUwMFoiLz48cGF0aCBjbGFzcz0iYSIgZD0iTTU0MCw1MDBWMjUwbDE1MC0xMDAsMTUwLDEwMFY1MDBaIi8+PHBhdGggY2xhc3M9ImEiIGQ9Ik04NDAsNTAwVjM4MGw4MC0zMCw4MCwzMFY1MDBaIi8+PC9zdmc+');
                    background-size: 1000px 500px;
                    animation: skyline-scroll 120s linear infinite;
                    opacity: 0.5;
                }
                .skyline-layer-mid {
                    background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDEyMDAgNjAwIj48ZGVmcz48c3R5bGU+LmJ7ZmlsbDojMWYyOTM3O30uY3tmaWxsOiNlYzQ4OTk7fTwvc3R5bGU+PC9kZWZzPjxwYXRoIGNsYXNzPSJiIiBkPSJNM esoteric code...');
                    background-size: 1200px 600px;
                    animation: skyline-scroll 80s linear infinite;
                    opacity: 0.7;
                }
                .skyline-layer-near {
                    background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgODAwIDIwMCI+PHBhdGggZmlsbD0iIzBjMGExYSIgZD0iTTAsMjAwVjE1MHkyMDBWMTQwSDQwMFYxNTBINjAwVjEzMEg4MDBWMjAwWiIvPjwvc3ZnPg==');
                    background-size: 800px 200px;
                    animation: skyline-scroll 50s linear infinite;
                }
                @keyframes skyline-scroll {
                    from { background-position-x: 0; }
                    to { background-position-x: -2400px; }
                }
                .flying-car {
                    position: absolute;
                    width: 15px; height: 3px; border-radius: 2px;
                    animation-name: fly-across;
                    animation-timing-function: linear;
                    animation-iteration-count: infinite;
                    will-change: transform;
                }
                .flying-car::before {
                    content: ''; position: absolute; right: 100%; top: 50%;
                    transform: translateY(-50%); width: 50px; height: 1px;
                    background: linear-gradient(to left, currentColor, transparent);
                }
                 .flying-car::after {
                    content: ''; position: absolute; left: 100%; top: 50%;
                    transform: translateY(-50%); width: 2px; height: 1px;
                    background: #fff; box-shadow: 0 0 5px #fff;
                }
                @keyframes fly-across {
                    from { transform: translateX(calc(-100vw - 50px)); }
                    to { transform: translateX(100vw); }
                }
            `}</style>
            <div className="skyline-container" aria-hidden="true">
                <div className="skyline-layer skyline-layer-far"></div>
                <div className="skyline-layer skyline-layer-mid"></div>
                <div className="skyline-layer skyline-layer-near"></div>
                {cars}
            </div>
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
            return <DynamicCyberpunkSkylineEffect />;
        // Other theme effects can be added here in the future
        default:
            return null;
    }
};

export default ThemeEffects;