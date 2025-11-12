import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const CyberPunkGrid = () => (
    <div className="themed-bg-effect fixed inset-0 z-0 opacity-20">
        <div className="cyber-grid"></div>
    </div>
);

const SolarFlareBubbles = () => (
     <div className="themed-bg-effect fixed inset-0 z-0">
        <div className="bubbles">
            {Array.from({ length: 20 }).map((_, i) => <div key={i} className="bubble"></div>)}
        </div>
    </div>
);

const DreamyGalaxyStars = () => (
    <div className="themed-bg-effect fixed inset-0 z-0">
        <div className="galaxy-bg">
            <div id="stars"></div>
            <div id="stars2"></div>
            <div id="stars3"></div>
        </div>
        <div className="meteors">
            {Array.from({ length: 7 }).map((_, i) => <div key={i} className="meteor"></div>)}
        </div>
    </div>
);

const ClassicDarkSnow = () => (
    <div className="themed-bg-effect fixed inset-0 z-0 pointer-events-none">
        <div className="snowfall"></div>
        <div className="snowfall layer2"></div>
        <div className="snowfall layer3"></div>
    </div>
);

const NeonVibeLines = () => (
    <div className="themed-bg-effect fixed inset-0 z-0 opacity-40">
        <div className="lines">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="line"></div>)}
        </div>
    </div>
);


const ThemeEffects: React.FC = () => {
    const { theme } = useTheme();

    switch (theme) {
        case 'cyber-punk':
            return <CyberPunkGrid />;
        case 'solar-flare':
            return <SolarFlareBubbles />;
        case 'dreamy-galaxy':
            return <DreamyGalaxyStars />;
        case 'classic-dark':
            return <ClassicDarkSnow />;
        case 'neon-vibe':
            return <NeonVibeLines />;
        default:
            return null;
    }
};

export default ThemeEffects;
