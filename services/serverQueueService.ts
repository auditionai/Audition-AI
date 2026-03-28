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
const QUEUE_TICK_NOOP_RESULT = {
  success: true,
  accepted: false,
  background: false,
  reason: 'dedicated_worker_mode',
} as const;

let queueTickDisabledLogged = false;

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

  return payload;
};

export const triggerServerQueueTick = async (_force = false) => {
  if (!queueTickDisabledLogged) {
    queueTickDisabledLogged = true;
    console.info('[Queue] queue-tick is disabled. Render dedicated worker owns queue processing.');
  }

  return QUEUE_TICK_NOOP_RESULT;
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
