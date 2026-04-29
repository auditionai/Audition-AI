import { GoogleAuth } from 'google-auth-library';
import { getServiceRoleClient } from './_supabase';

type VertexCredentialRow = {
  id: string;
  name: string | null;
  key_value: string | null;
  last_used_at?: string | null;
};

type VertexSession = {
  credentialId: string;
  credentialName: string | null;
  credentials: Record<string, any>;
  projectId: string;
  accessToken: string;
};

type ReserveVertexCredentialOptions = {
  excludedIds?: string[];
  normalCooldownMs?: number;
  recentReuseBlockMs?: number;
  usageWindowMs?: number;
  allowCoolingFallback?: boolean;
};

type RunWithVertexCredentialFailoverOptions<T> = {
  taskName: string;
  normalCooldownMs?: number;
  failureCooldownMs?: number;
  operation: (session: VertexSession) => Promise<T>;
  onAttemptFailure?: (info: {
    credentialId: string;
    credentialName: string | null;
    projectId?: string;
    error: Error;
    retryable: boolean;
  }) => Promise<void> | void;
};

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export const VERTEX_KEY_NORMAL_COOLDOWN_MS = 2 * 60_000;
export const VERTEX_KEY_FAILURE_COOLDOWN_MS = 10 * 60_000;
export const VERTEX_KEY_QUOTA_COOLDOWN_MS = 20 * 60_000;
export const VERTEX_KEY_RECENT_REUSE_BLOCK_MS = 15_000;
export const VERTEX_KEY_USAGE_WINDOW_MS = 10 * 60_000;

export const isVertexServiceAccountJson = (value: string) =>
  value.includes('project_id') && value.includes('private_key') && value.includes('client_email');

const vertexCredentialRecentUsage = new Map<string, number[]>();

const getTimestampMs = (value?: string | null) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isCoolingDownAfterFailure = (row: VertexCredentialRow, nowMs: number) => getTimestampMs(row.last_used_at) > nowMs;

const pruneVertexCredentialUsage = (credentialId: string, nowMs: number, usageWindowMs: number) => {
  const entries = vertexCredentialRecentUsage.get(credentialId) || [];
  const nextEntries = entries.filter((value) => nowMs - value < usageWindowMs);

  if (nextEntries.length > 0) {
    vertexCredentialRecentUsage.set(credentialId, nextEntries);
  } else {
    vertexCredentialRecentUsage.delete(credentialId);
  }

  return nextEntries;
};

const getVertexCredentialRecentUsageCount = (
  credentialId: string,
  nowMs: number,
  usageWindowMs: number,
) => pruneVertexCredentialUsage(credentialId, nowMs, usageWindowMs).length;

const recordVertexCredentialUsage = (
  credentialId: string,
  usedAtMs: number,
  usageWindowMs: number,
) => {
  const nextEntries = [
    ...pruneVertexCredentialUsage(credentialId, usedAtMs, usageWindowMs),
    usedAtMs,
  ];
  vertexCredentialRecentUsage.set(credentialId, nextEntries);
};

const isRecentlyReserved = (
  row: VertexCredentialRow,
  nowMs: number,
  recentReuseBlockMs: number,
) => {
  const lastUsedMs = getTimestampMs(row.last_used_at);
  if (lastUsedMs > 0 && lastUsedMs <= nowMs && nowMs - lastUsedMs < recentReuseBlockMs) {
    return true;
  }

  const localRecentEntries = vertexCredentialRecentUsage.get(row.id) || [];
  return localRecentEntries.some((value) => nowMs - value < recentReuseBlockMs);
};

const sortVertexCredentials = (
  rows: VertexCredentialRow[],
  nowMs: number,
  normalCooldownMs: number,
  usageWindowMs: number,
) => {
  return [...rows].sort((a, b) => {
    const aLastUsedMs = getTimestampMs(a.last_used_at);
    const bLastUsedMs = getTimestampMs(b.last_used_at);
    const aRecentUsageCount = getVertexCredentialRecentUsageCount(a.id, nowMs, usageWindowMs);
    const bRecentUsageCount = getVertexCredentialRecentUsageCount(b.id, nowMs, usageWindowMs);
    const aIsWarm = aLastUsedMs > 0 && nowMs - aLastUsedMs < normalCooldownMs;
    const bIsWarm = bLastUsedMs > 0 && nowMs - bLastUsedMs < normalCooldownMs;

    if (aRecentUsageCount !== bRecentUsageCount) {
      return aRecentUsageCount - bRecentUsageCount;
    }

    if (aIsWarm !== bIsWarm) {
      return aIsWarm ? 1 : -1;
    }

    if (aLastUsedMs !== bLastUsedMs) {
      return aLastUsedMs - bLastUsedMs;
    }

    return String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
};

const getActiveVertexCredentialRows = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('api_keys')
    .select('id, name, key_value, last_used_at')
    .eq('status', 'active');

  if (error) {
    throw error;
  }

  return ((data || []) as VertexCredentialRow[]).filter((row) =>
    typeof row.key_value === 'string' && isVertexServiceAccountJson(row.key_value),
  );
};

const getVertexCredentialProjectId = (row: VertexCredentialRow) => {
  try {
    const parsed = JSON.parse(row.key_value || '{}');
    return typeof parsed?.project_id === 'string' ? parsed.project_id : undefined;
  } catch {
    return undefined;
  }
};

const claimVertexCredential = async (row: VertexCredentialRow, claimedAtIso: string) => {
  const admin = getServiceRoleClient();
  let query = admin
    .from('api_keys')
    .update({ last_used_at: claimedAtIso })
    .eq('id', row.id)
    .eq('status', 'active');

  if (row.last_used_at) {
    query = query.eq('last_used_at', row.last_used_at);
  } else {
    query = query.is('last_used_at', null);
  }

  const { data, error } = await query.select('id').maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
};

const reserveVertexCredential = async ({
  excludedIds = [],
  normalCooldownMs = VERTEX_KEY_NORMAL_COOLDOWN_MS,
  recentReuseBlockMs = VERTEX_KEY_RECENT_REUSE_BLOCK_MS,
  usageWindowMs = VERTEX_KEY_USAGE_WINDOW_MS,
  allowCoolingFallback = true,
}: ReserveVertexCredentialOptions = {}): Promise<VertexCredentialRow | null> => {
  const nowMs = Date.now();
  const claimedAtIso = new Date(nowMs).toISOString();
  const rows = await getActiveVertexCredentialRows();

  const eligibleRows = rows.filter((row) => !excludedIds.includes(row.id));
  const nonCoolingRows = eligibleRows.filter((row) => !isCoolingDownAfterFailure(row, nowMs));
  const preferredRows = nonCoolingRows.filter((row) => !isRecentlyReserved(row, nowMs, recentReuseBlockMs));

  const sortedRows = sortVertexCredentials(preferredRows, nowMs, normalCooldownMs, usageWindowMs);

  for (const row of sortedRows) {
    const claimed = await claimVertexCredential(row, claimedAtIso);
    if (claimed) {
      recordVertexCredentialUsage(row.id, nowMs, usageWindowMs);
      return {
        ...row,
        last_used_at: claimedAtIso,
      };
    }
  }

  if (allowCoolingFallback && nonCoolingRows.length > 0) {
    const fallbackRows = sortVertexCredentials(nonCoolingRows, nowMs, normalCooldownMs, usageWindowMs);

    for (const row of fallbackRows) {
      const claimed = await claimVertexCredential(row, claimedAtIso);
      if (claimed) {
        recordVertexCredentialUsage(row.id, nowMs, usageWindowMs);
        console.warn(
          `[vertex-credentials] Reusing recently active credential ${row.name || row.id} because all colder credentials are busy.`,
        );

        return {
          ...row,
          last_used_at: claimedAtIso,
        };
      }
    }
  }

  if (allowCoolingFallback && eligibleRows.length > 0) {
    const coolingFallbackRows = sortVertexCredentials(eligibleRows, nowMs, normalCooldownMs, usageWindowMs);

    for (const row of coolingFallbackRows) {
      const claimed = await claimVertexCredential(row, claimedAtIso);
      if (claimed) {
        recordVertexCredentialUsage(row.id, nowMs, usageWindowMs);
        console.warn(
          `[vertex-credentials] Reusing cooling credential ${row.name || row.id} because the pool is temporarily exhausted.`,
        );

        return {
          ...row,
          last_used_at: claimedAtIso,
        };
      }
    }
  }

  return null;
};

export const markVertexCredentialCooldown = async (credentialId: string, cooldownMs: number) => {
  const admin = getServiceRoleClient();
  const cooldownUntilIso = new Date(Date.now() + cooldownMs).toISOString();
  const { error } = await admin
    .from('api_keys')
    .update({ last_used_at: cooldownUntilIso })
    .eq('id', credentialId)
    .eq('status', 'active');

  if (error) {
    throw error;
  }
};

const toError = (error: unknown) => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};

export const isVertexCredentialRetryableError = (error: unknown) => {
  const message = toError(error).message.toLowerCase();

  return (
    message.includes('429') ||
    message.includes('403') ||
    message.includes('401') ||
    message.includes('resource has been exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('permission denied') ||
    message.includes('invalid_grant') ||
    message.includes('failed to initialize vertex ai credentials') ||
    message.includes('deadline exceeded') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('overloaded') ||
    message.includes('unavailable') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('500') ||
    message.includes('fetch failed') ||
    message.includes('networkerror')
  );
};

export const isVertexQuotaOrRateLimitError = (error: unknown) => {
  const message = toError(error).message.toLowerCase();

  return (
    message.includes('429') ||
    message.includes('resource has been exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit')
  );
};

const buildVertexSession = async (row: VertexCredentialRow): Promise<VertexSession> => {
  const credentials = JSON.parse(row.key_value || '{}');
  const projectId = typeof credentials.project_id === 'string' ? credentials.project_id : '';

  const auth = new GoogleAuth({
    credentials,
    scopes: [VERTEX_SCOPE],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = accessToken.token;

  if (!projectId || !token) {
    throw new Error('Failed to initialize Vertex AI credentials.');
  }

  return {
    credentialId: row.id,
    credentialName: row.name,
    credentials,
    projectId,
    accessToken: token,
  };
};

export const runWithVertexCredentialFailover = async <T>({
  taskName,
  normalCooldownMs = VERTEX_KEY_NORMAL_COOLDOWN_MS,
  failureCooldownMs = VERTEX_KEY_FAILURE_COOLDOWN_MS,
  operation,
  onAttemptFailure,
}: RunWithVertexCredentialFailoverOptions<T>): Promise<T> => {
  const attemptedCredentialIds = new Set<string>();
  let lastRetryableError: Error | null = null;

  while (true) {
    const row = await reserveVertexCredential({
      excludedIds: [...attemptedCredentialIds],
      normalCooldownMs,
    });

    if (!row) {
      break;
    }

    attemptedCredentialIds.add(row.id);

    try {
      const session = await buildVertexSession(row);
      return await operation(session);
    } catch (error) {
      const normalizedError = toError(error);
      const retryable = isVertexCredentialRetryableError(normalizedError);

      if (onAttemptFailure) {
        try {
          await onAttemptFailure({
            credentialId: row.id,
            credentialName: row.name,
            projectId: getVertexCredentialProjectId(row),
            error: normalizedError,
            retryable,
          });
        } catch (callbackError) {
          console.warn('[vertex-credentials] onAttemptFailure callback errored:', callbackError);
        }
      }

      if (!retryable) {
        throw normalizedError;
      }

      lastRetryableError = normalizedError;

      try {
        await markVertexCredentialCooldown(
          row.id,
          isVertexQuotaOrRateLimitError(normalizedError)
            ? VERTEX_KEY_QUOTA_COOLDOWN_MS
            : failureCooldownMs,
        );
      } catch (cooldownError) {
        console.warn('[vertex-credentials] Failed to apply cooldown:', cooldownError);
      }

      console.warn(
        `[vertex-credentials] ${taskName} failed on ${row.name || row.id}. Trying next credential.`,
        normalizedError.message,
      );
    }
  }

  if (lastRetryableError) {
    throw new Error(`All Vertex AI credentials failed for ${taskName}. Last error: ${lastRetryableError.message}`);
  }

  throw new Error(`No available Vertex AI credentials for ${taskName}.`);
};
