import { getSupabaseAuthHeader } from './supabaseClient';
import { trackEvent } from './analyticsService';
import type { QueueRecipePayload } from '../shared/queueRecipes';
import type { QueueClientPlatform } from '../types';
import { resolveAppShell } from '../shared/shellDetection';

export type QueueAssetType = 'image' | 'video';
export type QueueKind = 'image_generate' | 'video_generate' | 'motion_generate';

const detectQueueClientPlatform = (): QueueClientPlatform => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unknown';
  }

  return resolveAppShell();
};

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
  clientPlatform?: QueueClientPlatform;
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

const waitForQueueRetry = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export const enqueueServerJob = async (request: QueueEnqueueRequest) => {
  const authHeader = await getAuthHeader();
  const clientPlatform = request.clientPlatform || detectQueueClientPlatform();
  const analyticsBase = {
    client_platform: clientPlatform,
    asset_type: request.assetType,
    queue_kind: request.queueKind,
    tool_id: request.toolId,
    engine: request.engine,
    cost_vcoin: request.costVcoin,
  };

  trackEvent('generation_job_enqueue_start', analyticsBase);

  try {
    const submit = () => fetch('/api/queue-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-platform': clientPlatform,
          ...authHeader,
        },
        body: JSON.stringify({
          ...request,
          clientPlatform,
        }),
      });

    let response: Response;
    try {
      response = await submit();
    } catch {
      await waitForQueueRetry(300);
      response = await submit();
    }

    if (response.status >= 500) {
      await waitForQueueRetry(300);
      response = await submit();
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to enqueue job');
    }

    notifyQueueSubmitted({
      request,
      response: payload,
    });
    trackEvent('generation_job_enqueue_success', analyticsBase);

    return payload;
  } catch (error) {
    trackEvent('generation_job_enqueue_error', {
      ...analyticsBase,
      error_message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    throw error;
  }
};

export const triggerServerQueueTick = async (_force = false) => {
  const response = await fetch('/api/queue-tick', {
    method: 'POST',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to trigger queue worker');
  }

  return payload;
};

export const syncPaymentTransaction = async (orderCode: string | number, gateway?: string | null) => {
  const params = new URLSearchParams({ orderCode: String(orderCode) });
  if (gateway) {
    params.set('gateway', gateway);
  }

  const authHeader = await getSupabaseAuthHeader();
  const response = await fetch(`/api/sepay-sync-transaction?${params.toString()}`, {
    method: 'GET',
    headers: authHeader,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to sync payment transaction');
  }

  return payload;
};
