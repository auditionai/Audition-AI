const DEFAULT_LAUNCH_TIMEOUT_MS = 2_500;
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

export const triggerBackgroundQueueWorker = async (
  rawUrl?: string | null,
  timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
) => {
  const baseUrl = resolveBaseUrl(rawUrl);
  if (!baseUrl) {
    throw new Error('Missing site URL for background queue worker launch');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(BACKGROUND_WORKER_PATH, baseUrl).toString(), {
      method: 'POST',
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
