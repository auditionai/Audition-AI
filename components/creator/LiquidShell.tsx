
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import UserAvatar from '../common/UserAvatar';
import { useTranslation } from '../../hooks/useTranslation';

interface LiquidShellProps {
    children: React.ReactNode;
    activeTab: CreatorTab | 'shop' | 'profile' | 'leaderboard';
    onNavigate: (tab: any) => void;
    onCheckInClick: () => void;
}

const LiquidShell: React.FC<LiquidShellProps> = ({ 
    children, 
    activeTab, 
    onNavigate,
    onCheckInClick
}) => {
    const { user, hasCheckedInToday } = useAuth();
    const { t } = useTranslation();

    if (!user) return null;

    // --- NAVIGATION DOCK ITEMS ---
    const navItems = [
        { 
            id: 'tool', 
            icon: 'ph-magic-wand', 
            label: 'Studio',
            action: () => onNavigate('tool'),
            active: activeTab === 'tool'
        },
        { 
            id: 'my-creations', 
            icon: 'ph-images', 
            label: t('creator.header.nav.myCreations'),
            action: () => onNavigate('my-creations'),
            active: activeTab === 'my-creations'
        },
        { 
            id: 'check-in', 
            icon: 'ph-calendar-check', 
            label: t('creator.header.nav.checkIn'),
            action: onCheckInClick,
            active: false, 
            extraClass: !hasCheckedInToday ? 'animate-bounce text-green-400' : ''
        }
    ];

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col font-barlow bg-black selection:bg-red-500 selection:text-white">
            
            {/* --- MAIN GLASS STAGE (Content) --- */}
            {/* Added extra padding-bottom (pb-32) so content isn't hidden behind the Dock */}
            <main className="flex-grow w-full h-screen overflow-hidden pt-2 pb-32 px-2 md:px-4 flex flex-col items-center">
                
                {/* Marquee removed here to prevent duplication with App.tsx */}

                <div className="w-full max-w-[1200px] h-full relative z-10 flex flex-col">
                     {/* Inner Scrollable Container with 3D Border */}
                     <div className="liquid-content-container w-full h-full overflow-y-auto custom-scrollbar">
                         {children}
                     </div>
                </div>
            </main>

            {/* --- BOTTOM OMNI-DOCK (3D Floating Bar) --- */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-auto max-w-[95vw]">
                <div className="liquid-dock-container pointer-events-auto shadow-2xl">
                    
                    {/* LEFT: User Profile (Settings) */}
                    <div 
                        className="flex items-center gap-2 pr-3 border-r border-white/10 mr-1 cursor-pointer group"
                        onClick={() => onNavigate('settings')}
                        title="Cài đặt tài khoản"
                    >
                         <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            level={user.level} 
                            size="sm"
                            className="scale-90 group-hover:scale-100 transition-transform"
                        />
                        <div className="hidden sm:flex flex-col">
                            <span className="text-[10px] font-bold text-gray-300 group-hover:text-white max-w-[80px] truncate">{user.display_name}</span>
                        </div>
                    </div>

                    {/* CENTER: Navigation Pills */}
                    <div className="flex items-center gap-2">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={item.action}
                                className={`liquid-dock-item group ${item.active ? 'active' : ''}`}
                            >
                                <i className={`ph-fill ${item.icon} ${item.extraClass || ''}`}></i>
                                <span className="liquid-dock-label">{item.label}</span>
                                
                                {/* Notification Dot for Check-in */}
                                {item.id === 'check-in' && !hasCheckedInToday && (
                                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* RIGHT: Balance & Top Up */}
                    <div className="ml-1 pl-3 border-l border-white/10 flex items-center gap-2">
                        <div className="flex flex-col items-end mr-1">
                             <span className="text-[9px] text-gray-400 font-bold tracking-wider">BALANCE</span>
                             <span className="text-sm font-black text-white leading-none">{user.diamonds} <i className="ph-fill ph-diamonds-four text-red-500 text-[10px]"></i></span>
                        </div>

                         <button 
                            onClick={() => onNavigate('buy-credits')} 
                            className="liquid-dock-item !w-auto !h-10 !px-4 !bg-gradient-to-r from-yellow-600 to-red-600 hover:from-yellow-500 hover:to-red-500 !border-yellow-500/30 text-white shadow-lg shadow-red-900/20 group"
                            title="Nạp Kim Cương"
                        >
                             <i className="ph-fill ph-plus-circle text-lg group-hover:rotate-90 transition-transform"></i>
                             <span className="text-xs font-bold hidden sm:inline">NẠP</span>
                         </button>
                    </div>

                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
