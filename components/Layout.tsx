
import React, { useState, useEffect } from 'react';
import { APP_CONFIG } from '../constants';
import { Language, Theme, ViewId, UserProfile, PromotionConfig } from '../types';
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
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, currentView, onNavigate, lang, setLang, theme, setTheme, showCheckin, setShowCheckin
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [promoConfig, setPromoConfig] = useState<PromotionConfig | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    // Initial User Load
    const refreshUser = () => getUserProfile().then(setUser);
    refreshUser();
    
    // Load Marquee
    getActivePromotion().then(config => {
        setPromoConfig(config);
    });
    
    // Listen for instant balance updates
    window.addEventListener('balance_updated', refreshUser);

    // Interval to refresh user balance (fallback)
    const interval = setInterval(refreshUser, 5000); // Relaxed to 5s since we have events

    return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('balance_updated', refreshUser);
        clearInterval(interval);
    };
  }, []);

  const dockItems = APP_CONFIG.ui.menu.filter(item => 
    ['home', 'tools', 'gallery'].includes(item.id)
  );

  const showMarquee = promoConfig?.isActive && promoConfig?.marqueeText;

  return (
    <div className="min-h-screen bg-[#05050A] text-white font-sans selection:bg-audi-pink selection:text-white relative overflow-x-hidden">
      
      {/* Checkin Modal */}
      {showCheckin && <DailyCheckin onClose={() => setShowCheckin(false)} onSuccess={() => getUserProfile().then(setUser)} lang={lang === 'vi' ? 'vi' : 'en'} />}

      {/* --- PROMOTION MARQUEE --- */}
      {showMarquee && (
          <div className="fixed top-0 left-0 right-0 h-8 bg-gradient-to-r from-audi-purple via-audi-pink to-audi-cyan z-[60] flex items-center overflow-hidden border-b border-white/20 shadow-[0_0_15px_#FF0099]">
              <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap flex gap-10 items-center font-game text-xs font-bold text-black uppercase tracking-widest">
                  <span>{promoConfig.marqueeText}</span>
                  <span>{promoConfig.marqueeText}</span>
                  <span>{promoConfig.marqueeText}</span>
              </div>
          </div>
      )}

      {/* --- BACKGROUND --- */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
         <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-audi-purple/10 rounded-full blur-[120px] animate-float"></div>
         <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-audi-cyan/10 rounded-full blur-[120px] animate-float" style={{animationDelay: '3s'}}></div>
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]"></div>
      </div>

      {/* --- HEADER --- */}
      <header className={`fixed ${showMarquee ? 'top-8' : 'top-0'} left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'py-2 bg-black/40 backdrop-blur-md' : 'py-4 md:py-6'}`}>
         <div className="max-w-7xl mx-auto px-4 md:px-6 flex justify-between items-center">
            
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => onNavigate('home')}
            >
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-tr from-audi-pink to-audi-purple flex items-center justify-center shadow-[0_0_20px_rgba(255,0,153,0.3)] border border-white/20 backdrop-blur-md group-hover:scale-105 transition-transform">
                    <Icons.Sparkles className="text-white w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="flex flex-col">
                    <span className="font-game text-xl md:text-2xl font-bold tracking-widest text-white leading-none drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                        AUDITION
                    </span>
                    <span className="text-[10px] font-bold text-audi-cyan tracking-[0.4em] uppercase">AI STUDIO</span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                 <button 
                    onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
                    className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 hover:text-white hover:border-audi-cyan transition-colors uppercase tracking-wider"
                >
                    {lang === 'vi' ? 'VN' : 'EN'}
                </button>
            </div>
         </div>
      </header>

      <main className={`relative z-10 ${showMarquee ? 'pt-32' : 'pt-24'} pb-32 min-h-screen`}>
         <div className="max-w-7xl mx-auto px-4 md:px-6 animate-fade-in">
             {children}
         </div>
      </main>

      {/* --- DOCK --- */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex justify-center w-auto">
          
          <div className="relative backdrop-blur-2xl bg-[#0c0c14]/90 border border-white/10 rounded-[2.5rem] p-2 pl-3 pr-3 shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex items-center gap-3 md:gap-6 animate-slide-in-right">
              
              <div className="absolute -inset-1 bg-gradient-to-r from-audi-pink/20 via-audi-purple/20 to-audi-cyan/20 blur-xl -z-10 rounded-[3rem] opacity-50"></div>
              
              <div className="flex items-center gap-1 md:gap-2">
                {dockItems.map((item) => {
                    const Icon = Icons[item.icon as keyof typeof Icons];
                    const isActive = currentView === item.id;
                    return (
                        <button
                          key={item.id}
                          onClick={() => onNavigate(item.id)}
                          className={`relative group flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-[1.5rem] transition-all duration-300 ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                        >
                            <Icon className={`w-5 h-5 md:w-6 md:h-6 transition-all duration-300 ${isActive ? 'text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'text-slate-500 group-hover:text-slate-300'}`} />
                            {isActive && <div className="absolute bottom-2 w-1 h-1 rounded-full bg-audi-cyan shadow-[0_0_5px_#21D4FD]"></div>}
                        </button>
                    );
                })}
              </div>

              <div className="w-px h-8 bg-white/10"></div>

              <div className="flex items-center gap-2 md:gap-4">
                  
                  {/* Balance / Top Up */}
                  <button 
                    onClick={() => onNavigate('topup')}
                    className="flex items-center gap-2 bg-black/40 hover:bg-white/10 px-3 py-1.5 rounded-full border border-audi-yellow/20 hover:border-audi-yellow transition-all group"
                  >
                       <Icons.Gem className="w-3 h-3 text-audi-yellow group-hover:animate-spin" />
                       <div className="flex flex-col leading-none">
                           <span className="text-sm font-bold text-audi-yellow font-game">{user?.balance || 0}</span>
                           <span className="text-[8px] text-audi-yellow/50 font-bold uppercase">VCOIN</span>
                       </div>
                       <div className="w-4 h-4 rounded-full bg-audi-yellow text-black flex items-center justify-center ml-1">
                           <Icons.ArrowUp className="w-2.5 h-2.5" />
                       </div>
                  </button>

                   {/* Mobile Checkin */}
                   <button 
                      onClick={() => setShowCheckin(true)}
                      className="md:hidden w-10 h-10 rounded-full bg-audi-lime/10 border border-audi-lime/30 flex items-center justify-center"
                   >
                       <Icons.Calendar className="w-4 h-4 text-audi-lime" />
                   </button>

                  <button 
                      onClick={() => onNavigate('settings')}
                      className={`relative w-11 h-11 md:w-12 md:h-12 rounded-full overflow-hidden border-2 transition-all group ${currentView === 'settings' ? 'border-audi-pink shadow-[0_0_15px_rgba(255,0,153,0.5)]' : 'border-white/10 hover:border-audi-pink'}`}
                  >
                      <img src={user?.avatar || "https://picsum.photos/100/100"} alt="User" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </button>
              </div>

          </div>
      </div>

    </div>
  );
};
