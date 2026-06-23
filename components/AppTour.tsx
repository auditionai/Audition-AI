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

const featureIdMatches = (tourFeatureId: string | undefined, featureId: string | null | undefined) => {
  if (!tourFeatureId) return true;
  return tourFeatureId
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(String(featureId || ''));
};

const selectTour = (tours: AppTourDefinition[], surface: AppTourSurface, screen: string, featureId?: string | null) => {
  const active = tours.filter((tour) => {
    if (!tour.isActive || tour.surface !== surface) return false;
    if (tour.screen !== screen && tour.screen !== 'global') return false;
    if (!featureIdMatches(tour.featureId, featureId)) return false;
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

const getTooltipStyle = (rect: TargetRect, placement: AppTourStep['placement'], surface: AppTourSurface) => {
  const margin = surface === 'mobile' ? 12 : 16;
  const tooltipWidth = surface === 'mobile'
    ? Math.min(310, window.innerWidth - 24)
    : Math.min(340, window.innerWidth - 32);
  const tooltipHeight = surface === 'mobile' ? 190 : 205;
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

  top = Math.max(10, Math.min(top, window.innerHeight - tooltipHeight - 10));
  left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));

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
          window.setTimeout(syncRect, 140);
          return;
        }
        goNext();
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.setTimeout(() => {
        if (disposed) return;
        const nextRect = target.getBoundingClientRect();
        setRect({ top: nextRect.top, left: nextRect.left, width: nextRect.width, height: nextRect.height });
        setReady(true);
      }, 220);
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

  const tooltipStyle = getTooltipStyle(rect, currentStep.placement, surface);
  const isMobile = surface === 'mobile';

  const highlightStyle: React.CSSProperties = {
    top: rect.top - (isMobile ? 5 : 7),
    left: rect.left - (isMobile ? 5 : 7),
    width: rect.width + (isMobile ? 10 : 14),
    height: rect.height + (isMobile ? 10 : 14),
    boxShadow: isMobile
      ? '0 8px 24px rgba(0,0,0,0.18), 0 0 0 3px rgba(255,255,255,0.75)'
      : '0 0 26px rgba(33,212,253,0.58), inset 0 0 18px rgba(33,212,253,0.12)',
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div className="absolute inset-0 bg-transparent" />
      <div
        className={`absolute transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${
          isMobile
            ? 'rounded-[22px] border-2 border-gray-950 bg-white/5'
            : 'rounded-[22px] border-2 border-audi-cyan bg-audi-cyan/5'
        }`}
        style={highlightStyle}
      >
        {!isMobile && (
          <>
            <div className="absolute -left-1 -top-1 h-4 w-4 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white" />
            <div className="absolute -right-1 -top-1 h-4 w-4 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white" />
            <div className="absolute -bottom-1 -left-1 h-4 w-4 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white" />
            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-br-2xl border-b-[3px] border-r-[3px] border-white" />
          </>
        )}
        <div
          className={`absolute -top-8 left-2 rounded-full px-2.5 py-1 text-[10px] font-black shadow-lg ${
            isMobile ? 'bg-gray-950 text-white' : 'bg-audi-cyan text-black'
          }`}
        >
          {stepIndex + 1}/{steps.length}
        </div>
      </div>

      <div
        key={currentStep.id}
        className={`absolute pointer-events-auto animate-fade-in ${
          isMobile
            ? 'rounded-[22px] border border-gray-200 bg-white p-4 text-gray-950 shadow-[0_14px_42px_rgba(0,0,0,0.18)] dark:border-zinc-800 dark:bg-[#18181B] dark:text-white'
            : 'overflow-hidden rounded-2xl border border-white/15 bg-[#101018]/96 p-4 text-white shadow-[0_18px_54px_rgba(0,0,0,0.56)] backdrop-blur-xl'
        }`}
        style={tooltipStyle}
      >
        {!isMobile && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-audi-pink via-audi-cyan to-audi-yellow" />}
        <div className="relative mb-3 flex items-center justify-between gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
              isMobile
                ? 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300'
                : 'border border-audi-cyan/40 bg-audi-cyan/10 text-audi-cyan'
            }`}
          >
            Bước {stepIndex + 1}/{steps.length}
          </span>
          <button
            onClick={closeTour}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              isMobile
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            Bỏ qua
          </button>
        </div>

        <h3 className={`relative mb-1.5 font-black leading-tight ${isMobile ? 'text-[17px]' : 'text-lg'}`}>{currentStep.title}</h3>
        <p className={`relative mb-4 text-sm leading-relaxed ${isMobile ? 'text-gray-500 dark:text-zinc-300' : 'text-slate-300'}`}>
          {currentStep.description}
        </p>

        <div className="relative mb-4 flex gap-1.5">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                index <= stepIndex
                  ? isMobile ? 'bg-gray-950 dark:bg-white' : 'bg-gradient-to-r from-audi-pink to-audi-cyan'
                  : isMobile ? 'bg-gray-200 dark:bg-zinc-700' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              isMobile
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200'
                : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
            }`}
          >
            Quay lại
          </button>
          <button
            onClick={goNext}
            className={`ml-auto rounded-xl px-4 py-2 text-sm font-black transition-transform active:scale-95 ${
              isMobile
                ? 'bg-gray-950 text-white dark:bg-white dark:text-black'
                : 'bg-audi-cyan text-black shadow-[0_0_22px_rgba(33,212,253,0.28)]'
            }`}
          >
            {stepIndex >= steps.length - 1 ? 'Hoàn tất' : 'Tiếp theo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

