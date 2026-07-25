import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import type { SystemAnnouncementConfig } from '../services/economyService';

export type AppEventPopupData = {
  type: 'payment_success' | 'generation_success' | 'generation_failed';
  title: string;
  message: string;
  actionLabel?: string;
};

const announcementStyles = {
  info: {
    label: 'Thông báo hệ thống',
    accent: 'text-cyan-300',
    border: 'border-cyan-300/30',
    surface: 'from-cyan-400/20 via-[#111725] to-violet-500/15',
    glow: 'bg-cyan-400/20',
    icon: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-300 shadow-[0_12px_35px_rgba(34,211,238,0.2)]',
    line: 'from-cyan-300 via-fuchsia-500 to-violet-500',
    button: 'from-cyan-400 via-violet-500 to-fuchsia-500 shadow-[0_14px_35px_rgba(168,85,247,0.28)]',
  },
  promo: {
    label: 'Ưu đãi mới',
    accent: 'text-fuchsia-300',
    border: 'border-fuchsia-300/30',
    surface: 'from-fuchsia-500/20 via-[#17111f] to-amber-400/10',
    glow: 'bg-fuchsia-500/20',
    icon: 'border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-300 shadow-[0_12px_35px_rgba(236,72,153,0.2)]',
    line: 'from-fuchsia-400 via-violet-500 to-amber-300',
    button: 'from-[#ff007f] via-fuchsia-500 to-amber-400 shadow-[0_14px_35px_rgba(255,0,127,0.28)]',
  },
  warning: {
    label: 'Thông báo quan trọng',
    accent: 'text-amber-300',
    border: 'border-amber-300/30',
    surface: 'from-amber-400/16 via-[#18150f] to-rose-500/14',
    glow: 'bg-amber-400/20',
    icon: 'border-amber-300/30 bg-amber-400/10 text-amber-300 shadow-[0_12px_35px_rgba(251,191,36,0.2)]',
    line: 'from-amber-300 via-orange-400 to-rose-500',
    button: 'from-amber-400 via-orange-500 to-rose-500 shadow-[0_14px_35px_rgba(249,115,22,0.28)]',
  },
};

const eventStyles = {
  payment_success: {
    icon: Icons.Gem,
    badge: 'Nạp tiền',
    color: 'text-emerald-300',
    ring: 'bg-emerald-400/15 border-emerald-300/25',
  },
  generation_success: {
    icon: Icons.Image,
    badge: 'Hoàn thành',
    color: 'text-audi-cyan',
    ring: 'bg-audi-cyan/15 border-audi-cyan/25',
  },
  generation_failed: {
    icon: Icons.AlertTriangle,
    badge: 'Thất bại',
    color: 'text-red-300',
    ring: 'bg-red-500/15 border-red-400/25',
  },
};

const NOTIFICATION_SOUND_URL = '/audio/notification-ting.mp3';
let notificationAudio: HTMLAudioElement | null = null;
let soundUnlockListenersAttached = false;

const getNotificationAudio = () => {
  if (typeof window === 'undefined') return null;
  if (!notificationAudio) {
    notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
    notificationAudio.preload = 'auto';
    notificationAudio.volume = 0.55;
  }
  return notificationAudio;
};

const unlockNotificationSound = () => {
  const audio = getNotificationAudio();
  if (!audio) return;

  try {
    const previousVolume = audio.volume;
    audio.volume = 0;
    void audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = previousVolume;
      })
      .catch(() => {
        audio.volume = previousVolume;
      });
  } catch {
    // Ignore audio unlock failures.
  }
};

const ensureNotificationSoundUnlock = () => {
  if (typeof window === 'undefined' || soundUnlockListenersAttached) return;
  soundUnlockListenersAttached = true;

  const unlockOnce = () => {
    unlockNotificationSound();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
    window.removeEventListener('touchstart', unlockOnce);
  };

  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce);
  window.addEventListener('touchstart', unlockOnce, { passive: true });
};

const playNotificationSound = () => {
  const audio = getNotificationAudio();
  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.55;
    void audio.play().catch(() => {
      // Browser autoplay policies may block sound before the first user gesture.
      ensureNotificationSoundUnlock();
    });
  } catch {
    // Sound is cosmetic; popup behavior must not depend on audio support.
  }
};

export function SystemAnnouncementModal({
  config,
  mode,
  onClose,
}: {
  config: SystemAnnouncementConfig | null;
  mode: 'desktop' | 'mobile';
  onClose: () => void;
}) {
  useEffect(() => {
    ensureNotificationSoundUnlock();
    if (config?.isActive) {
      window.setTimeout(playNotificationSound, 0);
    }
  }, [config?.isActive, config?.title, config?.message, config?.updatedAt]);

  useEffect(() => {
    if (!config?.isActive) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config?.isActive, onClose]);

  if (!config?.isActive) return null;

  const variant = config.variant || 'info';
  const style = announcementStyles[variant];
  const isMobile = mode === 'mobile';
  const AnnouncementIcon = variant === 'warning' ? Icons.AlertTriangle : variant === 'promo' ? Icons.Gift : Icons.Bell;

  const modal = (
    <div
      className={`fixed inset-0 z-[10020] flex items-center justify-center overflow-y-auto bg-[#020309]/80 backdrop-blur-xl ${
        isMobile ? 'p-4' : 'p-6'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-announcement-title"
      aria-describedby="system-announcement-message"
    >
      <div
        className={`relative w-full animate-fade-in ${
          isMobile ? 'max-w-[370px]' : 'max-w-[620px]'
        }`}
      >
        <div className={`absolute inset-x-5 -bottom-3 top-7 rounded-[32px] ${style.glow} opacity-40 blur-2xl`} />
        <div className="absolute inset-x-3 top-3 -bottom-2 rounded-[32px] border border-white/[0.06] bg-[#05070d] shadow-[0_34px_100px_rgba(0,0,0,0.8)]" />

        <div className={`relative flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-[30px] border ${style.border} bg-[#0c101a] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.7)] sm:max-h-[calc(100dvh-48px)]`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${style.surface} opacity-80`} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.line}`} />
          <div className={`absolute -right-16 -top-20 h-56 w-56 rounded-full ${style.glow} blur-[70px]`} />
          <div className="absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-violet-500/15 blur-[80px]" />

          <header className={`relative flex shrink-0 items-start gap-4 border-b border-white/[0.08] ${isMobile ? 'p-5 pr-16' : 'p-7 pr-20'}`}>
            <div className={`relative flex shrink-0 items-center justify-center rounded-2xl border ${style.icon} ${
              isMobile ? 'h-12 w-12' : 'h-14 w-14'
            }`}>
              <div className="absolute inset-[5px] rounded-xl border border-white/10 bg-black/20" />
              <AnnouncementIcon className={`relative ${isMobile ? 'h-5 w-5' : 'h-6 w-6'}`} />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0c101a] bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
            </div>

            <div className="min-w-0 pt-0.5">
              <div className={`mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] ${style.accent}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${style.glow} shadow-[0_0_10px_currentColor]`} />
                {style.label}
              </div>
              <h2
                id="system-announcement-title"
                className={`font-accent font-black leading-[1.15] tracking-[-0.02em] text-white ${
                  isMobile ? 'text-xl' : 'text-[28px]'
                }`}
              >
                {config.title || 'Thông báo từ AUDITION AI'}
              </h2>
              <p className="mt-2 text-xs font-medium text-slate-400">
                Cập nhật mới nhất từ AUDITION AI
              </p>
            </div>
          </header>

          <button
            onClick={onClose}
            className={`absolute right-4 top-4 z-10 flex items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-slate-400 shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
              isMobile ? 'h-10 w-10' : 'h-11 w-11'
            }`}
            aria-label="Đóng thông báo"
          >
            <Icons.X className="h-4 w-4" />
          </button>

          <div className={`relative min-h-0 overflow-y-auto [scrollbar-color:#22d3ee_#090b12] [scrollbar-width:thin] ${isMobile ? 'p-5' : 'p-7'}`}>
            <div className="relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_35px_rgba(0,0,0,0.18)]">
              <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${style.line}`} />
              <div className={isMobile ? 'p-4 pl-5' : 'p-5 pl-6'}>
                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <Icons.Sparkles className={`h-3.5 w-3.5 ${style.accent}`} />
                  Nội dung thông báo
                </div>
                <p
                  id="system-announcement-message"
                  className={`whitespace-pre-line font-medium text-slate-200 ${
                    isMobile ? 'text-sm leading-6' : 'text-[15px] leading-7'
                  }`}
                >
                  {config.message}
                </p>
              </div>
            </div>

            <div className={`flex gap-3 ${isMobile ? 'mt-4 flex-col' : 'mt-5 items-center justify-between'}`}>
              <div className="flex items-center gap-2.5 text-[11px] leading-relaxed text-slate-400">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <Icons.Clock className={`h-3.5 w-3.5 ${style.accent}`} />
                </div>
                <span>Thông báo sẽ được ẩn trong 12 giờ sau khi xác nhận.</span>
              </div>
              <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${style.border} ${style.accent}`}>
                <Icons.Shield className="h-3.5 w-3.5" />
                Chính thức
              </div>
            </div>

            <button
              onClick={onClose}
              className={`group relative mt-5 flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r ${style.button} px-5 font-black text-white transition duration-300 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:translate-y-0 ${
                isMobile ? 'py-3.5 text-sm' : 'py-4 text-base'
              }`}
            >
              <span className="absolute inset-x-8 top-0 h-px bg-white/70" />
              <span className="absolute inset-0 translate-x-[-130%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[130%]" />
              <span className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-black/20">
                <Icons.Check className="h-4 w-4" />
              </span>
              <span className="relative">Tôi đã hiểu</span>
              <Icons.ChevronRight className="relative h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}

export function AppEventPopup({
  data,
  mode,
  onClose,
  onAction,
}: {
  data: AppEventPopupData | null;
  mode: 'desktop' | 'mobile';
  onClose: () => void;
  onAction?: () => void;
}) {
  useEffect(() => {
    ensureNotificationSoundUnlock();
    if (data) {
      window.setTimeout(playNotificationSound, 0);
    }
  }, [data]);

  if (!data) return null;

  const style = eventStyles[data.type];
  const Icon = style.icon;
  const isMobile = mode === 'mobile';

  const popup = (
    <div className={`fixed z-[10010] ${isMobile ? 'inset-x-4 bottom-24' : 'right-6 top-24 w-[380px]'}`}>
      <div className="relative overflow-hidden rounded-[26px] border border-white/12 bg-[#10111a]/95 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl animate-slide-in-right">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-audi-pink via-audi-purple to-audi-cyan" />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1 text-white/45 hover:bg-white/10 hover:text-white"
          aria-label="Đóng thông báo"
        >
          <Icons.X className="h-4 w-4" />
        </button>

        <div className="flex gap-3 pr-6">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${style.ring}`}>
            <Icon className={`h-6 w-6 ${style.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`mb-1 text-[10px] font-black uppercase tracking-[0.16em] ${style.color}`}>
              {style.badge}
            </div>
            <h3 className="text-base font-black leading-snug text-white">{data.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{data.message}</p>
            {data.actionLabel && (
              <button
                onClick={onAction}
                className="mt-3 rounded-xl border border-audi-cyan/35 bg-audi-cyan/12 px-4 py-2 text-xs font-black uppercase tracking-wide text-audi-cyan hover:bg-audi-cyan hover:text-black"
              >
                {data.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(popup, document.body) : popup;
}
