import React, { useState, useEffect } from 'react';
import { Language, Theme, ViewId, UserProfile, PromotionCampaign, Feature } from '../types';
import { Icons } from './Icons';
import { DailyCheckin } from './DailyCheckin';
import { getUserProfile, getActivePromotion, getGenerationProviderConfig } from '../services/economyService';
import {
  getProviderConcurrencyLimits,
  getProviderQueueStats,
  setActiveQueueProvider,
  useActiveQueueProvider,
  useConcurrency,
} from '../services/concurrencyService';
import { DesktopAtmosphere } from './DesktopAtmosphere';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewId;
  selectedFeature?: Feature | null;
  onNavigate: (view: ViewId) => void;
  lang: Language;
  theme: Theme;
  setTheme: (t: Theme) => void;
  showCheckin: boolean;
  setShowCheckin: (show: boolean) => void;
  onLogout?: () => void | Promise<void>;
}

interface QueueStatGroupProps {
  title: string;
  imageValue: number;
  imageLimit: number;
  videoValue: number;
  videoLimit: number;
  queuedValue: number;
  queuedLimit: number;
}

const QueueStatGroup: React.FC<QueueStatGroupProps> = ({
  title,
  imageValue,
  imageLimit,
  videoValue,
  videoLimit,
  queuedValue,
  queuedLimit,
}) => {
  const stats = [
    { label: 'Ảnh', value: imageValue, limit: imageLimit, tone: 'cyan', icon: Icons.Image },
    { label: 'Video', value: videoValue, limit: videoLimit, tone: 'violet', icon: Icons.Video },
    { label: 'Đang chờ', value: queuedValue, limit: queuedLimit, tone: 'amber', icon: Icons.Clock },
  ];
  const totalActive = imageValue + videoValue + queuedValue;
  const totalLimit = imageLimit + videoLimit + queuedLimit;

  return (
    <div className="queue-hud__cluster">
      <div className="queue-hud__cluster-head">
        <span>{title}</span>
        <span className="queue-hud__cluster-total">{totalActive}<i>/</i>{totalLimit}</span>
      </div>
      <div className="queue-hud__lanes">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const percentage = stat.limit > 0 ? Math.min(100, Math.max(0, (stat.value / stat.limit) * 100)) : 0;
          const remaining = Math.max(0, stat.limit - stat.value);
          const stateLabel = stat.value <= 0
            ? 'Sẵn sàng'
            : stat.limit > 0 && stat.value >= stat.limit
              ? 'Đã đầy'
              : `Còn ${remaining} luồng`;

          return (
            <div
              key={stat.label}
              className={`queue-hud__tile queue-hud__tile--${stat.tone}`}
              style={{ '--queue-load': `${percentage}%` } as React.CSSProperties}
            >
              <div className="queue-hud__tile-label">
                <span aria-hidden="true"><Icon /></span>
                <strong>{stat.label}</strong>
              </div>
              <div className="queue-hud__value"><strong>{stat.value}</strong><span>/{stat.limit}</span></div>
              <span className="queue-hud__tile-state">{stateLabel}</span>
              <div className="queue-hud__track" aria-hidden="true">
                <span className="queue-hud__track-fill" />
                <i className="queue-hud__tracer" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const QueueCompactSummary: React.FC<{
  imageValue: number;
  imageLimit: number;
  videoValue: number;
  videoLimit: number;
  queuedValue: number;
  queuedLimit: number;
  systemActive: number;
  systemLimit: number;
}> = ({
  imageValue,
  imageLimit,
  videoValue,
  videoLimit,
  queuedValue,
  queuedLimit,
  systemActive,
  systemLimit,
}) => {
  const stats = [
    { label: 'Ảnh', value: imageValue, limit: imageLimit, tone: 'cyan', icon: Icons.Image },
    { label: 'Video', value: videoValue, limit: videoLimit, tone: 'violet', icon: Icons.Video },
    { label: 'Chờ', value: queuedValue, limit: queuedLimit, tone: 'amber', icon: Icons.Clock },
  ];

  return (
    <div className="queue-hud__compact animate-fade-in" aria-live="polite">
      <div className="queue-hud__compact-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`queue-hud__quick queue-hud__quick--${stat.tone}`}>
              <div><Icon aria-hidden="true" /><span>{stat.label}</span></div>
              <strong>{stat.value}<i>/{stat.limit}</i></strong>
            </div>
          );
        })}
      </div>
      <div className="queue-hud__compact-system">
        <span><i /> Sức chứa hệ thống</span>
        <strong>{systemActive}/{systemLimit}</strong>
      </div>
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = ({
  children, currentView, selectedFeature, onNavigate, lang, theme, setTheme, showCheckin, setShowCheckin, onLogout
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [promoConfig, setPromoConfig] = useState<PromotionCampaign | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queuePanelExpanded, setQueuePanelExpanded] = useState(false);

  const { queueStats, triggerPoll } = useConcurrency();
  const activeQueueProvider = useActiveQueueProvider();
  const visibleQueueStats = getProviderQueueStats(queueStats, activeQueueProvider);
  const visibleQueueLimits = getProviderConcurrencyLimits(activeQueueProvider);
  const myProcessingCount = visibleQueueStats.myImageProcessing + visibleQueueStats.myVideoProcessing;
  const myProcessingLimit = visibleQueueLimits.user.imageProcessing + visibleQueueLimits.user.videoProcessing;
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
    if (currentView === 'tool_workspace') return;
    let cancelled = false;
    void getGenerationProviderConfig().then((config) => {
      if (!cancelled) setActiveQueueProvider(config.provider);
    });
    return () => {
      cancelled = true;
    };
  }, [currentView]);

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

  const fallbackViewLabels: Partial<Record<ViewId, { vi: string; en: string }>> = {
    support: { vi: 'Hỗ trợ khách hàng', en: 'Customer Support' },
    settings: { vi: 'Cài đặt', en: 'Settings' },
    guide: { vi: 'Hướng dẫn sử dụng', en: 'User Guide' },
    about: { vi: 'Thông tin ứng dụng', en: 'About' },
    payment_gateway: { vi: 'Thanh toán', en: 'Payment' },
  };
  const activePageLabel = currentView === 'tool_workspace' && selectedFeature
    ? selectedFeature.name[lang]
    : navItems.find((item) => item.id === currentView)?.label[lang]
      || fallbackViewLabels[currentView]?.[lang]
      || currentView.replace(/_/g, ' ');

  const isAccountLocked = user?.accountStatus === 'locked';

  return (
    <div className="desktop-atmosphere-shell flex h-screen neu-base transition-colors duration-300 relative overflow-hidden font-sans">
      <DesktopAtmosphere />
      
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
      } desktop-neon-frame desktop-neon-frame--violet neu-raised-md m-3 rounded-3xl p-4 z-40 shrink-0 transition-all duration-300 relative`}>
        
        {/* Top Brand Logo */}
        <div className="space-y-6">
          <div 
            onClick={() => onNavigate('home')}
            className={`flex items-center cursor-pointer group py-1 ${
              sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-1'
            }`}
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
                  className={`w-full flex items-center py-3 rounded-2xl transition-all text-xs font-black group ${
                    sidebarCollapsed ? 'justify-center gap-0 px-0' : 'gap-3.5 px-3.5'
                  } ${
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
            <section className="queue-hud" aria-label="Trạng thái luồng xử lý realtime">
              <span className="queue-hud__grid" aria-hidden="true" />
              <span className="queue-hud__scan" aria-hidden="true" />
              <div className="queue-hud__header">
                <div className="queue-hud__identity">
                  <span className="queue-hud__core" aria-hidden="true">
                    <Icons.Activity />
                    <i />
                  </span>
                  <div>
                    <strong>Luồng xử lý</strong>
                    <span><i /> Đồng bộ realtime</span>
                  </div>
                </div>
                <div className="queue-hud__actions">
                  <button type="button" onClick={() => triggerPoll()} className="queue-hud__icon-button" title="Cập nhật trạng thái" aria-label="Cập nhật trạng thái luồng xử lý">
                    <Icons.RefreshCw />
                  </button>
                  <button type="button" onClick={() => setQueuePanelExpanded(!queuePanelExpanded)} className="queue-hud__icon-button" aria-label={queuePanelExpanded ? 'Thu gọn trạng thái luồng xử lý' : 'Mở rộng trạng thái luồng xử lý'} aria-expanded={queuePanelExpanded}>
                    {queuePanelExpanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
                  </button>
                </div>
              </div>

              {queuePanelExpanded && (
                <div className="queue-hud__body animate-fade-in" aria-live="polite">
                  <QueueStatGroup
                    title="Phiên của bạn"
                    imageValue={visibleQueueStats.myImageProcessing}
                    imageLimit={visibleQueueLimits.user.imageProcessing}
                    videoValue={visibleQueueStats.myVideoProcessing}
                    videoLimit={visibleQueueLimits.user.videoProcessing}
                    queuedValue={visibleQueueStats.myQueued}
                    queuedLimit={visibleQueueLimits.user.queued}
                  />
                  <div className="queue-hud__bridge" aria-hidden="true">
                    <span /><i /><i /><i />
                  </div>
                  <QueueStatGroup
                    title="Sức chứa hệ thống"
                    imageValue={visibleQueueStats.systemImageProcessing}
                    imageLimit={visibleQueueLimits.system.imageProcessing}
                    videoValue={visibleQueueStats.systemVideoProcessing}
                    videoLimit={visibleQueueLimits.system.videoProcessing}
                    queuedValue={visibleQueueStats.systemQueued}
                    queuedLimit={visibleQueueLimits.system.queued}
                  />
                </div>
              )}
              {!queuePanelExpanded && (
                <QueueCompactSummary
                  imageValue={visibleQueueStats.myImageProcessing}
                  imageLimit={visibleQueueLimits.user.imageProcessing}
                  videoValue={visibleQueueStats.myVideoProcessing}
                  videoLimit={visibleQueueLimits.user.videoProcessing}
                  queuedValue={visibleQueueStats.myQueued}
                  queuedLimit={visibleQueueLimits.user.queued}
                  systemActive={visibleQueueStats.systemImageProcessing + visibleQueueStats.systemVideoProcessing + visibleQueueStats.systemQueued}
                  systemLimit={visibleQueueLimits.system.imageProcessing + visibleQueueLimits.system.videoProcessing + visibleQueueLimits.system.queued}
                />
              )}
            </section>
          ) : (
            <button type="button" onClick={() => triggerPoll()} className="queue-hud-mini" title={`Đang xử lý ${myProcessingCount}/${myProcessingLimit} tác vụ`} aria-label={`Cập nhật luồng xử lý, hiện có ${myProcessingCount} trên ${myProcessingLimit} tác vụ của bạn đang chạy`}>
              <span className="queue-hud-mini__radar"><Icons.Activity /></span>
              <span>{myProcessingCount}/{myProcessingLimit}</span>
            </button>
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
      <div className="relative z-10 flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Floating Cyber Header */}
        <header className="desktop-neon-frame desktop-neon-frame--blue neu-raised-sm m-3 mb-0 rounded-3xl px-4 py-3 flex items-center justify-between z-30 shrink-0 shadow-lg">
          
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
              <span className="text-slate-900 dark:text-white font-black">{activePageLabel}</span>
            </div>
          </div>

          {/* Right Header Actions */}
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
