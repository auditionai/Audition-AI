import { Clock3, Flame, Home, UserRound, WalletCards } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

const tabs = [
  { label: 'Home', path: '/home', Icon: Home },
  { label: 'Mẫu HOT', path: '/prompt-library', Icon: Flame, badge: 'HOT' },
  { label: 'Lịch sử tạo', path: '/gallery', Icon: Clock3 },
  { label: 'Nạp tiền', path: '/topup', Icon: WalletCards },
  { label: 'Tài khoản', path: '/profile', Icon: UserRound },
];

export function MobileV2BottomNav() {
  const location = useLocation();
  const previewScreen = new URLSearchParams(location.search).get('screen');
  const previewTargets: Record<string, string> = {
    hot: '/prompt-library',
    history: '/gallery',
    wallet: '/topup',
    profile: '/profile',
  };
  const activePreviewPath = location.pathname === '/mobile-v2-preview'
    ? previewTargets[previewScreen || ''] || '/home'
    : null;

  if (['/', '/login', '/payment-gateway', '/admin'].includes(location.pathname)) {
    return null;
  }

  return (
    <nav className="v2-bottom-nav-wrap" aria-label="Điều hướng chính">
      <div className="v2-bottom-nav">
        {tabs.map(({ label, path, Icon, badge }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => {
              const isPreviewScreen = path === activePreviewPath;
              const isStudioRoute = path === '/home'
                && (location.pathname.startsWith('/generate/') || location.pathname.startsWith('/tools/') || location.pathname.startsWith('/tools-hub'));
              return `v2-nav-item v2-tap${isActive || isPreviewScreen || isStudioRoute ? ' is-active' : ''}`;
            }}
            aria-label={label}
          >
            <span className="v2-nav-icon">
              <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
              {badge && location.pathname !== path && <span className="v2-nav-badge">{badge}</span>}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
