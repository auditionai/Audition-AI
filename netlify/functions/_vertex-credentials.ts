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
};

type RunWithVertexCredentialFailoverOptions<T> = {
  taskName: string;
  normalCooldownMs?: number;
  failureCooldownMs?: number;
  operation: (session: VertexSession) => Promise<T>;
};

const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export const VERTEX_KEY_NORMAL_COOLDOWN_MS = 2 * 60_000;
export const VERTEX_KEY_FAILURE_COOLDOWN_MS = 10 * 60_000;

export const isVertexServiceAccountJson = (value: string) =>
  value.includes('project_id') && value.includes('private_key') && value.includes('client_email');

const getTimestampMs = (value?: string | null) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isCoolingDownAfterFailure = (row: VertexCredentialRow, nowMs: number) => getTimestampMs(row.last_used_at) > nowMs;

const sortVertexCredentials = (
  rows: VertexCredentialRow[],
  nowMs: number,
  normalCooldownMs: number,
) => {
  return [...rows].sort((a, b) => {
    const aLastUsedMs = getTimestampMs(a.last_used_at);
    const bLastUsedMs = getTimestampMs(b.last_used_at);
    const aIsWarm = aLastUsedMs > 0 && nowMs - aLastUsedMs < normalCooldownMs;
    const bIsWarm = bLastUsedMs > 0 && nowMs - bLastUsedMs < normalCooldownMs;

    if (aIsWarm !== bIsWarm) {
      return aIsWarm ? 1 : -1;
    }

    return aLastUsedMs - bLastUsedMs;
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
}: ReserveVertexCredentialOptions = {}): Promise<VertexCredentialRow | null> => {
  const nowMs = Date.now();
  const claimedAtIso = new Date(nowMs).toISOString();
  const rows = await getActiveVertexCredentialRows();

  const availableRows = rows.filter(
    (row) => !excludedIds.includes(row.id) && !isCoolingDownAfterFailure(row, nowMs),
  );

  const sortedRows = sortVertexCredentials(availableRows, nowMs, normalCooldownMs);

  for (const row of sortedRows) {
    const claimed = await claimVertexCredential(row, claimedAtIso);
    if (claimed) {
      return {
        ...row,
        last_used_at: claimedAtIso,
      };
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

      if (!isVertexCredentialRetryableError(normalizedError)) {
        throw normalizedError;
      }

      lastRetryableError = normalizedError;

      try {
        await markVertexCredentialCooldown(row.id, failureCooldownMs);
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
