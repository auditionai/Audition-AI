import React, { useEffect, useState } from 'react';
import { CreatorTab } from '../../pages/CreatorPage';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../contexts/AuthContext';

interface BottomNavBarProps {
  activeTab: CreatorTab | 'buy-credits' | 'profile' | 'shop' | 'messages' | 'admin-gallery';
  onTabChange: (tab: any) => void;
  onCheckInClick?: () => void;
}

const NavButton = ({ icon, label, isActive, onClick, hasNotification = false }: { icon: string, label: string, isActive: boolean, onClick: () => void, hasNotification?: boolean }) => (
    <button onClick={onClick} className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 ${isActive ? 'text-skin-accent' : 'text-gray-400 hover:text-white'}`}>
        {hasNotification && (
            <span className="absolute top-2 right-4 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-[#12121A]"></span>
            </span>
        )}
        <i className={`ph-fill ${icon} text-2xl ${isActive ? 'drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]' : ''}`}></i>
        <span className={`text-[10px] mt-1 font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
    </button>
);

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [unreadDMCount, setUnreadDMCount] = useState(0);

  // Polling for unread DMs separately for Mobile Bottom Bar
  useEffect(() => {
      const fetchUnread = async () => {
          if (!session) return;
          try {
              const res = await fetch('/.netlify/functions/get-unread-dm-count', {
                  headers: { Authorization: `Bearer ${session.access_token}` }
              });
              if (res.ok) {
                  const data = await res.json();
                  setUnreadDMCount(data.count || 0);
              }
          } catch (e) {}
      };

      fetchUnread();
      const interval = setInterval(fetchUnread, 15000);
      return () => clearInterval(interval);
  }, [session]);

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
            
            {/* 3. Profile */}
            <NavButton 
                icon="ph-user-circle"
                label={t('creator.header.nav.profile')}
                isActive={activeTab === 'profile' || activeTab === 'my-creations'}
                onClick={() => onTabChange('profile')}
            />

            {/* 4. Messages (Updated with Notification) */}
            <NavButton 
                icon="ph-chat-centered-text"
                label={t('creator.header.nav.messages')}
                isActive={activeTab === 'messages'}
                onClick={() => onTabChange('messages')}
                hasNotification={unreadDMCount > 0}
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