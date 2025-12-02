import React, { useEffect, useState } from 'react';

const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const duration = 1000;
        const frameRate = 1000 / 60;
        const totalFrames = Math.round(duration / frameRate);
        let frame = 0;
        
        const counter = setInterval(() => {
            frame++;
            const progress = frame / totalFrames;
            const easedProgress = 1 - Math.pow(1 - progress, 3); // ease-out cubic
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

interface RewardNotificationProps {
  reward: { diamonds: number; xp: number };
  onDismiss: () => void;
}

const RewardNotification: React.FC<RewardNotificationProps> = ({ reward, onDismiss }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const handleDismiss = () => {
            setIsExiting(true);
            const timer = setTimeout(onDismiss, 500); // Wait for exit animation
            return () => clearTimeout(timer);
        };
        
        const exitTimer = setTimeout(handleDismiss, 4500);

        return () => clearTimeout(exitTimer);
    }, [onDismiss]);
    
    const handleManualDismiss = () => {
        setIsExiting(true);
        setTimeout(onDismiss, 500);
    };

    return (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[9999] p-4 transition-opacity duration-500 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleManualDismiss}
        >
          <div 
            className={`relative bg-gradient-to-br from-[#1e1b25] to-[#12121A] border border-yellow-400/30 rounded-2xl shadow-2xl shadow-yellow-400/20 w-full max-w-sm text-white overflow-hidden`}
            style={{ animation: isExiting ? 'reward-exit 0.5s forwards' : 'reward-enter 0.5s forwards cubic-bezier(0.25, 0.8, 0.25, 1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sparkle background */}
            <div className="absolute inset-0 opacity-20 reward-sparkles pointer-events-none"></div>
            
            <div className="relative p-8 text-center">
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-yellow-500/10 mb-4 border-2 border-yellow-500/30">
                <i className="ph-fill ph-gift text-5xl text-yellow-400 animate-reward-icon-pop"></i>
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-300 to-amber-400 text-transparent bg-clip-text mb-2">Phần Thưởng Đã Đến!</h2>
              <p className="text-gray-400 mb-6">Giao dịch của bạn đã được phê duyệt.</p>

              <div className="space-y-4">
                {reward.diamonds > 0 && (
                    <div className="bg-white/5 p-4 rounded-lg flex items-center justify-between animate-reward-item-enter" style={{ animationDelay: '200ms' }}>
                        <span className="text-lg font-semibold flex items-center gap-2"><i className="ph-fill ph-diamonds-four text-pink-400 text-2xl"></i>Kim Cương</span>
                        <span className="text-2xl font-bold text-pink-400">+ <AnimatedNumber value={reward.diamonds} /></span>
                    </div>
                )}
                {reward.xp > 0 && (
                    <div className="bg-white/5 p-4 rounded-lg flex items-center justify-between animate-reward-item-enter" style={{ animationDelay: '400ms' }}>
                        <span className="text-lg font-semibold flex items-center gap-2"><i className="ph-fill ph-star text-cyan-400 text-2xl"></i>Điểm Kinh Nghiệm</span>
                        <span className="text-2xl font-bold text-cyan-400">+ <AnimatedNumber value={reward.xp} /></span>
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
    );
};

export default RewardNotification;
