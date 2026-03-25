import { getSupabaseAuthHeader } from './supabaseClient';
import type { QueueRecipePayload } from '../shared/queueRecipes';

export type QueueAssetType = 'image' | 'video';
export type QueueKind = 'image_generate' | 'video_generate' | 'motion_generate';

export interface QueueEnqueueRequest {
  id: string;
  prompt: string;
  toolId: string;
  toolName: string;
  engine: string;
  assetType: QueueAssetType;
  costVcoin: number;
  queueKind: QueueKind;
  queuePayload: Record<string, unknown> | QueueRecipePayload;
}

export const QUEUE_SUBMITTED_EVENT = 'audition:queue-submitted';

const getAuthHeader = async () => {
  return getSupabaseAuthHeader();
};

const notifyQueueSubmitted = (payload: any) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(QUEUE_SUBMITTED_EVENT, {
      detail: payload,
    }),
  );
};

const scheduleQueueTickRetry = (delayMs: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.setTimeout(() => {
    triggerServerQueueTick(true).catch((error) => {
      console.warn('[Queue] Retry tick failed:', error);
    });
  }, delayMs);
};

export const enqueueServerJob = async (request: QueueEnqueueRequest) => {
  const authHeader = await getAuthHeader();

  const response = await fetch('/api/queue-submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(request),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to enqueue job');
  }

  notifyQueueSubmitted({
    request,
    response: payload,
  });
  triggerServerQueueTick(true).catch((error) => {
    console.warn('[Queue] Immediate tick failed:', error);
  });
  scheduleQueueTickRetry(4_000);

  return payload;
};

let lastTickAt = 0;
let queueTickDisabledLogged = false;
let queueTickUnavailableUntil = 0;

export const triggerServerQueueTick = async (force = false) => {
  const now = Date.now();
  if (!force && queueTickUnavailableUntil > now) {
    return null;
  }
  if (!force && now - lastTickAt < 3000) {
    return null;
  }

  lastTickAt = now;
  let response: Response;
  let payload: any = {};
  let errorMessage = 'Failed to trigger queue worker';

  try {
    response = await fetch('/api/queue-tick', {
      method: 'POST',
    });
    payload = await response.json().catch(() => ({}));
    errorMessage = payload?.error || errorMessage;
  } catch (error: any) {
    queueTickUnavailableUntil = Date.now() + 60_000;
    if (!queueTickDisabledLogged) {
      queueTickDisabledLogged = true;
      console.warn('[Queue] Server worker unavailable:', error?.message || error);
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  if (payload?.disabled) {
    queueTickUnavailableUntil = Date.now() + 60_000;
    if (!queueTickDisabledLogged) {
      queueTickDisabledLogged = true;
      console.warn('[Queue] Server worker disabled:', errorMessage);
    }
    return payload;
  }

  if (payload?.timedOut) {
    queueTickDisabledLogged = false;
    queueTickUnavailableUntil = 0;
    return payload;
  }

  queueTickDisabledLogged = false;
  queueTickUnavailableUntil = 0;
  return payload;
};

export const syncPayOSTransaction = async (orderCode: string | number) => {
  const response = await fetch(`/api/payos-sync-transaction?orderCode=${encodeURIComponent(String(orderCode))}`, {
    method: 'GET',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to sync PayOS transaction');
  }

  return payload;
};
