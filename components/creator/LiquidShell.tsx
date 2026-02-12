
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
    onTopUpClick: () => void;
}

const LiquidShell: React.FC<LiquidShellProps> = ({ 
    children, 
    activeTab, 
    onNavigate,
    onCheckInClick,
    onTopUpClick
}) => {
    const { user, hasCheckedInToday } = useAuth();
    const { t } = useTranslation();

    if (!user) return null;

    // NAVIGATION: Home -> Studio -> Creations -> CheckIn -> TopUp -> Balance -> Avatar
    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col font-barlow bg-black selection:bg-red-500 selection:text-white">
            
            {/* --- MAIN GLASS STAGE (Content) --- */}
            <main className="flex-grow w-full h-screen overflow-hidden pt-4 pb-36 px-2 md:px-4 flex flex-col items-center">
                <div className="w-full max-w-[1280px] h-full relative z-10 flex flex-col">
                     {/* Thick Glass Container (Fixed Frame) */}
                     <div className="liquid-content-container w-full h-full relative flex flex-col">
                         {/* Inner Scrollable Area - Separated from container styles to avoid overflow conflict */}
                         <div className="w-full h-full overflow-y-auto custom-scrollbar p-1 rounded-[32px]">
                            {children}
                         </div>
                     </div>
                </div>
            </main>

            {/* --- BOTTOM OMNI-DOCK (3D Floating Bar) --- */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-auto max-w-[98vw]">
                <div className="liquid-dock-container pointer-events-auto">
                    
                    {/* 0. HOME */}
                    <button
                        onClick={() => onNavigate('tool')}
                        className="liquid-dock-item group"
                    >
                        <i className="ph-fill ph-house"></i>
                        <span className="liquid-dock-label">Trang chủ</span>
                    </button>

                    {/* 1. STUDIO */}
                    <button
                        onClick={() => onNavigate('tool')}
                        className={`liquid-dock-item group ${activeTab === 'tool' ? 'active' : ''}`}
                    >
                        <i className="ph-fill ph-magic-wand"></i>
                        <span className="liquid-dock-label">Studio</span>
                    </button>

                    {/* 2. CREATIONS */}
                    <button
                        onClick={() => onNavigate('my-creations')}
                        className={`liquid-dock-item group ${activeTab === 'my-creations' ? 'active' : ''}`}
                    >
                        <i className="ph-fill ph-images"></i>
                        <span className="liquid-dock-label">{t('creator.header.nav.myCreations')}</span>
                    </button>

                    {/* 3. CHECK-IN */}
                    <button
                        onClick={onCheckInClick}
                        className="liquid-dock-item group relative"
                    >
                        <i className={`ph-fill ph-calendar-check ${!hasCheckedInToday ? 'text-green-400 animate-pulse' : ''}`}></i>
                        {!hasCheckedInToday && (
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                        )}
                        <span className="liquid-dock-label">{t('creator.header.nav.checkIn')}</span>
                    </button>

                    <div className="w-px h-8 bg-white/10 mx-2"></div>

                    {/* 4. TOP UP (Triggers Modal) */}
                    <button
                        onClick={onTopUpClick} 
                        className={`liquid-dock-item group !min-w-[80px] ${activeTab === 'buy-credits' ? 'active' : ''}`}
                        title="Nạp Kim Cương"
                    >
                        <i className="ph-fill ph-plus-circle text-yellow-400 text-2xl group-hover:rotate-90 transition-transform"></i>
                        <span className="liquid-dock-label text-yellow-200">NẠP</span>
                    </button>

                    {/* 5. BALANCE */}
                    <div className="flex flex-col items-end justify-center px-4 h-full select-none min-w-[80px]">
                        <span className="text-[9px] text-gray-500 font-bold tracking-widest uppercase">Số Dư KC</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xl font-black text-white leading-none tracking-tight">{user.diamonds}</span>
                            <i className="ph-fill ph-diamonds-four text-red-500 text-xs"></i>
                        </div>
                    </div>

                    <div className="w-px h-8 bg-white/10 mx-2"></div>

                    {/* 6. AVATAR */}
                    <div 
                        className="cursor-pointer transition-transform hover:scale-110 active:scale-95 pr-2"
                        onClick={() => onNavigate('settings')}
                        title="Cài đặt tài khoản"
                    >
                         <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            level={user.level} 
                            size="md"
                        />
                    </div>

                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
