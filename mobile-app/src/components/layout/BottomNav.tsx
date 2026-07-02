/**
 * BottomNav - Mobile navigation bar
 * Clean Apple-style bottom nav with 5 essential tabs
 */

import { Home, Clock, Coins, User, Flame } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function BottomNav() {
  const location = useLocation();

  const tabs = [
    { name: 'Home', path: '/home', icon: Home },
    { name: 'Mẫu hot', path: '/prompt-library', icon: Flame, featured: true },
    { name: 'Thư viện', path: '/gallery', icon: Clock },
    { name: 'Nạp tiền', path: '/topup', icon: Coins },
    { name: 'Tài khoản', path: '/profile', icon: User },
  ];

  const hiddenRoutes = ['/', '/login', '/payment-gateway', '/admin'];
  if (hiddenRoutes.includes(location.pathname)) return null;

  return (
    <div data-tour-id="mobile.layout.bottomnav" className="fixed bottom-0 left-0 right-0 z-50 glass pb-safe">
      <div className="flex items-center justify-around px-2 py-2.5 mx-auto max-w-md">
        {tabs.map((tab) => {
          const isActive = location.pathname.startsWith(tab.path);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="relative flex flex-col items-center justify-center w-16 h-11"
            >
              {isActive && (
                <div className="absolute -top-0.5 w-5 h-0.5 bg-gray-900 rounded-full" />
              )}
              {tab.featured && !isActive && (
                <div className="absolute -top-1 right-3 h-2.5 w-2.5 rounded-full bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.8)]" />
              )}
              <Icon
                className={`w-[22px] h-[22px] mb-0.5 transition-colors duration-200 ${
                  isActive ? 'text-gray-900 dark:text-white' : tab.featured ? 'text-fuchsia-500 dark:text-fuchsia-300' : 'text-gray-400 dark:text-zinc-500'
                }`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={`text-[10px] transition-colors duration-200 ${
                  isActive ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-400 dark:text-zinc-500'
                }`}
              >
                {tab.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
