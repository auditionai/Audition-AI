import React from 'react';
import { CreatorTab } from '../../pages/CreatorPage';

interface BottomNavBarProps {
  activeTab: CreatorTab;
  onTabChange: (tab: CreatorTab) => void;
  onTopUpClick: () => void;
}

const NavButton = ({ icon, label, isActive, onClick }: { icon: string, label: string, isActive: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-1/4 h-full transition-colors duration-200 ${isActive ? 'text-pink-400' : 'text-gray-400 hover:text-white'}`}>
        <i className={`ph-fill ${icon} text-2xl`}></i>
        <span className="text-xs mt-1">{label}</span>
    </button>
);

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange, onTopUpClick }) => {
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
                icon="ph-diamonds-four"
                label="Nạp Kim cương"
                isActive={false}
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