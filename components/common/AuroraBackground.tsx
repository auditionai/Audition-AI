import React from 'react';

const AuroraBackground: React.FC = () => {
    return (
        <div className="fixed inset-0 w-full h-full -z-10 overflow-hidden bg-skin-fill">
            <div className="aurora-container">
                {/* FIX: Cast inline style objects to React.CSSProperties to allow the use of CSS custom properties ('--aurora-color') and resolve TypeScript errors. */}
                <div className="aurora-item" style={{ '--aurora-color': 'rgba(247, 37, 133, 0.3)', top: '-20%', left: '-20%', width: '60vw', height: '60vw', animationDuration: '20s' } as React.CSSProperties}></div>
                <div className="aurora-item" style={{ '--aurora-color': 'rgba(114, 9, 183, 0.3)', top: '10%', left: '40%', width: '50vw', height: '50vw', animationDuration: '25s' } as React.CSSProperties}></div>
                <div className="aurora-item" style={{ '--aurora-color': 'rgba(88, 101, 242, 0.25)', top: '50%', left: '0%', width: '70vw', height: '70vw', animationDuration: '30s' } as React.CSSProperties}></div>
                <div className="aurora-item" style={{ '--aurora-color': 'rgba(202, 39, 255, 0.2)', top: '40%', left: '60%', width: '60vw', height: '60vw', animationDuration: '35s' } as React.CSSProperties}></div>
            </div>
        </div>
    );
};

export default AuroraBackground;