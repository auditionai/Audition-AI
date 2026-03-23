import { getServiceRoleClient } from './_supabase';

type ServerAvailabilityConfig = {
  disabledByModel: Record<string, string[]>;
  updatedAt?: string;
};

const CACHE_TTL_MS = 30_000;

let configCache: ServerAvailabilityConfig | null = null;
let configPromise: Promise<ServerAvailabilityConfig> | null = null;
let configFetchedAt = 0;

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();
const isFresh = (timestamp: number) => timestamp > 0 && Date.now() - timestamp < CACHE_TTL_MS;

const normalizeConfig = (config: any): ServerAvailabilityConfig => ({
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
  updatedAt: typeof config?.updatedAt === 'string' ? config.updatedAt : undefined,
});

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

      configCache = normalizeConfig(data?.value || { disabledByModel: {} });
      configFetchedAt = Date.now();
      return configCache;
    })().finally(() => {
      configPromise = null;
    });
  }

  return configPromise;
};

export const isServerAllowedByConfig = async (modelId: string, serverId?: string | null) => {
  const normalizedServerId = normalize(serverId);
  if (!normalizedServerId) return true;
  const config = await getServerAvailabilityConfig();
  const disabled = config.disabledByModel[normalize(modelId)] || [];
  return !disabled.includes(normalizedServerId);
};
