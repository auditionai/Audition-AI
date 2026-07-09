import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Language, Transaction, CreditPackage, PromotionCampaign, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { getPackages, createPaymentLink, getActivePromotion, updateLastActive, getTopupGiftcodes, TopupGiftcodeOffer } from '../services/economyService';
import { useNotification } from '../components/NotificationSystem';

interface TopUpProps {
  lang: Language;
  onNavigate: (view: ViewId, data?: any) => void;
}

export const TopUp: React.FC<TopUpProps> = ({ lang, onNavigate }) => {
  const { notify } = useNotification();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<PromotionCampaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [topupGiftcodes, setTopupGiftcodes] = useState<TopupGiftcodeOffer[]>([]);
  const [giftcodeInput, setGiftcodeInput] = useState('');
  const [loadingGiftcodes, setLoadingGiftcodes] = useState(false);

  // Timer for Flash Sale (Added Days 'd')
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    // Load Packages & Active Campaign
    const loadData = async () => {
        const pkgs = await getPackages();
        setPackages(pkgs);
        const campaign = await getActivePromotion();
        setActiveCampaign(campaign);
    };
    loadData();
  }, []);

  const loadTopupGiftcodes = async () => {
      setLoadingGiftcodes(true);
      try {
          const rows = await getTopupGiftcodes();
          setTopupGiftcodes(rows);
      } catch (error) {
          console.warn('Failed to load topup giftcodes', error);
          notify(error instanceof Error ? error.message : 'Không thể tải giftcode nạp tiền', 'error');
      } finally {
          setLoadingGiftcodes(false);
      }
  };

  const openCheckoutModal = async (pkg: CreditPackage) => {
      setSelectedPackage(pkg);
      setGiftcodeInput('');
      await loadTopupGiftcodes();
  };

  // Update Countdown Timer based on Campaign End Time
  useEffect(() => {
    if (!activeCampaign) return;

    const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(activeCampaign.endTime).getTime();
        const diff = end - now;

        if (diff <= 0) {
            setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ d, h, m, s });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCampaign]);

  // --- SMART COPYWRITING GENERATOR ---
  // Generates an engaging description based on campaign data instead of raw title
  const smartDescription = useMemo(() => {
      if (!activeCampaign) return "";
      
      const { name, bonusPercent } = activeCampaign;
      const isHugeSale = bonusPercent >= 50;
      
      if (lang === 'vi') {
          if (isHugeSale) {
              return `Cơ hội vàng từ sự kiện "${name}"! Hệ thống đang tặng thêm +${bonusPercent}% Vcoin cho mọi giao dịch. Đây là thời điểm tốt nhất để tích lũy tài nguyên và sáng tạo không giới hạn. Đừng bỏ lỡ deal hời nhất tháng này!`;
          }
          return `Chào mừng sự kiện "${name}". Tận hưởng ưu đãi nạp +${bonusPercent}% Vcoin ngay hôm nay. Nạp càng nhiều, ưu đãi càng lớn. Sẵn sàng bùng nổ cùng các tính năng AI mới nhất!`;
      } else {
          if (isHugeSale) {
              return `Massive offer from "${name}" event! Get an extra +${bonusPercent}% Vcoin on every top-up. This is the perfect time to stock up and create without limits. Don't miss the best deal of the month!`;
          }
          return `Welcome to "${name}". Enjoy a +${bonusPercent}% Vcoin bonus today. The more you top up, the bigger the reward. Get ready to unleash your creativity with our latest AI tools!`;
      }
  }, [activeCampaign, lang]);

  const selectedOffer = useMemo(() => {
      const clean = giftcodeInput.trim().toUpperCase();
      if (!clean) return null;
      return topupGiftcodes.find((code) => code.code.toUpperCase() === clean) || null;
  }, [giftcodeInput, topupGiftcodes]);

  const checkoutPreview = useMemo(() => {
      if (!selectedPackage) return null;
      const discountPercent = selectedOffer?.status === 'available' ? selectedOffer.discountPercent : 0;
      const discountAmount = Math.floor(selectedPackage.price * discountPercent / 100);
      return {
          originalAmount: selectedPackage.price,
          discountAmount,
          finalAmount: Math.max(0, selectedPackage.price - discountAmount),
      };
  }, [selectedPackage, selectedOffer]);

  const availableTopupGiftcodes = useMemo(() => {
      return topupGiftcodes
          .filter((code) => {
              const remainingPerUser = Number(code.remainingPerUser ?? code.maxPerUser ?? 1);
              return code.status === 'available' && remainingPerUser > 0;
          })
          .sort((a, b) => {
              const aFeatured = a.audience === 'new_user_first_topup' ? 1 : 0;
              const bFeatured = b.audience === 'new_user_first_topup' ? 1 : 0;
              if (aFeatured !== bFeatured) return bFeatured - aFeatured;
              return b.discountPercent - a.discountPercent;
          });
  }, [topupGiftcodes]);

  const getGiftcodeUsageText = (code: TopupGiftcodeOffer) => {
      if (code.audience === 'new_user_first_topup') {
          return 'Chỉ sử dụng được 1 lần duy nhất';
      }
      const remainingPerUser = Math.max(0, Number(code.remainingPerUser ?? code.maxPerUser ?? 1));
      return `Còn ${remainingPerUser.toLocaleString('vi-VN')} lần sử dụng`;
  };

  const getGiftcodeDescription = (code: TopupGiftcodeOffer) => {
      if (code.audience === 'new_user_first_topup') {
          return `Ưu đãi ${code.discountPercent}% cho tài khoản mới nạp lần đầu tiên. Hãy tận dụng ưu đãi để tránh lãng phí.`;
      }
      return `Giảm trực tiếp ${code.discountPercent}% trên giá gói nạp khi quét QR thanh toán.`;
  };

  const handleBuyPackage = async (pkg: CreditPackage, code?: string) => {
      setLoading(true);
      updateLastActive(); // Mark active on purchase attempt
      try {
          const tx = await createPaymentLink(pkg.id, code);
          
          if (tx.checkoutUrl) {
              // Redirect to SePay
              window.location.href = tx.checkoutUrl;
          } else {
              // Fallback to internal Manual Gateway if SePay link generation failed
              onNavigate('payment_gateway', { transaction: tx });
          }
      } catch (e) {
          console.error(e);
          notify(e instanceof Error ? e.message : (lang === 'vi' ? 'Có lỗi khi tạo giao dịch' : 'Error creating transaction'), 'error');
      } finally {
          setLoading(false);
      }
  };

  const checkoutModal = selectedPackage && checkoutPreview ? (
            <div className="fixed inset-0 z-[3000] flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-8 backdrop-blur-md sm:px-5 md:py-12">
                <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#10111b] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:p-5 md:p-7">
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-audi-cyan/30 bg-audi-cyan/10 px-3 py-1 text-xs font-bold uppercase text-audi-cyan">
                                <Icons.Gift className="h-4 w-4" />
                                Giftcode ưu đãi
                            </div>
                            <h3 className="text-xl font-black text-white md:text-2xl">{selectedPackage!.name}</h3>
                            <p className="mt-1 max-w-xl text-sm text-slate-400">Chọn mã khuyến mại trước khi quét QR. Mã đã hết lượt trên tài khoản sẽ tự động ẩn khỏi danh sách.</p>
                        </div>
                        <button
                            onClick={() => setSelectedPackage(null)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                            aria-label="Đóng"
                        >
                            <Icons.X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                                <label className="mb-2 block text-xs font-bold uppercase text-slate-500">Nhập hoặc chọn nhanh code</label>
                                <div className="flex gap-2">
                                    <input
                                        value={giftcodeInput}
                                        onChange={(e) => setGiftcodeInput(e.target.value.toUpperCase())}
                                        placeholder="AUAI-50-XXXXX"
                                        className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 font-mono text-sm font-bold uppercase tracking-wider text-white outline-none focus:border-audi-cyan"
                                    />
                                    <button
                                        onClick={() => setGiftcodeInput('')}
                                        className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-slate-200 hover:bg-white/10"
                                    >
                                        Xóa
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
                                {loadingGiftcodes ? (
                                    <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-10 text-slate-400">
                                        <Icons.Loader className="mr-2 h-4 w-4 animate-spin" /> Đang tải mã ưu đãi
                                    </div>
                                ) : availableTopupGiftcodes.length === 0 ? (
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
                                        Hiện chưa có giftcode nạp tiền khả dụng cho tài khoản này.
                                    </div>
                                ) : availableTopupGiftcodes.map((code) => {
                                    const selected = giftcodeInput.trim().toUpperCase() === code.code.toUpperCase();
                                    const featured = code.audience === 'new_user_first_topup';
                                    return (
                                        <button
                                            key={code.id}
                                            onClick={() => setGiftcodeInput(code.code)}
                                            className={`w-full overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                                                selected
                                                    ? 'border-audi-cyan bg-audi-cyan/10 shadow-[0_0_28px_rgba(0,217,255,0.18)]'
                                                    : featured
                                                        ? 'border-audi-yellow/45 bg-gradient-to-br from-audi-yellow/16 via-white/[0.06] to-audi-pink/10 hover:border-audi-yellow/70'
                                                        : 'border-white/10 bg-white/[0.06] hover:border-white/20 hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="break-all font-mono text-base font-black text-white">{code.code}</span>
                                                        {featured && (
                                                            <span className="rounded-full bg-audi-yellow/20 px-2 py-1 text-[10px] font-black uppercase text-audi-yellow">
                                                                Nạp lần đầu
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{getGiftcodeDescription(code)}</p>
                                                </div>
                                                <span className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-300">
                                                    -{code.discountPercent}%
                                                </span>
                                            </div>
                                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold ${featured ? 'bg-audi-yellow/15 text-audi-yellow' : 'bg-audi-cyan/10 text-audi-cyan'}`}>
                                                    <Icons.Check className="h-3.5 w-3.5" />
                                                    {getGiftcodeUsageText(code)}
                                                </span>
                                                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 font-bold text-slate-300">
                                                    <Icons.Sparkles className="h-3.5 w-3.5" />
                                                    Áp dụng tức thì
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="self-start rounded-3xl border border-white/10 bg-black/35 p-5 lg:sticky lg:top-6">
                            <div className="mb-4 rounded-2xl border border-audi-pink/20 bg-audi-pink/10 p-4">
                                <p className="text-xs font-bold uppercase text-audi-pink">Ưu đãi đang áp dụng</p>
                                {selectedOffer?.status === 'available' ? (
                                    <>
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <span className="break-all font-mono text-sm font-black text-white">{selectedOffer.code}</span>
                                            <span className="text-2xl font-black text-emerald-300">-{selectedOffer.discountPercent}%</span>
                                        </div>
                                        <p className="mt-2 text-xs leading-relaxed text-slate-300">{getGiftcodeUsageText(selectedOffer)}</p>
                                    </>
                                ) : (
                                    <p className="mt-2 text-sm text-slate-300">Chưa chọn giftcode. Bạn vẫn có thể thanh toán theo giá gốc.</p>
                                )}
                            </div>
                            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                                <span className="text-sm text-slate-400">Gói nhận</span>
                                <span className="text-lg font-black text-audi-yellow">{selectedPackage!.vcoin} Vcoin</span>
                            </div>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between gap-3">
                                    <span className="text-slate-400">Giá gốc</span>
                                    <span className="font-bold text-white">{checkoutPreview!.originalAmount.toLocaleString('vi-VN')}đ</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="text-slate-400">Giảm giá</span>
                                    <span className="font-bold text-emerald-300">-{checkoutPreview!.discountAmount.toLocaleString('vi-VN')}đ</span>
                                </div>
                                <div className="flex justify-between gap-3 border-t border-white/10 pt-3">
                                    <span className="font-bold text-white">Cần thanh toán</span>
                                    <span className="text-2xl font-black text-audi-cyan">{checkoutPreview!.finalAmount.toLocaleString('vi-VN')}đ</span>
                                </div>
                            </div>
                            {giftcodeInput && selectedOffer?.status !== 'available' && (
                                <p className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                                    Code này không còn khả dụng cho tài khoản hoặc đã được sử dụng.
                                </p>
                            )}
                            <button
                                onClick={() => handleBuyPackage(selectedPackage!, selectedOffer?.status === 'available' ? giftcodeInput : undefined)}
                                disabled={loading || Boolean(giftcodeInput && selectedOffer?.status !== 'available')}
                                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-audi-pink font-black text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? <Icons.Loader className="h-5 w-5 animate-spin" /> : <Icons.QrCode className="h-5 w-5" />}
                                Quét QR để thanh toán
                            </button>
                        </div>
                    </div>
                </div>
            </div>
  ) : null;

  return (
    <div className="pb-32 animate-fade-in max-w-6xl mx-auto">
        
        {/* --- HERO BANNER (EVENT) --- */}
        {activeCampaign ? (
            <div data-tour-id="desktop.topup.hero" className="relative rounded-[2.5rem] overflow-hidden mb-12 border-2 border-audi-pink/50 shadow-[0_0_50px_rgba(255,0,153,0.3)] group mt-8">
                {/* Dynamic Background */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#2a0b36] via-[#4a0e44] to-[#0c0c14] z-0"></div>
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 z-0"></div>
                
                {/* Floating Shapes */}
                <div className="absolute top-[-50%] left-[-20%] w-[500px] h-[500px] bg-audi-pink/20 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute bottom-[-50%] right-[-20%] w-[500px] h-[500px] bg-audi-cyan/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>

                <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
                    
                    {/* Left Content */}
                    <div className="flex-1 text-center md:text-left space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-audi-yellow/50 backdrop-blur-md shadow-[0_0_15px_rgba(251,218,97,0.4)] animate-bounce-slow">
                            <Icons.Zap className="w-4 h-4 text-audi-yellow fill-current" />
                            <span className="text-xs font-bold text-audi-yellow uppercase tracking-widest">{activeCampaign.name}</span>
                        </div>
                        
                        <h1 className="text-5xl md:text-7xl font-game font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] leading-tight">
                            BONUS <span className="text-audi-pink">+{activeCampaign.bonusPercent}%</span> <span className="text-audi-cyan">VCOIN</span>
                        </h1>
                        
                        {/* Smart AI Description */}
                        <p className="text-slate-300 text-sm md:text-base max-w-lg leading-relaxed border-l-4 border-audi-purple pl-4 italic">
                            "{smartDescription}"
                        </p>
                    </div>

                    {/* Right Timer (Including Days) */}
                    <div className="flex gap-2 md:gap-4 p-4 md:p-6 bg-black/20 rounded-3xl border border-white/10 backdrop-blur-sm shadow-xl transform group-hover:scale-105 transition-transform duration-500">
                        {['d', 'h', 'm', 's'].map((unit) => (
                            <div key={unit} className="flex flex-col items-center gap-2">
                                <div className="w-14 h-16 md:w-20 md:h-24 bg-[#12121a] rounded-xl border-t border-white/20 border-b-4 border-black flex items-center justify-center relative overflow-hidden shadow-inner">
                                    <div className="absolute top-1/2 w-full h-px bg-black/50"></div>
                                    <span className="font-mono text-3xl md:text-5xl font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                                        {String(timeLeft[unit as keyof typeof timeLeft]).padStart(2, '0')}
                                    </span>
                                </div>
                                <span className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    {unit === 'd' ? 'DAYS' : unit === 'h' ? 'HOURS' : unit === 'm' ? 'MINS' : 'SECS'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        ) : (
            <div data-tour-id="desktop.topup.hero" className="text-center mb-12 py-8 bg-gradient-to-r from-audi-purple/10 to-audi-cyan/10 rounded-3xl border border-white/10 mt-8">
                <h2 className="text-3xl font-game font-bold text-white mb-2">STORE VCOIN</h2>
                <p className="text-slate-400">Nạp Vcoin để trải nghiệm các tính năng AI cao cấp</p>
            </div>
        )}

        {/* --- PACKAGES GRID --- */}
        <div data-tour-id="desktop.topup.heading" className="flex items-center gap-3 mb-8">
             <div className="w-10 h-10 rounded-xl bg-audi-cyan/20 flex items-center justify-center text-audi-cyan">
                 <Icons.ShoppingBag className="w-5 h-5" />
             </div>
             <h2 className="text-2xl font-bold text-white">{lang === 'vi' ? 'Chọn gói nạp' : 'Select Package'}</h2>
        </div>

        <div data-tour-id="desktop.topup.packages" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {packages.map((pkg) => {
                const activeBonusPercent = activeCampaign ? activeCampaign.bonusPercent : pkg.bonusPercent;
                const hasBonus = activeBonusPercent > 0;
                const finalCoins = Math.floor(pkg.vcoin + (pkg.vcoin * activeBonusPercent / 100));

                return (
                    <div 
                        key={pkg.id}
                        data-tour-id={`desktop.topup.package.${pkg.id}`}
                        className={`group relative bg-[#12121a] rounded-[2rem] p-6 border transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col ${pkg.isPopular ? 'border-audi-pink shadow-[0_0_20px_rgba(255,0,153,0.1)]' : 'border-white/10 hover:border-white/30'}`}
                    >
                        {/* Badges */}
                        {pkg.isPopular && (
                            <div className="absolute top-0 right-0 bg-gradient-to-bl from-audi-pink to-audi-purple text-white text-[10px] font-bold px-4 py-1.5 rounded-tr-[1.8rem] rounded-bl-xl shadow-lg z-10 flex items-center gap-1">
                                <Icons.Flame className="w-3 h-3 fill-white" /> HOT
                            </div>
                        )}
                        {hasBonus && (
                            <div className="absolute top-0 left-0 bg-audi-lime text-black text-[10px] font-bold px-4 py-1.5 rounded-tl-[1.8rem] rounded-br-xl shadow-lg z-10">
                                BONUS +{activeBonusPercent}%
                            </div>
                        )}

                        {/* Icon & Coin */}
                        <div className="flex flex-col items-center justify-center py-6 border-b border-white/5 border-dashed relative">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-500 bg-gradient-to-b ${pkg.id === 'pkg_4' ? 'from-audi-pink/20 to-transparent' : pkg.id === 'pkg_3' ? 'from-audi-purple/20 to-transparent' : 'from-audi-cyan/20 to-transparent'}`}>
                                <Icons.Gem className={`w-10 h-10 ${pkg.id === 'pkg_4' ? 'text-audi-pink' : pkg.id === 'pkg_3' ? 'text-audi-purple' : 'text-audi-cyan'} drop-shadow-[0_0_10px_currentColor]`} />
                            </div>
                            <div className="text-center">
                                <div className="text-4xl font-game font-black text-white mb-1 group-hover:text-audi-yellow transition-colors">{finalCoins}</div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">VCOIN</div>
                                {hasBonus && <div className="text-[10px] text-slate-400 line-through mt-1">{pkg.vcoin}</div>}
                            </div>
                        </div>

                        {/* Details */}
                        <div className="flex-1 py-6 space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Giá trị thực</span>
                                <span className="text-white font-bold">1 Vcoin = 1.000đ</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Bonus Event</span>
                                <span className="text-audi-lime font-bold">+{Math.floor(pkg.vcoin * activeBonusPercent / 100)} VC</span>
                            </div>
                            <div className="w-full h-px bg-white/5 my-2"></div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-bold uppercase text-xs">Thành tiền</span>
                                <span className="text-xl font-bold text-white">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}</span>
                            </div>
                        </div>

                        {/* Button */}
                        <button 
                            data-tour-id="desktop.topup.payment_button"
                            onClick={() => openCheckoutModal(pkg)}
                            disabled={loading}
                            className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative overflow-hidden ${pkg.isPopular ? 'bg-gradient-to-r from-audi-pink to-audi-purple text-white shadow-[0_5px_20px_rgba(255,0,153,0.3)] hover:shadow-[0_5px_30px_rgba(255,0,153,0.5)]' : 'bg-white text-black hover:bg-slate-200'}`}
                        >
                            <span className="relative z-10">
                                {loading ? <Icons.Loader className="animate-spin" /> : (lang === 'vi' ? 'Nạp ngay' : 'Buy Now')}
                            </span>
                            {!loading && <Icons.ChevronRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </div>
                );
            })}
        </div>
        {checkoutModal && typeof document !== 'undefined' ? createPortal(checkoutModal, document.body) : null}
    </div>
  );
};
