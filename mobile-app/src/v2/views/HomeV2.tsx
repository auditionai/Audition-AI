import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpenText,
  CalendarCheck2,
  Coins,
  Image,
  Images,
  LockKeyhole,
  MessageSquareText,
  Sparkles,
  UsersRound,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DailyCheckin } from '../../components/DailyCheckin';
import { useAuth } from '../../contexts/AuthContext';
import {
  getFeatureMaintenanceConfig,
  isFeatureInMaintenance,
  subscribeCheckinStatus,
  type FeatureMaintenanceConfig,
} from '../../services/economyService';

type QuickAction = {
  label: string;
  helper: string;
  path: string;
  featureId?: string;
  Icon: LucideIcon;
  accent: string;
};

const quickActions: QuickAction[] = [
  {
    label: 'Tạo ảnh AI',
    helper: 'Nhân vật 3D',
    path: '/generate/image',
    featureId: 'single_photo_gen',
    Icon: Image,
    accent: 'raspberry',
  },
  {
    label: 'Video AI Lab',
    helper: 'Ảnh thành video',
    path: '/generate/video',
    featureId: 'video_ai_gen',
    Icon: Video,
    accent: 'violet',
  },
  {
    label: 'Prompt Hub',
    helper: 'Mẫu sáng tạo',
    path: '/prompt-library',
    Icon: MessageSquareText,
    accent: 'teal',
  },
  {
    label: 'Store Vcoin',
    helper: 'Ưu đãi nạp',
    path: '/topup',
    Icon: Coins,
    accent: 'wine',
  },
];

export function HomeV2() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [showCheckin, setShowCheckin] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });

  useEffect(() => subscribeCheckinStatus(
    (status) => setIsCheckedIn(status.isCheckedInToday),
    { force: true },
  ), []);

  useEffect(() => {
    getFeatureMaintenanceConfig().then(setFeatureMaintenance).catch(() => {
      setFeatureMaintenance({ disabledFeatureIds: [] });
    });
  }, []);

  const isLocked = (featureId?: string) => Boolean(
    featureId
    && userRole !== 'admin'
    && isFeatureInMaintenance(featureMaintenance, featureId),
  );

  const openFeature = (path: string, featureId?: string) => {
    if (!isLocked(featureId)) navigate(path);
  };

  return (
    <div className="v2-home">
      <header className="v2-topbar">
        <button
          type="button"
          className="v2-brand v2-tap"
          onClick={() => navigate('/home')}
          aria-label="Audition AI - Trang chủ"
        >
          <span className="v2-brand__mark"><Sparkles size={21} aria-hidden="true" /></span>
          <span className="v2-brand__name">AUDITION <b>AI</b></span>
        </button>

        <div className="v2-topbar__actions">
          <button
            type="button"
            className={`v2-checkin v2-tap${isCheckedIn ? ' is-complete' : ''}`}
            onClick={() => setShowCheckin(true)}
            aria-label={isCheckedIn ? 'Đã điểm danh hôm nay' : 'Điểm danh nhận Vcoin'}
          >
            <CalendarCheck2 size={18} />
          </button>
          <button type="button" className="v2-icon-button v2-tap" aria-label="Thông báo">
            <Bell size={19} />
            <span className="v2-notification-dot" />
          </button>
          <button
            type="button"
            className="v2-balance v2-tap"
            onClick={() => navigate('/topup')}
            aria-label={`Số dư ${(user?.vcoin_balance ?? 0).toLocaleString('vi-VN')} Vcoin`}
          >
            <Coins size={17} />
            <span>{(user?.vcoin_balance ?? 0).toLocaleString('vi-VN')}</span>
          </button>
        </div>
      </header>

      <section className="v2-hero v2-neon-frame" data-accent="rainbow">
        <div className="v2-hero__art" aria-hidden="true">
          <span className="v2-orbit v2-orbit--one" />
          <span className="v2-orbit v2-orbit--two" />
          <Sparkles className="v2-hero__spark v2-hero__spark--one" />
          <Sparkles className="v2-hero__spark v2-hero__spark--two" />
        </div>
        <div className="v2-hero__scrim" />
        <div className="v2-hero__content">
          <span className="v2-eyebrow"><Sparkles size={13} /> Audition AI Studio</span>
          <h1>Sáng tạo cùng<br /><span>Audition AI</span></h1>
          <p>Biến ý tưởng thành ảnh, video và nhân vật 3D mang phong cách riêng.</p>
          <button
            type="button"
            className="v2-primary-button v2-tap"
            onClick={() => openFeature('/generate/image', 'single_photo_gen')}
          >
            <Sparkles size={18} aria-hidden="true" />
            Bắt đầu tạo ảnh
          </button>
        </div>
      </section>

      <section className="v2-quick-grid" aria-label="Truy cập nhanh">
        {quickActions.map(({ label, helper, path, featureId, Icon, accent }) => {
          const locked = isLocked(featureId);
          return (
            <button
              type="button"
              key={label}
              className="v2-quick-card v2-neon-frame v2-tap"
              data-accent={accent}
              onClick={() => openFeature(path, featureId)}
              disabled={locked}
              aria-label={`${label}: ${helper}${locked ? ' - đang bảo trì' : ''}`}
            >
              <span className="v2-quick-card__icon"><Icon size={25} strokeWidth={1.8} /></span>
              <strong>{label}</strong>
              <small>{helper}</small>
              {locked && <LockKeyhole className="v2-lock" size={15} aria-hidden="true" />}
            </button>
          );
        })}
      </section>

      <section className="v2-featured">
        <div className="v2-section-heading">
          <div>
            <span className="v2-section-heading__kicker"><BookOpenText size={14} /> Studio sáng tạo</span>
            <h2>Công cụ nổi bật</h2>
          </div>
          <button type="button" className="v2-text-button v2-tap" onClick={() => navigate('/prompt-library')}>
            Xem tất cả <ArrowRight size={16} />
          </button>
        </div>

        <button
          type="button"
          className="v2-feature-card v2-feature-card--single v2-neon-frame v2-tap"
          data-accent="raspberry"
          onClick={() => openFeature('/generate/image?tool=single_photo_gen', 'single_photo_gen')}
          disabled={isLocked('single_photo_gen')}
        >
          <span className="v2-feature-card__art" aria-hidden="true">
            <span className="v2-art-avatar v2-art-avatar--single"><Images size={58} strokeWidth={1.15} /></span>
          </span>
          <span className="v2-feature-card__veil" />
          <span className="v2-feature-card__content">
            <span className="v2-feature-card__icon"><Image size={22} /></span>
            <strong>Tạo ảnh đơn</strong>
            <small>Tạo nhân vật 3D từ ảnh của bạn</small>
            <span className="v2-outline-button">Tạo ngay <ArrowRight size={16} /></span>
          </span>
        </button>

        <button
          type="button"
          className="v2-feature-card v2-feature-card--couple v2-neon-frame v2-tap"
          data-accent="teal"
          onClick={() => openFeature('/generate/image?tool=couple_photo_gen', 'couple_photo_gen')}
          disabled={isLocked('couple_photo_gen')}
        >
          <span className="v2-feature-card__art" aria-hidden="true">
            <span className="v2-art-avatar v2-art-avatar--couple"><UsersRound size={62} strokeWidth={1.15} /></span>
          </span>
          <span className="v2-feature-card__veil" />
          <span className="v2-feature-card__content">
            <span className="v2-feature-card__icon"><UsersRound size={22} /></span>
            <strong>Couple Mode</strong>
            <small>Tạo ảnh cặp đôi phong cách Audition</small>
            <span className="v2-outline-button">Tạo ngay <ArrowRight size={16} /></span>
          </span>
        </button>
      </section>

      {showCheckin && (
        <DailyCheckin
          lang="vi"
          onClose={() => setShowCheckin(false)}
          onSuccess={() => setIsCheckedIn(true)}
        />
      )}
    </div>
  );
}
