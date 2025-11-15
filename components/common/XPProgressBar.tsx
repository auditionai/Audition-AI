import React from 'react';
import { getXpForNextLevel } from '../../utils/rankUtils';
import { RANKS } from '../../constants/ranks';
import { useTranslation } from '../../hooks/useTranslation';

interface XPProgressBarProps {
    currentXp: number;
    currentLevel: number;
}

const XPProgressBar: React.FC<XPProgressBarProps> = ({ currentXp, currentLevel }) => {
    const { t } = useTranslation();
    const xpForNext = getXpForNextLevel(currentLevel);
    const xpForPrev = getXpForNextLevel(currentLevel - 1);

    const currentLevelXp = currentXp - xpForPrev;
    const xpNeededForLevel = xpForNext - xpForPrev;
    
    // Ensure no division by zero and progress doesn't exceed 100%
    const progressPercentage = xpNeededForLevel > 0 ? Math.min((currentLevelXp / xpNeededForLevel) * 100, 100) : 100;
    
    const xpRemaining = Math.max(0, xpForNext - currentXp);
    
    // Find the next rank if it exists
    const nextRank = RANKS.find(r => r.levelThreshold > currentLevel);

    return (
        <div>
            <h4 className="font-semibold text-white mb-2 text-sm">{t('creator.xpBar.progress')}</h4>
            <div className="w-full bg-black/30 rounded-full h-3 p-0.5" title={`${currentLevelXp.toLocaleString()}/${xpNeededForLevel.toLocaleString()} XP`}>
                <div 
                    className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-cyan-400"
                    style={{
                        width: `${progressPercentage}%`,
                        backgroundSize: '200% 200%',
                        animation: 'progress-flow 3s linear infinite',
                        transition: 'width 0.5s ease-in-out'
                    }}
                ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>XP: {currentXp.toLocaleString()} / {xpForNext.toLocaleString()}</span>
                {nextRank && xpRemaining > 0 && (
                    <span>
                        {t('creator.xpBar.needed', { xp: xpRemaining.toLocaleString() })} <span className="font-bold text-pink-300">{nextRank.title}</span>
                    </span>
                )}
                 {xpRemaining === 0 && (
                     <span className="font-bold text-green-400">{t('creator.xpBar.maxLevel')}</span>
                 )}
            </div>
        </div>
    );
};

export default XPProgressBar;