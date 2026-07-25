
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
  const [user, setUser] = useState<UserProfile | null>(null);
  const [promoConfig, setPromoConfig] = useState<PromotionCampaign | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const navItems = [
    { id: 'home' as ViewId, label: { vi: 'Tổng quan', en: 'Dashboard' }, icon: 'Home' },
    { id: 'prompt_library' as ViewId, label: { vi: 'Prompt mẫu', en: 'Prompts' }, icon: 'Sparkles', badge: true },
    { id: 'tools' as ViewId, label: { vi: 'Công cụ', en: 'Tools' }, icon: 'Wand' },
    { id: 'gallery' as ViewId, label: { vi: 'Lịch sử', en: 'Gallery' }, icon: 'Image' },
    { id: 'topup' as ViewId, label: { vi: 'Nạp VCoin', en: 'Top Up' }, icon: 'Gem' },
    { id: 'settings' as ViewId, label: { vi: 'Cài đặt', en: 'Settings' }, icon: 'Settings' },
  ];

  const isAccountLocked = user?.accountStatus === 'locked';

  return (
    <div className="min-h-screen modern-base font-sans" style={{ fontFamily: 'Inter, sans-serif' }}>
      {showCheckin && <DailyCheckin onClose={() => setShowCheckin(false)} onSuccess={() => getUserProfile({ force: true }).then(setUser)} lang={lang === 'vi' ? 'vi' : 'en'} />}

      {isAccountLocked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg modern-card p-8 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <Icons.Lock className="h-10 w-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Tài khoản đã bị khóa</h2>
            <p className="mt-3 text-sm text-gray-600">
              Tài khoản này đang bị tạm khóa do hệ thống phát hiện dấu hiệu vi phạm.
            </p>
            <div className="mt-6 flex gap-3">
              <a href="mailto:support@auditionai.vn" className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                Liên hệ hỗ trợ
              </a>
              <button onClick={() => void onLogout?.()} className="flex-1 rounded-lg bg-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-300">
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-screen overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`modern-sidebar flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} fixed left-0 top-0 bottom-0 z-40`}>
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Icons.Sparkles className="h-5 w-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div>
                <div className="text-sm font-bold text-gray-900">AUDITION AI</div>
                <div className="text-[10px] text-gray-500">AI Studio</div>
              </div>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = Icons[item.icon as keyof typeof Icons];
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`group relative mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label[lang]}</span>
                      {item.badge && !isActive && (
                        <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                      )}
                    </>
                  )}
                  {isActive && <div className="absolute right-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-l-full bg-blue-600"></div>}
                </button>
              );
            })}
          </nav>

          {/* User Profile */}
          <div className="border-t border-gray-200 p-3">
            <div className="flex items-center gap-3">
              <img
                src={user?.avatar || "https://picsum.photos/100/100"}
                alt="Avatar"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-gray-200"
              />
              {!sidebarCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-sm font-semibold text-gray-900">{user?.display_name || 'User'}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Icons.Gem className="h-3 w-3" />
                    <span className="font-semibold">{user?.vcoin_balance?.toLocaleString() || 0}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'} flex flex-col overflow-hidden`}>
          {/* Top Bar */}
          <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <Icons.Menu className="h-5 w-5 text-gray-600" />
              </button>
              <h1 className="text-lg font-semibold text-gray-900">
                {navItems.find(item => item.id === currentView)?.label[lang] || 'Dashboard'}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCheckin(true)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-100"
              >
                <Icons.Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">{lang === 'vi' ? 'Điểm danh' : 'Check-in'}</span>
              </button>

              <button
                onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-100"
              >
                {lang === 'vi' ? 'VN' : 'EN'}
              </button>

              <button className="relative rounded-lg p-2 hover:bg-gray-100">
                <Icons.Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500"></span>
              </button>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1 overflow-y-auto p-6" style={{ background: '#F8F9FA' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
