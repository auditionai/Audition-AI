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

const resolveBaseUrl = (rawUrl?: string | null) => {
  // On Netlify, prefer deploy-native URLs so internal background launches do not
  // bounce through custom-domain proxies such as Cloudflare.
  const netlifyInternalOrigin =
    parseOrigin(process.env.DEPLOY_PRIME_URL) ||
    parseOrigin(process.env.DEPLOY_URL);

  if (netlifyInternalOrigin) {
    return netlifyInternalOrigin;
  }

  return (
    parseOrigin(rawUrl) ||
    parseOrigin(process.env.URL) ||
    parseOrigin(process.env.SITE_URL) ||
    ''
  );
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
