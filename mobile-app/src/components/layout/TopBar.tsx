/**
 * TopBar with real Vcoin balance from AuthContext
 * Also surfaces the current mobile promotion banner so app-wide offers
 * are visible outside of the top-up screen.
 */

import { useEffect, useMemo, useState } from 'react';
import { Coins, Gift, Settings, Zap } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getActivePromotion, getGiftcodePromoConfig, type PromotionCampaign } from '../../services/economyService';

type MobilePromoBanner =
  | { kind: 'promotion'; text: string; campaign: PromotionCampaign }
  | { kind: 'giftcode'; text: string };

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [promotion, setPromotion] = useState<PromotionCampaign | null>(null);
  const [giftcodePromo, setGiftcodePromo] = useState<{ text: string; isActive: boolean }>({ text: '', isActive: false });

  const hiddenRoutes = ['/', '/login', '/payment-gateway', '/admin'];
  const isHiddenRoute = hiddenRoutes.includes(location.pathname);

  useEffect(() => {
    let disposed = false;

    const refreshPromotions = async () => {
      try {
        const [nextPromotion, nextGiftcodePromo] = await Promise.all([
          getActivePromotion(),
          getGiftcodePromoConfig(),
        ]);

        if (disposed) {
          return;
        }

        setPromotion(nextPromotion);
        setGiftcodePromo(nextGiftcodePromo);
      } catch {
        if (disposed) {
          return;
        }

        setPromotion(null);
        setGiftcodePromo({ text: '', isActive: false });
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshPromotions();
      }
    };

    void refreshPromotions();
    window.addEventListener('focus', refreshPromotions);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      window.removeEventListener('focus', refreshPromotions);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const vcoinDisplay = user?.vcoin_balance != null
    ? user.vcoin_balance.toLocaleString()
    : '---';

  const promoBanner = useMemo<MobilePromoBanner | null>(() => {
    if (promotion?.isActive) {
      const title = promotion.name?.trim() || 'Khuyến mại';
      const bonus = Number.isFinite(promotion.bonusPercent) ? promotion.bonusPercent : 0;
      const text = bonus > 0
        ? `${title}: nạp Vcoin nhận thêm +${bonus}%`
        : promotion.marqueeText?.trim() || title;

      return {
        kind: 'promotion',
        text,
        campaign: promotion,
      };
    }

    if (giftcodePromo.isActive && giftcodePromo.text.trim()) {
      return {
        kind: 'giftcode',
        text: giftcodePromo.text.trim(),
      };
    }

    return null;
  }, [giftcodePromo, promotion]);

  if (isHiddenRoute) return null;

  const handlePromoClick = () => {
    if (!promoBanner) {
      return;
    }

    if (promoBanner.kind === 'promotion') {
      navigate('/topup');
      return;
    }

    navigate('/profile');
  };

  return (
    <div className="sticky top-0 z-40">
      <div className="bg-white dark:bg-[#18181B]/80 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#111] to-[#333] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            A
          </div>
          <span className="font-semibold tracking-tight text-base text-gray-800 dark:text-zinc-100">Audition AI</span>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/topup">
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full active:scale-95 transition-transform">
              <Coins className="w-3.5 h-3.5 text-yellow-600" />
              <span className="text-xs font-bold text-gray-700 dark:text-zinc-200">{vcoinDisplay}</span>
            </div>
          </Link>
          <button
            onClick={() => navigate('/profile')}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Settings className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
          </button>
        </div>
      </div>

      {promoBanner && (
        <button
          onClick={handlePromoClick}
          className={`w-full px-4 py-2.5 border-b text-left transition-colors ${
            promoBanner.kind === 'promotion'
              ? 'bg-gradient-to-r from-fuchsia-600 via-purple-600 to-orange-500 border-fuchsia-300/30 text-white'
              : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 border-cyan-300/30 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 shrink-0 rounded-full bg-white/15 border border-white/15 flex items-center justify-center">
              {promoBanner.kind === 'promotion' ? (
                <Zap className="w-4 h-4 text-yellow-200" />
              ) : (
                <Gift className="w-4 h-4 text-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/75">
                  {promoBanner.kind === 'promotion' ? 'Khuyến mại' : 'Giftcode'}
                </span>
                {promoBanner.kind === 'promotion' && (
                  <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-yellow-100">
                    +{Math.max(0, promoBanner.campaign.bonusPercent || 0)}%
                  </span>
                )}
              </div>
              <p className="truncate text-[12px] font-semibold leading-tight text-white">
                {promoBanner.text}
              </p>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
