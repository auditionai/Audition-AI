import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { createDanceVideoOrder, getDanceVideoTemplates } from '../services/danceVideoService';
import { uploadFileToR2 } from '../services/storageService';
import type { DanceVideoTemplate } from '../types';
import './dance-video-orders.css';

type CheckoutStep = 'review' | 'assets' | 'confirm';

const checkoutSteps: Array<{ id: CheckoutStep; stepNum: number; label: string; desc: string }> = [
  { id: 'review', stepNum: 1, label: 'Xem mẫu', desc: 'Video & Giá' },
  { id: 'assets', stepNum: 2, label: 'Ảnh nhân vật', desc: 'Tải ảnh game' },
  { id: 'confirm', stepNum: 3, label: 'Đặt đơn', desc: 'Xác nhận' },
];

const socialLinks = [
  { label: 'Chat Facebook', href: 'https://www.facebook.com/profile.php?id=61573249500027', Icon: Icons.Facebook, color: 'text-blue-500' },
  { label: 'Hotline / Zalo', href: 'tel:0824280497', Icon: Icons.Phone, color: 'text-emerald-500' },
  { label: 'Kênh TikTok', href: 'https://www.tiktok.com/@auditionai.io.vn', Icon: Icons.Video, color: 'text-[#FF007F]' },
];

// Fallback safe notification helper to prevent any crashes outside NotificationProvider (especially mobile-app)
const useSafeNotify = () => {
  try {
    const { notify } = useNotification();
    return notify;
  } catch {
    return (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
      if (typeof window !== 'undefined') {
        if (type === 'error') alert(message);
        else console.log(`[Notification ${type}]:`, message);
      }
    };
  }
};

// --- VIDEO TEMPLATE CARD (CLEAN VIDEO VIEWPORT, HOVER AUTOPLAY WITH AUDIO, METADATA BELOW) ---
const VideoTemplateCard: React.FC<{
  template: DanceVideoTemplate;
  onSelect: (template: DanceVideoTemplate) => void;
}> = ({ template, onSelect }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Play video with audio automatically on hover
  const handleMouseEnter = async () => {
    if (!videoRef.current) return;
    try {
      videoRef.current.muted = false;
      await videoRef.current.play();
    } catch {
      // Browser autoplay policy might require muted fallback before first interaction
      if (videoRef.current) {
        videoRef.current.muted = true;
        void videoRef.current.play();
      }
    }
  };

  const handleMouseLeave = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
  };

  const handleClickVideo = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      try {
        videoRef.current.muted = false;
        await videoRef.current.play();
      } catch {
        videoRef.current.muted = true;
        void videoRef.current.play();
      }
    } else {
      videoRef.current.pause();
    }
  };

  const hashtags = useMemo(() => {
    const categoryTag = template.category ? `#${template.category.replace(/\s+/g, '')}` : '#DanceCover';
    return ['#DanceAI', '#MotionControl', categoryTag, '#Audition3D'];
  }, [template.category]);

  return (
    <article
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="neu-card dance-card-glow rounded-3xl overflow-hidden border border-slate-300 dark:border-slate-800 shadow-xl flex flex-col justify-between group transition-all"
    >
      {/* 1. 100% CLEAN VIDEO VIEWPORT - NO ICONS, NO BADGES OVERLAYING THE VIDEO */}
      <div 
        onClick={handleClickVideo}
        className="relative w-full aspect-[16/10] sm:aspect-video min-h-[220px] max-h-[290px] bg-slate-950 overflow-hidden cursor-pointer"
        title="Rê chuột hoặc chạm để xem video có tiếng"
      >
        <video
          ref={videoRef}
          src={template.preview_video_url}
          className="w-full h-full object-cover"
          playsInline
          loop
          preload="metadata"
        />
      </div>

      {/* 2. CARD METADATA & BODY (ALL BADGES AND INFO LOCATED SAFELY BELOW THE VIDEO) */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3.5">
        <div className="space-y-2.5">
          {/* Row 1: Category & Required Character Count Badges */}
          <div className="flex items-center justify-between gap-2">
            <span className="neu-inset-sm px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider font-accent text-[#00F2FE] border border-cyan-400/20">
              {template.category || 'Dance AI'}
            </span>

            <span className="neu-inset-sm px-2.5 py-1 rounded-lg text-[10px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1 border border-slate-200 dark:border-slate-800">
              <Icons.User className="w-3 h-3 text-[#FF007F]" />
              <span>{template.required_image_count} ảnh nhân vật</span>
            </span>
          </div>

          {/* Row 2: Title & Golden Vcoin Badge */}
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-black font-accent text-slate-950 dark:text-white group-hover:text-[#FF007F] transition-colors line-clamp-1">
              {template.title}
            </h3>

            {/* Vcoin Price Badge */}
            <div className="neu-inset-sm px-3 py-1 rounded-xl text-amber-500 font-mono font-black text-sm shrink-0 flex items-center gap-1.5 border border-amber-500/25">
              <Icons.Gem className="w-4 h-4 text-amber-500" />
              <span>{template.price_vcoin.toLocaleString('vi-VN')}</span>
              <span className="text-[10px] font-accent text-amber-400">VC</span>
            </div>
          </div>

          {/* Row 3: Prominent Hashtags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="neu-inset-sm px-2.5 py-0.5 rounded-lg text-[10px] font-black font-accent tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#FF007F] via-[#9D00FF] to-[#00F2FE] border border-[#FF007F]/20"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium line-clamp-2 leading-relaxed">
            {template.description || 'Tái tạo chuyển động chuẩn xác theo từng nhịp điệu và vũ đạo của video mẫu.'}
          </p>
        </div>

        {/* 3. CARD ACTION FOOTER */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Sẵn sàng nhận đơn</span>
          </div>

          <button
            type="button"
            onClick={() => onSelect(template)}
            className="neu-button-primary px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 group-hover:scale-105 transition-all shadow-lg"
          >
            <span>CHỌN MẪU NÀY</span>
            <Icons.ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const DanceVideoOrders: React.FC = () => {
  const notify = useSafeNotify();
  const [templates, setTemplates] = useState<DanceVideoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [selected, setSelected] = useState<DanceVideoTemplate | null>(null);
  const [step, setStep] = useState<CheckoutStep>('review');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [zalo, setZalo] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getDanceVideoTemplates();
      setTemplates(data || []);
    } catch (error: any) {
      notify(error?.message || 'Không thể tải danh mục video mẫu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => () => previewUrls.forEach(URL.revokeObjectURL), [previewUrls]);

  const categories = useMemo(() => {
    return ['Tất cả', ...Array.from(new Set(templates.map((item) => item.category || 'Dance AI')))];
  }, [templates]);

  const visible = useMemo(() => {
    return templates.filter((item) => {
      const matchesCategory = category === 'Tất cả' || item.category === category;
      const haystack = `${item.title} ${item.description || ''} ${item.category || ''}`.toLocaleLowerCase('vi-VN');
      return matchesCategory && haystack.includes(query.toLocaleLowerCase('vi-VN').trim());
    });
  }, [templates, category, query]);

  const stepIndex = checkoutSteps.findIndex((item) => item.id === step);

  const openOrder = (template: DanceVideoTemplate) => {
    setSelected(template);
    setStep('review');
    setFiles([]);
    setPreviewUrls([]);
    setZalo('');
    setNote('');
  };

  const changeFiles = (input: FileList | null) => {
    if (!input || !selected) return;
    previewUrls.forEach(URL.revokeObjectURL);
    const next = Array.from(input).slice(0, selected.required_image_count);
    setFiles(next);
    setPreviewUrls(next.map((file) => URL.createObjectURL(file)));
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreviewUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const submitOrder = async () => {
    if (!selected || files.length !== selected.required_image_count) return;
    setSubmitting(true);
    try {
      const characterImageUrls = await Promise.all(
        files.map((file, index) =>
          uploadFileToR2(file, `dance-orders/${selected.id}/character-${index + 1}`)
        )
      );
      await createDanceVideoOrder({
        templateId: selected.id,
        characterImageUrls,
        contactZalo: zalo,
        note,
      });
      notify('Đơn video đã được tạo thành công! Theo dõi tiến độ trong Lịch sử tạo.', 'success');
      window.location.assign('/gallery');
    } catch (error: any) {
      notify(
        error?.message?.includes('INSUFFICIENT_VCOIN')
          ? 'Số dư Vcoin không đủ cho đơn này. Vui lòng nạp thêm Vcoin.'
          : (error?.message || 'Không thể tạo đơn video.'),
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dance-order-page w-full space-y-5 animate-fade-in">
      
      {/* 1. HERO BANNER HEADER - FULL WIDTH & HARMONIOUS SPACING */}
      <section className="neu-card rounded-3xl p-6 sm:p-7 relative overflow-hidden border border-slate-300 dark:border-slate-800 shadow-xl">
        {/* Glow ambient background aura */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-gradient-to-br from-[#FF007F]/20 via-[#9D00FF]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-gradient-to-tr from-[#00F2FE]/20 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 neu-inset-sm px-3.5 py-1.5 rounded-full text-[11px] font-black tracking-wider uppercase font-accent text-[#00F2FE]">
              <span className="w-2 h-2 rounded-full bg-[#00F2FE] dance-live-dot" />
              <Icons.Video className="w-3.5 h-3.5 text-[#00F2FE]" />
              <span>MOTION CATALOG SERVICE</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-accent tracking-wide uppercase text-slate-950 dark:text-white leading-tight">
              ĐẶT LÀM <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF007F] via-[#9D00FF] to-[#00F2FE]">VIDEO AI</span> THEO MẪU
            </h1>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
              Chọn vũ đạo yêu thích từ thư viện mẫu. Chúng tôi sẽ tái tạo video chuyển động chính xác 100% cho nhân vật Audition của bạn bằng công nghệ Motion Control AI cao cấp.
            </p>

            {/* Quick Guarantees Strip */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5 neu-inset-sm px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <Icons.Clock className="w-3.5 h-3.5 text-[#00F2FE]" />
                Thời gian xử lý: 15–30 phút (tối đa 24h)
              </span>
              <span className="flex items-center gap-1.5 neu-inset-sm px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <Icons.Shield className="w-3.5 h-3.5 text-emerald-500" />
                Hoàn Vcoin tự động nếu chưa tiếp nhận
              </span>
            </div>
          </div>

          {/* Right Stats Metrics Console */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 xl:w-96 shrink-0">
            <div className="neu-card p-3.5 sm:p-4 rounded-2xl text-center space-y-1 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-accent">Nhanh nhất</span>
              <div className="text-lg sm:text-2xl font-black font-accent text-[#00F2FE]">15–30'</div>
              <span className="text-[10px] text-slate-500 block">Trả video ngay</span>
            </div>

            <div className="neu-card p-3.5 sm:p-4 rounded-2xl text-center space-y-1 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-accent">Cam kết</span>
              <div className="text-lg sm:text-2xl font-black font-accent text-amber-500">24 Giờ</div>
              <span className="text-[10px] text-slate-500 block">Tối đa hoàn tiền</span>
            </div>

            <div className="neu-card p-3.5 sm:p-4 rounded-2xl text-center space-y-1 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-accent">Độ khớp</span>
              <div className="text-lg sm:text-2xl font-black font-accent text-[#FF007F]">100%</div>
              <span className="text-[10px] text-slate-500 block">Theo video mẫu</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <section className="neu-card p-3 sm:p-3.5 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px]">
          <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#FF007F]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tên dance, bài hát, phong cách..."
            className="neu-input w-full h-11 pl-10 pr-4 text-xs font-bold rounded-xl outline-none"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto dance-category-scroll py-0.5">
          {categories.map((item) => {
            const isActive = category === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-black font-accent uppercase tracking-wider transition-all ${
                  isActive
                    ? 'neu-inset-sm text-[#FF007F] ring-2 ring-[#FF007F] scale-[1.02]'
                    : 'neu-button text-slate-700 dark:text-slate-300 hover:text-[#FF007F]'
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Refresh & Counter */}
        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold font-accent text-slate-700 dark:text-slate-400">
            {visible.length} mẫu hiển thị
          </span>
          <button
            type="button"
            onClick={() => void loadTemplates()}
            className="neu-button p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:text-[#FF007F] transition-all"
            aria-label="Tải lại danh mục"
          >
            <Icons.RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#FF007F]' : ''}`} />
          </button>
        </div>
      </section>

      {/* 3. CATALOG VIDEO GRID - SPACIOUS, PROMINENT & CINEMATIC */}
      {loading ? (
        <div className="neu-card rounded-3xl p-14 text-center border border-slate-300 dark:border-slate-800 shadow-lg space-y-3">
          <Icons.Loader className="w-8 h-8 animate-spin mx-auto text-[#00F2FE]" />
          <h3 className="text-sm font-black font-accent text-slate-950 dark:text-white uppercase">Đang tải thư viện video mẫu...</h3>
          <p className="text-xs text-slate-500">Vui lòng chờ giây lát trong khi hệ thống đồng bộ dữ liệu Cloudflare R2.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="neu-card rounded-3xl p-14 text-center border border-slate-300 dark:border-slate-800 shadow-lg space-y-3">
          <div className="w-12 h-12 neu-inset-sm rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Icons.Search className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="text-sm font-black font-accent text-slate-950 dark:text-white uppercase">Không tìm thấy video mẫu</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Không có chuyển động mẫu nào phù hợp với từ khóa "{query}". Hãy thử tìm kiếm với từ khóa khác hoặc chuyển sang danh mục "Tất cả".
          </p>
          <button
            type="button"
            onClick={() => { setQuery(''); setCategory('Tất cả'); }}
            className="neu-button px-4 py-2 rounded-xl text-xs font-black text-[#FF007F] mt-1"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5 sm:gap-6">
          {visible.map((template) => (
            <VideoTemplateCard
              key={template.id}
              template={template}
              onSelect={openOrder}
            />
          ))}
        </section>
      )}

      {/* 4. REDESIGNED CENTERED ORDER MODAL (LUXURY, INTUITIVE & PERFECTLY CENTERED ON MOBILE & DESKTOP) */}
      {selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md overflow-y-auto">
          {/* Backdrop click to dismiss */}
          <div className="fixed inset-0" onClick={() => setSelected(null)} />

          {/* Modal Container */}
          <div className="relative z-10 w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] neu-card rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden dance-modal-animate my-auto">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between bg-slate-200/50 dark:bg-black/20 shrink-0">
              <div className="min-w-0 pr-3">
                <span className="text-[10px] font-black uppercase tracking-widest font-accent text-[#00F2FE] block">
                  ĐẶT LÀM VIDEO THEO MẪU
                </span>
                <h2 className="text-base sm:text-lg font-black font-accent text-slate-950 dark:text-white truncate mt-0.5">
                  {selected.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="neu-button p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-red-500 transition-colors shrink-0"
                aria-label="Đóng cửa sổ"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div className="grid grid-cols-3 border-b border-slate-300 dark:border-slate-800 bg-slate-200/30 dark:bg-black/10 shrink-0">
              {checkoutSteps.map((item, index) => {
                const isCurrent = step === item.id;
                const isDone = index < stepIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={index > stepIndex}
                    onClick={() => index <= stepIndex && setStep(item.id)}
                    className={`py-2.5 px-1.5 text-center flex flex-col items-center gap-0.5 border-r last:border-r-0 border-slate-300 dark:border-slate-800 transition-all ${
                      isCurrent
                        ? 'neu-inset-sm bg-[#FF007F]/10 text-[#FF007F]'
                        : isDone
                        ? 'text-emerald-500 hover:bg-slate-300/30'
                        : 'text-slate-400 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                      isCurrent
                        ? 'bg-[#FF007F] text-white shadow-md'
                        : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-400'
                    }`}>
                      {isDone ? <Icons.Check className="w-2.5 h-2.5" /> : item.stepNum}
                    </span>
                    <span className="text-[10px] font-black font-accent tracking-wider uppercase">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
              
              {/* STEP 1: REVIEW TEMPLATE */}
              {step === 'review' && (
                <div className="space-y-4">
                  {/* Clean Video Preview */}
                  <div className="neu-card p-2.5 rounded-2xl border border-slate-300 dark:border-slate-800">
                    <video
                      src={selected.preview_video_url}
                      controls
                      playsInline
                      className="w-full aspect-video max-h-56 rounded-xl bg-black object-cover"
                    />
                    <div className="mt-2.5 flex items-center justify-between px-1">
                      <b className="text-sm font-black font-accent text-slate-950 dark:text-white truncate">{selected.title}</b>
                      <span className="neu-inset-sm px-2.5 py-1 rounded-xl text-amber-500 font-mono font-black text-xs shrink-0">
                        {selected.price_vcoin} Vcoin
                      </span>
                    </div>
                  </div>

                  {/* Requirements & Policy Alert */}
                  <div className="neu-card p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 font-accent">
                      <Icons.AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Cam kết dịch vụ Motion Control</span>
                    </div>
                    <ul className="text-[11px] text-slate-700 dark:text-slate-300 font-medium space-y-1.5 list-disc pl-4 leading-relaxed">
                      <li>Yêu cầu <b>{selected.required_image_count} ảnh nhân vật Audition</b> chụp toàn thân rõ nét.</li>
                      <li>Thời gian hoàn thành từ <b>15 - 30 phút</b>, chậm nhất 24 giờ.</li>
                      <li>Khi đơn đang chờ và Admin chưa tiếp nhận, bạn có thể hủy đơn và hoàn lại 100% Vcoin.</li>
                      <li>Sau khi Admin tiếp nhận, đơn sẽ tiến hành render và không thể hủy hoàn.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* STEP 2: UPLOAD ASSETS */}
              {step === 'assets' && (
                <div className="space-y-4">
                  {/* Guidelines */}
                  <div className="neu-card p-3.5 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 font-accent">
                      <Icons.Sparkles className="w-3.5 h-3.5 text-[#00F2FE]" />
                      <span>Cần tải lên {selected.required_image_count} ảnh nhân vật Audition</span>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                      Chụp ảnh nhân vật trong game Audition rõ nét, ưu tiên chụp toàn thân với trang phục mong muốn. Tối đa {selected.required_image_count} ảnh.
                    </p>
                  </div>

                  {/* Dropzone */}
                  <label className="neu-card border-2 border-dashed border-[#FF007F]/50 rounded-2xl p-5 text-center cursor-pointer hover:border-[#FF007F] transition-colors flex flex-col items-center justify-center gap-1.5 group">
                    <div className="w-10 h-10 neu-inset-sm rounded-xl flex items-center justify-center text-[#FF007F] group-hover:scale-110 transition-transform">
                      <Icons.Upload className="w-5 h-5 text-[#FF007F]" />
                    </div>
                    <div className="font-black font-accent text-xs sm:text-sm text-slate-950 dark:text-white uppercase">
                      Bấm vào đây để chọn ảnh từ thiết bị
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Hỗ trợ PNG, JPG, WEBP • Cần đủ {selected.required_image_count} ảnh
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple={selected.required_image_count > 1}
                      onChange={(event) => changeFiles(event.target.files)}
                      className="sr-only"
                    />
                  </label>

                  {/* Uploaded Previews */}
                  {previewUrls.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-accent">
                        Ảnh đã chọn ({previewUrls.length}/{selected.required_image_count})
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {previewUrls.map((url, index) => (
                          <div key={url} className="neu-card p-1.5 rounded-xl relative group overflow-hidden">
                            <img
                              src={url}
                              alt={`Nhân vật ${index + 1}`}
                              className="w-full aspect-square object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="absolute top-2 right-2 p-1 rounded-md bg-black/70 text-white hover:bg-red-500 transition-colors"
                              aria-label={`Xóa ảnh ${index + 1}`}
                            >
                              <Icons.X className="w-3 h-3" />
                            </button>
                            <span className="text-[9px] font-bold text-center block mt-1 text-slate-600 dark:text-slate-300">
                              Ảnh {index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Help links if user doesn't know how to capture game images */}
                  <div className="neu-card p-3.5 rounded-2xl border border-slate-300 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-accent block">
                      Không biết chụp ảnh nhân vật?
                    </span>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                      Liên hệ trực tiếp để Admin hỗ trợ đăng nhập game chụp nhân vật miễn phí cho bạn:
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-0.5">
                      {socialLinks.map(({ label, href, Icon, color }) => (
                        <a
                          key={label}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="neu-button py-2 px-2 rounded-xl text-center flex items-center justify-center gap-1 text-[9px] font-black hover:scale-[1.02] transition-transform"
                        >
                          <Icon className={`w-3 h-3 ${color}`} />
                          <span className="truncate">{label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: CONFIRM & SUBMIT */}
              {step === 'confirm' && (
                <div className="space-y-4">
                  {/* Summary Card */}
                  <div className="neu-card p-3.5 rounded-2xl border border-slate-300 dark:border-slate-800 space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-accent">
                      Tóm tắt đơn hàng
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Mẫu video:</span>
                        <b className="font-accent text-slate-950 dark:text-white truncate max-w-[200px]">{selected.title}</b>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Số ảnh đã tải:</span>
                        <b className="font-accent text-emerald-500">{files.length}/{selected.required_image_count} ảnh</b>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Thời gian xử lý:</span>
                        <b className="font-accent text-cyan-500">15 - 30 phút</b>
                      </div>
                      <div className="flex justify-between py-1.5 text-sm">
                        <span className="font-bold text-slate-700 dark:text-slate-300">Tổng thanh toán:</span>
                        <span className="text-amber-500 font-mono font-black text-sm sm:text-base flex items-center gap-1">
                          <Icons.Gem className="w-3.5 h-3.5 text-amber-500" />
                          {selected.price_vcoin.toLocaleString('vi-VN')} Vcoin
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-2.5">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-accent">
                        Số Zalo để Admin liên hệ giao video
                      </span>
                      <input
                        value={zalo}
                        onChange={(event) => setZalo(event.target.value)}
                        placeholder="Nhập số Zalo của bạn (không bắt buộc)..."
                        className="neu-input w-full h-10 px-3 text-xs font-bold rounded-xl outline-none"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-accent">
                        Ghi chú yêu cầu thêm cho Admin
                      </span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Ví dụ: Giữ nguyên màu tóc, phong cách biểu cảm, liên hệ trước khi xuất video..."
                        className="neu-input w-full h-20 p-2.5 text-xs font-medium rounded-xl outline-none resize-none"
                      />
                    </label>
                  </div>

                  {/* Note about auto deduct */}
                  <div className="neu-inset-sm p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Xác nhận đặt đơn sẽ tự động trừ <b className="text-amber-500">{selected.price_vcoin} Vcoin</b> từ tài khoản của bạn. Đơn hàng sẽ ngay lập tức xuất hiện tại mục <b>Lịch Sử Tạo</b> để bạn theo dõi trạng thái.
                  </div>
                </div>
              )}

            </div>

            {/* STICKY MODAL FOOTER - ALWAYS ACCESSIBLE WITHOUT SCROLLING HUNT ON MOBILE */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300 dark:border-slate-800 bg-slate-200/50 dark:bg-black/20 flex items-center justify-between gap-3 shrink-0">
              {step === 'review' ? (
                <div className="w-full flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="neu-button px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Đóng
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep('assets')}
                    className="flex-1 neu-button-primary py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <span>Tiếp Tục: Tải Ảnh Nhân Vật</span>
                    <Icons.ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ) : step === 'assets' ? (
                <div className="w-full flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep('review')}
                    className="neu-button px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Quay Lại
                  </button>

                  <button
                    type="button"
                    disabled={files.length !== selected.required_image_count}
                    onClick={() => setStep('confirm')}
                    className="flex-1 neu-button-primary py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>Tiếp Tục: Kiểm Tra Đơn</span>
                    <Icons.ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-full flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep('assets')}
                    className="neu-button px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Quay Lại
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submitOrder()}
                    className="flex-1 neu-button-primary py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Icons.Loader className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Đang Tạo Đơn...</span>
                      </>
                    ) : (
                      <>
                        <span>Xác Nhận Đặt Video ({selected.price_vcoin} VC)</span>
                        <Icons.Check className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
