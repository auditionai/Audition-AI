import { useEffect, useState } from 'react';
import { Gem, Timer, Zap } from 'lucide-react';
import { getGenerationDiscountConfig } from '../services/economyService';
import type { GenerationDiscountConfig } from '../types';
import './generation-discount.css';

type Props = { originalCost: number; assetType: 'image' | 'video'; compact?: boolean };

const activeFor = (config: GenerationDiscountConfig, asset: Props['assetType'], now: number) =>
  config.isActive && config.discountPercent > 0 && (config.appliesTo === 'all' || config.appliesTo === asset)
  && Date.parse(config.startTime) <= now && Date.parse(config.endTime) > now;

const countdown = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor(total % 86400 / 3600), minutes: Math.floor(total % 3600 / 60), seconds: total % 60 };
};

export function GenerationDiscountPrice({ originalCost, assetType, compact = false }: Props) {
  const [config, setConfig] = useState<GenerationDiscountConfig | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void getGenerationDiscountConfig().then(setConfig); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const active = config && activeFor(config, assetType, now);
  const price = active ? Math.max(1, Math.ceil(originalCost * (100 - config.discountPercent) / 100)) : originalCost;
  if (!active) return <span className="inline-flex items-center gap-1 font-black text-amber-500">{originalCost} <Gem size={15} /></span>;
  if (compact) return <span className="generation-offer-compact"><s>{originalCost}</s><b>{price}</b><i>-{config.discountPercent}%</i></span>;
  const left = countdown(Date.parse(config.endTime) - now);
  return <section className="generation-offer" aria-label={`Ưu đãi ${config.title}`}><div className="generation-offer__edge" aria-hidden="true" /><div className="generation-offer__topline"><span><Zap size={14} /> EVENT ĐANG DIỄN RA</span><b>{config.title}</b></div><div className="generation-offer__body"><div className="generation-offer__clock"><span className="generation-offer__clock-label"><Timer size={13} /> Còn lại</span><div className="generation-offer__digits"><b>{left.days}</b><small>ngày</small><b>{String(left.hours).padStart(2, '0')}</b><small>giờ</small><b>{String(left.minutes).padStart(2, '0')}</b><small>phút</small><b>{String(left.seconds).padStart(2, '0')}</b><small>giây</small></div></div><div className="generation-offer__price"><span>GIÁ EVENT</span><strong>{price}<Gem size={20} /></strong><em>Giá gốc <s>{originalCost} Vcoin</s></em></div><div className="generation-offer__save"><b>-{config.discountPercent}%</b><span>TIẾT KIỆM<br />{Math.max(0, originalCost - price)} Vcoin</span></div></div></section>;
}
