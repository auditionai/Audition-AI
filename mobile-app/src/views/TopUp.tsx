/**
 * TopUp.tsx - Mobile Top-Up / Vcoin Purchase
 * Ported from desktop TopUp.tsx with mobile-first UX.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Flame, Gem, Gift, Loader, QrCode, ShoppingBag, Sparkles, X, Zap } from 'lucide-react';
import { useNotification } from '../components/NotificationSystem';
import { createPaymentLink, getActivePromotion, getPackages, getTopupGiftcodes, updateLastActive } from '../services/economyService';
import { syncPaymentTransaction } from '../services/serverQueueService';
import type { PromotionCampaign, TopupGiftcodeOffer } from '../services/economyService';
import type { CreditPackage, Transaction } from '../types';

const PENDING_TRANSACTION_STORAGE_KEY = 'audition-mobile-pending-transaction';
const PENDING_SEPAY_ORDERS_STORAGE_KEY = 'auditionai:pending-sepay-orders';
const PENDING_SEPAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const TopUp: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<PromotionCampaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [topupGiftcodes, setTopupGiftcodes] = useState<TopupGiftcodeOffer[]>([]);
  const [giftcodeInput, setGiftcodeInput] = useState('');
  const [loadingGiftcodes, setLoadingGiftcodes] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    void (async () => {
      setPackagesLoading(true);
      try {
        const [nextPackages, campaign] = await Promise.all([getPackages(), getActivePromotion()]);
        setPackages(nextPackages);
        setActiveCampaign(campaign);
      } catch (error) {
        console.error(error);
      } finally {
        setPackagesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let disposed = false;
    let syncing = false;

    const getPendingOrders = () => {
      if (typeof window === 'undefined') return [];
      try {
        const raw = window.localStorage.getItem(PENDING_SEPAY_ORDERS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        const now = Date.now();
        return parsed.filter((item) =>
          item?.orderCode &&
          Number.isFinite(Number(item?.createdAt || 0)) &&
          now - Number(item.createdAt) < PENDING_SEPAY_MAX_AGE_MS
        );
      } catch {
        return [];
      }
    };

    const savePendingOrders = (orders: any[]) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(PENDING_SEPAY_ORDERS_STORAGE_KEY, JSON.stringify(orders.slice(-12)));
      } catch {
        // Ignore storage failures.
      }
    };

    const reconcilePendingOrders = async () => {
      if (syncing || disposed) return;
      const pendingOrders = getPendingOrders();
      if (pendingOrders.length === 0) return;

      syncing = true;
      const remaining = [...pendingOrders];
      try {
        for (const order of pendingOrders.slice(-4)) {
          if (disposed) return;
          try {
            const result = await syncPaymentTransaction(order.orderCode, 'sepay');
            if (result?.settled === false) {
              continue;
            }

            const index = remaining.findIndex((item) => String(item.orderCode) === String(order.orderCode));
            if (index >= 0) remaining.splice(index, 1);
            window.dispatchEvent(new Event('balance_updated'));
            notify('Giao dịch nạp tiền đã được đối soát thành công. Vcoin đã được cộng tự động.', 'success');
          } catch (error) {
            console.warn('[Mobile TopUp] Pending SePay reconcile failed:', order.orderCode, error);
          }
        }
      } finally {
        savePendingOrders(remaining);
        syncing = false;
      }
    };

    void reconcilePendingOrders();
    const handleAttention = () => void reconcilePendingOrders();
    window.addEventListener('focus', handleAttention);
    document.addEventListener('visibilitychange', handleAttention);

    return () => {
      disposed = true;
      window.removeEventListener('focus', handleAttention);
      document.removeEventListener('visibilitychange', handleAttention);
    };
  }, [notify]);

  useEffect(() => {
    if (!activeCampaign) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const end = new Date(activeCampaign.endTime).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        return;
      }

      setTimeLeft({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        s: Math.floor((diff % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeCampaign]);

  const smartDescription = useMemo(() => {
    if (!activeCampaign) return '';
    const { name, bonusPercent } = activeCampaign;
    if (bonusPercent >= 50) {
      return `Cơ hội vàng từ "${name}"! Tặng thêm +${bonusPercent}% Vcoin cho mọi giao dịch. Đừng bỏ lỡ deal hời nhất!`;
    }
    return `Sự kiện "${name}". Ưu đãi nạp +${bonusPercent}% Vcoin ngay hôm nay!`;
  }, [activeCampaign]);

  const loadTopupGiftcodes = async () => {
    setLoadingGiftcodes(true);
    try {
      setTopupGiftcodes(await getTopupGiftcodes());
    } catch (error) {
      console.warn('[Mobile TopUp] Failed to load topup giftcodes', error);
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

  const selectedOffer = useMemo(() => {
    const clean = giftcodeInput.trim().toUpperCase();
    if (!clean) return null;
    return topupGiftcodes.find((code) => code.code.toUpperCase() === clean) || null;
  }, [giftcodeInput, topupGiftcodes]);

  const availableTopupGiftcodes = useMemo(() => {
    return topupGiftcodes
      .filter((code) => code.status === 'available' && Number(code.remainingPerUser ?? code.maxPerUser ?? 1) > 0)
      .sort((a, b) => {
        const aFeatured = a.audience === 'new_user_first_topup' ? 1 : 0;
        const bFeatured = b.audience === 'new_user_first_topup' ? 1 : 0;
        if (aFeatured !== bFeatured) return bFeatured - aFeatured;
        return b.discountPercent - a.discountPercent;
      });
  }, [topupGiftcodes]);

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

  const getGiftcodeUsageText = (code: TopupGiftcodeOffer) => {
    if (code.audience === 'new_user_first_topup') return 'Chỉ sử dụng được 1 lần duy nhất';
    return `Còn ${Number(code.remainingPerUser ?? code.maxPerUser ?? 1).toLocaleString('vi-VN')} lần sử dụng`;
  };

  const getGiftcodeDescription = (code: TopupGiftcodeOffer) => {
    if (code.audience === 'new_user_first_topup') {
      return `Ưu đãi ${code.discountPercent}% cho tài khoản mới nạp lần đầu. Hãy tận dụng để tránh lãng phí.`;
    }
    return `Giảm trực tiếp ${code.discountPercent}% trên giá gói nạp.`;
  };

  const handleBuyPackage = async (pkg: CreditPackage, code?: string) => {
    setLoading(true);
    updateLastActive();

    try {
      const transaction = await createPaymentLink(pkg.id, code);
      if (transaction.checkoutUrl) {
        window.location.assign(transaction.checkoutUrl);
        return;
      }

      window.sessionStorage.setItem(
        PENDING_TRANSACTION_STORAGE_KEY,
        JSON.stringify(transaction as Transaction),
      );
      notify('Đã tạo đơn hàng. Vui lòng chuyển khoản theo hướng dẫn.', 'info');
      navigate('/payment-gateway', { state: { transaction } });
    } catch (error) {
      console.error(error);
      notify('Có lỗi khi tạo giao dịch', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (packagesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#09090B]">
        <Loader className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-28">
      {activeCampaign ? (
        <div data-tour-id="mobile.topup.hero" className="relative mx-4 mt-4 rounded-3xl overflow-hidden border border-purple-200 dark:border-purple-500/30 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-orange-500" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />

          <div className="relative z-10 p-5 pb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/20 border border-yellow-300/40 backdrop-blur-md mb-3">
              <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
              <span className="text-[10px] font-bold text-yellow-200 uppercase tracking-widest">{activeCampaign.name}</span>
            </div>

            <h1 className="text-3xl font-black text-white leading-tight mb-1">
              BONUS <span className="text-yellow-300">+{activeCampaign.bonusPercent}%</span>
            </h1>
            <p className="text-xs text-white/70 leading-relaxed max-w-[280px] mb-4">{smartDescription}</p>

            <div className="flex gap-2">
              {(['d', 'h', 'm', 's'] as const).map((unit) => (
                <div key={unit} className="flex flex-col items-center">
                  <div className="w-11 h-12 bg-black/30 backdrop-blur-sm rounded-xl border border-white/10 flex items-center justify-center">
                    <span className="font-mono text-xl font-bold text-white">
                      {String(timeLeft[unit]).padStart(2, '0')}
                    </span>
                  </div>
                  <span className="text-[8px] font-bold text-white/50 mt-1 uppercase">
                    {unit === 'd' ? 'Ngày' : unit === 'h' ? 'Giờ' : unit === 'm' ? 'Phút' : 'Giây'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div data-tour-id="mobile.topup.hero" className="mx-4 mt-4 p-6 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 text-center">
          <Sparkles className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <h2 className="text-xl font-black text-white mb-1">STORE VCOIN</h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Nạp Vcoin để trải nghiệm các tính năng AI cao cấp</p>
        </div>
      )}

      <div data-tour-id="mobile.topup.heading" className="flex items-center gap-2.5 px-5 mt-6 mb-4">
        <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
          <ShoppingBag className="w-4 h-4 text-purple-600" />
        </div>
        <h2 className="text-base font-bold text-gray-800 dark:text-zinc-100">Chọn gói nạp</h2>
      </div>

      <div data-tour-id="mobile.topup.packages" className="px-4 space-y-3">
        {packages.map((pkg) => {
          const bonusPercent = activeCampaign ? activeCampaign.bonusPercent : pkg.bonusPercent;
          const hasBonus = bonusPercent > 0;
          const finalCoins = Math.floor(pkg.vcoin + (pkg.vcoin * bonusPercent / 100));
          const bonusAmount = Math.floor(pkg.vcoin * bonusPercent / 100);
          const isPopular = pkg.isPopular;
          const colorAccent = isPopular ? 'from-purple-500 to-fuchsia-500' : 'from-gray-800 to-gray-700';

          return (
            <div
              key={pkg.id}
              data-tour-id={`mobile.topup.package.${pkg.id}`}
              className={`relative bg-white dark:bg-[#18181B] rounded-2xl overflow-hidden border transition-all active:scale-[0.98] ${isPopular ? 'border-purple-200 dark:border-purple-500/30 shadow-lg shadow-purple-500/10' : 'border-gray-100 dark:border-zinc-800 shadow-sm'}`}
            >
              {isPopular && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-bl from-orange-500 to-pink-500 text-white text-[9px] font-bold rounded-bl-xl z-10 flex items-center gap-0.5">
                  <Flame className="w-2.5 h-2.5 fill-white" /> HOT
                </div>
              )}

              {hasBonus && (
                <div className="absolute top-0 left-0 px-3 py-1 bg-green-500 text-white text-[9px] font-bold rounded-br-xl z-10">
                  +{bonusPercent}%
                </div>
              )}

              <div className="flex items-center p-4 gap-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-b ${colorAccent} flex items-center justify-center shrink-0`}>
                  <Gem className="w-7 h-7 text-white drop-shadow-lg" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{finalCoins}</span>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Vcoin</span>
                  </div>
                  {hasBonus && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-400 dark:text-zinc-500 line-through">{pkg.vcoin}</span>
                      <span className="text-[10px] text-green-600 font-bold">+{bonusAmount} bonus</span>
                    </div>
                  )}
                  <p className="text-lg font-bold text-gray-800 dark:text-zinc-100 mt-1">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(pkg.price)}
                  </p>
                </div>

                <button
                  data-tour-id="mobile.topup.payment_button"
                  onClick={() => void openCheckoutModal(pkg)}
                  disabled={loading}
                  className={`shrink-0 px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-1 transition-all ${isPopular ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30 active:shadow-sm' : 'bg-gray-900 text-white active:bg-gray-700'}`}
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <>Nạp <ChevronRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div data-tour-id="mobile.topup.note" className="mx-4 mt-6 p-4 rounded-2xl bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50">
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-relaxed text-center">
          Thanh toán an toàn qua <strong>SePay</strong>. 1 Vcoin = 1.000đ. Vcoin nạp vào tài khoản ngay lập tức sau khi thanh toán thành công.
        </p>
      </div>

      {selectedPackage && checkoutPreview && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/60 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[30px] bg-white p-4 shadow-2xl dark:bg-[#18181B]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
                  <Gift className="h-3.5 w-3.5" />
                  Giftcode ưu đãi
                </div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white">{selectedPackage.name}</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Chọn mã trước khi quét QR thanh toán.</p>
              </div>
              <button onClick={() => setSelectedPackage(null)} className="rounded-2xl bg-gray-100 p-2 text-gray-500 dark:bg-zinc-800 dark:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-gray-50 p-3 dark:bg-zinc-800/80">
              <label className="text-[10px] font-black uppercase tracking-wide text-gray-400 dark:text-zinc-500">Nhập hoặc chọn nhanh code</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={giftcodeInput}
                  onChange={(e) => setGiftcodeInput(e.target.value.toUpperCase())}
                  placeholder="AUAI-50-XXXXX"
                  className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 font-mono text-sm font-black uppercase outline-none focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                <button onClick={() => setGiftcodeInput('')} className="rounded-2xl bg-gray-900 px-4 text-xs font-bold text-white dark:bg-white dark:text-black">Xóa</button>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              {loadingGiftcodes ? (
                <div className="flex items-center justify-center rounded-2xl bg-gray-50 py-8 text-sm text-gray-400 dark:bg-zinc-800/80">
                  <Loader className="mr-2 h-4 w-4 animate-spin" /> Đang tải mã ưu đãi
                </div>
              ) : availableTopupGiftcodes.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-zinc-800/80 dark:text-zinc-400">Hiện chưa có giftcode nạp tiền khả dụng cho tài khoản này.</div>
              ) : availableTopupGiftcodes.map((code) => {
                const selected = giftcodeInput.trim().toUpperCase() === code.code.toUpperCase();
                const featured = code.audience === 'new_user_first_topup';
                return (
                  <button
                    key={code.id}
                    onClick={() => setGiftcodeInput(code.code)}
                    className={`w-full rounded-2xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-500/10'
                        : featured
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'
                          : 'border-gray-100 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all font-mono text-sm font-black text-gray-900 dark:text-white">{code.code}</span>
                          {featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Nạp lần đầu</span>}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-zinc-400">{getGiftcodeDescription(code)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">-{code.discountPercent}%</span>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-gray-600 dark:bg-zinc-900 dark:text-zinc-300">
                      <CheckCircle2 className="h-3 w-3 text-cyan-500" />
                      {getGiftcodeUsageText(code)}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-3xl bg-gray-950 p-4 text-white">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-zinc-400">Gói nhận</span>
                <span className="text-lg font-black text-yellow-300">{selectedPackage.vcoin} Vcoin</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><span className="text-zinc-400">Giá gốc</span><span className="font-bold">{checkoutPreview.originalAmount.toLocaleString('vi-VN')}đ</span></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-400">Giảm giá</span><span className="font-bold text-emerald-300">-{checkoutPreview.discountAmount.toLocaleString('vi-VN')}đ</span></div>
                <div className="flex justify-between gap-3 border-t border-white/10 pt-3"><span className="font-bold">Cần thanh toán</span><span className="text-2xl font-black text-cyan-300">{checkoutPreview.finalAmount.toLocaleString('vi-VN')}đ</span></div>
              </div>
              {giftcodeInput && selectedOffer?.status !== 'available' && (
                <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">Code này không còn khả dụng cho tài khoản hoặc đã được sử dụng.</p>
              )}
              <button
                onClick={() => void handleBuyPackage(selectedPackage, selectedOffer?.status === 'available' ? giftcodeInput : undefined)}
                disabled={loading || Boolean(giftcodeInput && selectedOffer?.status !== 'available')}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {loading ? <Loader className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Quét QR để thanh toán
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
