import React, { useState, useEffect } from 'react';

interface StatCardProps {
    title: string;
    value: number;
    icon: React.ReactNode;
    color: 'cyan' | 'green' | 'pink' | 'purple';
    isSubtle?: boolean;
}

const colorConfig = {
    cyan: {
        glow: 'shadow-cyan-500/20',
        text: 'text-cyan-400',
        iconBg: 'bg-cyan-500/10',
    },
    green: {
        glow: 'shadow-green-500/20',
        text: 'text-green-400',
        iconBg: 'bg-green-500/10',
    },
    pink: {
        glow: 'shadow-pink-500/20',
        text: 'text-pink-400',
        iconBg: 'bg-pink-500/10',
    },
    purple: {
        glow: 'shadow-purple-500/20',
        text: 'text-purple-400',
        iconBg: 'bg-purple-500/10',
    }
};

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        const oldValue = displayValue;
        if (oldValue === value) return;

        const diff = value - oldValue;
        const duration = 500;
        const frameRate = 1000 / 60;
        const totalFrames = Math.round(duration / frameRate);
        let frame = 0;
        
        const counter = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const easeOutProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            
            const currentVal = Math.round(oldValue + diff * easeOutProgress);
            setDisplayValue(currentVal);

            if (frame === totalFrames) {
                clearInterval(counter);
            }
        }, frameRate);

        return () => clearInterval(counter);
    }, [value, displayValue]);
    
    return <span>{displayValue.toLocaleString('vi-VN')}</span>;
};


const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, isSubtle = false }) => {
    const styles = colorConfig[color];

    return (
        <div className={`relative bg-[#12121A]/80 p-6 rounded-2xl border border-white/10 interactive-3d shadow-lg ${isSubtle ? 'opacity-70' : styles.glow}`}>
            <div className="glowing-border"></div>
            <div className="flex items-start justify-between">
                <h3 className="text-gray-400 font-semibold">{title}</h3>
                <div className={`text-2xl ${styles.text} ${styles.iconBg} p-2 rounded-lg`}>
                    {icon}
                </div>
            </div>
            <p className={`text-5xl font-bold mt-4 ${styles.text} ${!isSubtle ? 'neon-text-flow' : ''}`} style={{ animationDuration: '6s' }}>
                <AnimatedNumber value={value} />
            </p>
        </div>
    );
};

export default StatCard;