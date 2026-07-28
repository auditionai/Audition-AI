import { Bell, Coins, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function MobileV2TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (['/', '/login', '/payment-gateway', '/admin', '/home', '/mobile-v2-preview'].includes(location.pathname)) {
    return null;
  }

  return (
    <header className="v2-topbar v2-topbar--compact">
      <button
        type="button"
        className="v2-brand v2-tap"
        onClick={() => navigate('/home')}
        aria-label="Về trang chủ"
      >
        <span className="v2-brand__mark"><Sparkles size={19} aria-hidden="true" /></span>
        <span className="v2-brand__name">AUDITION <b>AI</b></span>
      </button>
      <div className="v2-topbar__actions">
        <button type="button" className="v2-icon-button v2-tap" aria-label="Thông báo">
          <Bell size={19} />
          <span className="v2-notification-dot" />
        </button>
        <button
          type="button"
          className="v2-balance v2-tap"
          onClick={() => navigate('/topup')}
          aria-label={`Số dư ${user?.vcoin_balance ?? 0} Vcoin`}
        >
          <Coins size={17} />
          <span>{(user?.vcoin_balance ?? 0).toLocaleString('vi-VN')}</span>
        </button>
      </div>
    </header>
  );
}
