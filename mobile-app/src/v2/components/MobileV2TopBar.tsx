import { useEffect, useState } from 'react';
import { CalendarCheck2, Gem } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DailyCheckin } from '../../components/DailyCheckin';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeCheckinStatus } from '../../services/economyService';
import { AuditionV2Logo } from './AuditionV2Logo';

export function MobileV2TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showCheckin, setShowCheckin] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(true);

  useEffect(() => subscribeCheckinStatus(
    (status) => setIsCheckedIn(status.isCheckedInToday),
    { force: true },
  ), []);

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
        <AuditionV2Logo compact />
      </button>
      <div className="v2-topbar__actions">
        <button
          type="button"
          className={`v2-checkin v2-checkin--compact v2-tap ${isCheckedIn ? 'is-complete' : 'is-pending'}`}
          onClick={() => setShowCheckin(true)}
          aria-label={isCheckedIn ? 'Đã điểm danh hôm nay' : 'Điểm danh nhận Vcoin'}
        >
          <CalendarCheck2 size={17} />
          <span>Điểm danh</span>
          {!isCheckedIn && <i aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="v2-balance v2-tap"
          onClick={() => navigate('/topup')}
          aria-label={`Số dư ${user?.vcoin_balance ?? 0} Vcoin`}
        >
          <Gem size={18} />
          <span>{(user?.vcoin_balance ?? 0).toLocaleString('vi-VN')}</span>
        </button>
      </div>
      {showCheckin && (
        <DailyCheckin
          lang="vi"
          onClose={() => setShowCheckin(false)}
          onSuccess={() => setIsCheckedIn(true)}
        />
      )}
    </header>
  );
}
