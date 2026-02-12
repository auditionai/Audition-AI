
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import UserAvatar from '../common/UserAvatar';
import { useTranslation } from '../../hooks/useTranslation';
import MarqueeBanner from '../common/MarqueeBanner';

interface LiquidShellProps {
    children: React.ReactNode;
    activeTab: CreatorTab | 'shop' | 'profile' | 'leaderboard';
    onNavigate: (tab: any) => void;
    onTopUpClick: () => void;
    onCheckInClick: () => void;
}

const LiquidShell: React.FC<LiquidShellProps> = ({ 
    children, 
    activeTab, 
    onNavigate,
    onTopUpClick,
    onCheckInClick
}) => {
    const { user, logout, hasCheckedInToday } = useAuth();
    const { t } = useTranslation();

    if (!user) return null;

    // --- NAVIGATION DOCK ITEMS (4 Core Functions) ---
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
            active: false, // Trigger only
            extraClass: !hasCheckedInToday ? 'animate-bounce text-green-400' : ''
        },
        { 
            id: 'top-up', 
            icon: 'ph-diamonds-four', 
            label: 'Nạp tiền',
            action: onTopUpClick,
            active: false, // Trigger only
            extraClass: 'text-yellow-400'
        },
    ];

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col font-barlow bg-black selection:bg-red-500 selection:text-white">
            
            {/* --- MAIN GLASS STAGE (Content) --- */}
            <main className="flex-grow w-full h-screen overflow-hidden pt-4 pb-28 px-2 md:px-4 flex flex-col items-center">
                
                {/* 3D Floating Marquee */}
                <MarqueeBanner />

                <div className="w-full max-w-[1200px] h-full relative z-10 flex flex-col">
                     {/* Inner Scrollable Container with 3D Border */}
                     <div className="liquid-content-container w-full h-full overflow-y-auto custom-scrollbar">
                         {children}
                     </div>
                </div>
            </main>

            {/* --- BOTTOM OMNI-DOCK (3D Floating Bar) --- */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                <div className="liquid-dock-container pointer-events-auto">
                    
                    {/* LEFT: Logo/Profile (Mini) */}
                    <div 
                        className="w-12 h-12 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center cursor-pointer hover:border-red-500 transition-colors mr-2 relative group overflow-hidden"
                        onClick={() => onNavigate('profile')}
                    >
                         <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            level={user.level} 
                            size="sm"
                            className="scale-90"
                        />
                    </div>

                    {/* CENTER: Navigation Pills (3D Buttons) */}
                    <div className="flex items-center gap-3">
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

                    {/* RIGHT: Logout (Small) */}
                    <div className="ml-2 pl-2 border-l border-white/10">
                         <button 
                            onClick={logout} 
                            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-500 transition-colors"
                            title="Đăng xuất"
                        >
                             <i className="ph-fill ph-sign-out text-lg"></i>
                         </button>
                    </div>

                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
