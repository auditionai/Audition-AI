import React, { useMemo, useRef, useEffect } from 'react';
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

// --- NEW: Digital Rain & Glitch Effect ---
const DigitalRainEffect: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();

        const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
        const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const nums = '0123456789';
        const characters = katakana + latin + nums;

        const fontSize = 16;
        let columns = Math.floor(canvas.width / fontSize);
        const drops: number[] = [];

        for (let i = 0; i < columns; i++) {
            drops[i] = 1;
        }

        const draw = () => {
            ctx.fillStyle = 'rgba(17, 12, 19, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const colors = ['#ec4899', '#8B5CF6', '#00FFF9', '#F0F0F0'];
            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < drops.length; i++) {
                ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
                const text = characters.charAt(Math.floor(Math.random() * characters.length));
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        };

        let lastTime = 0;
        const fps = 24;
        const interval = 1000 / fps;

        const render = (timestamp: number) => {
            if (timestamp - lastTime >= interval) {
                draw();
                lastTime = timestamp;
            }
            animationFrameId = window.requestAnimationFrame(render);
        };
        render(0);

        const handleResize = () => {
            resizeCanvas();
            columns = Math.floor(canvas.width / fontSize);
            drops.length = 0;
            for (let i = 0; i < columns; i++) {
                drops[i] = 1;
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <>
            <style>{`
                .digital-rain-container {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none; z-index: -1;
                    animation: glitch-anim 8s infinite steps(1);
                    background: #110C13;
                }
                .digital-rain-canvas { display: block; }
                
                @keyframes glitch-anim {
                    0%, 100% { clip-path: inset(0 0 0 0); transform: translateX(0); }
                    5% { clip-path: inset(10% 0 85% 0); }
                    6% { clip-path: inset(0 0 0 0); }
                    8% { clip-path: inset(90% 0 2% 0); }
                    9% { clip-path: inset(0 0 0 0); }
                    10% { transform: translateX(10px); }
                    10.5% { transform: translateX(-10px); }
                    11% { transform: translateX(0); }
                    40% { clip-path: inset(40% 0 42% 0); }
                    40.5% { clip-path: inset(0 0 0 0); }
                }
                .digital-rain-container::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: repeating-linear-gradient(0deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px);
                    pointer-events: none;
                    opacity: 0.5;
                }
            `}</style>
            <div className="digital-rain-container" aria-hidden="true">
                <canvas ref={canvasRef} className="digital-rain-canvas" />
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
            return <DigitalRainEffect />;
        // Other theme effects can be added here in the future
        default:
            return null;
    }
};

export default ThemeEffects;