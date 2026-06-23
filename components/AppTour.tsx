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
  const active = tours.filter((tour) => {
    if (!tour.isActive || tour.surface !== surface) return false;
    const screenMatches = tour.screen === screen || tour.screen === 'global';
    if (!screenMatches) return false;
    if (tour.featureId && tour.featureId !== featureId) return false;
    return getActiveSteps(tour).length > 0;
  });

  return active.sort((left, right) => {
    const leftScore = (left.featureId ? 2 : 0) + (left.screen === screen ? 1 : 0);
    const rightScore = (right.featureId ? 2 : 0) + (right.screen === screen ? 1 : 0);
    return rightScore - leftScore;
  })[0] || null;
};

const getTooltipStyle = (rect: TargetRect, placement: AppTourStep['placement']) => {
  const margin = 16;
  const tooltipWidth = Math.min(360, window.innerWidth - 32);
  const tooltipHeight = 220;
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
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
      <div
        className="absolute rounded-2xl border-2 border-audi-cyan bg-white/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.58),0_0_32px_rgba(33,212,253,0.8)] transition-all duration-300"
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        }}
      />
      <div
        className="absolute pointer-events-auto rounded-2xl border border-white/15 bg-[#101018] p-5 text-white shadow-2xl"
        style={tooltipStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-audi-cyan/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-audi-cyan">
            {stepIndex + 1}/{steps.length}
          </span>
          <button onClick={closeTour} className="text-xs font-bold text-slate-400 hover:text-white">
            Bo qua
          </button>
        </div>
        <h3 className="mb-2 text-lg font-black leading-tight text-white">{currentStep.title}</h3>
        <p className="mb-5 text-sm leading-relaxed text-slate-300">{currentStep.description}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quay lai
          </button>
          <button
            onClick={goNext}
            className="ml-auto rounded-xl bg-audi-cyan px-5 py-2 text-sm font-black text-black transition-transform active:scale-95"
          >
            {stepIndex >= steps.length - 1 ? 'Hoan tat' : 'Tiep theo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

