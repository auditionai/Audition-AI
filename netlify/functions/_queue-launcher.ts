import { isDedicatedQueueWorkerMode } from './_queue-runtime-mode';

const DEFAULT_LAUNCH_TIMEOUT_MS = 10_000;
const BACKGROUND_WORKER_PATH = '/.netlify/functions/queue-worker-background';

const parseOrigin = (value?: string | null) => {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
};

const isNetlifyOrigin = (origin?: string | null) => {
  try {
    const hostname = new URL(String(origin || '')).hostname.toLowerCase();
    return hostname.endsWith('.netlify.app');
  } catch {
    return false;
  }
};

const getSiteNameOrigin = () => {
  const siteName = String(process.env.SITE_NAME || '').trim();
  return siteName ? `https://${siteName}.netlify.app` : '';
};

const resolveBaseUrls = (rawUrl?: string | null) => {
  const rawOrigin = parseOrigin(rawUrl);
  const candidates = [
    isNetlifyOrigin(rawOrigin) ? rawOrigin : '',
    getSiteNameOrigin(),
    rawOrigin,
    parseOrigin(process.env.URL),
    parseOrigin(process.env.SITE_URL),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
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
  const baseUrls = resolveBaseUrls(rawUrl);
  if (baseUrls.length === 0) {
    return false;
  }

  const startedAt = Date.now();
  let lastError: Error | null = null;

  for (const baseUrl of baseUrls) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      break;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remainingMs);

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
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || 'Background worker launch failed'));
      console.warn('[queue-launcher] background launch attempt failed:', {
        baseUrl,
        path,
        error: lastError.message,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
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
