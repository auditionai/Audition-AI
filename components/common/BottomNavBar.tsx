
import React from 'react';
import { CreatorTab } from '../../pages/CreatorPage';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';

interface BottomNavBarProps {
  activeTab: CreatorTab | 'buy-credits' | 'profile' | 'shop' | 'messages' | 'admin-gallery';
  onTabChange: (tab: any) => void;
  onCheckInClick: () => void;
}

const NavButton = ({ icon, label, isActive, onClick, hasNotification = false }: { icon: string, label: string, isActive: boolean, onClick: () => void, hasNotification?: boolean }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 ${isActive ? 'text-skin-accent' : 'text-gray-400 hover:text-white'}`}>
        {hasNotification && (
            <span className="absolute top-2 right-4 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
            </span>
        )}
        <i className={`ph-fill ${icon} text-2xl ${isActive ? 'drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]' : ''}`}></i>
        <span className={`text-[10px] mt-1 font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
    </button>
);

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange, onCheckInClick }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-0 left-0 w-full h-16 bg-[#12121A]/90 backdrop-blur-lg border-t border-white/10 z-50 md:hidden pb-safe">
        <div className="flex justify-around items-center h-full px-1">
            {/* 1. Studio (Tool) */}
            <NavButton 
                icon="ph-magic-wand"
                label={t('creator.aiTool.title').split(' ')[0]} // "Audition" or "Studio"
                isActive={activeTab === 'tool'}
                onClick={() => onTabChange('tool')}
            />
            
            {/* 2. Shop */}
            <NavButton 
                icon="ph-storefront"
                label={t('creator.header.nav.shop')}
                isActive={activeTab === 'shop' || activeTab === 'buy-credits'}
                onClick={() => onTabChange('shop')}
            />
            
            {/* 3. Leaderboard */}
            <NavButton 
                icon="ph-crown-simple"
                label="BXH"
                isActive={activeTab === 'leaderboard'}
                onClick={() => onTabChange('leaderboard')}
            />
            
            {/* 4. Profile */}
            <NavButton 
                icon="ph-user-circle"
                label={t('creator.header.nav.profile')}
                isActive={activeTab === 'profile' || activeTab === 'my-creations'}
                onClick={() => onTabChange('profile')}
            />

            {/* 5. Menu (Settings) */}
            <NavButton 
                icon="ph-list"
                label="Menu"
                isActive={activeTab === 'settings'}
                onClick={() => onTabChange('settings')}
            />
        </div>
    </div>
  );
};

export default BottomNavBar;
