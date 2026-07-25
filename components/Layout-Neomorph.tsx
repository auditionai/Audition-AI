
import React, { useState, useEffect } from 'react';
import { APP_CONFIG } from '../constants';
import { Language, Theme, ViewId, UserProfile, PromotionCampaign } from '../types';
import { Icons } from './Icons';
import { DailyCheckin } from './DailyCheckin';
import { getUserProfile, getActivePromotion } from '../services/economyService';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewId;
  onNavigate: (view: ViewId) => void;
  lang: Language;
  setLang: (l: Language) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  showCheckin: boolean;
  setShowCheckin: (show: boolean) => void;
  onLogout?: () => void | Promise<void>;
}

export const Layout: React.FC<LayoutProps> = ({
  children, currentView, onNavigate, lang, setLang, theme, setTheme, showCheckin, setShowCheckin, onLogout
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [promoConfig, setPromoConfig] = useState<PromotionCampaign | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    const handleScroll = () => setScrolled((root?.scrollTop || 0) > 20);
    const refreshUser = (force = false) => getUserProfile(force ? { force: true } : undefined).then(setUser).catch(() => setUser(null));
    const refreshPromotion = () => getActivePromotion().then(setPromoConfig).catch(() => setPromoConfig(null));
    let lastPassiveRefreshAt = 0;
    const refreshOnAttention = () => {
      const now = Date.now();
      if (now - lastPassiveRefreshAt < 15_000) {
        return;
      }
      lastPassiveRefreshAt = now;
      refreshUser();
      refreshPromotion();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshOnAttention();
      }
    };

    root?.addEventListener('scroll', handleScroll);

    refreshUser();
    refreshPromotion();

    // Listen for instant balance updates
    const handleBalanceUpdated = () => refreshUser(true);
    const handleWindowFocus = () => refreshOnAttention();
    window.addEventListener('balance_updated', handleBalanceUpdated);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
        root?.removeEventListener('scroll', handleScroll);
        window.removeEventListener('balance_updated', handleBalanceUpdated);
        window.removeEventListener('focus', handleWindowFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const dockItems = [
    { id: 'home' as ViewId, label: { vi: 'Trang chủ', en: 'Home' }, icon: 'Home' },
    { id: 'prompt_library' as ViewId, label: { vi: 'Prompt', en: 'Prompts' }, icon: 'Sparkles', badge: true },
    { id: 'tools' as ViewId, label: { vi: 'Công cụ', en: 'Tools' }, icon: 'Wand' },
    { id: 'gallery' as ViewId, label: { vi: 'Lịch sử', en: 'Gallery' }, icon: 'Image' },
  ];

  const showMarquee = promoConfig?.isActive && promoConfig?.marqueeText;
  const isAccountLocked = user?.accountStatus === 'locked';
  const accountWarning = user?.accountWarning?.trim();
  const lockedAtText = user?.lockedAt
    ? new Date(user.lockedAt).toLocaleString('vi-VN', {
        hour12: false,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="min-h-screen bg-neomorph-base text-text-primary font-sans selection:bg-primary selection:text-white relative overflow-x-hidden">
      {showCheckin && <DailyCheckin onClose={() => setShowCheckin(false)} onSuccess={() => getUserProfile({ force: true }).then(setUser)} lang={lang === 'vi' ? 'vi' : 'en'} />}

      {accountWarning && !isAccountLocked && (
          <div className={`${showMarquee ? 'top-9' : 'top-2'} fixed left-1/2 z-[80] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 neomorph-raised px-4 py-3 text-sm`}>
              <div className="flex items-start gap-3">
                  <Icons.AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                  <div>
                      <div className="font-bold text-text-primary">Cảnh báo tài khoản</div>
                      <div className="text-text-secondary">{accountWarning}</div>
                  </div>
              </div>
          </div>
      )}

      {isAccountLocked && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
              <div className="w-full max-w-lg neomorph-float p-8 text-center animate-fade-in">
                  <div className="mx-auto mb-5 neomorph-icon w-20 h-20">
                      <Icons.Lock className="h-10 w-10 text-secondary" />
                  </div>
                  <h2 className="text-2xl font-black text-text-primary font-accent">Tài khoản đã bị khóa</h2>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                      Tài khoản này đang bị tạm khóa do hệ thống phát hiện dấu hiệu vi phạm hoặc lạm dụng tính năng.
                  </p>
                  <div className="mt-5 space-y-3 neomorph-inset p-4 text-left text-sm">
                      <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Lý do</div>
                          <div className="mt-1 text-text-primary">{user?.lockReason || 'Vi phạm quy định sử dụng hệ thống.'}</div>
                      </div>
                      {lockedAtText && (
                          <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Thời gian khóa</div>
                              <div className="mt-1 text-text-primary">{lockedAtText}</div>
                          </div>
                      )}
                      <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Tài khoản</div>
                          <div className="mt-1 break-all text-text-primary">{user?.email}</div>
                      </div>
                  </div>
                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <a href="mailto:support@auditionai.vn" className="neomorph-btn px-4 py-3 text-sm font-bold text-text-primary hover:text-primary transition-colors">
                          Liên hệ hỗ trợ
                      </a>
                      <button onClick={() => void onLogout?.()} className="neomorph-btn px-4 py-3 text-sm font-bold text-text-secondary hover:text-text-primary transition-colors">
                          Đăng xuất
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- PROMOTION MARQUEE --- */}
      {showMarquee && (
          <div className="fixed top-0 left-0 right-0 h-8 gradient-primary z-[60] flex items-center overflow-hidden border-b border-white/20 shadow-lg">
              <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap flex gap-10 items-center font-accent text-xs font-bold text-white uppercase tracking-widest">
                  <span>{promoConfig.marqueeText}</span>
                  <span>{promoConfig.marqueeText}</span>
                  <span>{promoConfig.marqueeText}</span>
              </div>
          </div>
      )}

      {/* --- HEADER --- */}
      <header className={`fixed ${showMarquee ? 'top-8' : 'top-0'} left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'py-2' : 'py-4 md:py-5'}`}>
         <div className={`max-w-7xl mx-auto px-4 md:px-6 neomorph-flat py-3 ${scrolled ? 'shadow-lg' : ''} transition-all`}>
            <div className="flex justify-between items-center">
               {/* Logo */}
               <div
                 data-tour-id="desktop.layout.logo"
                 className="flex items-center gap-3 cursor-pointer group"
                 onClick={() => onNavigate('home')}
               >
                   <div className="w-10 h-10 md:w-12 md:h-12 neomorph-icon gradient-primary p-2 group-hover:scale-105 transition-transform">
                       <Icons.Sparkles className="text-white w-full h-full" />
                   </div>
                   <div className="flex flex-col">
                       <span className="font-accent text-xl md:text-2xl font-bold tracking-wider text-text-primary leading-none">
                           AUDITION
                       </span>
                       <span className="text-[10px] font-bold text-primary tracking-[0.3em] uppercase">AI STUDIO</span>
                   </div>
               </div>

               {/* Right section */}
               <div className="flex items-center gap-3">
                    <button
                       data-tour-id="desktop.layout.language"
                       onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
                       className="neomorph-btn px-3 py-1.5 text-[10px] font-bold text-text-secondary hover:text-primary transition-colors uppercase tracking-wider"
                   >
                       {lang === 'vi' ? 'VN' : 'EN'}
                   </button>
               </div>
            </div>
         </div>
      </header>

      <main className={`relative z-10 ${showMarquee ? 'pt-32' : 'pt-24'} pb-32 min-h-screen`}>
         <div className={`${currentView === 'admin' ? 'w-full max-w-[1920px] px-4 xl:px-6 2xl:px-8' : 'max-w-7xl px-4 md:px-6'} mx-auto animate-fade-in`}>
             {children}
         </div>
      </main>

      {/* --- DOCK NAVIGATION --- */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex justify-center w-auto">
          <div data-tour-id="desktop.layout.dock" className="neomorph-float px-4 py-3 flex items-center gap-6 animate-slide-in-right">

              {/* Main nav icons */}
              <div className="flex items-center gap-2">
                {dockItems.map((item) => {
                    const Icon = Icons[item.icon as keyof typeof Icons];
                    const isActive = currentView === item.id;
                    return (
                        <button
                          key={item.id}
                          data-tour-id={`desktop.layout.nav.${item.id}`}
                          onClick={() => onNavigate(item.id)}
                          className={`relative group flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all duration-300 ${
                            isActive ? 'neomorph-inset' : 'neomorph-flat hover:neomorph-raised'
                          }`}
                        >
                            {item.badge && !isActive && (
                                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-secondary shadow-lg" />
                            )}
                            <Icon className={`w-5 h-5 md:w-6 md:h-6 transition-all duration-300 ${
                              isActive ? 'text-primary scale-110' : 'text-text-secondary group-hover:text-primary'
                            }`} />
                            {isActive && <div className="absolute bottom-2 w-1 h-1 rounded-full bg-primary"></div>}
                        </button>
                    );
                })}
              </div>

              <div className="w-px h-8 bg-text-muted/30"></div>

              {/* VCoin & Profile */}
              <div className="flex items-center gap-3">
                  {/* Balance */}
                  <button
                    data-tour-id="desktop.layout.vcoin"
                    onClick={() => onNavigate('topup')}
                    className="flex items-center gap-2 neomorph-btn px-3 py-2 hover:neomorph-raised transition-all group"
                  >
                       <Icons.Gem className="w-3.5 h-3.5 text-secondary group-hover:rotate-12 transition-transform" />
                       <div className="flex flex-col leading-none">
                           <span className="text-sm font-bold text-primary font-accent">{user?.vcoin_balance?.toLocaleString() || 0}</span>
                           <span className="text-[8px] text-text-muted font-bold uppercase">VCOIN</span>
                       </div>
                       <Icons.ArrowUp className="w-3 h-3 text-secondary" />
                  </button>

                  {/* Avatar */}
                  <button
                      data-tour-id="desktop.layout.profile"
                      onClick={() => onNavigate('settings')}
                      className={`relative w-11 h-11 md:w-12 md:h-12 rounded-full overflow-hidden transition-all group ${
                        currentView === 'settings' ? 'neomorph-inset ring-2 ring-primary' : 'neomorph-raised hover:neomorph-float'
                      }`}
                  >
                      <img
                        src={user?.avatar || "https://picsum.photos/100/100"}
                        alt="User"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={(e) => { e.currentTarget.src = "https://picsum.photos/100/100"; }}
                      />
                  </button>
              </div>

          </div>
      </div>

    </div>
  );
};
