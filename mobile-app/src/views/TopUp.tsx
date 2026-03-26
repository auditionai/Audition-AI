/**
 * TopUp.tsx - Mobile Top-Up / Vcoin Purchase
 * Ported from desktop TopUp.tsx with mobile-first UX.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Flame, Gem, Loader, ShoppingBag, Sparkles, Zap } from 'lucide-react';
import { useNotification } from '../components/NotificationSystem';
import { createPaymentLink, getActivePromotion, getPackages, updateLastActive } from '../services/economyService';
import type { PromotionCampaign } from '../services/economyService';
import type { CreditPackage, Transaction } from '../types';

const PENDING_TRANSACTION_STORAGE_KEY = 'audition-mobile-pending-transaction';

export const TopUp: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<PromotionCampaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [packagesLoading, setPackagesLoading] = useState(true);
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

  const handleBuyPackage = async (pkg: CreditPackage) => {
    setLoading(true);
    updateLastActive();

    try {
      const transaction = await createPaymentLink(pkg.id);
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
        <div className="relative mx-4 mt-4 rounded-3xl overflow-hidden border border-purple-200 dark:border-purple-500/30 shadow-lg">
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
        <div className="mx-4 mt-4 p-6 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 text-center">
          <Sparkles className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <h2 className="text-xl font-black text-white mb-1">STORE VCOIN</h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Nạp Vcoin để trải nghiệm các tính năng AI cao cấp</p>
        </div>
      )}

      <div className="flex items-center gap-2.5 px-5 mt-6 mb-4">
        <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
          <ShoppingBag className="w-4 h-4 text-purple-600" />
        </div>
        <h2 className="text-base font-bold text-gray-800 dark:text-zinc-100">Chọn gói nạp</h2>
      </div>

      <div className="px-4 space-y-3">
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
                  onClick={() => void handleBuyPackage(pkg)}
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

      <div className="mx-4 mt-6 p-4 rounded-2xl bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50">
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-relaxed text-center">
          Thanh toán an toàn qua <strong>PayOS</strong>. 1 Vcoin = 1.000đ. Vcoin nạp vào tài khoản ngay lập tức sau khi thanh toán thành công.
        </p>
      </div>
    </div>
  );
};
