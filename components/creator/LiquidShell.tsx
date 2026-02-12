
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

    // --- NAVIGATION ITEMS ---
    const navItems = [
        { id: 'tool', icon: 'ph-magic-wand', label: 'Studio', color: 'text-white' },
        { id: 'my-creations', icon: 'ph-images', label: t('creator.header.nav.myCreations'), color: 'text-white' },
        { id: 'shop', icon: 'ph-storefront', label: t('creator.header.nav.shop'), color: 'text-white' },
        { id: 'leaderboard', icon: 'ph-crown-simple', label: t('creator.header.nav.leaderboard'), color: 'text-white' },
    ];

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-white flex flex-col font-barlow bg-black">
            
            {/* --- TOP STAGE (Maximizing Screen Space) --- */}
            {/* Removed top header completely. The stage starts from near top. */}
            
            {/* --- MAIN GLASS STAGE (Content) --- */}
            <main className="flex-grow w-full h-screen overflow-hidden pt-4 pb-28 px-2 md:px-4 flex flex-col items-center">
                <div className="w-full max-w-[1400px] h-full relative z-10 flex flex-col">
                     {/* Inner Scrollable Container with Smoked Red Glass Effect */}
                     <div className="liquid-content-container w-full h-full overflow-y-auto custom-scrollbar rounded-[20px] md:rounded-[32px] p-4 md:p-8">
                         {children}
                     </div>
                </div>
            </main>

            {/* --- BOTTOM OMNI-DOCK (Unified Command Center) --- */}
            {/* Contains: Logo (Left), Nav (Center), User/Resources (Right) */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[800px] pointer-events-none">
                <div className="liquid-dock-container pointer-events-auto flex justify-between items-center px-2 py-1.5 md:py-2 md:px-3">
                    
                    {/* LEFT: Logo & System */}
                    <div className="flex items-center gap-2 mr-2">
                        <div 
                            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-black/40 rounded-full border border-red-500/30 cursor-pointer hover:bg-red-900/20 transition-colors group"
                            onClick={() => onNavigate('tool')}
                        >
                            <div className="text-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)] transition-transform group-hover:scale-110">
                                 <i className="ph-fill ph-drop-half-bottom text-2xl"></i>
                            </div>
                        </div>
                    </div>

                    {/* CENTER: Navigation Pills */}
                    <div className="flex items-center gap-1 md:gap-2">
                        {navItems.map((item) => {
                            const isActive = activeTab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onNavigate(item.id)}
                                    className={`liquid-dock-item group ${isActive ? 'active' : ''}`}
                                    title={item.label}
                                >
                                    <i className={`ph-fill ${item.icon} text-xl md:text-2xl transition-all duration-300 ${isActive ? 'text-white scale-110 drop-shadow-md' : 'text-gray-400 group-hover:text-white'}`}></i>
                                </button>
                            );
                        })}
                    </div>

                    {/* RIGHT: User Status & Resources */}
                    <div className="flex items-center gap-3 ml-2">
                         {/* Resources */}
                         <div className="hidden sm:flex flex-col items-end gap-0.5 mr-2">
                             <div className="text-[10px] font-bold text-red-400 tracking-wider">BALANCE</div>
                             <div 
                                onClick={onTopUpClick}
                                className="flex items-center gap-1 cursor-pointer hover:scale-105 transition"
                             >
                                 <span className="font-black text-white text-sm">{user.diamonds.toLocaleString()}</span>
                                 <i className="ph-fill ph-diamonds-four text-red-500"></i>
                             </div>
                         </div>

                        {/* Profile Pill */}
                        <div 
                            className="liquid-dock-profile flex items-center gap-2 cursor-pointer group pr-3" 
                            onClick={() => onNavigate('profile')}
                        >
                            <UserAvatar 
                                url={user.photo_url} 
                                alt={user.display_name} 
                                frameId={user.equipped_frame_id} 
                                level={user.level}
                                size="sm"
                                className="border border-white/20"
                            />
                            <div className="flex flex-col md:hidden">
                                 <span className="text-[10px] font-bold text-red-400">{user.diamonds}💎</span>
                            </div>
                            <div className="hidden md:flex flex-col">
                                <span className="text-xs font-bold text-white leading-none">{user.display_name}</span>
                                <span className="text-[9px] text-gray-400">LV.{user.level}</span>
                            </div>
                        </div>

                         {/* Mobile Menu Trigger (Settings/Logout) - Small dot menu */}
                         <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400">
                             <i className="ph-fill ph-sign-out text-lg"></i>
                         </button>
                    </div>

                </div>
            </div>

        </div>
    );
};

export default LiquidShell;
