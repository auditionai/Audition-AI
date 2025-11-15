import React from 'react';
import { CreatorTab } from '../../pages/CreatorPage';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';

interface BottomNavBarProps {
  activeTab: CreatorTab | 'buy-credits';
  onTabChange: (tab: CreatorTab) => void;
  onCheckInClick: () => void;
}

const NavButton = ({ icon, label, isActive, onClick, hasNotification = false }: { icon: string, label: string, isActive: boolean, onClick: () => void, hasNotification?: boolean }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 ${isActive ? 'text-pink-400' : 'text-gray-400 hover:text-white'}`}>
        {hasNotification && (
            <span className="absolute top-2 right-4 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
            </span>
        )}
        <i className={`ph-fill ${icon} text-2xl`}></i>
        <span className="text-xs mt-1">{label}</span>
    </button>
);

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange, onCheckInClick }) => {
  const { hasCheckedInToday } = useAuth();
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-0 left-0 w-full h-16 bg-[#12121A]/80 backdrop-blur-lg border-t border-white/10 z-50 md:hidden">
        <div className="flex justify-around items-center h-full">
            <NavButton 
                icon="ph-paint-brush-broad"
                label={t('creator.aiTool.tabs.single')}
                isActive={activeTab === 'tool'}
                onClick={() => onTabChange('tool')}
            />
            <NavButton 
                icon="ph-images"
                label={t('creator.header.nav.myCreations')}
                isActive={activeTab === 'my-creations'}
                onClick={() => onTabChange('my-creations')}
            />
            <NavButton 
                icon="ph-crown-simple"
                label={t('creator.header.nav.leaderboard')}
                isActive={activeTab === 'leaderboard'}
                onClick={() => onTabChange('leaderboard')}
            />
            {/* Fix: Add Daily Check-in button, which was missing for mobile users */}
            <NavButton 
                icon="ph-calendar-check"
                label={t('creator.header.nav.checkIn')}
                isActive={false} // This is a modal action, not a tab.
                onClick={onCheckInClick}
                hasNotification={!hasCheckedInToday}
            />
            <NavButton 
                icon="ph-user-circle"
                label={t('creator.header.userMenu.settings')}
                isActive={activeTab === 'settings'}
                onClick={() => onTabChange('settings')}
            />
        </div>
    </div>
  );
};

export default BottomNavBar;
