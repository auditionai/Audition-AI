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
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-3xl neu-raised-xl rounded-3xl p-6 sm:p-8 animate-fade-in relative">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="neu-inset-sm px-3 py-1 rounded-full text-xs font-bold text-[#FF0099] inline-flex items-center gap-1.5 mb-2 font-accent">
              <Icons.Gift className="w-4 h-4 text-[#FF0099]" />
              Mã giảm giá & Khuyến mãi
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white font-accent">{selectedPackage.name}</h3>
          </div>
          <button
            onClick={() => setSelectedPackage(null)}
            className="neu-button w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 hover:text-red-500"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Giftcodes Selection */}
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nhập mã giảm giá</label>
            <div className="flex gap-2">
              <input
                value={giftcodeInput}
                onChange={(e) => setGiftcodeInput(e.target.value.toUpperCase())}
                placeholder="AUAI-50-XXXXX"
                className="neu-input flex-1 h-12 rounded-2xl px-4 font-mono text-sm font-bold uppercase tracking-wider"
              />
              <button
                onClick={() => setGiftcodeInput('')}
                className="neu-button px-4 rounded-2xl text-xs font-bold text-slate-500"
              >
                Xóa
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {loadingGiftcodes ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                  <Icons.Loader className="w-4 h-4 animate-spin text-[#FF007F]" />
                  Đang đồng bộ giftcode...
                </div>
              ) : availableTopupGiftcodes.length === 0 ? (
                <div className="py-6 text-center text-xs font-semibold text-slate-500">
                  Hiện chưa có mã giảm giá phù hợp cho tài khoản.
                </div>
              ) : availableTopupGiftcodes.map((code) => {
                const isSelected = giftcodeInput.toUpperCase() === code.code.toUpperCase();
                return (
                  <button
                    key={code.id}
                    onClick={() => setGiftcodeInput(code.code)}
                    className={`w-full p-3 rounded-2xl text-left transition-all flex items-center justify-between ${
                      isSelected ? 'neu-inset-sm ring-2 ring-[#FF0099]' : 'neu-button'
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-800 dark:text-white">{code.code}</div>
                      <div className="text-[10px] text-slate-400">Giảm {code.discountPercent}% cho hóa đơn</div>
                    </div>
                    <span className="neu-inset-sm px-2.5 py-1 rounded-full text-[10px] font-extrabold text-emerald-500">
                      -{code.discountPercent}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order Summary & Pay */}
          <div className="neu-inset-md rounded-2xl p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chi tiết đơn nạp</h4>
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Số Vcoin nhận:</span>
                <span className="font-bold text-amber-500 font-accent">{selectedPackage.vcoin} Vcoin</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Giá niêm yết:</span>
                <span className="font-bold">{checkoutPreview.originalAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              {checkoutPreview.discountAmount > 0 && (
                <div className="flex justify-between text-xs text-emerald-500 font-bold">
                  <span>Giảm giá Giftcode:</span>
                  <span>-{checkoutPreview.discountAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-300 dark:border-slate-700 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800 dark:text-white uppercase">Tổng thanh toán:</span>
                <span className="text-2xl font-black text-[#FF0099] font-accent">
                  {checkoutPreview.finalAmount.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            <button
              onClick={() => handleBuyPackage(selectedPackage, selectedOffer?.status === 'available' ? giftcodeInput : undefined)}
              disabled={loading}
              className="w-full py-3.5 mt-6 rounded-2xl neu-button-primary font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {loading ? <Icons.Loader className="w-5 h-5 animate-spin" /> : <Icons.QrCode className="w-5 h-5" />}
              <span>Quét QR Chuyển Khoản Ngay</span>
            </button>
          </div>
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
