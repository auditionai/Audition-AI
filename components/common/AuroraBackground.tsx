import React from 'react';

const AuroraBackground: React.FC = () => {
    return (
        <>
            <style>{`
                .aurora-background {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: -1;
                    background-color: #0B0B0F;
                    overflow: hidden;
                }
                .aurora-background::before,
                .aurora-background::after {
                    content: '';
                    position: absolute;
                    width: 150vw;
                    height: 150vh;
                    border-radius: 50%;
                    opacity: 0.15;
                    mix-blend-mode: screen;
                    filter: blur(100px);
                    will-change: transform, opacity;
                }
                .aurora-background::before {
                    top: -50%;
                    left: -50%;
                    background: radial-gradient(circle at center, #ec4899, transparent 40%);
                    animation: aurora-move-1 25s infinite alternate ease-in-out;
                }
                .aurora-background::after {
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
            <div className="aurora-background" aria-hidden="true"></div>
        </>
    );
};

export default AuroraBackground;