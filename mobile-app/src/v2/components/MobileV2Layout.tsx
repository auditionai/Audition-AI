import { Outlet, useLocation } from 'react-router-dom';
import { AuroraBackdrop } from './AuroraBackdrop';
import { MobileV2BottomNav } from './MobileV2BottomNav';
import { MobileV2TopBar } from './MobileV2TopBar';
import '../mobile-v2.css';

export function MobileV2Layout() {
  const location = useLocation();
  const isStandalonePreview = location.pathname === '/mobile-v2-preview';
  const previewTheme = new URLSearchParams(location.search).get('preview-theme');
  const forceLightPreview = isStandalonePreview && previewTheme !== 'dark';

  return (
    <div className={`mobile-v2-shell${forceLightPreview ? ' v2-force-light' : ''}`}>
      <AuroraBackdrop />
      <MobileV2TopBar />
      <main className="mobile-v2-content">
        <Outlet />
      </main>
      <MobileV2BottomNav />
    </div>
  );
}
