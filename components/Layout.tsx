import React, { useState, useEffect } from 'react';
import { Language, Theme, ViewId, UserProfile, PromotionCampaign, Feature } from '../types';
import { Icons } from './Icons';
import { DailyCheckin } from './DailyCheckin';
import { getUserProfile, getActivePromotion } from '../services/economyService';
import { useConcurrency, CONCURRENCY_LIMITS } from '../services/concurrencyService';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewId;
  selectedFeature?: Feature | null;
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
  children, currentView, selectedFeature, onNavigate, lang, setLang, theme, setTheme, showCheckin, setShowCheckin, onLogout
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [promoConfig, setPromoConfig] = useState<PromotionCampaign | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queuePanelExpanded, setQueuePanelExpanded] = useState(true);

  const { queueStats, triggerPoll } = useConcurrency();
  const showMarquee = Boolean(promoConfig?.isActive && promoConfig.marqueeText?.trim());

  useEffect(() => {
    const refreshUser = (force = false) => getUserProfile(force ? { force: true } : undefined).then(setUser).catch(() => setUser(null));
    const refreshPromotion = () => getActivePromotion().then(setPromoConfig).catch(() => setPromoConfig(null));
    
    refreshUser();
    refreshPromotion();

    const handleBalanceUpdated = () => refreshUser(true);
    window.addEventListener('balance_updated', handleBalanceUpdated);

    return () => {
      window.removeEventListener('balance_updated', handleBalanceUpdated);
    };
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const navItems = [
    { id: 'home' as ViewId, label: { vi: 'Trang Chủ', en: 'Home' }, icon: Icons.Home },
    { id: 'tools' as ViewId, label: { vi: 'Tạo Ảnh AI', en: 'AI Image' }, icon: Icons.Sparkles, badge: 'HOT' },
    { id: 'video' as ViewId, label: { vi: 'Tạo Video AI', en: 'AI Video' }, icon: Icons.Video },
    { id: 'prompt_library' as ViewId, label: { vi: 'Thư Viện Câu Lệnh', en: 'Prompt Library' }, icon: Icons.BookOpen },
    { id: 'topup' as ViewId, label: { vi: 'Nạp Vcoin', en: 'Store Vcoin' }, icon: Icons.Gem, highlight: true },
    { id: 'gallery' as ViewId, label: { vi: 'Lịch Sử Tạo', en: 'Generation History' }, icon: Icons.History },
    ...(user?.role === 'admin' ? [{ id: 'admin' as ViewId, label: { vi: 'Quản Trị Admin', en: 'Admin Portal' }, icon: Icons.Shield }] : []),
  ];

  const isAccountLocked = user?.accountStatus === 'locked';

  return (
    <div className="flex h-screen neu-base transition-colors duration-300 relative overflow-hidden font-sans">
      
      {showCheckin && (
        <DailyCheckin 
          onClose={() => setShowCheckin(false)} 
          onSuccess={() => getUserProfile({ force: true }).then(setUser)} 
          lang={lang === 'vi' ? 'vi' : 'en'} 
        />
      )}

      {/* Account Locked Overlay */}
      {isAccountLocked && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-lg neu-card p-8 text-center rounded-3xl animate-fade-in">
            <div className="mx-auto mb-5 neu-inset-md w-20 h-20 rounded-full flex items-center justify-center text-red-500">
              <Icons.Lock className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold font-accent text-red-500">Tài khoản tạm bị khóa</h2>
            <p className="mt-3 text-xs text-slate-400">
              Tài khoản này đang bị khóa do vi phạm điều khoản sử dụng hệ thống.
            </p>
            <div className="mt-6 flex gap-3">
              <a href="mailto:support@auditionai.vn" className="flex-1 neu-button-primary py-3 rounded-2xl text-xs font-bold text-center">
                Liên hệ hỗ trợ
              </a>
              {onLogout && (
                <button onClick={() => void onLogout()} className="flex-1 neu-button py-3 rounded-2xl text-xs font-bold text-slate-400">
                  Đăng xuất
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          1. LEFT ORBIT COMMAND DECK (Thanh menu dọc 3D thu nhỏ được)
         ==================================================== */}
      <aside className={`hidden lg:flex flex-col justify-between ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      } neu-raised-md m-3 rounded-3xl p-4 z-40 shrink-0 transition-all duration-300 relative`}>
        
        {/* Top Brand Logo */}
        <div className="space-y-6">
          <div 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 cursor-pointer group px-1 py-1"
          >
            <div className="w-12 h-12 neu-raised-sm rounded-2xl flex items-center justify-center text-[#FF007F] group-hover:scale-110 transition-transform bg-gradient-to-br from-[#FF007F]/20 to-[#00F2FE]/20 shrink-0">
              <Icons.Sparkles className="w-6 h-6 text-[#FF007F] animate-pulse" />
            </div>
            {!sidebarCollapsed && (
              <div className="animate-fade-in min-w-0">
                <div className="font-accent font-black text-base text-slate-900 dark:text-white leading-none tracking-wider truncate">
                  AUDITION <span className="text-[#FF007F]">AI</span>
                </div>
                <span className="text-[9px] font-extrabold text-emerald-500 font-mono tracking-widest block mt-1">3D CYBER STUDIO</span>
              </div>
            )}
          </div>

          {/* Navigation Menu Links */}
          <nav className="space-y-2.5">
            {navItems.map((item) => {
              const isVideoWorkspace = currentView === 'tool_workspace' && (selectedFeature?.toolType === 'video' || selectedFeature?.id === 'video_ai_gen');
              const isImageWorkspace = currentView === 'tool_workspace' && !isVideoWorkspace;

              const isActive = currentView === item.id || 
                (item.id === 'video' && isVideoWorkspace) ||
                (item.id === 'tools' && isImageWorkspace);

              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={sidebarCollapsed ? item.label[lang] : undefined}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl transition-all text-xs font-black group ${
                    isActive 
                      ? 'neu-inset-sm text-[#FF007F] ring-2 ring-[#FF007F]' 
                      : 'neu-button text-slate-700 dark:text-slate-300 hover:text-[#FF007F]'
                  }`}
                >
                  <div className={`p-1 rounded-xl transition-transform group-hover:scale-110 shrink-0 ${isActive ? 'text-[#FF007F]' : 'text-slate-500'}`}>
                    <IconComp className="w-5 h-5" />
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <span className="font-accent uppercase tracking-wider truncate">{item.label[lang]}</span>
                      {item.badge && (
                        <span className="ml-auto px-2 py-0.5 rounded-full text-[9px] font-black text-white bg-gradient-to-r from-red-500 to-[#FF007F] shadow-sm">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Luồng Xử Lý + Vcoin Balance & User Profile Account */}
        <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          
          {/* LUỒNG XỬ LÝ (Processing Queue Status Box) */}
          {!sidebarCollapsed ? (
            <div className="neu-inset-sm p-3 rounded-2xl border border-slate-300 dark:border-slate-800 space-y-2">
              {/* Header Title & Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-black text-[#FF007F] dark:text-[#00F2FE] font-accent uppercase tracking-wider">
                  <Icons.Activity className="w-3.5 h-3.5 text-[#FF007F] dark:text-[#00F2FE] animate-pulse shrink-0" />
                  <span>Luồng xử lý</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => triggerPoll()}
                    className="p-1 rounded-lg text-slate-700 dark:text-slate-400 hover:text-[#FF007F] transition-colors"
                    title="Làm mới luồng"
                  >
                    <Icons.RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setQueuePanelExpanded(!queuePanelExpanded)}
                    className="p-1 rounded-lg text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                  >
                    {queuePanelExpanded ? <Icons.ChevronUp className="w-3.5 h-3.5" /> : <Icons.ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {queuePanelExpanded && (
                <div className="space-y-2 pt-1 text-[11px] animate-fade-in font-sans">
                  {/* CỦA BẠN */}
                  <div>
                    <div className="text-[9px] font-black uppercase text-slate-800 dark:text-slate-400 tracking-wider mb-1 font-accent">
                      CỦA BẠN
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-950 dark:text-slate-200">Đang xử lý</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black font-mono bg-cyan-500/25 dark:bg-cyan-500/20 text-cyan-900 dark:text-cyan-400 border border-cyan-500/60">
                          {queueStats.myImageProcessing + queueStats.myVideoProcessing}/{CONCURRENCY_LIMITS.user.imageProcessing}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-950 dark:text-slate-200">Hàng chờ</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black font-mono bg-amber-500/25 dark:bg-amber-500/20 text-amber-900 dark:text-amber-400 border border-amber-500/60">
                          {queueStats.myQueued}/{CONCURRENCY_LIMITS.user.queued}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-300 dark:border-slate-800/80 my-1.5"></div>

                  {/* HỆ THỐNG */}
                  <div>
                    <div className="text-[9px] font-black uppercase text-slate-800 dark:text-slate-400 tracking-wider mb-1 font-accent">
                      HỆ THỐNG
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-950 dark:text-slate-200">Ảnh</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black font-mono bg-slate-300 dark:bg-slate-800 text-slate-950 dark:text-slate-200 border border-slate-400 dark:border-transparent">
                          {queueStats.systemImageProcessing}/{CONCURRENCY_LIMITS.system.imageProcessing}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-950 dark:text-slate-200">Video</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black font-mono bg-slate-300 dark:bg-slate-800 text-slate-950 dark:text-slate-200 border border-slate-400 dark:border-transparent">
                          {queueStats.systemVideoProcessing}/{CONCURRENCY_LIMITS.system.videoProcessing}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-950 dark:text-slate-200">Hàng chờ chung</span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black font-mono bg-orange-500/25 dark:bg-orange-500/20 text-orange-950 dark:text-orange-400 border border-orange-500/60">
                          {queueStats.systemQueued}/{CONCURRENCY_LIMITS.system.queued}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div 
              onClick={() => triggerPoll()}
              className="neu-inset-sm p-2 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-[#FF007F] transition-all"
              title={`Luồng xử lý: Của bạn ${queueStats.myImageProcessing + queueStats.myVideoProcessing}/${CONCURRENCY_LIMITS.user.imageProcessing} | Hệ thống ${queueStats.systemImageProcessing}/${CONCURRENCY_LIMITS.system.imageProcessing}`}
            >
              <Icons.Activity className="w-4 h-4 text-[#FF007F] dark:text-[#00F2FE] animate-pulse" />
              <span className="text-[9px] font-mono font-black text-[#FF007F] dark:text-cyan-400 mt-0.5">
                {queueStats.myImageProcessing + queueStats.myVideoProcessing}/{CONCURRENCY_LIMITS.user.imageProcessing}
              </span>
            </div>
          )}

          {/* Vcoin Balance Display Badge */}
          <div 
            onClick={() => onNavigate('topup')}
            className={`neu-inset-sm ${sidebarCollapsed ? 'p-2 justify-center' : 'px-3.5 py-2.5 justify-between'} rounded-2xl flex items-center cursor-pointer hover:ring-2 hover:ring-[#FF007F] transition-all`}
            title="Nạp Vcoin Ngay"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icons.Gem className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="font-accent font-black text-xs text-slate-950 dark:text-white truncate">
                    {user ? (user.vcoin_balance || 0).toLocaleString() : 0}
                  </div>
                  <div className="text-[9px] font-black text-[#FF007F] dark:text-[#00F2FE] uppercase">Vcoin</div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <div className="w-6 h-6 neu-raised-sm rounded-xl flex items-center justify-center text-[#FF007F] shrink-0">
                <Icons.Plus className="w-3.5 h-3.5" />
              </div>
            )}
          </div>

          {/* User Profile Pill & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className={`w-full neu-button ${sidebarCollapsed ? 'p-1.5 justify-center' : 'p-1.5 pr-3 justify-between'} rounded-2xl flex items-center gap-2`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img 
                  src={user?.avatar || 'https://picsum.photos/100/100'} 
                  alt="User" 
                  className="w-8 h-8 rounded-xl object-cover neu-raised-sm shrink-0"
                  onError={(e) => (e.currentTarget.src = 'https://picsum.photos/100/100')}
                />
                {!sidebarCollapsed && (
                  <div className="text-left min-w-0">
                    <div className="font-accent text-xs font-black text-slate-900 dark:text-white truncate">
                      {user?.username || (user as any)?.display_name || 'Creator'}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500 truncate">
                      {user?.role === 'admin' ? '⚡ Quản Trị Viên' : 'Thành Viên VIP'}
                    </div>
                  </div>
                )}
              </div>
              {!sidebarCollapsed && <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </button>

            {/* Profile Dropdown Menu */}
            {profileMenuOpen && (
              <div 
                className="absolute bottom-14 left-0 w-60 neu-raised-xl rounded-3xl p-3 z-50 animate-fade-in shadow-2xl border border-slate-200 dark:border-slate-800"
                onClick={() => setProfileMenuOpen(false)}
              >
                <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 mb-2">
                  <div className="text-xs font-black truncate text-slate-900 dark:text-white">
                    {user?.username || (user as any)?.display_name || 'Creator AI'}
                  </div>
                  <div className="text-[10px] font-medium text-slate-500 truncate">{user?.email}</div>
                </div>

                <button 
                  onClick={() => onNavigate('settings')} 
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-black text-slate-800 dark:text-slate-200 hover:neu-inset-sm transition-all"
                >
                  <Icons.Settings className="w-4 h-4 text-purple-500" />
                  <span>{lang === 'vi' ? 'Cài đặt tài khoản' : 'Account Settings'}</span>
                </button>

                <button 
                  onClick={() => onNavigate('guide')} 
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-black text-slate-800 dark:text-slate-200 hover:neu-inset-sm transition-all"
                >
                  <Icons.BookOpen className="w-4 h-4 text-blue-500" />
                  <span>{lang === 'vi' ? 'Hướng dẫn sử dụng' : 'User Guide'}</span>
                </button>

                <button 
                  onClick={() => onNavigate('support')} 
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-black text-slate-800 dark:text-slate-200 hover:neu-inset-sm transition-all"
                >
                  <Icons.Info className="w-4 h-4 text-emerald-500" />
                  <span>{lang === 'vi' ? 'Hỗ trợ khách hàng' : 'Support'}</span>
                </button>

                <div className="my-1.5 border-t border-slate-200 dark:border-slate-800"></div>

                <button 
                  onClick={() => void onLogout?.()} 
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-black text-red-500 hover:bg-red-500/10 transition-all"
                >
                  <Icons.Rocket className="w-4 h-4" />
                  <span>{lang === 'vi' ? 'Đăng xuất' : 'Log Out'}</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </aside>

      {/* ====================================================
          2. MAIN CONTENT & TOP STATUS BAR
         ==================================================== */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Floating Cyber Header */}
        <header className="neu-raised-sm m-3 mb-0 rounded-3xl px-4 py-3 flex items-center justify-between z-30 shrink-0 shadow-lg">
          
          {/* Left Controls & Page Title */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden neu-button p-2.5 rounded-2xl text-slate-700 dark:text-slate-200"
            >
              <Icons.Menu className="w-5 h-5" />
            </button>

            {/* Toggle Collapse Desktop Sidebar */}
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex neu-button p-2.5 rounded-2xl text-slate-700 dark:text-slate-200 hover:text-[#FF007F] transition-all"
              title={sidebarCollapsed ? "Mở rộng Menu" : "Thu nhỏ Menu"}
            >
              {sidebarCollapsed ? <Icons.ChevronRight className="w-4.5 h-4.5 text-[#FF007F]" /> : <Icons.ChevronLeft className="w-4.5 h-4.5 text-[#FF007F]" />}
            </button>

            <div className="lg:hidden flex items-center gap-2" onClick={() => onNavigate('home')}>
              <Icons.Sparkles className="w-6 h-6 text-[#FF007F]" />
              <span className="font-accent font-black text-sm text-slate-900 dark:text-white">AUDITION <span className="text-[#FF007F]">AI</span></span>
            </div>

            {/* Active Page Breadcrumb */}
            <div className="hidden lg:flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-wider font-accent">
              <span>Studio</span>
              <Icons.ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 dark:text-white font-black">{currentView}</span>
            </div>
          </div>

          {/* Right Header Actions: Theme Toggle + Language Switcher */}
          <div className="flex items-center gap-2.5">
            {/* Theme Toggle (Sun / Moon) */}
            <button
              onClick={toggleTheme}
              className="neu-button px-3.5 py-2 rounded-2xl flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200 hover:text-[#FF007F] transition-all"
              title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
            >
              {theme === 'dark' ? <Icons.Sun className="w-4 h-4 text-amber-400" /> : <Icons.Moon className="w-4 h-4 text-indigo-500" />}
              <span className="hidden md:inline font-accent">{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
            </button>

            {/* Language Switcher (VN / EN) */}
            <button
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              className="neu-button px-3.5 py-2 rounded-2xl text-xs font-black text-slate-800 dark:text-slate-200 hover:text-[#00F2FE] transition-all"
            >
              {lang === 'vi' ? '🇻🇳 VN' : '🇺🇸 EN'}
            </button>

          </div>

        </header>

        {showMarquee && (
          <button
            type="button"
            onClick={() => onNavigate('topup')}
            className="mx-3 mt-3 neu-inset-sm rounded-2xl px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-black text-[#FF007F] dark:text-amber-300 shrink-0"
          >
            <Icons.Gem className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">{promoConfig?.marqueeText}</span>
            <Icons.ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        )}

        {/* Scrollable Work Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 custom-scrollbar">
          {children}
        </main>

      </div>

      {/* ====================================================
          3. FLOATING GLASS DOCK (Thanh Dock viên thuốc ma thuật dưới mobile)
         ==================================================== */}
      <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md neu-float p-2 rounded-full flex items-center justify-around">
        {navItems.map((item) => {
          const isVideoWorkspace = currentView === 'tool_workspace' && selectedFeature?.toolType === 'video';
          const isImageWorkspace = currentView === 'tool_workspace' && !isVideoWorkspace;
          const isActive = currentView === item.id
            || (item.id === 'video' && isVideoWorkspace)
            || (item.id === 'tools' && isImageWorkspace);
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-label={item.label[lang]}
              title={item.label[lang]}
              className={`p-3 rounded-full transition-all ${
                isActive ? 'neu-inset-sm text-[#FF007F]' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <IconComp className="w-5 h-5" />
            </button>
          );
        })}
      </div>

    </div>
  );
};
