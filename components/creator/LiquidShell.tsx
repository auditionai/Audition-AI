
import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import UserAvatar from '../common/UserAvatar';
import Logo from '../common/Logo';
import { useTranslation } from '../../hooks/useTranslation';
import ThemeSwitcher from '../common/ThemeSwitcher';

interface LiquidShellProps {
    children: React.ReactNode;
    activeTab: CreatorTab | 'admin-gallery' | 'shop' | 'profile' | 'messages' | 'leaderboard';
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

    // Mapping tabs to icons for the floating dock
    const dockItems = [
        { id: 'tool', icon: 'ph-magic-wand', label: t('creator.header.nav.studio') || 'Studio', color: 'text-cyan-400' },
        { id: 'my-creations', icon: 'ph-images', label: t('creator.header.nav.myCreations'), color: 'text-purple-400' },
        { id: 'shop', icon: 'ph-storefront', label: t('creator.header.nav.shop'), color: 'text-yellow-400' },
        { id: 'leaderboard', icon: 'ph-crown-simple', label: t('creator.header.nav.leaderboard'), color: 'text-green-400' },
        { id: 'profile', icon: 'ph-user-circle', label: t('creator.header.nav.profile'), color: 'text-pink-400' },
    ];

    // Additional items for Admins
    if (user.is_admin) {
        dockItems.push({ id: 'settings', icon: 'ph-gear', label: t('creator.header.userMenu.settings'), color: 'text-gray-400' });
    }

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col items-center">
            
            {/* --- TOP FLOATING BAR (Status Bar) --- */}
            <div className="fixed top-6 left-0 right-0 z-50 px-6 flex justify-between items-start pointer-events-none">
                
                {/* Left: Brand & Theme */}
                <div className="pointer-events-auto flex flex-col gap-2">
                    <div className="liquid-capsule px-4 py-2 flex items-center gap-2">
                         <Logo onClick={() => onNavigate('tool')} />
                    </div>
                    {/* Theme Switcher Mini */}
                    <div className="liquid-capsule p-1 inline-flex">
                        <ThemeSwitcher />
                    </div>
                </div>

                {/* Right: User Status */}
                <div className="pointer-events-auto flex flex-col items-end gap-3">
                    
                    {/* Profile Capsule */}
                    <div className="liquid-capsule p-1 pr-4 flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('profile')}>
                        <UserAvatar 
                            url={user.photo_url} 
                            alt={user.display_name} 
                            frameId={user.equipped_frame_id} 
                            level={user.level}
                            size="md"
                        />
                        <div className="flex flex-col items-end">
                            <span className="font-bold text-sm leading-none">{user.display_name}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-widest">Lv.{user.level}</span>
                        </div>
                    </div>

                    {/* Resources Capsule */}
                    <div className="flex gap-2">
                        <button 
                            onClick={onCheckInClick}
                            className="liquid-capsule px-3 py-2 flex items-center gap-2 hover:text-green-400 transition"
                        >
                            <i className={`ph-fill ph-calendar-check text-lg ${!hasCheckedInToday ? 'animate-bounce text-green-400' : ''}`}></i>
                        </button>
                        <button 
                            onClick={onTopUpClick}
                            className="liquid-capsule px-4 py-2 flex items-center gap-2 hover:text-pink-400 transition"
                        >
                            <span className="font-black text-sm">{user.diamonds.toLocaleString()}</span>
                            <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                        </button>
                         <button 
                            onClick={logout}
                            className="liquid-capsule px-3 py-2 flex items-center gap-2 hover:text-red-400 transition"
                        >
                            <i className="ph-fill ph-sign-out text-lg"></i>
                        </button>
                    </div>

                </div>
            </div>

            {/* --- MAIN GLASS STAGE (Content) --- */}
            {/* Centered, constrained width, scrollable inside */}
            <main className="relative z-10 w-full max-w-[1400px] h-screen pt-32 pb-28 px-4 flex flex-col">
                <div className="liquid-stage flex-grow w-full h-full relative overflow-y-auto custom-scrollbar p-6 md:p-8">
                     {/* Inner Content Content */}
                     {children}
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
                                className={`liquid-dock-item ${isActive ? 'active' : ''}`}
                                data-tooltip={item.label}
                            >
                                <i className={`ph-fill ${item.icon} ${isActive ? 'text-white' : item.color}`}></i>
                            </button>
                        );
                    })}
                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
