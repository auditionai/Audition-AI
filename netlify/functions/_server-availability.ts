import { getServiceRoleClient } from './_supabase';
import { pickQueueFailureMessage } from '../../shared/queueErrorClassifier';

type AutoDisabledServerCombo = {
  serverId: string;
  speed: string;
  disabledUntil: string;
  hiddenAt?: string;
  reason?: string;
  hitCount?: number;
  windowHours?: number;
};

type ServerAvailabilityConfig = {
  disabledByModel: Record<string, string[]>;
  autoDisabledCombos?: Record<string, AutoDisabledServerCombo[]>;
  manualReopenedCombos?: Record<string, Array<{ serverId: string; speed: string; reopenedAt: string }>>;
  updatedAt?: string;
};

type QueueProgressLogEntry = {
  at: string;
  stage: string;
  level: string;
  message: string;
};

const CACHE_TTL_MS = 30_000;
const AUTO_DISABLE_LOOKBACK_HOURS = 5;
const AUTO_DISABLE_DURATION_HOURS = 5;
const AUTO_DISABLE_MIN_FAILURES = 6;

let configCache: ServerAvailabilityConfig | null = null;
let configPromise: Promise<ServerAvailabilityConfig> | null = null;
let configFetchedAt = 0;

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();
const isFresh = (timestamp: number) => timestamp > 0 && Date.now() - timestamp < CACHE_TTL_MS;

const getQueueLogs = (payload?: Record<string, unknown> | null): QueueProgressLogEntry[] => {
  const rawLogs = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__logs : null;
  if (!Array.isArray(rawLogs)) {
    return [];
  }

  return rawLogs.filter(
    (entry): entry is QueueProgressLogEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as QueueProgressLogEntry).message === 'string' &&
      typeof (entry as QueueProgressLogEntry).stage === 'string',
  );
};

const toPayloadObject = (payload?: Record<string, unknown> | null): Record<string, unknown> =>
  payload && typeof payload === 'object' ? payload : {};

const extractRuntimeIdentity = (payload?: Record<string, unknown> | null) => {
  const normalizedPayload = toPayloadObject(payload);
  const recipePayload = toPayloadObject(normalizedPayload.__recipePayload as Record<string, unknown> | null);
  const source = Object.keys(recipePayload).length > 0 ? recipePayload : normalizedPayload;

  const modelId = normalize(String(source.modelId || normalizedPayload.model || ''));
  const speed = normalize(String(source.speed || normalizedPayload.speed || ''));
  const serverId = normalize(String(source.serverId || normalizedPayload.server_id || ''));

  return { modelId, speed, serverId };
};

const isTimeoutOverloadFailureMessage = (message?: string | null) => {
  const lower = normalize(message);
  return (
    lower.includes('server tạo ảnh đang quá tải') ||
    lower.includes('server tao anh dang qua tai') ||
    lower.includes('anh da qua thoi gian cho') ||
    lower.includes('ảnh đã quá thời gian chờ')
  );
};

const normalizeConfig = (config: any, now = Date.now()): ServerAvailabilityConfig => ({
  disabledByModel: Object.fromEntries(
    Object.entries(config?.disabledByModel || {}).map(([modelId, servers]) => [
      normalize(modelId),
      Array.from(
        new Set(
          (Array.isArray(servers) ? servers : [])
            .map((serverId) => normalize(String(serverId)))
            .filter(Boolean),
        ),
      ),
    ]),
  ),
  autoDisabledCombos: Object.fromEntries(
    Object.entries(config?.autoDisabledCombos || {}).map(([modelId, combos]) => [
      normalize(modelId),
      (Array.isArray(combos) ? combos : [])
        .map((entry) => ({
          serverId: normalize(entry?.serverId),
          speed: normalize(entry?.speed),
          disabledUntil: typeof entry?.disabledUntil === 'string' ? entry.disabledUntil : '',
          hiddenAt: typeof entry?.hiddenAt === 'string' ? entry.hiddenAt : undefined,
          reason: typeof entry?.reason === 'string' ? entry.reason : undefined,
          hitCount: Number(entry?.hitCount || 0) || undefined,
          windowHours: Number(entry?.windowHours || 0) || undefined,
        }))
        .filter((entry) => {
          if (!entry.serverId || !entry.speed || !entry.disabledUntil) return false;
          const disabledUntilMs = new Date(entry.disabledUntil).getTime();
          return Number.isFinite(disabledUntilMs) && disabledUntilMs > now;
        }),
    ]),
  ),
  manualReopenedCombos: Object.fromEntries(
    Object.entries(config?.manualReopenedCombos || {}).map(([modelId, combos]) => [
      normalize(modelId),
      (Array.isArray(combos) ? combos : [])
        .map((entry) => ({
          serverId: normalize(entry?.serverId),
          speed: normalize(entry?.speed),
          reopenedAt: typeof entry?.reopenedAt === 'string' ? entry.reopenedAt : '',
        }))
        .filter((entry) => entry.serverId && entry.speed && entry.reopenedAt),
    ]),
  ),
  updatedAt: typeof config?.updatedAt === 'string' ? config.updatedAt : undefined,
});

const saveServerAvailabilityConfig = async (config: ServerAvailabilityConfig) => {
  const admin = getServiceRoleClient();
  const payload = {
    disabledByModel: config.disabledByModel || {},
    autoDisabledCombos: config.autoDisabledCombos || {},
    manualReopenedCombos: config.manualReopenedCombos || {},
    updatedAt: new Date().toISOString(),
  };

  const { error } = await admin
    .from('system_settings')
    .upsert({ key: 'tst_server_availability', value: payload }, { onConflict: 'key' });

  if (error) {
    throw error;
  }

  configCache = normalizeConfig(payload);
  configFetchedAt = Date.now();
};

export const getServerAvailabilityConfig = async (forceRefresh = false): Promise<ServerAvailabilityConfig> => {
  if (forceRefresh) {
    configCache = null;
    configPromise = null;
    configFetchedAt = 0;
  }

  if (configCache && isFresh(configFetchedAt)) {
    return configCache;
  }

  if (!configPromise) {
    configPromise = (async () => {
      const admin = getServiceRoleClient();
      const { data, error } = await admin
        .from('system_settings')
        .select('value')
        .eq('key', 'tst_server_availability')
        .maybeSingle();

      if (error) {
        throw error;
      }

      configCache = normalizeConfig(data?.value || { disabledByModel: {}, autoDisabledCombos: {}, manualReopenedCombos: {} });
      configFetchedAt = Date.now();
      return configCache;
    })().finally(() => {
      configPromise = null;
    });
  }

  return configPromise;
};

export const isServerAllowedBySnapshot = (
  config: ServerAvailabilityConfig,
  modelId: string,
  serverId?: string | null,
  speed?: string | null,
) => {
  const normalizedModelId = normalize(modelId);
  const normalizedServerId = normalize(serverId);
  if (!normalizedServerId) return true;

  if ((config.disabledByModel?.[normalizedModelId] || []).includes(normalizedServerId)) {
    return false;
  }

  const normalizedSpeed = normalize(speed);
  if (!normalizedSpeed) {
    return true;
  }

  const combos = config.autoDisabledCombos?.[normalizedModelId] || [];
  return !combos.some((entry) => entry.serverId === normalizedServerId && entry.speed === normalizedSpeed);
};

export const isServerAllowedByConfig = async (
  modelId: string,
  serverId?: string | null,
  speed?: string | null,
) => {
  const config = await getServerAvailabilityConfig();
  return isServerAllowedBySnapshot(config, modelId, serverId, speed);
};

export const refreshAutoDisabledServerAvailability = async () => {
  const admin = getServiceRoleClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const lookbackIso = new Date(now - AUTO_DISABLE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const disableUntilIso = new Date(now + AUTO_DISABLE_DURATION_HOURS * 60 * 60 * 1000).toISOString();

  const existingConfig = normalizeConfig(await getServerAvailabilityConfig(true), now);
  const nextConfig: ServerAvailabilityConfig = {
    disabledByModel: existingConfig.disabledByModel || {},
    autoDisabledCombos: { ...(existingConfig.autoDisabledCombos || {}) },
    manualReopenedCombos: { ...(existingConfig.manualReopenedCombos || {}) },
    updatedAt: existingConfig.updatedAt,
  };

  const { data, error } = await admin
    .from('generated_images')
    .select('id, queue_kind, status, error_message, updated_at, queue_payload')
    .eq('status', 'failed')
    .eq('queue_kind', 'image_generate')
    .gte('updated_at', lookbackIso)
    .limit(1000);

  if (error) {
    throw error;
  }

  const grouped = new Map<string, { modelId: string; serverId: string; speed: string; count: number }>();

  for (const row of (data || []) as any[]) {
    const queuePayload = toPayloadObject(row?.queue_payload);
    const failureMessage = pickQueueFailureMessage(row?.error_message || '', getQueueLogs(queuePayload));
    if (!isTimeoutOverloadFailureMessage(failureMessage)) {
      continue;
    }

    const { modelId, speed, serverId } = extractRuntimeIdentity(queuePayload);
    if (!modelId || !speed || !serverId) {
      continue;
    }

    const reopenedAt = (nextConfig.manualReopenedCombos?.[modelId] || []).find(
      (entry) => entry.serverId === serverId && entry.speed === speed,
    )?.reopenedAt;
    const rowUpdatedAtMs = new Date(String(row?.updated_at || '')).getTime();
    const reopenedAtMs = new Date(String(reopenedAt || '')).getTime();
    if (reopenedAt && Number.isFinite(reopenedAtMs) && Number.isFinite(rowUpdatedAtMs) && rowUpdatedAtMs <= reopenedAtMs) {
      continue;
    }

    const key = `${modelId}::${speed}::${serverId}`;
    const current = grouped.get(key) || { modelId, speed, serverId, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  }

  let triggered = 0;
  for (const item of grouped.values()) {
    if (item.count < AUTO_DISABLE_MIN_FAILURES) {
      continue;
    }

    const existingCombos = nextConfig.autoDisabledCombos?.[item.modelId] || [];
    const retainedCombos = existingCombos.filter(
      (entry) => !(entry.serverId === item.serverId && entry.speed === item.speed),
    );

    retainedCombos.push({
      serverId: item.serverId,
      speed: item.speed,
      disabledUntil: disableUntilIso,
      hiddenAt: nowIso,
      reason: 'image_timeout_cluster',
      hitCount: item.count,
      windowHours: AUTO_DISABLE_LOOKBACK_HOURS,
    });

    nextConfig.autoDisabledCombos = {
      ...(nextConfig.autoDisabledCombos || {}),
      [item.modelId]: retainedCombos,
    };
    nextConfig.manualReopenedCombos = {
      ...(nextConfig.manualReopenedCombos || {}),
      [item.modelId]: (nextConfig.manualReopenedCombos?.[item.modelId] || []).filter(
        (entry) => !(entry.serverId === item.serverId && entry.speed === item.speed),
      ),
    };
    triggered += 1;
  }

  const normalizedNext = normalizeConfig(nextConfig, now);
  const normalizedCurrent = normalizeConfig(existingConfig, now);
  const changed = JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedNext);

  if (changed) {
    await saveServerAvailabilityConfig(normalizedNext);
  }

  return {
    changed,
    triggered,
    activeRules: Object.values(normalizedNext.autoDisabledCombos || {}).reduce((sum, items) => sum + items.length, 0),
    lookbackHours: AUTO_DISABLE_LOOKBACK_HOURS,
    disableHours: AUTO_DISABLE_DURATION_HOURS,
    threshold: AUTO_DISABLE_MIN_FAILURES,
  };
};
