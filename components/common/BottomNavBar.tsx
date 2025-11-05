import React from 'react';
import { CreatorTab } from '../../pages/CreatorPage';

interface BottomNavBarProps {
  activeTab: CreatorTab | 'buy-credits';
  onTabChange: (tab: CreatorTab) => void;
  onTopUpClick: () => void;
  onCheckInClick: () => void;
}

const NavButton = ({ icon, label, isActive, onClick, hasNotification = false }: { icon: string, label: string, isActive: boolean, onClick: () => void, hasNotification?: boolean }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center w-1/5 h-full transition-colors duration-200 ${isActive ? 'text-pink-400' : 'text-gray-400 hover:text-white'}`}>
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

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange, onTopUpClick, onCheckInClick }) => {
  return (
    <div className="fixed bottom-0 left-0 w-full h-16 bg-[#12121A]/80 backdrop-blur-lg border-t border-white/10 z-50 md:hidden">
        <div className="flex justify-around items-center h-full">
            <NavButton 
                icon="ph-paint-brush-broad"
                label="Tạo ảnh"
                isActive={activeTab === 'tool'}
                onClick={() => onTabChange('tool')}
            />
            <NavButton 
                icon="ph-crown-simple"
                label="Xếp hạng"
                isActive={activeTab === 'leaderboard'}
                onClick={() => onTabChange('leaderboard')}
            />
             <NavButton 
                icon="ph-calendar-check"
                label="Điểm danh"
                isActive={false}
                onClick={onCheckInClick}
            />
            <NavButton 
                icon="ph-diamonds-four"
                label="Nạp"
                isActive={activeTab === 'buy-credits'}
                onClick={onTopUpClick}
            />
            <NavButton 
                icon="ph-user-circle"
                label="Tài khoản"
                isActive={activeTab === 'settings'}
                onClick={() => onTabChange('settings')}
            />
        </div>
    </div>
  );
};

export default BottomNavBar;
