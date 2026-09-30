import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { useNotification } from '../components/NotificationSystem';
import { createDanceVideoOrder, getDanceVideoTemplates } from '../services/danceVideoService';
import { uploadFileToR2 } from '../services/storageService';
import type { DanceVideoTemplate } from '../types';
import './dance-video-orders.css';

type CheckoutStep = 'review' | 'assets' | 'confirm';

const checkoutSteps: Array<{ id: CheckoutStep; stepNum: number; label: string; desc: string }> = [
  { id: 'review', stepNum: 1, label: 'Kiểm tra mẫu', desc: 'Xem video & chi phí' },
  { id: 'assets', stepNum: 2, label: 'Ảnh nhân vật', desc: 'Tải ảnh từ game' },
  { id: 'confirm', stepNum: 3, label: 'Đặt đơn hàng', desc: 'Xác nhận & trừ Vcoin' },
];

const socialLinks = [
  { label: 'Chat Facebook', href: 'https://www.facebook.com/profile.php?id=61573249500027', Icon: Icons.Facebook, color: 'text-blue-500' },
  { label: 'Hotline / Zalo', href: 'tel:0824280497', Icon: Icons.Phone, color: 'text-emerald-500' },
  { label: 'Kênh TikTok', href: 'https://www.tiktok.com/@auditionai.io.vn', Icon: Icons.Video, color: 'text-[#FF007F]' },
];

export const DanceVideoOrders: React.FC = () => {
  const { notify } = useNotification();
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
    <div className="dance-order-page space-y-6 animate-fade-in px-3 sm:px-6">
      
      {/* 1. HERO BANNER HEADER */}
      <section className="neu-card rounded-3xl p-6 sm:p-8 relative overflow-hidden border border-slate-300 dark:border-slate-800 shadow-2xl">
        {/* Glow ambient background aura */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-gradient-to-br from-[#FF007F]/20 via-[#9D00FF]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-gradient-to-tr from-[#00F2FE]/20 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 neu-inset-sm px-3 py-1.5 rounded-full text-[11px] font-black tracking-wider uppercase font-accent text-[#00F2FE]">
              <span className="w-2 h-2 rounded-full bg-[#00F2FE] dance-live-dot" />
              <Icons.Video className="w-3.5 h-3.5 text-[#00F2FE]" />
              <span>MOTION CATALOG SERVICE</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black font-accent tracking-wide uppercase text-slate-950 dark:text-white leading-tight">
              ĐẶT LÀM <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF007F] via-[#9D00FF] to-[#00F2FE]">VIDEO AI</span> THEO MẪU
            </h1>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
              Chọn vũ đạo yêu thích từ thư viện mẫu. Chúng tôi sẽ tái tạo video chuyển động chính xác 100% cho nhân vật Audition của bạn bằng công nghệ Motion Control AI cao cấp.
            </p>

            {/* Quick Guarantees Strip */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
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
          <div className="grid grid-cols-3 gap-2 sm:gap-3 xl:w-96 shrink-0">
            <div className="neu-card p-3.5 sm:p-4 rounded-2xl text-center space-y-1 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-accent">Nhanh nhất</span>
              <div className="text-lg sm:text-2xl font-black font-accent text-[#00F2FE]">15–30'</div>
              <span className="text-[9px] text-slate-500 block">Trả video ngay</span>
            </div>

            <div className="neu-card p-3.5 sm:p-4 rounded-2xl text-center space-y-1 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-accent">Cam kết</span>
              <div className="text-lg sm:text-2xl font-black font-accent text-amber-500">24 Giờ</div>
              <span className="text-[9px] text-slate-500 block">Tối đa hoàn tiền</span>
            </div>

            <div className="neu-card p-3.5 sm:p-4 rounded-2xl text-center space-y-1 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 font-accent">Độ khớp</span>
              <div className="text-lg sm:text-2xl font-black font-accent text-[#FF007F]">100%</div>
              <span className="text-[9px] text-slate-500 block">Theo video mẫu</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <section className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
        <div className="flex items-center gap-2 overflow-x-auto dance-category-scroll py-1">
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

      {/* 3. CATALOG VIDEO GRID */}
      {loading ? (
        <div className="neu-card rounded-3xl p-16 text-center border border-slate-300 dark:border-slate-800 shadow-xl space-y-3">
          <Icons.Loader className="w-8 h-8 animate-spin mx-auto text-[#00F2FE]" />
          <h3 className="text-base font-black font-accent text-slate-950 dark:text-white uppercase">Đang tải thư viện video mẫu...</h3>
          <p className="text-xs text-slate-500">Vui lòng chờ giây lát trong khi hệ thống đồng bộ dữ liệu Cloudflare R2.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="neu-card rounded-3xl p-16 text-center border border-slate-300 dark:border-slate-800 shadow-xl space-y-3">
          <div className="w-14 h-14 neu-inset-sm rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Icons.Search className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-base font-black font-accent text-slate-950 dark:text-white uppercase">Không tìm thấy video mẫu</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Không có chuyển động mẫu nào phù hợp với từ khóa "{query}". Hãy thử tìm kiếm với từ khóa khác hoặc chuyển sang danh mục "Tất cả".
          </p>
          <button
            type="button"
            onClick={() => { setQuery(''); setCategory('Tất cả'); }}
            className="neu-button px-4 py-2 rounded-xl text-xs font-black text-[#FF007F] mt-2"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible.map((template) => (
            <article
              key={template.id}
              className="neu-card dance-card-glow rounded-3xl overflow-hidden border border-slate-300 dark:border-slate-800 shadow-xl flex flex-col group"
            >
              {/* Video Player Showcase Area */}
              <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                <video
                  src={template.preview_video_url}
                  className="w-full h-full object-cover"
                  controls
                  playsInline
                  preload="metadata"
                />

                {/* Top Badges Overlay */}
                <div className="absolute top-3 left-3 pointer-events-none">
                  <span className="neu-inset-sm px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider font-accent text-[#00F2FE] bg-black/60 backdrop-blur-md border border-cyan-400/20">
                    {template.category || 'Dance AI'}
                  </span>
                </div>

                <div className="absolute top-3 right-3 pointer-events-none">
                  <span className="neu-inset-sm px-2.5 py-1 rounded-lg text-[10px] font-black text-white bg-black/60 backdrop-blur-md flex items-center gap-1 border border-white/10">
                    <Icons.User className="w-3 h-3 text-[#FF007F]" />
                    {template.required_image_count} ảnh nhân vật
                  </span>
                </div>
              </div>

              {/* Template Body Info */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-black font-accent text-slate-950 dark:text-white group-hover:text-[#FF007F] transition-colors line-clamp-1">
                      {template.title}
                    </h3>

                    {/* Vcoin Price Badge */}
                    <div className="neu-inset-sm px-3 py-1 rounded-xl text-amber-500 font-mono font-black text-sm shrink-0 flex items-center gap-1.5 border border-amber-500/20">
                      <Icons.Gem className="w-4 h-4 text-amber-500" />
                      <span>{template.price_vcoin.toLocaleString('vi-VN')}</span>
                      <span className="text-[10px] font-accent text-amber-400">VC</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium line-clamp-2 mt-2 leading-relaxed">
                    {template.description || 'Tái tạo chuyển động chuẩn xác theo đúng từng động tác và nhịp điệu của video mẫu.'}
                  </p>
                </div>

                {/* Action Footer */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                    <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Motion AI 4K</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => openOrder(template)}
                    className="neu-button-primary px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 group-hover:scale-105 transition-all"
                  >
                    <span>Chọn Mẫu Này</span>
                    <Icons.ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* 4. ORDER DRAWER / MODAL */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm">
          {/* Overlay click to close */}
          <div className="absolute inset-0" onClick={() => setSelected(null)} />

          {/* Drawer content */}
          <aside className="relative z-10 w-full max-w-xl h-full bg-[#DFE4ED] dark:bg-[#11131F] text-slate-900 dark:text-white border-l border-slate-300 dark:border-slate-800 shadow-2xl flex flex-col dance-drawer-animate overflow-y-auto">
            
            {/* Drawer Header */}
            <div className="p-5 sm:p-6 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-[#DFE4ED]/90 dark:bg-[#11131F]/90 backdrop-blur-md z-20">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest font-accent text-[#00F2FE]">
                  ĐẶT LÀM VIDEO THEO MẪU
                </span>
                <h2 className="text-lg sm:text-xl font-black font-accent text-slate-950 dark:text-white line-clamp-1 mt-0.5">
                  {selected.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="neu-button p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:text-red-500 transition-colors"
                aria-label="Đóng panel"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Navigation */}
            <div className="grid grid-cols-3 border-b border-slate-300 dark:border-slate-800 bg-slate-200/50 dark:bg-black/20">
              {checkoutSteps.map((item, index) => {
                const isCurrent = step === item.id;
                const isDone = index < stepIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={index > stepIndex}
                    onClick={() => index <= stepIndex && setStep(item.id)}
                    className={`py-3.5 px-2 text-center flex flex-col items-center gap-1 border-r last:border-r-0 border-slate-300 dark:border-slate-800 transition-all ${
                      isCurrent
                        ? 'neu-inset-sm bg-[#FF007F]/10 text-[#FF007F]'
                        : isDone
                        ? 'text-emerald-500 hover:bg-slate-300/30'
                        : 'text-slate-400 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isCurrent
                        ? 'bg-[#FF007F] text-white shadow-md'
                        : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-400'
                    }`}>
                      {isDone ? <Icons.Check className="w-3 h-3" /> : item.stepNum}
                    </span>
                    <span className="text-[11px] font-black font-accent tracking-wider uppercase">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* STEP 1: REVIEW TEMPLATE */}
            {step === 'review' && (
              <div className="p-5 sm:p-6 space-y-5 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Video preview card */}
                  <div className="neu-card p-3 rounded-2xl border border-slate-300 dark:border-slate-800">
                    <video
                      src={selected.preview_video_url}
                      controls
                      playsInline
                      className="w-full aspect-video rounded-xl bg-black object-cover"
                    />
                    <div className="mt-3 flex items-center justify-between px-1">
                      <b className="text-sm font-black font-accent">{selected.title}</b>
                      <span className="neu-inset-sm px-2.5 py-0.5 rounded-lg text-amber-500 font-mono font-black text-xs">
                        {selected.price_vcoin} Vcoin
                      </span>
                    </div>
                  </div>

                  {/* Requirements & Policy Alert */}
                  <div className="neu-card p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 font-accent">
                      <Icons.AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Quy trình & Cam kết dịch vụ</span>
                    </div>
                    <ul className="text-xs text-slate-700 dark:text-slate-300 font-medium space-y-1.5 list-disc pl-5">
                      <li>Yêu cầu <b>{selected.required_image_count} ảnh nhân vật Audition</b> rõ nét.</li>
                      <li>Thời gian hoàn thành từ <b>15 - 30 phút</b>, chậm nhất 24 giờ.</li>
                      <li>Khi đơn đang chờ và Admin chưa tiếp nhận, bạn có thể hủy đơn và hoàn lại 100% Vcoin.</li>
                      <li>Sau khi Admin tiếp nhận, đơn sẽ tiến hành render và không thể hủy hoàn.</li>
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-300 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setStep('assets')}
                    className="w-full neu-button-primary py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <span>Tiếp Tục Với Ảnh Nhân Vật</span>
                    <Icons.ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: UPLOAD ASSETS */}
            {step === 'assets' && (
              <div className="p-5 sm:p-6 space-y-5 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Upload guidelines */}
                  <div className="neu-card p-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 font-accent">
                      <Icons.Sparkles className="w-4 h-4 text-[#00F2FE]" />
                      <span>Yêu cầu tải ảnh nhân vật ({selected.required_image_count} ảnh)</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                      Chụp ảnh nhân vật trong game Audition rõ nét, ưu tiên chụp toàn thân với trang phục mong muốn. Tối đa {selected.required_image_count} ảnh.
                    </p>
                  </div>

                  {/* Dropzone */}
                  <label className="neu-card border-2 border-dashed border-[#FF007F]/50 rounded-2xl p-6 text-center cursor-pointer hover:border-[#FF007F] transition-colors flex flex-col items-center justify-center gap-2 group">
                    <div className="w-12 h-12 neu-inset-sm rounded-2xl flex items-center justify-center text-[#FF007F] group-hover:scale-110 transition-transform">
                      <Icons.Upload className="w-6 h-6 text-[#FF007F]" />
                    </div>
                    <div className="font-black font-accent text-sm text-slate-900 dark:text-white uppercase">
                      Bấm vào đây để chọn ảnh
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Hỗ trợ định dạng PNG, JPG, WEBP • Cần đủ {selected.required_image_count} ảnh
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {previewUrls.map((url, index) => (
                          <div key={url} className="neu-card p-2 rounded-xl relative group overflow-hidden">
                            <img
                              src={url}
                              alt={`Nhân vật ${index + 1}`}
                              className="w-full aspect-square object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/70 text-white hover:bg-red-500 transition-colors"
                              aria-label={`Xóa ảnh ${index + 1}`}
                            >
                              <Icons.X className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-bold text-center block mt-1 text-slate-600 dark:text-slate-300">
                              Ảnh {index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Help links if user doesn't know how to capture game images */}
                  <div className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 font-accent block">
                      Không biết chụp ảnh nhân vật?
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                      Liên hệ trực tiếp để Admin hỗ trợ đăng nhập game chụp nhân vật miễn phí cho bạn:
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {socialLinks.map(({ label, href, Icon, color }) => (
                        <a
                          key={label}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="neu-button py-2 px-2 rounded-xl text-center flex items-center justify-center gap-1.5 text-[10px] font-black hover:scale-[1.02] transition-transform"
                        >
                          <Icon className={`w-3.5 h-3.5 ${color}`} />
                          <span className="truncate">{label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Navigation Buttons */}
                <div className="pt-4 border-t border-slate-300 dark:border-slate-800 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('review')}
                    className="neu-button px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Quay Lại
                  </button>

                  <button
                    type="button"
                    disabled={files.length !== selected.required_image_count}
                    onClick={() => setStep('confirm')}
                    className="flex-1 neu-button-primary py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>Kiểm Tra Đơn Hàng</span>
                    <Icons.ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: CONFIRM & SUBMIT */}
            {step === 'confirm' && (
              <div className="p-5 sm:p-6 space-y-5 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Summary Card */}
                  <div className="neu-card p-4 rounded-2xl border border-slate-300 dark:border-slate-800 space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-slate-500 font-accent">
                      Tóm tắt đơn hàng
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Mẫu video:</span>
                        <b className="font-accent text-slate-900 dark:text-white">{selected.title}</b>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Số ảnh đã tải:</span>
                        <b className="font-accent text-emerald-500">{files.length}/{selected.required_image_count} ảnh</b>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500">Thời gian xử lý:</span>
                        <b className="font-accent text-cyan-500">15 - 30 phút</b>
                      </div>
                      <div className="flex justify-between py-2 text-sm">
                        <span className="font-bold text-slate-700 dark:text-slate-300">Tổng thanh toán:</span>
                        <span className="text-amber-500 font-mono font-black text-base flex items-center gap-1">
                          <Icons.Gem className="w-4 h-4 text-amber-500" />
                          {selected.price_vcoin.toLocaleString('vi-VN')} Vcoin
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-accent">
                        Số Zalo để Admin liên hệ giao video
                      </span>
                      <input
                        value={zalo}
                        onChange={(event) => setZalo(event.target.value)}
                        placeholder="Nhập số Zalo của bạn (không bắt buộc)..."
                        className="neu-input w-full h-11 px-3.5 text-xs font-bold rounded-xl outline-none"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-accent">
                        Ghi chú yêu cầu thêm cho Admin
                      </span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Ví dụ: Giữ nguyên màu tóc, phong cách biểu cảm, liên hệ trước khi xuất video..."
                        className="neu-input w-full h-24 p-3 text-xs font-medium rounded-xl outline-none resize-none"
                      />
                    </label>
                  </div>

                  {/* Note about auto deduct */}
                  <div className="neu-inset-sm p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Xác nhận đặt đơn sẽ tự động trừ <b className="text-amber-500">{selected.price_vcoin} Vcoin</b> từ tài khoản của bạn. Đơn hàng sẽ ngay lập tức xuất hiện tại mục <b>Lịch Sử Tạo</b> để bạn theo dõi trạng thái.
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-4 border-t border-slate-300 dark:border-slate-800 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('assets')}
                    className="neu-button px-5 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider"
                  >
                    Quay Lại
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submitOrder()}
                    className="flex-1 neu-button-primary py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Icons.Loader className="w-4 h-4 animate-spin text-white" />
                        <span>Đang Tải Ảnh & Tạo Đơn...</span>
                      </>
                    ) : (
                      <>
                        <span>Xác Nhận Đặt Video ({selected.price_vcoin} VC)</span>
                        <Icons.Check className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

          </aside>
        </div>
      )}

    </div>
  );
};
