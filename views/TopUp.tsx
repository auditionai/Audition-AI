import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Language, CreditPackage, PromotionCampaign, ViewId } from '../types';
import { Icons } from '../components/Icons';
import { getPackages, createPaymentLink, getActivePromotion, updateLastActive, getCachedTopupGiftcodes, getTopupGiftcodePreviews, getTopupGiftcodes, TopupGiftcodeOffer } from '../services/economyService';
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
  const [giftcodeSelectionMode, setGiftcodeSelectionMode] = useState<'auto' | 'manual'>('auto');
  const [loadingGiftcodes, setLoadingGiftcodes] = useState(false);

  // Timer for Flash Sale
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    const loadData = async () => {
        const pkgs = await getPackages();
        setPackages(pkgs);
        const campaign = await getActivePromotion();
        setActiveCampaign(campaign);
    };
    loadData();
  }, []);

  useEffect(() => {
      let disposed = false;
      getTopupGiftcodePreviews()
          .then((rows) => {
              if (!disposed && rows.length > 0) {
                  setTopupGiftcodes(rows);
              }
          })
          .catch((error) => {
              console.warn('Failed to prefetch topup giftcode previews', error);
          });

      return () => {
          disposed = true;
      };
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
      setGiftcodeSelectionMode('auto');
      if (topupGiftcodes.length === 0) {
          const cachedRows = getCachedTopupGiftcodes();
          if (cachedRows.length > 0) {
              setTopupGiftcodes(cachedRows);
          } else {
              void getTopupGiftcodePreviews().then((rows) => {
                  if (rows.length > 0) {
                      setTopupGiftcodes(rows);
                  }
              }).catch((error) => {
                  console.warn('Failed to load topup giftcode previews', error);
              });
          }
          void loadTopupGiftcodes();
      }
  };

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

  const smartDescription = useMemo(() => {
      if (!activeCampaign) return "";
      
      const { name, bonusPercent } = activeCampaign;
      const isHugeSale = bonusPercent >= 50;
      
      if (lang === 'vi') {
          if (isHugeSale) {
              return `Sự kiện "${name}" đang tặng thêm +${bonusPercent}% Vcoin cho mọi giao dịch! Tích lũy Vcoin để thỏa sức sáng tạo cùng AI 3D.`;
          }
          return `Sự kiện "${name}" - Ưu đãi nạp +${bonusPercent}% Vcoin hôm nay!`;
      } else {
          return `Special Event "${name}" - Enjoy +${bonusPercent}% bonus Vcoin on every top-up today!`;
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
          .sort((a, b) => b.discountPercent - a.discountPercent);
  }, [topupGiftcodes]);

  useEffect(() => {
      if (!selectedPackage || giftcodeSelectionMode !== 'auto') return;
      const bestOffer = availableTopupGiftcodes[0];
      setGiftcodeInput(bestOffer?.code || '');
  }, [selectedPackage, availableTopupGiftcodes, giftcodeSelectionMode]);

  const getGiftcodeUsageText = (code: TopupGiftcodeOffer) => {
      if (code.audience === 'new_user_first_topup') return 'Dành cho lần nạp đầu tiên';
      const remainingPerUser = Number(code.remainingPerUser ?? code.maxPerUser ?? 1);
      return `Bạn còn ${remainingPerUser.toLocaleString('vi-VN')} lượt dùng`;
  };

  const getGiftcodeAvailabilityText = (code: TopupGiftcodeOffer) => {
      const remainingCount = Number(code.remainingCount || 0);
      if (remainingCount <= 0 && Number(code.totalLimit || 0) <= 0) return 'Không giới hạn toàn hệ thống';
      return `Còn ${remainingCount.toLocaleString('vi-VN')} lượt toàn hệ thống`;
  };

  const getGiftcodeExpiryText = (code: TopupGiftcodeOffer) => {
      if (!code.expiresAt) return 'Không giới hạn thời gian';
      const expiresAt = new Date(code.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) return 'Không giới hạn thời gian';
      return `Hết hạn ${expiresAt.toLocaleDateString('vi-VN')}`;
  };

  const getGiftcodeDescription = (code: TopupGiftcodeOffer) => {
      if (code.audience === 'new_user_first_topup') {
          return `Giảm ${code.discountPercent}% cho tài khoản đủ điều kiện nạp lần đầu.`;
      }
      return `Giảm trực tiếp ${code.discountPercent}% trên tổng giá trị gói nạp.`;
  };

  const handleBuyPackage = async (pkg: CreditPackage, code?: string) => {
      setLoading(true);
      updateLastActive();
      try {
          const tx = await createPaymentLink(pkg.id, code);
          if (tx.checkoutUrl) {
              window.location.href = tx.checkoutUrl;
          } else {
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
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#03040a]/80 p-3 backdrop-blur-xl sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topup-checkout-title"
    >
      <div className="relative flex min-h-[540px] max-h-[90vh] w-full max-w-[922px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#11141f] shadow-[0_32px_100px_rgba(0,0,0,0.72),0_0_60px_rgba(255,0,127,0.1)] animate-fade-in">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_20%_0%,rgba(255,0,127,0.18),transparent_48%),radial-gradient(circle_at_75%_0%,rgba(0,242,254,0.12),transparent_42%)]" />

        <header className="relative flex items-start justify-between gap-5 border-b border-white/8 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">
              <Icons.Gift className="h-3.5 w-3.5" />
              Giftcode ưu đãi
            </div>
            <h3 id="topup-checkout-title" className="font-accent text-2xl font-black text-white sm:text-[28px]">
              {selectedPackage.name}
            </h3>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400 sm:text-sm">
              Hệ thống tự động chọn mã giảm giá tốt nhất. Bạn vẫn có thể đổi sang mã khác trước khi quét QR.
            </p>
          </div>
          <button
            onClick={() => setSelectedPackage(null)}
            aria-label="Đóng cửa sổ nạp tiền"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 shadow-lg transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Icons.X className="h-5 w-5" />
          </button>
        </header>

        <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 sm:p-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(310px,0.8fr)]">
          <section className="flex flex-col gap-4 lg:min-h-0">
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="topup-giftcode-input" className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Nhập hoặc chọn nhanh code
                </label>
                {giftcodeSelectionMode === 'auto' && selectedOffer && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                    <Icons.Sparkles className="h-3 w-3" />
                    Đã tự động áp mã tốt nhất
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  id="topup-giftcode-input"
                  value={giftcodeInput}
                  onChange={(e) => {
                    setGiftcodeSelectionMode('manual');
                    setGiftcodeInput(e.target.value.toUpperCase());
                  }}
                  placeholder="AUAI-20-XXXXXX"
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#080a11] px-4 font-mono text-sm font-black uppercase tracking-wider text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
                />
                <button
                  onClick={() => {
                    setGiftcodeSelectionMode('manual');
                    setGiftcodeInput('');
                  }}
                  className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Xóa
                </button>
              </div>
            </div>

            <div className="max-h-[360px] min-h-[245px] space-y-3 overflow-y-auto pr-1 [scrollbar-color:#ff0080_#0a0c13] [scrollbar-width:thin] lg:max-h-none lg:flex-1">
              {loadingGiftcodes && availableTopupGiftcodes.length === 0 ? (
                <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-white/8 bg-black/20 text-sm font-bold text-slate-400">
                  <Icons.Loader className="h-4 w-4 animate-spin text-cyan-300" />
                  Đang đồng bộ giftcode...
                </div>
              ) : availableTopupGiftcodes.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 text-center">
                  <Icons.Gift className="mb-3 h-8 w-8 text-slate-600" />
                  <p className="text-sm font-bold text-slate-300">Chưa có mã giảm giá phù hợp</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Bạn vẫn có thể tiếp tục thanh toán theo giá niêm yết.</p>
                </div>
              ) : availableTopupGiftcodes.map((code, index) => {
                const isSelected = giftcodeInput.trim().toUpperCase() === code.code.toUpperCase();
                const isBestOffer = index === 0;
                const savingAmount = Math.floor(selectedPackage.price * code.discountPercent / 100);
                return (
                  <button
                    key={code.id}
                    onClick={() => {
                      setGiftcodeSelectionMode('manual');
                      setGiftcodeInput(code.code);
                    }}
                    aria-pressed={isSelected}
                    className={`group w-full rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                      isSelected
                        ? 'border-cyan-300/70 bg-gradient-to-br from-cyan-400/12 to-fuchsia-500/10 shadow-[0_0_28px_rgba(0,242,254,0.1)]'
                        : 'border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all font-mono text-sm font-black text-white">{code.code}</span>
                          {isBestOffer && (
                            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-fuchsia-300">
                              Tốt nhất
                            </span>
                          )}
                          {code.audience === 'new_user_first_topup' && (
                            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-300">
                              Nạp lần đầu
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{getGiftcodeDescription(code)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-400/12 px-3 py-1 text-sm font-black text-emerald-300">
                        -{code.discountPercent}%
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2.5 py-1 text-cyan-300">
                        <Icons.Check className="h-3 w-3" />
                        {getGiftcodeUsageText(code)}
                      </span>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-400">{getGiftcodeAvailabilityText(code)}</span>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-400">{getGiftcodeExpiryText(code)}</span>
                      <span className="ml-auto text-emerald-300">Tiết kiệm {savingAmount.toLocaleString('vi-VN')}đ</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="flex flex-col rounded-[24px] border border-white/10 bg-[#080a11] p-5 shadow-inner sm:p-6">
            <div className={`rounded-2xl border p-4 ${
              selectedOffer?.status === 'available'
                ? 'border-emerald-400/25 bg-emerald-400/[0.08]'
                : 'border-fuchsia-400/25 bg-fuchsia-500/10'
            }`}>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-300">Ưu đãi đang áp dụng</div>
              {selectedOffer?.status === 'available' ? (
                <>
                  <div className="mt-2 break-all font-mono text-sm font-black text-white">{selectedOffer.code}</div>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-200">
                    Đã giảm {selectedOffer.discountPercent}% — bạn tiết kiệm {checkoutPreview.discountAmount.toLocaleString('vi-VN')}đ.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-slate-300">Chưa áp dụng giftcode. Đơn hàng đang tính theo giá gốc.</p>
              )}
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Gói nhận</span>
                <span className="font-accent text-lg font-black text-amber-300">{selectedPackage.vcoin.toLocaleString('vi-VN')} Vcoin</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Giá niêm yết</span>
                <span className="font-bold text-white">{checkoutPreview.originalAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Giftcode giảm</span>
                <span className="font-bold text-emerald-300">-{checkoutPreview.discountAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-end justify-between gap-4">
                <span className="pb-1 text-sm font-black text-white">Cần thanh toán</span>
                <span className="font-accent text-3xl font-black text-cyan-300">
                  {checkoutPreview.finalAmount.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            {giftcodeInput && selectedOffer?.status !== 'available' && (
              <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-200">
                Mã này không còn khả dụng hoặc không áp dụng cho tài khoản của bạn. Hãy chọn một mã trong danh sách.
              </p>
            )}

            <div className="mt-auto pt-5">
              <div className="mb-3 flex items-start gap-2 rounded-2xl bg-white/[0.035] p-3 text-[11px] leading-relaxed text-slate-400">
                <Icons.Shield className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                Giftcode được xác thực lại khi tạo đơn. Vcoin sẽ tự động cộng sau khi SePay xác nhận thanh toán.
              </div>
              <button
                onClick={() => handleBuyPackage(selectedPackage, selectedOffer?.status === 'available' ? giftcodeInput : undefined)}
                disabled={loading || Boolean(giftcodeInput && selectedOffer?.status !== 'available')}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff007f] via-fuchsia-500 to-[#00d9ff] px-5 py-4 text-sm font-black text-white shadow-[0_10px_30px_rgba(255,0,127,0.24)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? <Icons.Loader className="h-5 w-5 animate-spin" /> : <Icons.QrCode className="h-5 w-5" />}
                Quét QR để thanh toán
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="w-full space-y-8 pb-24 animate-fade-in">
      
      {/* 3D NEUMORPHIC HERO EVENT BANNER */}
      {activeCampaign ? (
        <div className="w-full neu-card p-6 sm:p-8 border border-white/20 relative overflow-hidden shadow-2xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 text-center md:text-left">
              <div className="neu-inset-sm px-3.5 py-1 rounded-full text-xs font-bold text-amber-500 inline-flex items-center gap-2 uppercase tracking-wider font-accent">
                <Icons.Zap className="w-4 h-4 text-amber-500" />
                <span>{activeCampaign.name}</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-slate-800 dark:text-white tracking-wide font-accent">
                KHUYẾN MÃI <span className="text-[#FF007F] animate-pulse">+</span><span className="text-[#FF007F]">{activeCampaign.bonusPercent}%</span> VCOIN
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                {smartDescription}
              </p>
            </div>

            {/* Countdown Box */}
            <div className="flex gap-3 neu-inset-sm p-4 rounded-3xl">
              {['d', 'h', 'm', 's'].map((unit) => (
                <div key={unit} className="flex flex-col items-center">
                  <div className="w-12 h-14 neu-raised-sm rounded-2xl flex items-center justify-center font-accent text-xl font-black text-[#FF007F]">
                    {String(timeLeft[unit as keyof typeof timeLeft]).padStart(2, '0')}
                  </div>
                  <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 uppercase mt-1">
                    {unit === 'd' ? 'Ngày' : unit === 'h' ? 'Giờ' : unit === 'm' ? 'Phút' : 'Giây'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full neu-card p-8 text-center space-y-2 rounded-3xl shadow-2xl">
          <div className="inline-flex items-center gap-2 neu-inset-sm px-4 py-1 rounded-full text-xs font-extrabold text-[#00F2FE] font-accent uppercase">
            <Icons.Gem className="w-4 h-4 text-[#00F2FE]" />
            NẠP VỚI HỆ THỐNG SEPAY QR TỰ ĐỘNG 24/7
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-800 dark:text-white font-accent uppercase">NẠP THÊM VCOIN VÀO TÀI KHOẢN</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">Nạp Vcoin an toàn, bảo mật tuyệt đối, tự động cộng Vcoin vào ví ngay sau 3 giây quét mã QR SePay</p>
        </div>
      )}

      {/* PACKAGES GRID */}
      <div className="space-y-4">
        <div className="neu-raised-sm rounded-3xl px-6 py-4 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 neu-inset-sm rounded-2xl flex items-center justify-center text-[#FF007F]">
              <Icons.Gem className="w-5 h-5 text-[#FF007F]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 dark:text-white font-accent uppercase">BẢNG GÓI NẠP VCOIN GIÁ TỐT NHẤT</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chọn gói Vcoin phù hợp để nhận ngay ưu đãi quà tặng</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {packages.map((pkg) => {
            const activeBonusPercent = activeCampaign ? activeCampaign.bonusPercent : pkg.bonusPercent;
            const hasBonus = activeBonusPercent > 0;
            const finalCoins = Math.floor(pkg.vcoin + (pkg.vcoin * activeBonusPercent / 100));

            return (
              <div 
                key={pkg.id}
                className={`neu-card p-6 rounded-3xl flex flex-col justify-between relative group hover:scale-[1.03] transition-all cursor-pointer shadow-xl ${
                  pkg.isPopular ? 'border-2 border-[#FF007F] shadow-[0_0_25px_rgba(255,0,127,0.3)]' : ''
                }`}
                onClick={() => openCheckoutModal(pkg)}
              >
                {/* Badges */}
                {pkg.isPopular && (
                  <span className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-black text-white bg-gradient-to-r from-red-500 to-[#FF007F] shadow-md uppercase tracking-wider flex items-center gap-1 font-accent">
                    <Icons.Flame className="w-3 h-3 text-yellow-300" /> HOT SALE
                  </span>
                )}
                {hasBonus && (
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-[10px] font-black text-slate-900 bg-amber-400 shadow-md uppercase tracking-wider font-accent">
                    +{activeBonusPercent}% BONUS
                  </span>
                )}

                {/* Main Icon & Coin */}
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="w-20 h-20 neu-inset-sm rounded-3xl flex items-center justify-center mb-4 text-[#FF007F] group-hover:scale-110 transition-transform">
                    <Icons.Gem className="w-10 h-10 text-amber-500" />
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-black text-slate-800 dark:text-white font-accent group-hover:text-[#FF007F] transition-colors">
                      {finalCoins.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest font-accent">VCOIN</div>
                  </div>
                </div>

                {/* Price & Action */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Giá nạp:</span>
                    <span className="font-black text-slate-800 dark:text-white text-base font-accent">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openCheckoutModal(pkg);
                    }}
                    className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all font-accent ${
                      pkg.isPopular ? 'neu-button-primary shadow-lg' : 'neu-button text-slate-800 dark:text-white'
                    }`}
                  >
                    <Icons.QrCode className="w-4 h-4 text-[#00F2FE]" />
                    <span>NẠP NGAY (QR SEPAY)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {checkoutModal && typeof document !== 'undefined' ? createPortal(checkoutModal, document.body) : null}
    </div>
  );
};
