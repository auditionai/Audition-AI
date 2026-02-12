
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import UserAvatar from '../common/UserAvatar';
import { useTranslation } from '../../hooks/useTranslation';

interface LiquidShellProps {
    children: React.ReactNode;
    activeTab: CreatorTab | 'shop' | 'profile' | 'leaderboard' | 'buy-credits';
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

    // --- NAVIGATION LOGIC ---
    // 1. Studio
    // 2. My Creations
    // 3. Check-in
    // 4. Top Up
    // 5. Balance Info (Not clickable nav, just info)
    // 6. Avatar (Profile/Settings)

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col font-barlow bg-black selection:bg-red-500 selection:text-white">
            
            {/* --- MAIN GLASS STAGE (Content) --- */}
            <main className="flex-grow w-full h-screen overflow-hidden pt-2 pb-32 px-2 md:px-4 flex flex-col items-center">
                
                {/* Marquee removed here to prevent duplication with App.tsx */}

                <div className="w-full max-w-[1200px] h-full relative z-10 flex flex-col">
                     {/* Inner Scrollable Container with Thicker 3D Border */}
                     <div className="liquid-content-container w-full h-full overflow-y-auto custom-scrollbar">
                         {children}
                     </div>
                </div>
            </main>

            {/* --- BOTTOM OMNI-DOCK (3D Floating Bar) --- */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-auto max-w-[95vw]">
                <div className="liquid-dock-container pointer-events-auto">
                    
                    {/* 1. STUDIO (Tool) */}
                    <button
                        onClick={() => onNavigate('tool')}
                        className={`liquid-dock-item group ${activeTab === 'tool' ? 'active' : ''}`}
                        title="Studio"
                    >
                        <i className="ph-fill ph-magic-wand"></i>
                        <span className="liquid-dock-label">Studio</span>
                    </button>

                    {/* 2. CREATIONS (Tác Phẩm) */}
                    <button
                        onClick={() => onNavigate('my-creations')}
                        className={`liquid-dock-item group ${activeTab === 'my-creations' ? 'active' : ''}`}
                        title={t('creator.header.nav.myCreations')}
                    >
                        <i className="ph-fill ph-images"></i>
                        <span className="liquid-dock-label">{t('creator.header.nav.myCreations')}</span>
                    </button>

                    {/* 3. CHECK-IN (Điểm danh) */}
                    <button
                        onClick={onCheckInClick}
                        className="liquid-dock-item group relative"
                        title={t('creator.header.nav.checkIn')}
                    >
                        <i className={`ph-fill ph-calendar-check ${!hasCheckedInToday ? 'text-green-400 animate-pulse' : ''}`}></i>
                        {!hasCheckedInToday && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                        )}
                        <span className="liquid-dock-label">{t('creator.header.nav.checkIn')}</span>
                    </button>

                    {/* SEPARATOR */}
                    <div className="w-px h-8 bg-white/10 mx-1"></div>

                    {/* 4. TOP UP (Nạp tiền) - Special Style */}
                    <button
                        onClick={() => onNavigate('buy-credits')}
                        className="liquid-dock-item group !bg-gradient-to-br !from-yellow-600 !to-orange-700 !border-orange-500/50"
                        title="Nạp Kim Cương"
                    >
                        <i className="ph-fill ph-plus-circle text-white"></i>
                        <span className="liquid-dock-label font-bold text-yellow-100">Nạp</span>
                    </button>

                    {/* 5. BALANCE INFO (Display Only) */}
                    <div className="flex flex-col items-end justify-center px-3 h-[52px] select-none">
                        <span className="text-[9px] text-gray-500 font-bold tracking-widest uppercase">Balance</span>
                        <div className="flex items-center gap-1">
                            <span className="text-lg font-black text-white leading-none">{user.diamonds}</span>
                            <i className="ph-fill ph-diamonds-four text-red-500 text-xs"></i>
                        </div>
                    </div>

                    {/* SEPARATOR */}
                    <div className="w-px h-8 bg-white/10 mx-1"></div>

                    {/* 6. AVATAR (Profile/Settings) - Circular Only, No Name */}
                    <div 
                        className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                        onClick={() => onNavigate('settings')}
                        title="Cài đặt tài khoản"
                    >
                         <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            level={user.level} 
                            size="md"
                            className="shadow-lg"
                        />
                    </div>

                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
