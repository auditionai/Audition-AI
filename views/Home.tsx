import React, { useEffect, useState } from 'react';
import { APP_CONFIG } from '../constants';
import { Language, Feature, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { subscribeCheckinStatus, isFeatureInMaintenance, type FeatureMaintenanceConfig } from '../services/economyService';

const NEON_FRAME_TONES = ['magenta', 'violet', 'cyan', 'emerald', 'amber', 'blue'] as const;

const DESKTOP_HERO_SLIDES = [
  {
    eyebrow: 'AUDITION AI STUDIO v4.2',
    title: 'TẠO ẢNH & VIDEO AI',
    highlight: 'NHÂN VẬT AUDITION 3D',
    description: 'Studio AI dành riêng cho cộng đồng Audition: tạo ảnh nhân vật 3D sắc nét, đội hình nhiều người và video chuyển động điện ảnh.',
    buttonLabel: 'Bắt đầu tạo ảnh',
    view: 'tools' as ViewId,
    imageLight: '/assets/audition-characters/desktop-hero-crew-light.webp',
    imageDark: '/assets/audition-characters/desktop-hero-crew.webp',
  },
  {
    eyebrow: 'COUPLE UNIVERSE',
    title: 'KỂ CÂU CHUYỆN',
    highlight: 'CỦA HAI NGƯỜI',
    description: 'Ghép đôi nhân vật Audition trong những khung hình hip-hop, ánh sáng neon và bố cục 3D được tối ưu tự động.',
    buttonLabel: 'Mở Couple Mode',
    view: 'tools' as ViewId,
    imageLight: '/assets/audition-characters/desktop-hero-couple-light-v2.webp',
    imageDark: '/assets/audition-characters/desktop-hero-couple-v2.webp',
  },
  {
    eyebrow: 'CREATIVE SQUAD',
    title: 'KHÁM PHÁ MỌI',
    highlight: 'CÔNG CỤ AI NỔI BẬT',
    description: 'Tạo đội hình, dựng video, chỉnh sửa ảnh và quản lý toàn bộ tác phẩm trong một hệ sinh thái sáng tạo thống nhất.',
    buttonLabel: 'Xem tất cả công cụ',
    view: 'tools' as ViewId,
    imageLight: '/assets/audition-characters/desktop-hero-squad-light-v2.webp',
    imageDark: '/assets/audition-characters/desktop-hero-squad-v2.webp',
  },
];

interface HomeProps {
  lang: Language;
  onSelectFeature: (feature: Feature) => void;
  onNavigate: (view: ViewId) => void;
  onOpenCheckin: () => void;
  isMaintenance?: boolean;
  maintenanceMessage?: string;
  featureMaintenance?: FeatureMaintenanceConfig | null;
}

export const Home: React.FC<HomeProps> = ({
  lang,
  onSelectFeature,
  onNavigate,
  onOpenCheckin,
  isMaintenance,
  maintenanceMessage,
  featureMaintenance
}) => {
  const [isCheckedInToday, setIsCheckedInToday] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'generation' | 'video' | 'editing'>('all');
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);

  useEffect(() => {
    return subscribeCheckinStatus((status) => {
      setIsCheckedInToday(status.isCheckedInToday);
    });
  }, []);

  useEffect(() => {
    if (heroPaused) return undefined;
    const timer = window.setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % DESKTOP_HERO_SLIDES.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [heroPaused]);

  const features: Feature[] = APP_CONFIG.main_features;
  const magicEditorFeature = features.find((feature) => feature.id === 'magic_editor_pro');
  const heroSlide = DESKTOP_HERO_SLIDES[activeHeroSlide];

  const filteredFeatures = features.filter((feat: Feature) => {
    if (activeCategory === 'all') return true;
    return feat.toolType === activeCategory;
  });

  return (
    <div className="w-full space-y-8 pb-24 animate-fade-in">
      
      {/* Maintenance Banner */}
      {isMaintenance && (
        <div className="w-full neu-card p-5 bg-gradient-to-r from-red-500/10 via-amber-500/10 to-red-500/10 border-red-500/30 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 neu-inset-sm rounded-2xl flex items-center justify-center text-red-500 shrink-0">
            <Icons.AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-red-500 uppercase tracking-wider font-accent">Hệ Thống Đang Bảo Trì Nâng Cấp</h4>
            <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 font-semibold">{maintenanceMessage || 'Vui lòng quay lại sau.'}</p>
          </div>
        </div>
      )}

      {/* ====================================================
          1. 3D HERO CONSOLE (Banner Giới Thiệu Ứng Dụng)
         ==================================================== */}
      <section
        className="desktop-character-hero desktop-rainbow-frame w-full neu-raised-lg p-6 sm:p-10 relative overflow-hidden border border-slate-300/80 dark:border-slate-800 shadow-2xl rounded-[2.5rem]"
        style={{
          '--desktop-hero-image-light': `url("${heroSlide.imageLight}")`,
          '--desktop-hero-image-dark': `url("${heroSlide.imageDark}")`,
        } as React.CSSProperties}
        onPointerEnter={() => setHeroPaused(true)}
        onPointerLeave={() => setHeroPaused(false)}
        onFocus={() => setHeroPaused(true)}
        onBlur={() => setHeroPaused(false)}
        aria-roledescription="carousel"
        aria-label="Tính năng nổi bật Audition AI"
      >
        
        {/* Subtle Ambient Accent */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#FF007F]/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Intro Copy */}
          <div className="lg:col-span-7 space-y-4 desktop-hero-copy" key={heroSlide.eyebrow}>
            
            <div className="inline-flex items-center gap-2 neu-inset-sm px-3.5 py-1.5 rounded-full border border-slate-300 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-[#FF007F]" />
              <span className="text-[11px] font-black uppercase tracking-wider text-[#FF007F] dark:text-[#FF007F] font-accent">
                {heroSlide.eyebrow}
              </span>
            </div>

            <h1
              className="flex flex-col items-start gap-3 sm:gap-4 py-1 font-accent font-black uppercase tracking-[-0.035em]"
              aria-label="Tạo ảnh và video AI nhân vật Audition 3D"
            >
              <span
                className="block text-[clamp(1.8rem,4vw,3.5rem)] leading-[0.9] text-slate-950 dark:text-white"
                style={{ textShadow: '0 2px 0 rgba(148,163,184,.45), 0 6px 18px rgba(0,0,0,.22)' }}
              >
                {heroSlide.title}
              </span>
              <span
                className="block text-[clamp(1.8rem,4vw,3.5rem)] leading-[0.9] text-[#FF007F]"
                style={{ textShadow: '0 2px 0 #9d004f, 0 5px 0 rgba(91,0,53,.45), 0 10px 22px rgba(255,0,127,.28)' }}
              >
                {heroSlide.highlight}
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 max-w-xl leading-relaxed font-bold">
              {heroSlide.description}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => onNavigate(heroSlide.view)}
                className="neu-button-primary px-7 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-xl hover:scale-105 transition-all"
              >
                <Icons.Wand className="w-4 h-4 text-white" />
                <span>{heroSlide.buttonLabel}</span>
              </button>

              <button
                onClick={() => onNavigate('prompt_library')}
                className="neu-button px-6 py-3.5 rounded-2xl text-xs font-black text-slate-950 dark:text-white flex items-center gap-2 hover:border-[#FF007F] transition-all"
              >
                <Icons.Sparkles className="w-4 h-4 text-[#FF007F]" />
                <span>Xem Prompt Mẫu</span>
              </button>

              <button
                onClick={onOpenCheckin}
                className={`neu-button px-6 py-3.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all ${
                  isCheckedInToday
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400 ring-2 ring-amber-400/40 animate-pulse'
                }`}
              >
                {isCheckedInToday ? <Icons.Check className="w-4 h-4" /> : <Icons.Calendar className="w-4 h-4" />}
                <span>
                  {isCheckedInToday
                    ? (lang === 'vi' ? 'Đã điểm danh hôm nay' : 'Checked in today')
                    : (lang === 'vi' ? 'Điểm danh nhận Vcoin' : 'Check in for Vcoin')}
                </span>
              </button>
            </div>

          </div>

          {/* Right Clean 2x2 Feature Grid */}
          <div className="hidden lg:col-span-5 grid-cols-2 gap-3">
            
            {/* Card 1: Tạo Ảnh */}
            <div 
              onClick={() => onNavigate('video')}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onNavigate('video');
              }}
              className="desktop-neon-card desktop-neon-frame--magenta neu-card p-4 rounded-2xl cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 neu-inset-sm rounded-xl flex items-center justify-center text-[#FF007F] mb-2.5 group-hover:scale-110 transition-transform">
                  <Icons.Sparkles className="w-4.5 h-4.5 text-[#FF007F]" />
                </div>
                <h4 className="text-xs font-black text-slate-950 dark:text-white font-accent">TẠO ẢNH AI 4K</h4>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold mt-0.5">Ảnh Đơn, Đôi, Nhóm 3-5 người</p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-black text-[#FF007F]">
                Giá từ 5 Vcoin
              </div>
            </div>

            {/* Card 2: Video AI */}
            <div 
              onClick={() => onNavigate('tools')}
              className="desktop-neon-card desktop-neon-frame--violet neu-card p-4 rounded-2xl cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 neu-inset-sm rounded-xl flex items-center justify-center text-[#FF007F] mb-2.5 group-hover:scale-110 transition-transform">
                  <Icons.Video className="w-4.5 h-4.5 text-[#FF007F]" />
                </div>
                <h4 className="text-xs font-black text-slate-950 dark:text-white font-accent">VIDEO AI LAB</h4>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold mt-0.5">Biến ảnh thành Video vũ đạo</p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-black text-[#FF007F]">
                Giá từ 15 Vcoin
              </div>
            </div>

            {/* Card 3: Prompt Hub */}
            <div 
              onClick={() => onNavigate('prompt_library')}
              className="desktop-neon-card desktop-neon-frame--cyan neu-card p-4 rounded-2xl cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 neu-inset-sm rounded-xl flex items-center justify-center text-[#FF007F] mb-2.5 group-hover:scale-110 transition-transform">
                  <Icons.BookOpen className="w-4.5 h-4.5 text-[#FF007F]" />
                </div>
                <h4 className="text-xs font-black text-slate-950 dark:text-white font-accent">PROMPT HUB</h4>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold mt-0.5">Thư viện prompt mẫu Audition</p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-black text-[#FF007F]">
                Miễn phí 100%
              </div>
            </div>

            {/* Card 4: Store Vcoin */}
            <div 
              onClick={() => onNavigate('topup')}
              className="desktop-neon-card desktop-neon-frame--amber neu-card p-4 rounded-2xl cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-9 h-9 neu-inset-sm rounded-xl flex items-center justify-center text-amber-500 mb-2.5 group-hover:scale-110 transition-transform">
                  <Icons.Gem className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <h4 className="text-xs font-black text-slate-950 dark:text-white font-accent">STORE VCOIN</h4>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold mt-0.5">Nạp Vcoin ưu đãi sự kiện</p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-black text-amber-600 dark:text-amber-400">
                +50% Bonus
              </div>
            </div>

          </div>

        </div>

        <div className="desktop-hero-carousel" aria-label="Điều khiển banner">
          <button
            type="button"
            onClick={() => setActiveHeroSlide((activeHeroSlide - 1 + DESKTOP_HERO_SLIDES.length) % DESKTOP_HERO_SLIDES.length)}
            aria-label="Banner trước"
          >
            <Icons.ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            {DESKTOP_HERO_SLIDES.map((slide, index) => (
              <button
                type="button"
                key={slide.eyebrow}
                className={activeHeroSlide === index ? 'is-active' : ''}
                onClick={() => setActiveHeroSlide(index)}
                aria-label={`Xem banner ${index + 1}`}
                aria-current={activeHeroSlide === index ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setActiveHeroSlide((activeHeroSlide + 1) % DESKTOP_HERO_SLIDES.length)}
            aria-label="Banner sau"
          >
            <Icons.ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </section>

      <section className="desktop-primary-tools grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Công cụ sáng tạo chính">
        <button
          type="button"
          onClick={() => onNavigate('tools')}
          className="desktop-primary-tool desktop-primary-tool--image desktop-neon-frame desktop-neon-frame--magenta text-left"
        >
          <span className="desktop-primary-tool__copy">
            <span className="desktop-primary-tool__icon"><Icons.Sparkles className="w-5 h-5" /></span>
            <strong>Tạo Ảnh AI</strong>
            <small>Ảnh đơn, couple và đội hình 3–5 người</small>
          </span>
          <span className="desktop-primary-tool__action">Khám phá <Icons.ChevronRight className="w-4 h-4" /></span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('tools')}
          className="desktop-primary-tool desktop-primary-tool--video desktop-neon-frame desktop-neon-frame--violet text-left"
        >
          <span className="desktop-primary-tool__copy">
            <span className="desktop-primary-tool__icon"><Icons.Video className="w-5 h-5" /></span>
            <strong>Tạo Video AI</strong>
            <small>Biến ảnh thành thước phim và vũ đạo 3D</small>
          </span>
          <span className="desktop-primary-tool__action">Khám phá <Icons.ChevronRight className="w-4 h-4" /></span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (magicEditorFeature) onSelectFeature(magicEditorFeature);
          }}
          className="desktop-primary-tool desktop-primary-tool--editing desktop-neon-frame desktop-neon-frame--cyan text-left"
        >
          <span className="desktop-primary-tool__copy">
            <span className="desktop-primary-tool__icon"><Icons.Wand className="w-5 h-5" /></span>
            <strong>Chỉnh Sửa Ảnh</strong>
            <small>Tách nền, làm nét và chỉnh sửa bằng AI</small>
          </span>
          <span className="desktop-primary-tool__action">Khám phá <Icons.ChevronRight className="w-4 h-4" /></span>
        </button>
      </section>

      {/* ====================================================
          2. STUDIO FEATURE FILTERS & GRID
         ==================================================== */}
      <section className="space-y-6">
        
        {/* Header & Filter Pills */}
        <div className="desktop-neon-frame desktop-neon-frame--emerald flex flex-col sm:flex-row sm:items-center justify-between gap-4 neu-raised-sm p-4 rounded-3xl shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 neu-inset-sm rounded-2xl flex items-center justify-center text-[#FF007F]">
              <Icons.Wand className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white font-accent uppercase">DANH MỤC CÔNG CỤ AI</h2>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold">Chọn công cụ để mở Studio làm việc</p>
            </div>
          </div>

          {/* Category Filter Pills - Direct & Visual */}
          <div className="flex gap-2 neu-inset-sm p-1.5 rounded-2xl overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'Tất Cả', icon: Icons.Palette, count: features.length, color: 'text-purple-600 dark:text-[#00F2FE]' },
              { id: 'generation', label: 'Tạo Ảnh (Đơn/Nhóm)', icon: Icons.Sparkles, count: features.filter(f => f.toolType === 'generation').length, color: 'text-[#FF007F]' },
              { id: 'video', label: 'Tạo Video AI', icon: Icons.Video, count: features.filter(f => f.toolType === 'video').length, color: 'text-sky-600 dark:text-[#00F2FE]' },
              { id: 'editing', label: 'Chỉnh Sửa Tool', icon: Icons.Wand, count: features.filter(f => f.toolType === 'editing').length, color: 'text-amber-600 dark:text-amber-400' },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all uppercase tracking-wider flex items-center gap-2 ${
                    isActive
                      ? 'neu-raised-sm border-2 border-[#FF007F] text-slate-950 dark:text-white shadow-lg font-accent'
                      : 'neu-button text-slate-800 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? cat.color : 'text-slate-500'}`} />
                  <span>{cat.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-black ${
                    isActive ? 'bg-[#FF007F] text-white' : 'bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFeatures.map((feat: Feature, featureIndex) => {
            const inMaint = isFeatureInMaintenance(featureMaintenance, feat.id);
            const neonTone = NEON_FRAME_TONES[featureIndex % NEON_FRAME_TONES.length];
            
            // Unique icon for each feature card
            const renderUniqueIcon = () => {
              switch (feat.id) {
                case 'single_photo_gen':
                  return <Icons.User className="w-7 h-7 text-[#FF007F]" />;
                case 'couple_photo_gen':
                  return <Icons.Heart className="w-7 h-7 text-[#FF007F]" />;
                case 'group_3_gen':
                  return <Icons.Users className="w-7 h-7 text-amber-500" />;
                case 'group_4_gen':
                  return <Icons.Shield className="w-7 h-7 text-emerald-500" />;
                case 'group_5_gen':
                  return <Icons.Crown className="w-7 h-7 text-purple-500" />;
                case 'ai_image_tool':
                  return <Icons.Sparkles className="w-7 h-7 text-[#00F2FE]" />;
                case 'magic_editor_pro':
                  return <Icons.Wand className="w-7 h-7 text-[#9D00FF]" />;
                case 'remove_bg_pro':
                  return <Icons.Scissors className="w-7 h-7 text-[#00F2FE]" />;
                case 'sharpen_upscale':
                  return <Icons.Zap className="w-7 h-7 text-amber-500" />;
                case 'video_ai_gen':
                  return <Icons.Video className="w-7 h-7 text-[#00F2FE]" />;
                case 'motion_control_gen':
                  return <Icons.Play className="w-7 h-7 text-[#FF007F]" />;
                default:
                  return <Icons.Sparkles className="w-7 h-7 text-[#FF007F]" />;
              }
            };

            return (
              <div
                key={feat.id}
                onClick={() => !inMaint && onSelectFeature(feat)}
                className={`desktop-feature-art-card desktop-feature-art-card--${feat.toolType} desktop-neon-card desktop-neon-frame--${neonTone} neu-card p-6 flex flex-col justify-between group cursor-pointer hover:scale-[1.02] transition-all relative overflow-hidden shadow-xl ${
                  inMaint ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 neu-inset-sm rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      {renderUniqueIcon()}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {feat.tag === 'HOT' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black text-white bg-gradient-to-r from-red-500 to-[#FF007F] shadow-sm uppercase tracking-wider">
                          HOT
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2 font-accent group-hover:text-[#FF007F] transition-colors uppercase">
                    {feat.name[lang]}
                  </h3>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed line-clamp-2">
                    {feat.description[lang]}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="neu-inset-sm px-3 py-1 rounded-xl text-[11px] text-amber-500 font-black flex items-center gap-1">
                    <Icons.Gem className="w-3.5 h-3.5 text-amber-500" />
                    <span>{feat.engine}</span>
                  </span>
                  <div className="neu-button px-3.5 py-1.5 rounded-xl text-[10px] font-black text-[#FF007F] flex items-center gap-1 group-hover:bg-[#FF007F] group-hover:text-white transition-all uppercase tracking-wider font-accent">
                    <span>Trải nghiệm</span>
                    <Icons.ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </section>

    </div>
  );
};
