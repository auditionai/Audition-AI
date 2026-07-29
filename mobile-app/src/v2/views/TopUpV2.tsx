import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgePercent,
  Check,
  CheckCircle2,
  Coins,
  Crown,
  Gem,
  Gift,
  Loader,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  X,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../components/NotificationSystem';
import {
  createPaymentLink,
  getActivePromotion,
  getPackages,
  getTopupGiftcodes,
  updateLastActive,
  type PromotionCampaign,
  type TopupGiftcodeOffer,
} from '../../services/economyService';
import type { CreditPackage, Transaction } from '../../types';

const PENDING_TRANSACTION_STORAGE_KEY = 'audition-mobile-pending-transaction';

export function TopUpV2() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [campaign, setCampaign] = useState<PromotionCampaign | null>(null);
  const [giftcodes, setGiftcodes] = useState<TopupGiftcodeOffer[]>([]);
  const [selected, setSelected] = useState<CreditPackage | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    Promise.all([getPackages(), getActivePromotion(), getTopupGiftcodes()])
      .then(([nextPackages, nextCampaign, nextCodes]) => {
        setPackages(nextPackages);
        setCampaign(nextCampaign);
        setGiftcodes(nextCodes);
      })
      .catch(() => notify('Không thể tải cửa hàng Vcoin.', 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    if (!campaign) return undefined;
    const update = () => {
      const diff = Math.max(0, new Date(campaign.endTime).getTime() - Date.now());
      setTimeLeft({
        h: Math.floor(diff / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1000),
      });
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [campaign]);

  const activeCode = useMemo(
    () => giftcodes.find((item) => item.code.toUpperCase() === code.trim().toUpperCase() && item.status === 'available') || null,
    [code, giftcodes],
  );

  const availableGiftcodes = useMemo(
    () => giftcodes
      .filter((item) => item.status === 'available' && Number(item.remainingPerUser ?? item.maxPerUser ?? 1) > 0)
      .sort((a, b) => b.discountPercent - a.discountPercent),
    [giftcodes],
  );

  const giftcodeBenefits = useMemo(() => {
    const summary = new Map<number, number>();
    availableGiftcodes.forEach((item) => {
      const remainingUses = Math.max(0, Number(item.remainingPerUser ?? item.maxPerUser ?? 1));
      summary.set(item.discountPercent, (summary.get(item.discountPercent) || 0) + remainingUses);
    });
    return [...summary.entries()]
      .sort(([discountA], [discountB]) => discountB - discountA)
      .map(([discountPercent, remainingUses]) => ({ discountPercent, remainingUses }));
  }, [availableGiftcodes]);

  const preview = useMemo(() => {
    if (!selected) return null;
    const discount = activeCode?.discountPercent || 0;
    const discountAmount = Math.floor(selected.price * discount / 100);
    return { discount, discountAmount, total: Math.max(0, selected.price - discountAmount) };
  }, [activeCode, selected]);

  const checkout = async () => {
    if (!selected) return;
    setPaying(true);
    updateLastActive();
    try {
      const transaction = await createPaymentLink(selected.id, activeCode?.code);
      if (transaction.checkoutUrl) {
        window.location.assign(transaction.checkoutUrl);
        return;
      }
      window.sessionStorage.setItem(PENDING_TRANSACTION_STORAGE_KEY, JSON.stringify(transaction as Transaction));
      navigate('/payment-gateway', { state: { transaction } });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể tạo giao dịch.', 'error');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="v2-wallet-page">
      <section className="v2-wallet-hero">
        <div className="v2-wallet-hero__copy">
          <span><Crown size={14} /> Vcoin energy vault</span>
          <h1>Nạp năng lượng.<br /><b>Mở khóa sáng tạo.</b></h1>
          <p>Giá cuối cùng, bonus và giftcode được tính ngay trước khi thanh toán.</p>
          <div><ShieldCheck size={15} /> Thanh toán bảo mật qua SePay</div>
        </div>
        <div className="v2-wallet-gem" aria-hidden="true"><Gem size={42} /></div>
      </section>

      {campaign && (
        <section className="v2-wallet-campaign">
          <div><Zap size={19} /><span><small>Sự kiện đang diễn ra</small><strong>{campaign.name}</strong></span></div>
          <b>+{campaign.bonusPercent}%</b>
          <time>{String(timeLeft.h).padStart(2, '0')}:{String(timeLeft.m).padStart(2, '0')}:{String(timeLeft.s).padStart(2, '0')}</time>
        </section>
      )}

      <section className="v2-voucher-board" aria-labelledby="v2-voucher-title">
        <div className="v2-voucher-board__heading">
          <span><TicketPercent size={21} /></span>
          <div>
            <small>Ưu đãi đang khả dụng</small>
            <h2 id="v2-voucher-title">Giftcode nạp tiền của bạn</h2>
            <p>Chọn gói nạp để xem và áp dụng mã cụ thể.</p>
          </div>
          <b>{availableGiftcodes.length}</b>
        </div>
        {loading ? (
          <div className="v2-voucher-board__state"><Loader className="v2-spin" size={18} /> Đang kiểm tra ưu đãi…</div>
        ) : giftcodeBenefits.length > 0 ? (
          <div className="v2-voucher-benefits">
            {giftcodeBenefits.map((benefit) => (
              <article key={benefit.discountPercent}>
                <span><BadgePercent size={18} /></span>
                <div>
                  <strong>Code giảm {benefit.discountPercent}%</strong>
                  <small>Khi nạp tiền</small>
                </div>
                <b>Còn {benefit.remainingUses.toLocaleString('vi-VN')} lượt</b>
              </article>
            ))}
          </div>
        ) : (
          <div className="v2-voucher-board__state">Hiện chưa có Giftcode nạp tiền khả dụng.</div>
        )}
      </section>

      <section className="v2-wallet-heading">
        <div><span>Chọn mức năng lượng</span><h2>Gói Vcoin dành cho bạn</h2></div>
        <Coins size={25} />
      </section>

      {loading ? (
        <div className="v2-state-card"><Loader className="v2-spin" /><strong>Đang mở kho Vcoin…</strong></div>
      ) : (
        <section className="v2-package-deck">
          {packages.map((pkg, index) => {
            const bonus = campaign?.bonusPercent ?? pkg.bonusPercent ?? 0;
            const finalCoins = Math.floor(pkg.vcoin * (1 + bonus / 100));
            return (
              <button type="button" key={pkg.id} className={`v2-package-card v2-tap${pkg.isPopular ? ' is-popular' : ''}`} onClick={() => {
                setSelected(pkg);
                setCode(availableGiftcodes[0]?.code || '');
              }}>
                <span className="v2-package-card__rank">0{index + 1}</span>
                {pkg.isPopular && <span className="v2-package-card__hot"><Sparkles size={12} /> Đề xuất</span>}
                <span className="v2-package-card__gem"><Gem size={28} /></span>
                <span className="v2-package-card__coins"><strong>{finalCoins.toLocaleString('vi-VN')}</strong><small>VCOIN</small></span>
                {bonus > 0 && <span className="v2-package-card__bonus">+{bonus}% bonus</span>}
                <span className="v2-package-card__price">{pkg.price.toLocaleString('vi-VN')}đ</span>
                <ArrowRight size={19} />
              </button>
            );
          })}
        </section>
      )}

      {selected && preview && (
        <div className="v2-checkout-sheet" role="dialog" aria-modal="true" aria-label="Xác nhận gói nạp">
          <button type="button" className="v2-checkout-sheet__close" onClick={() => setSelected(null)} aria-label="Đóng"><X size={20} /></button>
          <div className="v2-checkout-sheet__handle" />
          <span className="v2-checkout-sheet__badge"><Gift size={15} /> Smart checkout</span>
          <h2>{selected.vcoin.toLocaleString('vi-VN')} Vcoin</h2>
          <p>Kiểm tra ưu đãi và số tiền cuối cùng trước khi sang cổng thanh toán.</p>

          <section className="v2-checkout-offers" aria-label="Danh sách Giftcode khả dụng">
            <div>
              <strong>Chọn Giftcode</strong>
              <small>{availableGiftcodes.length} mã có thể sử dụng</small>
            </div>
            {availableGiftcodes.length > 0 ? (
              <div className="v2-checkout-offers__list">
                {availableGiftcodes.map((item, index) => {
                  const isSelected = activeCode?.id === item.id;
                  const remainingUses = Math.max(0, Number(item.remainingPerUser ?? item.maxPerUser ?? 1));
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={isSelected ? 'is-selected' : ''}
                      aria-pressed={isSelected}
                      onClick={() => setCode(item.code)}
                    >
                      <span><BadgePercent size={18} /></span>
                      <div>
                        <strong>{item.code}</strong>
                        <small>Còn {remainingUses.toLocaleString('vi-VN')} lượt sử dụng</small>
                      </div>
                      <b>-{item.discountPercent}%</b>
                      {index === 0 && <em>Tốt nhất</em>}
                      <i>{isSelected && <CheckCircle2 size={17} />}</i>
                    </button>
                  );
                })}
                <button type="button" className={!code ? 'is-selected is-none' : 'is-none'} aria-pressed={!code} onClick={() => setCode('')}>
                  <span><X size={17} /></span>
                  <div><strong>Không dùng Giftcode</strong><small>Thanh toán theo giá gốc</small></div>
                  <i>{!code && <CheckCircle2 size={17} />}</i>
                </button>
              </div>
            ) : (
              <p>Chưa có Giftcode phù hợp với tài khoản này.</p>
            )}
          </section>

          <label className="v2-checkout-code">
            <span>Giftcode</span>
            <div><TicketPercent size={18} /><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Nhập mã ưu đãi" />{activeCode && <Check size={18} />}</div>
          </label>

          <div className="v2-checkout-summary">
            <span><small>Giá gốc</small><b>{selected.price.toLocaleString('vi-VN')}đ</b></span>
            <span><small>Giảm giá {preview.discount > 0 ? `${preview.discount}%` : ''}</small><b>-{preview.discountAmount.toLocaleString('vi-VN')}đ</b></span>
            <span><small>Thanh toán</small><strong>{preview.total.toLocaleString('vi-VN')}đ</strong></span>
          </div>

          <button type="button" className="v2-checkout-submit" onClick={() => void checkout()} disabled={paying}>
            {paying ? <Loader className="v2-spin" size={19} /> : <ShieldCheck size={19} />}
            {paying ? 'Đang tạo giao dịch…' : 'Thanh toán an toàn'}
            {!paying && <ArrowRight size={19} />}
          </button>
        </div>
      )}
    </div>
  );
}
