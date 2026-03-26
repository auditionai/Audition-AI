import type { QueueProgressLogEntry } from './queueRecipes';

const asPayload = (payload?: Record<string, unknown> | null) =>
  payload && typeof payload === 'object' ? payload : {};

export const getFailedRescueAttemptCount = (payload?: Record<string, unknown> | null) =>
  Math.max(0, Number(asPayload(payload).__failedRescueAttemptCount || 0));

export const getFailedRescueNextAt = (payload?: Record<string, unknown> | null) => {
  const raw = asPayload(payload).__nextFailedRescueAt;
  if (typeof raw !== 'string' || !raw.trim()) {
    return 0;
  }

  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const hasFailedRescuePending = (payload?: Record<string, unknown> | null) =>
  getFailedRescueAttemptCount(payload) > 0 && getFailedRescueNextAt(payload) > 0;

export const clearFailedRescueMeta = (payload?: Record<string, unknown> | null) => {
  const nextPayload = { ...asPayload(payload) } as Record<string, unknown>;
  nextPayload.__failedRescueAttemptCount = 0;
  nextPayload.__nextFailedRescueAt = null;
  return nextPayload;
};

export const getLatestQueueLog = (logs?: QueueProgressLogEntry[] | null) => {
  const entries = logs || [];
  return entries.length > 0 ? entries[entries.length - 1] : null;
};

