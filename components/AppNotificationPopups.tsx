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

const variantStyles = {
  info: 'from-audi-cyan/25 via-[#101827] to-audi-purple/20 border-audi-cyan/30',
  promo: 'from-audi-pink/25 via-[#17111f] to-audi-yellow/15 border-audi-pink/30',
  warning: 'from-yellow-400/20 via-[#17170e] to-red-500/15 border-yellow-400/30',
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

  if (!config?.isActive) return null;

  const style = variantStyles[config.variant || 'info'];
  const isMobile = mode === 'mobile';

  const modal = (
    <div className={`fixed inset-0 z-[10020] flex bg-black/70 backdrop-blur-md ${isMobile ? 'items-center justify-center p-5' : 'items-start justify-center px-6 pt-[112px] pb-6'}`}>
      <div
        className={`relative w-full overflow-hidden border bg-gradient-to-br ${style} shadow-[0_24px_80px_rgba(0,0,0,0.55)] animate-fade-in ${
          isMobile ? 'max-w-[340px] rounded-[30px] p-5' : 'max-w-[460px] rounded-[28px] p-6'
        }`}
      >
        <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-audi-pink/20 blur-3xl" />
        <div className="absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-audi-cyan/20 blur-3xl" />

        <button
          onClick={onClose}
          className={`absolute right-4 top-4 flex items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/70 hover:text-white ${
            isMobile ? 'h-9 w-9' : 'h-10 w-10'
          }`}
          aria-label="Đóng thông báo"
        >
          <Icons.X className="h-4 w-4" />
        </button>

        <div className="relative">
          <div className={`mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-audi-cyan`}>
            <Icons.Bell className="h-3.5 w-3.5" />
            Thông báo
          </div>
          <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black leading-tight text-white`}>
            {config.title || 'Thông báo từ AUDITION AI'}
          </h2>
          <p className={`${isMobile ? 'mt-3 text-sm' : 'mt-4 text-[15px]'} whitespace-pre-line leading-relaxed text-slate-200`}>
            {config.message}
          </p>
          <button
            onClick={onClose}
            className={`mt-6 w-full rounded-2xl bg-gradient-to-r from-audi-pink to-audi-purple font-black text-white shadow-[0_12px_30px_rgba(236,0,140,0.25)] transition hover:brightness-110 ${
              isMobile ? 'py-3 text-sm' : 'py-3.5 text-base'
            }`}
          >
            Tôi đã hiểu
          </button>
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
