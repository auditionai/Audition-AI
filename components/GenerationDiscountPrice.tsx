import { useEffect, useMemo, useState } from 'react';
import { Gem, Timer, Zap } from 'lucide-react';
import { getGenerationDiscountConfig } from '../services/economyService';
import type { GenerationDiscountConfig } from '../types';

type Props = { originalCost: number; assetType: 'image' | 'video'; compact?: boolean };

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

export function GenerationDiscountPrice({ originalCost, assetType, compact = false }: Props) {
  const [config, setConfig] = useState<GenerationDiscountConfig | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void getGenerationDiscountConfig().then(setConfig); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const active = config && activeFor(config, assetType, now);
  const cost = active ? Math.max(1, Math.ceil(originalCost * (100 - config.discountPercent) / 100)) : originalCost;
  const content = active ? (
    <div className={`min-w-[172px] rounded-xl border border-pink-400/45 bg-gradient-to-r from-pink-500/15 to-cyan-400/15 px-3 py-2 shadow-lg shadow-pink-500/10 ${compact ? 'min-w-0 px-2 py-1.5' : ''}`} role="status">
      <div className={`flex items-center gap-1.5 font-black uppercase text-pink-400 ${compact ? 'text-[8px]' : 'text-[10px]'}`}><Zap size={compact ? 13 : 16} className="animate-pulse" /><span>{config.title}</span></div>
      <div className="mt-0.5 flex items-baseline gap-1.5 font-mono"><s className={compact ? 'text-[9px] text-slate-400' : 'text-[11px] text-slate-400'}>{originalCost} VC</s><strong className={`inline-flex items-center gap-1 font-black text-amber-400 ${compact ? 'text-sm' : 'text-xl'}`}>{cost}<Gem size={compact ? 12 : 15} /></strong><b className={`rounded-full bg-pink-600 px-1.5 py-0.5 text-white ${compact ? 'text-[8px]' : 'text-[10px]'}`}>-{config.discountPercent}%</b></div>
      <div className={`mt-0.5 flex items-center gap-1 font-bold text-cyan-300 ${compact ? 'text-[8px]' : 'text-[10px]'}`}><Timer size={compact ? 10 : 12} /> Kết thúc <time className="font-mono">{countdown(Date.parse(config.endTime) - now)}</time></div>
    </div>
  ) : <span className="inline-flex items-center gap-1 font-black text-amber-500">{originalCost} <Gem size={15} /></span>;
  return content;
}
