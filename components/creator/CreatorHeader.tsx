
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import { getRankForLevel } from '../../utils/rankUtils';
import XPProgressBar from '../common/XPProgressBar';
import NotificationDropdown from './NotificationDropdown';
import Logo from '../common/Logo';
import { useTranslation } from '../../hooks/useTranslation';
import LanguageSwitcher from '../common/LanguageSwitcher';
import UserAvatar from '../common/UserAvatar';
import UserBadge from '../common/UserBadge';
import UserName from '../common/UserName'; // Import UserName

interface CreatorHeaderProps {
  onTopUpClick: () => void;
  activeTab: CreatorTab | 'admin-gallery' | 'shop' | 'profile' | 'messages'; 
  onNavigate: (tab: any) => void; 
  onCheckInClick: () => void;
}

const CreatorHeader: React.FC<CreatorHeaderProps> = ({ onTopUpClick, activeTab, onNavigate, onCheckInClick }) => {
  const { user, logout, hasCheckedInToday, supabase } = useAuth();
  const { t } = useTranslation();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  
  // 1. Fetch Unread Count Function
  const fetchUnreadCount = useCallback(async () => {
      if (!user || !supabase) return;
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      
      setUnreadCount(count || 0);
  }, [user, supabase]);

  // 2. Polling Strategy (Backup Layer) - Checks every 15 seconds
  useEffect(() => {
      fetchUnreadCount(); // Initial fetch
      
      const intervalId = setInterval(() => {
          fetchUnreadCount();
      }, 15000); // 15 seconds

      return () => clearInterval(intervalId);
  }, [fetchUnreadCount]);

  // 3. Realtime Strategy (Instant Layer)
  useEffect(() => {
    if (!user || !supabase) return;

    // USE A UNIQUE CHANNEL NAME PER USER
    const channel = supabase.channel(`user-notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', // We mostly care about new notifications
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${user.id}` // Explicitly filter by recipient_id
      }, (payload) => {
         console.log('New notification received!', payload);
         fetchUnreadCount(); // Refresh count immediately
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase, fetchUnreadCount]);

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

  const handleNavClick = (tab: any) => {
    onNavigate(tab);
    setDropdownOpen(false);
  }
  
  const handleNotificationClick = () => {
    setNotificationOpen(prev => !prev);
  }

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    logout();
  };

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-skin-fill/95 backdrop-blur-lg border-b border-skin-border shadow-lg transition-all">
      
      <div className="container mx-auto px-3 md:px-4">
        <div className="flex justify-between items-center h-16 md:h-20">
          
          {/* Left: Logo */}
          <div className="flex-shrink-0 transform scale-90 md:scale-100 origin-left">
             <Logo onClick={() => handleNavClick('tool')} />
          </div>
          
          {/* Center: Desktop Navigation */}
           <nav className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleNavClick('leaderboard')}
                  className={`themed-nav-button leaderboard ${activeTab === 'leaderboard' ? 'is-active' : ''}`}
                  >
                    <i className="ph-fill ph-crown-simple text-base"></i>
                    <span className="hidden md:inline">{t('creator.header.nav.leaderboard')}</span>
                </button>
                <button
                  type="button"
                  onClick={onCheckInClick}
                  className="themed-nav-button checkin"
                >
                    {!hasCheckedInToday && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                            <span className="notification-dot-ping animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"></span>
                            <span className="notification-dot relative inline-flex rounded-full h-3 w-3 border-2"></span>
                        </span>
                    )}
                    <i className="ph-fill ph-calendar-check text-base"></i>
                    <span className="hidden md:inline">{t('creator.header.nav.checkIn')}</span>
                </button>
                
                {/* Shop Button */}
                <button
                  type="button"
                  onClick={() => handleNavClick('shop')}
                  className={`themed-nav-button shop ${activeTab === 'shop' ? 'is-active' : ''}`}
                  >
                    <i className="ph-fill ph-storefront text-base"></i>
                    <span className="hidden md:inline">{t('creator.header.nav.shop')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('my-creations')}
                  className={`themed-nav-button creations ${activeTab === 'my-creations' ? 'is-active' : ''}`}
                  >
                    <i className="ph-fill ph-images text-base"></i>
                    <span className="hidden md:inline">{t('creator.header.nav.myCreations')}</span>
                </button>
                
                {/* Admin Gallery Button */}
                {user.is_admin && (
                    <button
                      type="button"
                      onClick={() => handleNavClick('admin-gallery')}
                      className={`themed-nav-button admin ${activeTab === 'admin-gallery' ? 'is-active' : ''}`}
                      >
                        <i className="ph-fill ph-shield-check text-base"></i>
                        <span className="hidden md:inline">{t('creator.header.nav.adminGallery')}</span>
                    </button>
                )}
            </nav>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* Language Switcher (Desktop Only - Hidden on Mobile) */}
            <div className="hidden md:block">
                <LanguageSwitcher />
            </div>

            {/* Mobile Top Up (Pill Style) */}
            <button
              type="button"
              onClick={onTopUpClick}
              className="md:hidden flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-[#1E1B25] border border-skin-border shadow-sm active:scale-95 transition-transform"
            >
              <div className="w-5 h-5 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center shadow-inner">
                  <i className="ph-fill ph-diamonds-four text-white text-[10px]"></i>
              </div>
              <span className="font-black text-xs text-white">{user.diamonds}</span>
            </button>
            
            {/* Desktop Top Up */}
            <div className="hidden md:block">
              <button type="button" onClick={onTopUpClick} className="themed-top-up-button">
                  <div className="themed-top-up-button__icon-wrapper">
                      <i className="ph-fill ph-diamonds-four"></i>
                  </div>
                  <div className="themed-top-up-button__content-wrapper">
                      <span className="themed-top-up-button__amount">{user.diamonds.toLocaleString()}</span>
                      <span className="themed-top-up-button__action">{t('creator.header.topUp.action')}</span>
                  </div>
              </button>
            </div>
            
            {/* Mobile Check-in Button (Icon Only) */}
            <button 
                type="button" 
                onClick={onCheckInClick}
                className="md:hidden relative text-skin-muted hover:text-skin-base active:scale-95 transition-transform"
            >
                <i className="ph-fill ph-calendar-check text-2xl"></i>
                {!hasCheckedInToday && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-[#12121A]"></span>
                    </span>
                )}
            </button>

            {/* Notification & Messages Group */}
            <div className="flex items-center gap-1 md:bg-white/5 md:rounded-full md:p-1 md:border md:border-white/5">
                {/* Messages Button */}
                <button
                  type="button"
                  onClick={() => handleNavClick('messages')}
                  className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-colors ${activeTab === 'messages' ? 'bg-skin-accent text-white' : 'text-skin-muted hover:text-skin-base md:hover:bg-white/10'}`}
                  title={t('creator.header.nav.messages')}
                >
                    <i className="ph-fill ph-chat-centered-text text-2xl md:text-lg"></i>
                </button>

                {/* Notification Bell */}
                <div className="relative" ref={notificationRef}>
                    <button
                      type="button"
                      onClick={handleNotificationClick}
                      className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isNotificationOpen ? 'md:bg-skin-fill-secondary text-skin-accent' : 'text-skin-muted hover:text-skin-base md:hover:bg-white/10'}`}
                    >
                        <i className={`ph-fill ${isNotificationOpen ? 'ph-bell-ringing' : 'ph-bell'} text-2xl md:text-lg`}></i>
                        {unreadCount > 0 && (
                             <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)] border border-[#12121A]"></span>
                        )}
                    </button>
                    {isNotificationOpen && <NotificationDropdown onClose={() => setNotificationOpen(false)} onRead={() => setUnreadCount(0)} />}
                </div>
            </div>

            {/* Desktop User Dropdown */}
            <div className="hidden md:flex relative items-center gap-3" ref={dropdownRef}>
                <div className="hidden sm:flex flex-col items-end gap-0 text-right">
                    <span className="font-semibold text-skin-base text-sm">
                        <UserName user={user} />
                    </span>
                    <UserBadge titleId={user.equipped_title_id} level={user.level} className="scale-90 origin-right" />
                </div>
                <button type="button" onClick={() => setDropdownOpen(!isDropdownOpen)} className="flex items-center gap-3 cursor-pointer">
                  <UserAvatar url={user.photo_url} alt={user.display_name} frameId={user.equipped_frame_id} level={user.level} size="md" />
                </button>
              {isDropdownOpen && (
                <div className="absolute right-0 mt-3 top-full w-72 origin-top-right bg-skin-fill-modal border border-skin-border rounded-md shadow-lg z-50 animate-fade-in-down">
                  <div className="p-2">
                     <div className="px-2 py-2 border-b border-skin-border">
                        <div className="flex items-center gap-3">
                           <span className="text-2xl">{rank.icon}</span>
                           <div>
                               <p className="font-semibold text-sm text-skin-base"><UserName user={user} /></p>
                               <p className="text-xs text-skin-muted truncate">{rank.title} - {t('creator.header.level')} {user.level}</p>
                           </div>
                        </div>
                        <div className="mt-3">
                           <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
                     </div>
                     
                     <div className="py-1 mt-1">
                        <button type="button" onClick={() => handleNavClick('profile')} className="flex items-center gap-3 w-full text-left px-2 py-2 text-sm rounded-md cursor-pointer text-skin-base hover:bg-white/10 font-bold">
                            <i className="ph-fill ph-user-circle text-pink-400"></i>
                            {t('creator.header.nav.profile')}
                        </button>
                     </div>

                     <div className="py-1">
                        <button type="button" onClick={() => handleNavClick('settings')} className={`flex items-center gap-3 w-full text-left px-2 py-2 text-sm rounded-md cursor-pointer ${activeTab === 'settings' ? 'bg-skin-accent/20 text-skin-base' : 'text-skin-muted hover:bg-white/10'}`}>
                            <i className="ph-fill ph-gear"></i>
                            {t('creator.header.userMenu.settings')}
                        </button>
                     </div>
                     <div className="py-1 border-t border-skin-border mt-1">
                        <button type="button" onClick={handleLogout} className="flex items-center gap-3 w-full text-left px-2 py-2 text-sm text-skin-muted rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer">
                          <i className="ph-fill ph-sign-out"></i>
                          {t('creator.header.userMenu.logout')}
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
