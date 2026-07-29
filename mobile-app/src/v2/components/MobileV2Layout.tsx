import { Outlet, useLocation } from 'react-router-dom';
import { AuroraBackdrop } from './AuroraBackdrop';
import { MobileV2BottomNav } from './MobileV2BottomNav';
import { MobileV2TopBar } from './MobileV2TopBar';
import '../mobile-v2.css';

export function MobileV2Layout() {
  const location = useLocation();
  const hasBottomNav = !['/', '/login', '/payment-gateway', '/admin'].includes(location.pathname);
  const routeTone = (() => {
    if (location.pathname.startsWith('/generate/image')) return 'raspberry';
    if (location.pathname.startsWith('/generate/video')) return 'violet';
    if (location.pathname.startsWith('/tools')) return 'teal';
    if (location.pathname === '/prompt-library') return 'violet';
    if (location.pathname === '/gallery') return 'indigo';
    if (location.pathname === '/topup' || location.pathname === '/payment-gateway') return 'amber';
    if (location.pathname === '/profile') return 'wine';
    if (location.pathname === '/admin') return 'amber';
    if (['/about', '/support', '/guide'].includes(location.pathname)) return 'teal';
    return 'raspberry';
  })();

  return (
    <div
      className={`mobile-v2-shell v2-tone-${routeTone}`}
      data-v2-route={location.pathname}
    >
      <AuroraBackdrop />
      <MobileV2TopBar />
      <main className={`mobile-v2-content${hasBottomNav ? ' has-bottom-nav' : ''}${location.pathname === '/home' || location.pathname === '/' ? '' : ' v2-screen'}`}>
        <Outlet />
      </main>
      <MobileV2BottomNav />
    </div>
  );
}
