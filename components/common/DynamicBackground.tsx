import React, { useState, useEffect } from 'react';

interface DynamicBackgroundProps {
    activeSection: string;
}

const sectionPositions: { [key: string]: React.CSSProperties[] } = {
    hero: [
        { top: '-20%', left: '10%', transform: 'translate(-50%, -50%)', width: '800px', height: '800px' },
        { top: '80%', left: '90%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px' },
        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px' },
    ],
    features: [
        { top: '30%', left: '0%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px' },
        { top: '70%', left: '100%', transform: 'translate(-50%, -50%)', width: '800px', height: '800px' },
        { top: '5%', left: '40%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px' },
    ],
    'how-it-works': [
        { top: '10%', left: '80%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px' },
        { top: '90%', left: '20%', transform: 'translate(-50%, -50%)', width: '900px', height: '900px' },
        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px' },
    ],
    gallery: [
        { top: '50%', left: '0%', transform: 'translate(-50%, -50%)', width: '800px', height: '800px' },
        { top: '50%', left: '100%', transform: 'translate(-50%, -50%)', width: '800px', height: '800px' },
        { top: '90%', left: '50%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px' },
    ],
    pricing: [
        { top: '80%', left: '10%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px' },
        { top: '20%', left: '90%', transform: 'translate(-50%, -50%)', width: '900px', height: '900px' },
        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px' },
    ],
    faq: [
        { top: '10%', left: '20%', transform: 'translate(-50%, -50%)', width: '800px', height: '800px' },
        { top: '90%', left: '80%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px' },
        { top: '40%', left: '60%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px' },
    ],
};

const DynamicBackground: React.FC<DynamicBackgroundProps> = ({ activeSection }) => {
    const [blobStyles, setBlobStyles] = useState(sectionPositions.hero);

    useEffect(() => {
        setBlobStyles(sectionPositions[activeSection] || sectionPositions.hero);
    }, [activeSection]);

    const blobs = [
        "radial-gradient(circle at center, rgba(247, 37, 133, 0.15) 0%, rgba(247, 37, 133, 0) 50%)",
        "radial-gradient(circle at center, rgba(202, 39, 255, 0.12) 0%, rgba(202, 39, 255, 0) 50%)",
        "radial-gradient(circle at center, rgba(114, 9, 183, 0.15) 0%, rgba(114, 9, 183, 0) 60%)",
    ];

    return (
        <div className="fixed inset-0 w-full h-full -z-10 overflow-hidden">
            {blobs.map((bg, index) => (
                <div
                    key={index}
                    className="absolute transition-all duration-1000 ease-in-out"
                    style={{
                        ...blobStyles[index],
                        backgroundImage: bg,
                        filter: 'blur(100px)',
                    }}
                />
            ))}
        </div>
    );
};

export default DynamicBackground;
