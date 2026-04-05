import { isDedicatedQueueWorkerMode } from './_queue-runtime-mode';

const DEFAULT_LAUNCH_TIMEOUT_MS = 10_000;
const BACKGROUND_WORKER_PATH = '/.netlify/functions/queue-worker-background';

const resolveBaseUrl = (rawUrl?: string | null) => {
  if (rawUrl) {
    try {
      return new URL(rawUrl).origin;
    } catch {
      // Ignore invalid URL and fall through to envs.
    }
  }

  return process.env.URL || process.env.DEPLOY_URL || process.env.SITE_URL || '';
};

export const triggerBackgroundFunction = async (
  path: string,
  rawUrl?: string | null,
  timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => {
  const baseUrl = resolveBaseUrl(rawUrl);
  if (!baseUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(path, baseUrl).toString(), {
      method: init?.method || 'POST',
      headers: init?.headers,
      body: init?.body,
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 202) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Background worker launch failed with ${response.status}`);
    }

    return true;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const triggerBackgroundQueueWorker = async (
  rawUrl?: string | null,
  timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
) => {
  if (isDedicatedQueueWorkerMode()) {
    return false;
  }

  return triggerBackgroundFunction(BACKGROUND_WORKER_PATH, rawUrl, timeoutMs);
};
