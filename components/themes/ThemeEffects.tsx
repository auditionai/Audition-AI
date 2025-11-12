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

// --- NEW: Endless Data Tunnel Effect ---
const EndlessDataTunnelEffect: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: any[] = [];
        const numParticles = 500;
        const fov = 250;
        const speed = 2;

        const resizeCanvas = () => {
            if(!canvas) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        class Particle {
            x: number;
            y: number;
            z: number;
            px: number;
            py: number;

            constructor() {
                this.x = (Math.random() - 0.5) * (canvas?.width || window.innerWidth);
                this.y = (Math.random() - 0.5) * (canvas?.height || window.innerHeight);
                this.z = Math.random() * 1000 + 500;
                this.px = this.x;
                this.py = this.y;
            }
        }

        const createParticles = () => {
            particles = [];
            for (let i = 0; i < numParticles; i++) {
                particles.push(new Particle());
            }
        };

        const render = () => {
            if(!ctx || !canvas) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            particles.forEach(p => {
                p.z -= speed;

                if (p.z <= 0) {
                    p.x = (Math.random() - 0.5) * canvas.width;
                    p.y = (Math.random() - 0.5) * canvas.height;
                    p.z = 1000;
                    p.px = p.x;
                    p.py = p.y;
                }

                const scale = fov / (fov + p.z);
                const x2d = p.x * scale + centerX;
                const y2d = p.y * scale + centerY;
                
                const prevScale = fov / (fov + p.z + speed);
                const prevX2d = p.px * prevScale + centerX;
                const prevY2d = p.py * prevScale + centerY;

                const alpha = (1 - p.z / 1000) * 0.8;

                ctx.beginPath();
                ctx.moveTo(prevX2d, prevY2d);
                ctx.lineTo(x2d, y2d);
                ctx.lineWidth = scale * 2;
                ctx.strokeStyle = `rgba(0, 255, 249, ${alpha})`; // Cyan color
                ctx.stroke();

                p.px = p.x;
                p.py = p.y;
            });

            animationFrameId = requestAnimationFrame(render);
        };

        const init = () => {
            resizeCanvas();
            createParticles();
            render();
        };

        window.addEventListener('resize', resizeCanvas);
        init();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };

    }, []);

    return (
        <>
            <style>{`
                .data-tunnel-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: -1;
                    pointer-events: none;
                    background: #110C13;
                }
                .data-tunnel-canvas {
                    display: block;
                    filter: drop-shadow(0 0 5px #00FFF9);
                }
            `}</style>
            <div className="data-tunnel-container">
                <canvas ref={canvasRef} className="data-tunnel-canvas" />
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
            return <EndlessDataTunnelEffect />;
        // Other theme effects can be added here in the future
        default:
            return null;
    }
};

export default ThemeEffects;