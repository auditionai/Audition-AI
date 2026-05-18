import { getSupabaseAuthHeader } from './supabaseClient';
import { trackEvent } from './analyticsService';
import type { QueueRecipePayload } from '../shared/queueRecipes';
import type { QueueClientPlatform } from '../types';

export type QueueAssetType = 'image' | 'video';
export type QueueKind = 'image_generate' | 'video_generate' | 'motion_generate';

const SHELL_OVERRIDE_STORAGE_KEY = 'auditionai:shell-override';
const PHONE_USER_AGENT_PATTERN = /iphone|ipod|android.+mobile|windows phone|blackberry|opera mini|mobile safari/i;

const detectQueueClientPlatform = (): QueueClientPlatform => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unknown';
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('desktop') === '1') return 'desktop';
  if (params.get('mobile') === '1') return 'mobile';

  const savedOverride = window.localStorage.getItem(SHELL_OVERRIDE_STORAGE_KEY);
  if (savedOverride === 'mobile' || savedOverride === 'desktop') {
    return savedOverride;
  }

  const navigatorWithUAData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof navigatorWithUAData.userAgentData?.mobile === 'boolean') {
    return navigatorWithUAData.userAgentData.mobile ? 'mobile' : 'desktop';
  }

  return PHONE_USER_AGENT_PATTERN.test(navigator.userAgent.toLowerCase()) ? 'mobile' : 'desktop';
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
    const response = await fetch('/api/queue-submit', {
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
  if (!queueTickDisabledLogged) {
    queueTickDisabledLogged = true;
    console.info('[Queue] queue-tick is disabled. Render dedicated worker owns queue processing.');
  }

  return QUEUE_TICK_NOOP_RESULT;
};

export const syncPaymentTransaction = async (orderCode: string | number, gateway?: string | null) => {
  const params = new URLSearchParams({ orderCode: String(orderCode) });
  if (gateway) {
    params.set('gateway', gateway);
  }

  const response = await fetch(`/api/sepay-sync-transaction?${params.toString()}`, {
    method: 'GET',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to sync payment transaction');
  }

  return payload;
};
