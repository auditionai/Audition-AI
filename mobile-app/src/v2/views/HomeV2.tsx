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
  Play,
  Maximize2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DailyCheckin } from '../../components/DailyCheckin';
import { useAuth } from '../../contexts/AuthContext';
import {
  getStartupSettings,
  getTutorialVideo,
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
    kicker: 'Motion Control Service', title: 'Đặt làm', highlight: 'Video Dance AI',
    description: 'Chọn video mẫu, gửi ảnh nhân vật game và nhận video copy chuyển động đúng mẫu.',
    cta: 'Chọn video mẫu', path: '/dat-lam-video-ai', Icon: Film, accent: 'violet',
    imageLight: '/assets/audition-characters/mobile-hero-squad-light-v2.webp', imageDark: '/assets/audition-characters/mobile-hero-squad-v2.webp',
  },
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

const extractYouTubeId = (url?: string): string => {
  if (!url) return 'ba2WR8txe_c';
  const clean = url.trim();
  const match = clean.match(/(?:[?&]v=|\/embed\/|\/live\/|\/shorts\/|^https?:\/\/youtu\.be\/|\/v\/)([^&#?]+)/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  return 'ba2WR8txe_c';
};

export function HomeV2() {
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const [showCheckin, setShowCheckin] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [featureMaintenance, setFeatureMaintenance] = useState<FeatureMaintenanceConfig>({ disabledFeatureIds: [] });
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [tutorialVideo, setTutorialVideo] = useState({ url: 'https://www.youtube.com/watch?v=ba2WR8txe_c', isActive: true });
  const [isPlayingTutorial, setIsPlayingTutorial] = useState(false);
  const [isCinemaModalOpen, setIsCinemaModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getTutorialVideo().then((data) => {
      if (isMounted && data) {
        setTutorialVideo(data);
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const tutorialVideoId = extractYouTubeId(tutorialVideo.url);

  useEffect(() => subscribeCheckinStatus(
    (status) => setIsCheckedIn(status.isCheckedInToday),
    { force: true },
  ), []);

  useEffect(() => {
    getStartupSettings().then((settings) => setFeatureMaintenance(settings.featureMaintenance)).catch(() => {
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

      {/* ====================================================
          TUTORIAL VIDEO BANNER (Video Hướng Dẫn Sử Dụng)
         ==================================================== */}
      {tutorialVideo.isActive && (
        <section
          className="v2-tutorial-card v2-neon-frame"
          data-accent="raspberry"
          aria-label="Video hướng dẫn sử dụng Audition AI"
        >
          {/* Header Badge */}
          <div className="v2-tutorial-card__header">
            <div className="v2-tutorial-card__pill">
              <span className="v2-tutorial-card__pulse" />
              <Sparkles size={12} className="v2-tutorial-card__sparkle" />
              <span>HƯỚNG DẪN CHI TIẾT AI 3D</span>
            </div>
            <span className="v2-tutorial-card__badge-hd">HD 1080P</span>
          </div>

          {/* Title & Description */}
          <div className="v2-tutorial-card__title-group">
            <h2 className="v2-tutorial-card__title">
              Hướng Dẫn Sử Dụng Audition AI
            </h2>
            <p className="v2-tutorial-card__desc">
              Video hướng dẫn sử dụng ứng dụng Audition AI để tạo ảnh 3D AI từ A-Z
            </p>
          </div>

          {/* Interactive Player Frame (16:9) */}
          <div className="v2-tutorial-card__player-frame">
            {isPlayingTutorial ? (
              <iframe
                src={`https://www.youtube.com/embed/${tutorialVideoId}?autoplay=1&rel=0&playsinline=1`}
                title="Video hướng dẫn sử dụng ứng dụng Audition AI để tạo ảnh 3D AI"
                className="v2-tutorial-card__iframe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div
                className="v2-tutorial-card__poster"
                onClick={() => setIsPlayingTutorial(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsPlayingTutorial(true)}
                aria-label="Phát video hướng dẫn sử dụng Audition AI"
              >
                <img
                  src={`https://img.youtube.com/vi/${tutorialVideoId}/hqdefault.jpg`}
                  alt="Video hướng dẫn sử dụng ứng dụng Audition AI để tạo ảnh 3D AI"
                  className="v2-tutorial-card__poster-img"
                  loading="lazy"
                />
                <div className="v2-tutorial-card__poster-scrim" />
                <div className="v2-tutorial-card__play-btn">
                  <span className="v2-tutorial-card__play-pulse" />
                  <span className="v2-tutorial-card__play-ring">
                    <Play size={22} fill="currentColor" />
                  </span>
                </div>
                <div className="v2-tutorial-card__poster-tags">
                  <span className="v2-tutorial-card__tag">Cody CN • A-Z</span>
                  <span className="v2-tutorial-card__tag v2-tutorial-card__tag--cta">Bấm để phát</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="v2-tutorial-card__footer">
            <span className="v2-tutorial-card__footer-note">
              {isPlayingTutorial ? 'Đang phát video hướng dẫn' : 'Bấm Play để xem trực tiếp hoặc'}
            </span>
            <button
              type="button"
              className="v2-tutorial-card__theater-btn v2-tap"
              onClick={() => setIsCinemaModalOpen(true)}
            >
              <Maximize2 size={13} />
              <span>Toàn màn hình</span>
            </button>
          </div>
        </section>
      )}

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

        <button
          type="button"
          className="v2-feature-card v2-feature-card--dance v2-neon-frame v2-tap"
          data-accent="violet"
          onClick={() => openFeature('/dat-lam-video-ai')}
        >
          <span className="v2-feature-card__art" aria-hidden="true">
            <span className="v2-art-avatar v2-art-avatar--dance"><Film size={58} strokeWidth={1.15} /></span>
          </span>
          <span className="v2-feature-card__veil" />
          <span className="v2-feature-card__content">
            <span className="v2-feature-card__icon"><Film size={22} /></span>
            <strong>Đặt làm video AI</strong>
            <small>Chọn mẫu vũ đạo, tạo video nhảy Audition theo yêu cầu</small>
            <span className="v2-outline-button">Đặt ngay <ArrowRight size={16} /></span>
          </span>
        </button>

        <button
          type="button"
          className="v2-feature-card v2-feature-card--video v2-neon-frame v2-tap"
          data-accent="cyan"
          onClick={() => openFeature('/generate/video?tool=video_ai_gen', 'video_ai_gen')}
          disabled={isLocked('video_ai_gen')}
        >
          <span className="v2-feature-card__art" aria-hidden="true">
            <span className="v2-art-avatar v2-art-avatar--video"><Video size={58} strokeWidth={1.15} /></span>
          </span>
          <span className="v2-feature-card__veil" />
          <span className="v2-feature-card__content">
            <span className="v2-feature-card__icon"><Video size={22} /></span>
            <strong>Ảnh thành Video</strong>
            <small>Biến ảnh 3D thành video chuyển động sống động</small>
            <span className="v2-outline-button">Tạo ngay <ArrowRight size={16} /></span>
          </span>
        </button>

        <button
          type="button"
          className="v2-feature-card v2-feature-card--edit v2-neon-frame v2-tap"
          data-accent="pink"
          onClick={() => openFeature('/tools-hub/edit')}
        >
          <span className="v2-feature-card__art" aria-hidden="true">
            <span className="v2-art-avatar v2-art-avatar--edit"><Crop size={58} strokeWidth={1.15} /></span>
          </span>
          <span className="v2-feature-card__veil" />
          <span className="v2-feature-card__content">
            <span className="v2-feature-card__icon"><Crop size={22} /></span>
            <strong>Chỉnh sửa ảnh</strong>
            <small>Tách nền Pro, làm nét và phục hồi chi tiết ảnh</small>
            <span className="v2-outline-button">Khám phá <ArrowRight size={16} /></span>
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

      {/* Video Theater Lightbox Modal */}
      {isCinemaModalOpen && (
        <div
          className="v2-video-modal-backdrop"
          onClick={() => setIsCinemaModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="v2-video-modal v2-neon-frame"
            data-accent="raspberry"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="v2-video-modal__header">
              <div className="v2-video-modal__title-box">
                <div className="v2-video-modal__icon">
                  <Video size={16} />
                </div>
                <div>
                  <h3 className="v2-video-modal__title">Hướng Dẫn Sử Dụng Audition AI</h3>
                  <p className="v2-video-modal__subtitle">Video hướng dẫn tạo ảnh 3D AI từ A-Z</p>
                </div>
              </div>
              <button
                type="button"
                className="v2-video-modal__close-btn v2-tap"
                onClick={() => setIsCinemaModalOpen(false)}
                aria-label="Đóng rạp chiếu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="v2-video-modal__player">
              <iframe
                src={`https://www.youtube.com/embed/${tutorialVideoId}?autoplay=1&rel=0`}
                title="Video hướng dẫn sử dụng ứng dụng Audition AI để tạo ảnh 3D AI"
                className="v2-video-modal__iframe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="v2-video-modal__footer">
              <span className="v2-video-modal__author">Cody CN • Audition AI Studio</span>
              <button
                type="button"
                className="v2-primary-button v2-tap"
                style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}
                onClick={() => setIsCinemaModalOpen(false)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
