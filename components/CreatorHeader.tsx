import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CreatorTab } from '../pages/CreatorPage';
import { getRankForLevel } from '../utils/rankUtils';
import XPProgressBar from './common/XPProgressBar';
import NotificationDropdown from './common/NotificationDropdown';
import { CHANGELOG_DATA } from '../constants/changelogData';

interface CreatorHeaderProps {
  onTopUpClick: () => void;
  activeTab: CreatorTab | 'admin-gallery'; // Add new admin tab
  onNavigate: (tab: CreatorTab | 'admin-gallery') => void;
  onCheckInClick: () => void;
}

const CreatorHeader: React.FC<CreatorHeaderProps> = ({ onTopUpClick, activeTab, onNavigate, onCheckInClick }) => {
  const { user, logout, hasCheckedInToday } = useAuth();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  
  // Check for unread notifications on mount
  useEffect(() => {
    const lastSeenId = localStorage.getItem('lastSeenChangelogId');
    const latestId = CHANGELOG_DATA[0]?.id;
    if (latestId && (!lastSeenId || Number(lastSeenId) < latestId)) {
      setHasUnread(true);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;
  
  const rank = getRankForLevel(user.level);

  const handleNavClick = (tab: CreatorTab | 'admin-gallery') => {
    onNavigate(tab);
    setDropdownOpen(false);
  }
  
  const handleNotificationClick = () => {
    setNotificationOpen(prev => !prev);
    if (hasUnread) {
      localStorage.setItem('lastSeenChangelogId', String(CHANGELOG_DATA[0].id));
      setHasUnread(false);
    }
  }

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    logout();
  };

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-[#0B0B0F]/80 backdrop-blur-lg border-b border-pink-500/10">
      <div className="container mx-auto px-4">
        <div className="flex justify-center md:justify-between items-center py-3 md:h-20">
          
          <div className="flex flex-col items-center md:items-start">
            <div className="text-2xl font-bold cursor-pointer" onClick={() => handleNavClick('tool')}>
              <span className="bg-gradient-to-r from-[#FF3FA4] to-[#CA27FF] text-transparent bg-clip-text">Audition AI Studio</span>
            </div>
            <div className="md:hidden mt-2">
                <button
                  onClick={onTopUpClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-transform active:scale-95 bg-gradient-to-r from-[#F72585] to-[#CA27FF] text-white shadow-lg shadow-[#F72585]/40"
                  style={{ animation: 'button-neon-glow 4s infinite alternate' }}
                >
                  <i className="ph-fill ph-diamonds-four text-lg"></i>
                  <span className="font-bold text-sm">{user.diamonds} Kim cương</span>
                </button>
            </div>
          </div>
          
           <nav className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
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
                <button 
                  onClick={onCheckInClick}
                  className="relative flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 shadow-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 hover:shadow-cyan-400/20"
                >
                    {!hasCheckedInToday && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500 border-2 border-[#0B0B0F]"></span>
                        </span>
                    )}
                    <i className="ph-fill ph-calendar-check text-base"></i>
                    <span className="hidden md:inline">Điểm danh</span>
                </button>
                <button 
                  onClick={() => handleNavClick('my-creations')} 
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 shadow-lg
                    ${activeTab === 'my-creations' 
                      ? 'bg-blue-400 text-black shadow-blue-400/30' 
                      : 'bg-blue-400/20 text-blue-300 hover:bg-blue-400/30 hover:shadow-blue-400/20'}`
                  }>
                    <i className="ph-fill ph-images text-base"></i>
                    <span className="hidden md:inline">Tác phẩm</span>
                </button>
                {/* Admin Gallery Button */}
                {user.is_admin && (
                    <button 
                      onClick={() => handleNavClick('admin-gallery')} 
                      className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 shadow-lg
                        ${activeTab === 'admin-gallery' 
                          ? 'bg-red-500 text-white shadow-red-500/30' 
                          : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 hover:shadow-red-400/20'}`
                      }>
                        <i className="ph-fill ph-shield-check text-base"></i>
                        <span className="hidden md:inline">Quản lý Gallery</span>
                    </button>
                )}
            </nav>
          
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={onTopUpClick}
              className="group relative flex items-center p-1 font-bold text-white bg-black/50 rounded-full transition-all duration-300 hover:-translate-y-0.5"
              style={{ animation: 'button-neon-glow 4s infinite alternate' }}
            >
              <div className="absolute -inset-px bg-gradient-to-r from-[#F72585] to-[#CA27FF] rounded-full opacity-50 group-hover:opacity-80 transition-opacity duration-300 blur-sm"></div>
              <div className="relative flex items-center gap-2 bg-black/80 px-3 py-1 rounded-full">
                  <i className="ph-fill ph-diamonds-four text-lg text-pink-400 neon-text-glow"></i>
                  <span className="text-sm">{user.diamonds}</span>
                  <span className="pl-2 text-xs font-semibold tracking-wider text-gray-400 group-hover:text-white transition-colors border-l border-white/20">NẠP</span>
              </div>
            </button>
            
            {/* Notification Bell */}
            <div className="relative" ref={notificationRef}>
                <button
                  onClick={handleNotificationClick}
                  className="p-2 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors"
                >
                    <i className="ph-fill ph-bell text-xl"></i>
                    {hasUnread && (
                         <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500 border-2 border-[#0B0B0F]"></span>
                        </span>
                    )}
                </button>
                {isNotificationOpen && <NotificationDropdown onClose={() => setNotificationOpen(false)} />}
            </div>

            <div className="relative flex items-center gap-3" ref={dropdownRef}>
                <div className="hidden sm:flex items-center gap-2 text-right">
                    <span className="font-semibold text-white">{user.display_name}</span>
                    <span className="text-xs text-gray-400">{rank.title}</span>
                </div>
                <button onClick={() => setDropdownOpen(!isDropdownOpen)} className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
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
                               <p className="font-semibold text-sm text-white">{user.display_name}</p>
                               <p className="text-xs text-gray-400 truncate">{rank.title} - Cấp {user.level}</p>
                           </div>
                        </div>
                        <div className="mt-3">
                           <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
                     </div>
                     <div className="py-1 mt-1">
                        <button onClick={() => handleNavClick('settings')} className={`flex items-center gap-3 w-full text-left px-2 py-2 text-sm rounded-md cursor-pointer ${activeTab === 'settings' ? 'bg-pink-500/20 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
                            <i className="ph-fill ph-gear"></i>
                            Cài đặt tài khoản
                        </button>
                     </div>
                     <div className="py-1 border-t border-white/10 mt-1">
                        <button onClick={handleLogout} className="flex items-center gap-3 w-full text-left px-2 py-2 text-sm text-gray-300 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer">
                          <i className="ph-fill ph-sign-out"></i>
                          Đăng xuất
                        </button>
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