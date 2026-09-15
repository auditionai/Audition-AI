import { useEffect, useState } from 'react';
import { Gem, Timer, Zap } from 'lucide-react';
import { getGenerationDiscountConfig } from '../services/economyService';
import type { GenerationDiscountConfig } from '../types';
import './generation-discount.css';

type Props = { originalCost: number; assetType: 'image' | 'video'; compact?: boolean; panel?: boolean };

const activeFor = (config: GenerationDiscountConfig, assetType: Props['assetType'], now: number) =>
  config.isActive && config.discountPercent > 0 && (config.appliesTo === 'all' || config.appliesTo === assetType)
  && Date.parse(config.startTime) <= now && Date.parse(config.endTime) > now;

const countdown = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor(total % 3600 / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export function GenerationDiscountPrice({ originalCost, assetType, compact = false, panel = false }: Props) {
  const [config, setConfig] = useState<GenerationDiscountConfig | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void getGenerationDiscountConfig().then(setConfig); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const active = config && activeFor(config, assetType, now);
  const cost = active ? Math.max(1, Math.ceil(originalCost * (100 - config.discountPercent) / 100)) : originalCost;
  const content = active && compact ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] font-black text-amber-300"><s className="text-white/50">{originalCost}</s><b>{cost}</b><span className="rounded-full bg-pink-500 px-1 text-[8px] text-white">-{config.discountPercent}%</span></span>
  ) : active ? (
    <div className={`generation-promo-frame ${panel ? 'generation-promo-frame--panel' : ''}`} role="status">
      <div className="generation-promo-frame__glow" aria-hidden="true" />
      <div className="generation-promo-frame__content">
      <div className={`flex items-center gap-1.5 font-black uppercase text-pink-400 ${compact ? 'text-[8px]' : 'text-[10px]'}`}><Zap size={compact ? 13 : 16} className="animate-pulse" /><span>{config.title}</span></div>
      <div className="mt-1 flex items-end gap-2 font-mono"><div><span className="block text-[10px] font-bold text-slate-400">Giá gốc</span><s className="text-sm font-bold text-slate-400">{originalCost} Vcoin</s></div><div className="h-9 w-px bg-white/15" /><div><span className="block text-[10px] font-bold text-cyan-200">Giá event</span><strong className="inline-flex items-center gap-1 text-3xl font-black text-amber-300">{cost}<Gem size={18} /></strong></div><b className="mb-1 rounded-full bg-pink-600 px-2 py-1 text-xs text-white shadow-lg shadow-pink-500/40">-{config.discountPercent}%</b></div>
      <div className={`mt-0.5 flex items-center gap-1 font-bold text-cyan-300 ${compact ? 'text-[8px]' : 'text-[10px]'}`}><Timer size={compact ? 10 : 12} /> Kết thúc <time className="font-mono">{countdown(Date.parse(config.endTime) - now)}</time></div>
      </div></div>
  ) : <span className="inline-flex items-center gap-1 font-black text-amber-500">{originalCost} <Gem size={15} /></span>;
  return content;
}
