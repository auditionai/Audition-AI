import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  BookOpenText,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Gem,
  Crop,
  Film,
  Image,
  Images,
  LockKeyhole,
  Palette,
  Rocket,
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
import { AuditionV2Logo } from '../components/AuditionV2Logo';

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
    helper: '',
    path: '/tools-hub/image',
    featureId: 'single_photo_gen',
    Icon: Image,
    accent: 'raspberry',
  },
  {
    label: 'Tạo Video AI',
    helper: '',
    path: '/tools-hub/video',
    featureId: 'video_ai_gen',
    Icon: Video,
    accent: 'violet',
  },
  {
    label: 'Chỉnh Sửa Ảnh',
    helper: '',
    path: '/tools-hub/edit',
    Icon: Crop,
    accent: 'teal',
  },
];

const heroSlides = [
  {
    kicker: 'Character Dream Lab',
    title: 'Biến bạn thành',
    highlight: 'nhân vật 3D',
    description: 'Giữ đúng gương mặt, phối trang phục và tạo thế giới Audition mang dấu ấn riêng.',
    cta: 'Tạo nhân vật ngay',
    path: '/generate/image?tool=single_photo_gen',
    featureId: 'single_photo_gen',
    Icon: Palette,
    accent: 'pink',
    imageLight: '/assets/audition-characters/mobile-hero-crew-light.webp',
    imageDark: '/assets/audition-characters/mobile-hero-crew.webp',
  },
  {
    kicker: 'Couple Universe',
    title: 'Kể câu chuyện',
    highlight: 'của hai người',
    description: 'Dựng khoảnh khắc couple lãng mạn với bố cục, ánh sáng và phong cách game 3D.',
    cta: 'Mở Couple Mode',
    path: '/generate/image?tool=couple_photo_gen',
    featureId: 'couple_photo_gen',
    Icon: Sparkles,
    accent: 'cyan',
    imageLight: '/assets/audition-characters/mobile-hero-couple-light-v2.webp',
    imageDark: '/assets/audition-characters/mobile-hero-couple-v2.webp',
  },
  {
    kicker: 'Motion Galaxy',
    title: 'Cho hình ảnh',
    highlight: 'chuyển động',
    description: 'Đạo diễn video AI từ một khung hình với chuyển động điện ảnh và âm thanh sống động.',
    cta: 'Khám phá Video Lab',
    path: '/generate/video',
    featureId: 'video_ai_gen',
    Icon: Film,
    accent: 'violet',
    imageLight: '/assets/audition-characters/mobile-hero-squad-light-v2.webp',
    imageDark: '/assets/audition-characters/mobile-hero-squad-v2.webp',
  },
];

export function HomeV2() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [showCheckin, setShowCheckin] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  useEffect(() => subscribeCheckinStatus(
    (status) => setIsCheckedIn(status.isCheckedInToday),
    { force: true },
  ), []);

  useEffect(() => {
    getFeatureMaintenanceConfig().then(setFeatureMaintenance).catch(() => {
      setFeatureMaintenance({ disabledFeatureIds: [] });
    });
  }, []);

  useEffect(() => {
    if (carouselPaused) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [carouselPaused]);

  const isLocked = (featureId?: string) => Boolean(
    featureId
    && userRole !== 'admin'
    && isFeatureInMaintenance(featureMaintenance, featureId),
  );

  const openFeature = (path: string, featureId?: string) => {
    if (!isLocked(featureId)) navigate(path);
  };
  const slide = heroSlides[activeSlide];
  const SlideIcon = slide.Icon;

  return (
    <div className="v2-home">
      <header className="v2-topbar">
        <button
          type="button"
          className="v2-brand v2-tap"
          onClick={() => navigate('/home')}
          aria-label="Audition AI - Trang chủ"
        >
          <AuditionV2Logo />
        </button>

        <div className="v2-topbar__actions">
          <button
            type="button"
            className={`v2-checkin v2-tap ${isCheckedIn ? 'is-complete' : 'is-pending'}`}
            onClick={() => setShowCheckin(true)}
            aria-label={isCheckedIn ? 'Đã điểm danh hôm nay' : 'Điểm danh nhận Vcoin'}
          >
            <CalendarCheck2 size={18} />
            <span>Điểm danh</span>
            {!isCheckedIn && <i aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="v2-balance v2-tap"
            onClick={() => navigate('/topup')}
            aria-label={`Số dư ${(user?.vcoin_balance ?? 0).toLocaleString('vi-VN')} Vcoin`}
          >
            <Gem size={18} />
            <span>{(user?.vcoin_balance ?? 0).toLocaleString('vi-VN')}</span>
          </button>
        </div>
      </header>

      <section
        className="v2-hero v2-neon-frame v2-hero--carousel v2-hero--characters"
        data-accent={slide.accent}
        onPointerEnter={() => setCarouselPaused(true)}
        onPointerLeave={() => setCarouselPaused(false)}
        onFocus={() => setCarouselPaused(true)}
        onBlur={() => setCarouselPaused(false)}
        aria-roledescription="carousel"
        aria-label="Khám phá tính năng nổi bật"
        style={{
          '--mobile-v2-hero-image-light': `url("${slide.imageLight}")`,
          '--mobile-v2-hero-image-dark': `url("${slide.imageDark}")`,
        } as CSSProperties}
      >
        <div className="v2-hero__art" key={slide.imageDark} aria-hidden="true">
          <span className="v2-orbit v2-orbit--one" />
          <span className="v2-orbit v2-orbit--two" />
          <span className="v2-hero__planet"><SlideIcon size={48} strokeWidth={1.25} /></span>
          <Sparkles className="v2-hero__spark v2-hero__spark--one" />
          <Sparkles className="v2-hero__spark v2-hero__spark--two" />
        </div>
        <div className="v2-hero__scrim" />
        <div className="v2-hero__content" key={slide.kicker}>
          <span className="v2-eyebrow"><Rocket size={13} /> {slide.kicker}</span>
          <h1>{slide.title}<br /><span>{slide.highlight}</span></h1>
          <p>{slide.description}</p>
          <button
            type="button"
            className="v2-primary-button v2-tap"
            onClick={() => openFeature(slide.path, slide.featureId)}
          >
            <Sparkles size={18} aria-hidden="true" />
            {slide.cta}
          </button>
        </div>
        <div className="v2-carousel-controls">
          <button type="button" onClick={() => setActiveSlide((activeSlide - 1 + heroSlides.length) % heroSlides.length)} aria-label="Banner trước"><ChevronLeft size={18} /></button>
          <div className="v2-carousel-dots">
            {heroSlides.map((item, index) => (
              <button
                type="button"
                key={item.kicker}
                className={activeSlide === index ? 'is-active' : ''}
                onClick={() => setActiveSlide(index)}
                aria-label={`Xem banner ${index + 1}`}
                aria-current={activeSlide === index ? 'true' : undefined}
              />
            ))}
          </div>
          <button type="button" onClick={() => setActiveSlide((activeSlide + 1) % heroSlides.length)} aria-label="Banner sau"><ChevronRight size={18} /></button>
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
              aria-label={`${label}${locked ? ' - đang bảo trì' : ''}`}
            >
              <span className="v2-quick-card__icon"><Icon size={25} strokeWidth={1.8} /></span>
              <strong>{label}</strong>
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
          <button type="button" className="v2-text-button v2-tap" onClick={() => navigate('/tools-hub')}>
            Tất cả công cụ <ArrowRight size={16} />
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
