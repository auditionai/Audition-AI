import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CreatorTab } from '../../pages/CreatorPage';
import XPProgressBar from '../common/XPProgressBar';
import Logo from '../common/Logo';
import { useTranslation } from '../../hooks/useTranslation';
import LanguageSwitcher from '../common/LanguageSwitcher';
import UserAvatar from '../common/UserAvatar';
import UserName from '../common/UserName';

interface CreatorHeaderProps {
  onTopUpClick: () => void;
  activeTab: CreatorTab | 'shop' | 'profile' | 'messages' | 'admin-gallery' | 'buy-credits'; 
  onNavigate: (tab: any) => void; 
  onCheckInClick: () => void;
}

const CreatorHeader: React.FC<CreatorHeaderProps> = ({ onTopUpClick, activeTab, onNavigate, onCheckInClick }) => {
  const { user, logout, hasCheckedInToday } = useAuth();
  const { t } = useTranslation();
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
  
  const handleNavClick = (tab: any) => {
    onNavigate(tab);
    setDropdownOpen(false);
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
                  onClick={() => handleNavClick('tool')}
                  className={`themed-nav-button ${activeTab === 'tool' ? 'is-active' : ''}`}
                >
                    <i className="ph-fill ph-magic-wand text-base"></i>
                    <span className="hidden md:inline">Studio</span>
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

                <button
                  type="button"
                  onClick={() => handleNavClick('my-creations')}
                  className={`themed-nav-button creations ${activeTab === 'my-creations' ? 'is-active' : ''}`}
                  >
                    <i className="ph-fill ph-images text-base"></i>
                    <span className="hidden md:inline">{t('creator.header.nav.myCreations')}</span>
                </button>
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

            {/* Desktop User Dropdown */}
            <div className="hidden md:flex relative items-center gap-3" ref={dropdownRef}>
                <div className="hidden sm:flex flex-col items-end gap-0 text-right">
                    <span className="font-semibold text-skin-base text-sm">
                        <UserName user={user} />
                    </span>
                </div>
                <button type="button" onClick={() => setDropdownOpen(!isDropdownOpen)} className="flex items-center gap-3 cursor-pointer">
                  <UserAvatar url={user.photo_url} alt={user.display_name} frameId={user.equipped_frame_id} level={user.level} size="md" />
                </button>
              {isDropdownOpen && (
                <div className="absolute right-0 mt-3 top-full w-72 origin-top-right bg-skin-fill-modal border border-skin-border rounded-md shadow-lg z-50 animate-fade-in-down">
                  <div className="p-2">
                     <div className="px-2 py-2 border-b border-skin-border">
                        <div className="flex items-center gap-3">
                           <div>
                               <p className="font-semibold text-sm text-skin-base"><UserName user={user} /></p>
                               <p className="text-xs text-skin-muted truncate">{t('creator.header.level')} {user.level}</p>
                           </div>
                        </div>
                        <div className="mt-3">
                           <XPProgressBar currentXp={user.xp} currentLevel={user.level} />
                        </div>
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