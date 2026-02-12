
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import UserAvatar from '../common/UserAvatar';
import Logo from '../common/Logo';
import { useTranslation } from '../../hooks/useTranslation';
import ThemeSwitcher from '../common/ThemeSwitcher';

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

    // --- CLEANED UP DOCK ITEMS ---
    // Only essential navigation to prevent errors and clutter
    const dockItems = [
        { id: 'tool', icon: 'ph-magic-wand', label: t('creator.header.nav.studio') || 'Studio', color: 'text-cyan-400' },
        { id: 'my-creations', icon: 'ph-images', label: t('creator.header.nav.myCreations'), color: 'text-purple-400' },
        { id: 'shop', icon: 'ph-storefront', label: t('creator.header.nav.shop'), color: 'text-yellow-400' },
        // Leaderboard is accessed via Profile or specific campaigns usually, but keeping it as a tab is fine if handled
        { id: 'leaderboard', icon: 'ph-crown-simple', label: t('creator.header.nav.leaderboard'), color: 'text-green-400' }, 
        { id: 'profile', icon: 'ph-user-circle', label: t('creator.header.nav.profile'), color: 'text-pink-400' },
    ];

    // Removed 'settings' and 'admin-gallery' from Dock to keep it clean (access via Profile usually)
    // Removed 'messages' as per request

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col font-barlow">
            
            {/* --- TOP DYNAMIC ISLAND (Status Bar) --- */}
            {/* Floating pill shape combining Logo, Resources, and User */}
            <div className="fixed top-4 left-0 right-0 z-50 flex justify-center pointer-events-none">
                <div className="pointer-events-auto bg-[#1a1a1a]/60 backdrop-blur-xl border border-white/10 rounded-full p-2 pl-6 pr-2 shadow-2xl flex items-center gap-6 animate-fade-in-down transition-all hover:bg-[#1a1a1a]/80 hover:scale-[1.01]">
                    
                    {/* Brand */}
                    <div className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => onNavigate('tool')}>
                         <Logo />
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-2 hidden sm:block"></div>

                    {/* Resources (Clickable) */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onCheckInClick}
                            className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-green-500/30"
                            title="Điểm danh"
                        >
                            <i className={`ph-fill ph-calendar-check text-lg ${!hasCheckedInToday ? 'animate-bounce text-green-400' : 'text-gray-400'}`}></i>
                        </button>

                        <button 
                            onClick={onTopUpClick}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/30 transition-all group"
                        >
                            <span className="font-black text-sm text-pink-200 group-hover:text-white">{user.diamonds.toLocaleString()}</span>
                            <i className="ph-fill ph-diamonds-four text-pink-400 group-hover:text-pink-300 drop-shadow-md"></i>
                        </button>
                    </div>

                    {/* User Avatar (Profile Menu Trigger) */}
                    <div className="relative group cursor-pointer" onClick={() => onNavigate('profile')}>
                        <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            level={user.level}
                            size="md"
                            className="transition-transform group-hover:scale-105"
                        />
                        {/* Level Badge Overlay */}
                        <div className="absolute -bottom-1 -right-1 bg-black/80 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white/20 text-white">
                            Lv.{user.level}
                        </div>
                    </div>

                    {/* Settings/Logout Shortcuts (Hidden on mobile to save space) */}
                    <div className="hidden sm:flex items-center gap-1 ml-2">
                        <div className="w-px h-6 bg-white/10 mx-1"></div>
                         <div className="scale-75">
                            <ThemeSwitcher />
                         </div>
                         <button onClick={logout} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
                            <i className="ph-fill ph-sign-out text-xl"></i>
                         </button>
                    </div>
                </div>
            </div>

            {/* --- MAIN GLASS STAGE (Content) --- */}
            {/* The "Stage" is a floating window in the middle */}
            <main className="flex-grow w-full h-screen overflow-hidden pt-24 pb-28 px-4 md:px-8 flex flex-col items-center">
                <div className="w-full max-w-[1200px] h-full relative z-10 flex flex-col">
                     {/* Inner Scrollable Container with Glass Effect */}
                     <div className="liquid-content-container w-full h-full overflow-y-auto custom-scrollbar rounded-[32px] p-6 md:p-8">
                         {children}
                     </div>
                </div>
            </main>

            {/* --- BOTTOM FLOATING DOCK --- */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <div className="liquid-dock-container">
                    {dockItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                className={`liquid-dock-item group ${isActive ? 'active' : ''}`}
                            >
                                <span className="liquid-dock-tooltip">{item.label}</span>
                                <i className={`ph-fill ${item.icon} text-2xl transition-all duration-300 ${isActive ? 'text-white scale-110 drop-shadow-md' : 'text-gray-400 group-hover:text-white'}`}></i>
                                {isActive && <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white]"></div>}
                            </button>
                        );
                    })}
                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
