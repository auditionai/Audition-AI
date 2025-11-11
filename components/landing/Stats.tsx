import React, { useEffect, useState } from 'react';
import { DashboardStats } from '../../types';

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        if (value === 0) {
            setDisplayValue(0);
            return;
        };
        const duration = 2000;
        const frameRate = 1000 / 60;
        const totalFrames = Math.round(duration / frameRate);
        let frame = 0;
        
        const counter = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const easedProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart
            const currentVal = Math.round(value * easedProgress);
            setDisplayValue(currentVal);

            if (frame === totalFrames) {
                clearInterval(counter);
                setDisplayValue(value);
            }
        }, frameRate);

        return () => clearInterval(counter);
    }, [value]);
    
    return <span>{displayValue.toLocaleString('vi-VN')}</span>;
};


const StatsDisplay: React.FC<{ stats: DashboardStats | null }> = ({ stats }) => {
  return (
    <div className="py-12 sm:py-24 bg-gradient-to-t from-black/20 to-transparent">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div>
            <p className="text-5xl md:text-6xl font-bold text-pink-400">
              <AnimatedNumber value={stats?.totalUsers ?? 0} />+
            </p>
            <p className="text-lg text-gray-400 mt-2">Người Dùng</p>
          </div>
          <div>
            <p className="text-5xl md:text-6xl font-bold text-blue-400">
              <AnimatedNumber value={stats?.totalImages ?? 0} />+
            </p>
            <p className="text-lg text-gray-400 mt-2">Tác Phẩm Được Tạo</p>
          </div>
          <div>
            <p className="text-5xl md:text-6xl font-bold text-green-400">
              <AnimatedNumber value={stats?.totalVisits ?? 0} />+
            </p>
            <p className="text-lg text-gray-400 mt-2">Lượt Truy Cập</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsDisplay;