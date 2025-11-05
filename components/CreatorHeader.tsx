import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CreatorTab } from '../pages/CreatorPage';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';

interface CreatorHeaderProps {
  onTopUpClick: () => void;
  activeTab: CreatorTab;
  setActiveTab: (tab: CreatorTab) => void;
}

const CreatorHeader: React.FC<CreatorHeaderProps> = ({ onTopUpClick, activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;
  
  const rank = getRankForLevel(user.level);

  const handleNavClick = (tab: CreatorTab) => {
    setActiveTab(tab);
    setDropdownOpen(false);
  }

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-[#0B0B0F]/80 backdrop-blur-lg border-b border-pink-500/10">
      <div className="container mx-auto px-4">
        <div className="flex justify-center md:justify-between items-center h-20">
          
          <div className="flex items-center gap-4 md:gap-8">
            <div className="text-2xl font-bold cursor-pointer" onClick={() => handleNavClick('tool')}>
               <span className="bg-gradient-to-r from-[#FF3FA4] to-[#CA27FF] text-transparent bg-clip-text">Audition AI Studio</span>
            </div>
             <nav className="hidden md:flex items-center">
                <button 
                  onClick={() => handleNavClick('leaderboard')} 
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 shadow-lg
                    ${activeTab === 'leaderboard' 
                      ? 'bg-yellow-400 text-black shadow-yellow-400/30' 
                      : 'bg-yellow-400/20 text-yellow-300 hover:bg-yellow-400/30 hover:shadow-yellow-400/20'}`
                  }>
                    <i className="ph-fill ph-crown-simple text-base"></i>
                    <span className="hidden md:inline">Bảng xếp hạng</span>
                </button>
            </nav>
          </div>
          
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/5 p-1 pr-3 rounded-full border border-white/10">
                <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-full">
                    <i className="ph-fill ph-diamonds-four text-pink-400"></i>
                    <span className="font-bold text-sm">{user.diamonds}</span>
                </div>
                <button onClick={onTopUpClick} className="text-xs font-bold text-white hover:text-pink-300 transition-colors">NẠP</button>
            </div>
            
            <div className="relative flex items-center gap-3" ref={dropdownRef}>
                <div className="hidden sm:flex items-center gap-2 text-right">
                    {/* Fix: Use `display_name` instead of `displayName`. */}
                    <span className="font-semibold text-white">{user.display_name}</span>
                    <span className="text-xs text-gray-400">{rank.title}</span>
                </div>
                <button onClick={() => setDropdownOpen(!isDropdownOpen)} className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                     {/* Fix: Use `photo_url` and `display_name`. */}
                     <img src={user.photo_url} alt={user.display_name} className="w-11 h-11 rounded-full border-2 border-transparent group-hover:border-pink-500 transition-all" />
                      <div className={`absolute inset-0 rounded-full border-2 border-pink-500 transition-all duration-300 shadow-[0_0_12px_rgba(247,37,133,0.7)] ${isDropdownOpen ? 'opacity-100' : 'opacity-0'}`}></div>
                  </div>
                </button>
              {isDropdownOpen && (
                <div className="absolute right-0 mt-3 top-full w-72 origin-top-right bg-[#1e1b25] border border-white/10 rounded-md shadow-lg z-50 animate-fade-in-down">
                  <div className="p-2">
                     <div className="px-2 py-2 border-b border-white/10">
                        <div className="flex items-center gap-3">
                           <span className="text-2xl">{rank.icon}</span>
                           <div>
                               {/* Fix: Use `display_name`. */}
                               <p className="font-semibold text-sm text-white">{user.display_name}</p>
                               <p className="text-xs text-gray-400 truncate">{rank.title} - Cấp {user.level}</p>
                           </div>
                        </div>
                        <div className="mt-3">
                           <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
                     </div>
                     <div className="py-1 mt-1">
                        <a onClick={() => handleNavClick('settings')} className={`flex items-center gap-3 px-2 py-2 text-sm rounded-md cursor-pointer ${activeTab === 'settings' ? 'bg-pink-500/20 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
                            <i className="ph-fill ph-gear"></i>
                            Cài đặt tài khoản
                        </a>
                     </div>
                     <div className="py-1 border-t border-white/10 mt-1">
                        <a onClick={logout} className="flex items-center gap-3 w-full text-left px-2 py-2 text-sm text-gray-300 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer">
                          <i className="ph-fill ph-sign-out"></i>
                          Đăng xuất
                        </a>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default CreatorHeader;