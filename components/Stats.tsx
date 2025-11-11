import React, { useState, useEffect } from 'react';
import { Stats as StatsType } from '../types';

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        if (value === 0) return;
        const duration = 2000;
        const frameRate = 1000 / 60;
        const totalFrames = Math.round(duration / frameRate);
        let frame = 0;

        const counter = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const easedProgress = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
            const currentVal = Math.round(value * easedProgress);
            
            setDisplayValue(currentVal);

            if (frame === totalFrames) {
                clearInterval(counter);
                setDisplayValue(value);
            }
        }, frameRate);

        return () => clearInterval(counter);
    }, [value]);
    
    return <span>{displayValue.toLocaleString('vi-VN')}+</span>;
};


interface StatsProps {
  stats: StatsType;
}

const StatItem: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <div className="bg-[#12121A]/80 p-8 rounded-2xl border border-pink-500/20 text-center interactive-3d">
        <div className="glowing-border"></div>
        <p className="text-5xl font-extrabold mb-2">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 text-transparent bg-clip-text">
                <AnimatedNumber value={value} />
            </span>
        </p>
        <p className="text-lg text-gray-400">{label}</p>
    </div>
);

const Stats: React.FC<StatsProps> = ({ stats }) => {
  return (
    <section id="stats" className="py-16 sm:py-24 bg-[#12121A]">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <StatItem value={stats.users} label="Người dùng đã đăng ký" />
          <StatItem value={stats.visits} label="Lượt truy cập ứng dụng" />
          <StatItem value={stats.images} label="Ảnh đã được tạo" />
        </div>
      </div>
    </section>
  );
};

export default Stats;
