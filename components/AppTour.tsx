import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAppToursConfig, type AppTourDefinition, type AppTourStep, type AppTourSurface } from '../services/economyService';

type AppTourProps = {
  surface: AppTourSurface;
  screen: string;
  featureId?: string | null;
  disabled?: boolean;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const STORAGE_PREFIX = 'auditionai:tour:last-shown';
const TOUR_REFRESH_EVENT = 'auditionai:app-tours-updated';

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getStorageKey = (tour: AppTourDefinition) => `${STORAGE_PREFIX}:${tour.surface}:${tour.id}`;

const hasSeenTour = (tour: AppTourDefinition, frequency: string) => {
  if (typeof window === 'undefined' || frequency === 'always') return false;
  const saved = window.localStorage.getItem(getStorageKey(tour));
  if (frequency === 'once') return !!saved;
  return saved === getTodayKey();
};

const markTourSeen = (tour: AppTourDefinition) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getStorageKey(tour), getTodayKey());
};

const findTarget = (targetId: string) =>
  document.querySelector(`[data-tour-id="${CSS.escape(targetId)}"]`) as HTMLElement | null;

const getActiveSteps = (tour: AppTourDefinition) =>
  [...(tour.steps || [])]
    .filter((step) => step.isActive !== false && step.targetId)
    .sort((left, right) => (left.order || 0) - (right.order || 0));

const selectTour = (tours: AppTourDefinition[], surface: AppTourSurface, screen: string, featureId?: string | null) => {
  const featureMatches = (tourFeatureId?: string) => {
    if (!tourFeatureId) return true;
    return tourFeatureId
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(String(featureId || ''));
  };

  const active = tours.filter((tour) => {
    if (!tour.isActive || tour.surface !== surface) return false;
    const screenMatches = tour.screen === screen || tour.screen === 'global';
    if (!screenMatches) return false;
    if (!featureMatches(tour.featureId)) return false;
    return getActiveSteps(tour).length > 0;
  });

  return active.sort((left, right) => {
    const exactLeft = left.featureId === featureId ? 2 : 0;
    const exactRight = right.featureId === featureId ? 2 : 0;
    const leftScore = (left.featureId ? 2 : 0) + exactLeft + (left.screen === screen ? 1 : 0);
    const rightScore = (right.featureId ? 2 : 0) + exactRight + (right.screen === screen ? 1 : 0);
    return rightScore - leftScore;
  })[0] || null;
};

const getTooltipStyle = (rect: TargetRect, placement: AppTourStep['placement']) => {
  const margin = 22;
  const tooltipWidth = Math.min(410, window.innerWidth - 32);
  const tooltipHeight = 250;
  const preferred = placement && placement !== 'auto' ? placement : rect.top > window.innerHeight / 2 ? 'top' : 'bottom';

  let top = rect.top + rect.height + margin;
  let left = rect.left + Math.min(rect.width / 2, tooltipWidth / 2) - tooltipWidth / 2;

  if (preferred === 'top') top = rect.top - tooltipHeight - margin;
  if (preferred === 'left') {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.left - tooltipWidth - margin;
  }
  if (preferred === 'right') {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.left + rect.width + margin;
  }

  top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));
  left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

  return { top, left, width: tooltipWidth };
};

export const AppTour: React.FC<AppTourProps> = ({ surface, screen, featureId, disabled }) => {
  const [config, setConfig] = useState<any>(null);
  const [activeTour, setActiveTour] = useState<AppTourDefinition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (disabled) return;
    let disposed = false;

    const load = async () => {
      const next = await getAppToursConfig();
      if (!disposed) setConfig(next);
    };

    void load();
    window.addEventListener(TOUR_REFRESH_EVENT, load);
    return () => {
      disposed = true;
      window.removeEventListener(TOUR_REFRESH_EVENT, load);
    };
  }, [disabled]);

  useEffect(() => {
    if (disabled || !config?.isActive) {
      setActiveTour(null);
      return;
    }

    const tour = selectTour(config.tours || [], surface, screen, featureId);
    if (!tour || hasSeenTour(tour, config.showFrequency)) {
      setActiveTour(null);
      return;
    }

    setActiveTour(tour);
    setStepIndex(0);
  }, [config, disabled, featureId, screen, surface]);

  const steps = useMemo(() => activeTour ? getActiveSteps(activeTour) : [], [activeTour]);
  const currentStep = steps[stepIndex] || null;

  useEffect(() => {
    if (!activeTour || !currentStep) return;
    let disposed = false;
    let attempts = 0;

    const syncRect = () => {
      const target = findTarget(currentStep.targetId);
      if (!target) {
        attempts += 1;
        if (attempts < 8) {
          window.setTimeout(syncRect, 150);
          return;
        }
        goNext();
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.setTimeout(() => {
        if (disposed) return;
        const nextRect = target.getBoundingClientRect();
        setRect({
          top: nextRect.top,
          left: nextRect.left,
          width: nextRect.width,
          height: nextRect.height,
        });
        setReady(true);
      }, 260);
    };

    setReady(false);
    syncRect();

    const handleResize = () => {
      const target = findTarget(currentStep.targetId);
      if (!target) return;
      const nextRect = target.getBoundingClientRect();
      setRect({ top: nextRect.top, left: nextRect.left, width: nextRect.width, height: nextRect.height });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTour, currentStep?.targetId, stepIndex]);

  const closeTour = () => {
    if (activeTour) markTourSeen(activeTour);
    setActiveTour(null);
  };

  function goNext() {
    if (!activeTour) return;
    if (stepIndex >= steps.length - 1) {
      closeTour();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  if (!activeTour || !currentStep || !rect || !ready || typeof document === 'undefined') return null;

  const tooltipStyle = getTooltipStyle(rect, currentStep.placement);

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(33,212,253,0.18),rgba(0,0,0,0.72)_42%,rgba(0,0,0,0.86))] backdrop-blur-[3px]" />
      <div
        className="absolute rounded-[28px] border border-white/20 opacity-70 blur-[1px] transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{
          top: rect.top - 18,
          left: rect.left - 18,
          width: rect.width + 36,
          height: rect.height + 36,
          boxShadow: '0 0 70px rgba(33,212,253,0.38), inset 0 0 34px rgba(255,255,255,0.14)',
        }}
      />
      <div
        className="absolute rounded-[24px] border-2 border-audi-cyan bg-white/10 transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.56), 0 20px 80px rgba(33,212,253,0.55), inset 0 0 26px rgba(33,212,253,0.18)',
        }}
      >
        <div className="absolute -left-1.5 -top-1.5 h-5 w-5 rounded-tl-[20px] border-l-4 border-t-4 border-white shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
        <div className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-tr-[20px] border-r-4 border-t-4 border-white shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
        <div className="absolute -bottom-1.5 -left-1.5 h-5 w-5 rounded-bl-[20px] border-b-4 border-l-4 border-white shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
        <div className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-br-[20px] border-b-4 border-r-4 border-white shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
      </div>
      <div
        key={currentStep.id}
        className="absolute pointer-events-auto overflow-hidden rounded-[28px] border border-white/20 bg-[#0d0d18]/95 p-5 text-white shadow-[0_26px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl animate-fade-in"
        style={{
          ...tooltipStyle,
          transform: 'perspective(900px) rotateX(2deg) translateZ(0)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.68), 0 0 42px rgba(183,33,255,0.28), inset 0 1px 0 rgba(255,255,255,0.16)',
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-audi-pink via-audi-cyan to-audi-yellow" />
        <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-audi-cyan/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-44 w-44 rounded-full bg-audi-pink/20 blur-3xl" />

        <div className="relative mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-audi-cyan/40 bg-audi-cyan/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-audi-cyan shadow-[0_0_20px_rgba(33,212,253,0.18)]">
              Bước {stepIndex + 1}/{steps.length}
            </span>
            <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-400 sm:inline">
              {activeTour.title}
            </span>
          </div>
          <button onClick={closeTour} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:border-audi-pink/50 hover:bg-audi-pink/15 hover:text-white">
            Bỏ qua
          </button>
        </div>
        <h3 className="relative mb-2 text-xl font-black leading-tight text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]">{currentStep.title}</h3>
        <p className="relative mb-5 text-sm leading-relaxed text-slate-200">{currentStep.description}</p>
        <div className="relative mb-5 flex gap-1.5">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${index <= stepIndex ? 'bg-gradient-to-r from-audi-pink to-audi-cyan shadow-[0_0_12px_rgba(33,212,253,0.45)]' : 'bg-white/10'}`}
            />
          ))}
        </div>
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 transition-all hover:-translate-y-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            Quay lại
          </button>
          <button
            onClick={goNext}
            className="ml-auto rounded-2xl bg-gradient-to-r from-audi-cyan to-audi-yellow px-5 py-2.5 text-sm font-black text-black shadow-[0_0_28px_rgba(33,212,253,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(251,218,97,0.45)] active:scale-95"
          >
            {stepIndex >= steps.length - 1 ? 'Hoàn tất' : 'Tiếp theo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
