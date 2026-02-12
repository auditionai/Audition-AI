import React from 'react';
import { CreatorTab } from '../../pages/CreatorPage';

interface BottomNavBarProps {
  activeTab: CreatorTab | 'buy-credits' | 'profile' | 'messages' | 'shop' | 'leaderboard';
  onTabChange: (tab: any) => void;
  onCheckInClick?: () => void; // Optional if you want check-in on bar
}

const NavButton = ({ icon, label, isActive, onClick }: { icon: string, label: string, isActive: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 ${isActive ? 'text-skin-accent' : 'text-gray-400 hover:text-white'}`}>
        <i className={`ph-fill ${icon} text-2xl ${isActive ? 'drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]' : ''}`}></i>
        <span className={`text-[10px] mt-1 font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
    </button>
);

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="fixed bottom-0 left-0 w-full h-16 bg-[#12121A]/90 backdrop-blur-lg border-t border-white/10 z-50 md:hidden pb-safe">
        <div className="flex justify-around items-center h-full px-1">
            {/* 1. Studio (Tool) */}
            <NavButton 
                icon="ph-magic-wand"
                label="Studio"
                isActive={activeTab === 'tool'}
                onClick={() => onTabChange('tool')}
            />
            
            {/* 2. My Creations */}
            <NavButton 
                icon="ph-images"
                label="Tác phẩm"
                isActive={activeTab === 'my-creations'}
                onClick={() => onTabChange('my-creations')}
            />
            
            {/* 3. Settings (Replaced Menu) */}
            <NavButton 
                icon="ph-gear"
                label="Cài đặt"
                isActive={activeTab === 'settings'}
                onClick={() => onTabChange('settings')}
            />
        </div>
    </div>
  );
};

export default BottomNavBar;