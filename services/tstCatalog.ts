import modelsMarkdown from '../models.md?raw';

export type TstGenerationTier = 'flash' | 'pro';
export type TstGenerationSpeed = 'fast' | 'slow';
export type TstResolution = '1K' | '2K' | '4K';
export type TstMediaType = 'image' | 'video' | 'motion-control';

export interface TstPricingEntry {
  model: string;
  server: string;
  config_key: string;
  credits: number;
  resolution?: string;
  speed?: string;
  duration?: string;
  audio?: boolean;
}

export interface TstRuntimeModel {
  model: string;
  name: string;
  type: string;
  description?: string;
  servers: string[];
  capabilities?: {
    resolutions?: string[] | null;
    durations?: string[] | null;
    aspect_ratios?: string[] | null;
    aspectRatios?: string[] | null;
    i2v?: boolean;
    slow_mode?: boolean;
    audio?: boolean;
  };
}

export interface TstImageModelSpec {
  modelId: string;
  displayName: string;
  servers: string[];
  resolutions: string[];
  speeds: string[];
  minCredits: number;
  maxCredits: number;
}

export interface TstVideoModelSpec {
  modelId: string;
  displayName: string;
  servers: string[];
  resolutions: string[];
  durations: string[];
  aspectRatios: string[];
  speeds: string[];
  supportsAudio: boolean;
  minCredits: number;
  maxCredits: number;
}

export interface TstMotionModelSpec {
  modelId: string;
  displayName: string;
  servers: string[];
  resolutions: string[];
  speeds: string[];
  minCredits: number;
  maxCredits: number;
}

export interface TstGenerationCostBreakdown {
  available: boolean;
  credits: number;
  vcoin: number;
  configKey?: string;
  modelId?: string;
}

export interface AuditionPricingOverride {
  modelId: string;
  optionId: string;
  auditionPriceVcoin: number;
}

export interface TstServerAvailabilityConfig {
  disabledByModel: Record<string, string[]>;
  updatedAt?: string;
}

export interface TstPricingRow {
  type: TstMediaType;
  modelId: string;
  modelName: string;
  server: string;
  resolution?: string;
  duration?: string;
  speed?: string;
  audio?: boolean;
  credits: number;
  vcoin: number;
  configKey: string;
}

type ParsedMarkdownModel = {
  modelId: string;
  displayName: string;
  servers: string[];
  resolutions: string[];
  speeds: string[];
  durations: string[];
  aspectRatios: string[];
  supportsAudio: boolean;
  minCredits: number;
  maxCredits: number;
};

const VND_PER_CREDIT = 40;
const VND_PER_VCOIN = 1000;
export const TST_CATALOG_CACHE_TTL_MS = 60_000;
const SERVER_ORDER = ['cheap', 'fast', 'vip2', 'vip1'];
const SPEED_ORDER = ['fast', 'slow'];
const RESOLUTION_ORDER = ['default', '1k', '2k', '4k', '720p', '1080p'];
const DURATION_ORDER = ['3s', '5s', '8s', '10s', '15s', '25s'];

const tierToModelId: Record<TstGenerationTier, string> = {
  flash: 'nano-banana-2',
  pro: 'nano-banana-pro',
};

const uiServerMap: Record<string, string> = {
  FAST: 'fast',
  'VIP 1': 'vip1',
  'VIP 2': 'vip2',
  CHEAP: 'cheap',
};

const uiSpeedMap: Record<string, TstGenerationSpeed> = {
  Nhanh: 'fast',
  'Tiết Kiệm': 'slow',
};

const sortByOrder = (values: string[], order: string[]) =>
  [...values].sort((a, b) => {
    const rankA = order.indexOf(a);
    const rankB = order.indexOf(b);
    const resolvedRankA = rankA === -1 ? order.length : rankA;
    const resolvedRankB = rankB === -1 ? order.length : rankB;
    if (resolvedRankA !== resolvedRankB) {
      return resolvedRankA - resolvedRankB;
    }
    return a.localeCompare(b);
  });

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeModelId = (value: string) => value.trim().toLowerCase();
const normalizeServer = (value?: string) => (value || 'fast').trim().toLowerCase();
const normalizeSpeed = (value?: string) => (value || 'fast').trim().toLowerCase();
const normalizeResolution = (value?: string) => (value || 'default').trim().toLowerCase();
const normalizeDuration = (value?: string) => (value || '').trim().toLowerCase();
const normalizeCatalogServer = (value?: string) => (value || '').trim().toLowerCase();
const normalizeCatalogSpeed = (value?: string) => (value || '').trim().toLowerCase();
const normalizeCatalogResolution = (value?: string) => (value || '').trim().toLowerCase();
const normalizeCatalogDuration = (value?: string) => (value || '').trim().toLowerCase();
const cleanCell = (value: string) => value.replace(/`/g, '').trim();
const isDashValue = (value: string) => ['—', '-', '–', ''].includes(cleanCell(value));

const extractSection = (markdown: string, title: string): string => {
  const match = markdown.match(new RegExp(`## ${escapeRegex(title)}([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1] ?? '';
};

const parseMarkdownTable = (section: string): string[][] => {
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  return lines.slice(2).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
};

const parseListCell = (value: string) => {
  if (isDashValue(value)) {
    return [];
  }

  return cleanCell(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const parseCredits = (value: string) => {
  const numbers = cleanCell(value).match(/\d+/g)?.map(Number) ?? [0];
  return {
    minCredits: numbers[0] ?? 0,
    maxCredits: numbers[1] ?? numbers[0] ?? 0,
  };
};

const createMarkdownModelMap = (rows: string[][], kind: TstMediaType): Record<string, ParsedMarkdownModel> =>
  Object.fromEntries(
    rows.map((row) => {
      const modelId = normalizeModelId(cleanCell(row[0]));
      const displayName = cleanCell(row[1]);
      const servers = sortByOrder(parseListCell(row[2]), SERVER_ORDER);
      const resolutions = sortByOrder(parseListCell(row[3]), RESOLUTION_ORDER);
      const durations = kind === 'video' ? sortByOrder(parseListCell(row[4]), DURATION_ORDER) : [];
      const aspectRatios = kind === 'video' ? parseListCell(row[5]) : [];
      const supportsAudio =
        kind === 'video' ? cleanCell(row[6]).toLowerCase() === 'yes' : false;
      const creditsCellIndex = kind === 'video' ? 7 : kind === 'motion-control' ? 4 : 5;
      const speeds = kind === 'image' ? sortByOrder(parseListCell(row[4]), SPEED_ORDER) : [];
      const { minCredits, maxCredits } = parseCredits(row[creditsCellIndex]);

      return [
        modelId,
        {
          modelId,
          displayName,
          servers,
          resolutions,
          speeds,
          durations,
          aspectRatios,
          supportsAudio,
          minCredits,
          maxCredits,
        },
      ];
    }),
  );

const imageModelsSection = extractSection(modelsMarkdown, 'Image Models');
const videoModelsSection = extractSection(modelsMarkdown, 'Video Models');
const motionModelsSection = extractSection(modelsMarkdown, 'Motion Control Models');
const serverTiersSection = extractSection(modelsMarkdown, 'Server Tiers');

const imageModelRows = parseMarkdownTable(imageModelsSection);
const videoModelRows = parseMarkdownTable(videoModelsSection);
const motionModelRows = parseMarkdownTable(motionModelsSection);
const serverRows = parseMarkdownTable(serverTiersSection);

const markdownImageSpecs = createMarkdownModelMap(imageModelRows, 'image');
const markdownVideoSpecs = createMarkdownModelMap(videoModelRows, 'video');
const markdownMotionSpecs = createMarkdownModelMap(motionModelRows, 'motion-control');

const serverDescriptions = Object.fromEntries(
  serverRows.map((row) => [cleanCell(row[0]).toLowerCase(), cleanCell(row[1])]),
) as Record<string, string>;

let pricingCache: TstPricingEntry[] | null = null;
let pricingPromise: Promise<TstPricingEntry[]> | null = null;
let modelsCache: TstRuntimeModel[] | null = null;
let modelsPromise: Promise<TstRuntimeModel[]> | null = null;
let pricingCacheFetchedAt = 0;
let modelsCacheFetchedAt = 0;

export const DEFAULT_TST_SERVER_AVAILABILITY_CONFIG: TstServerAvailabilityConfig = {
  disabledByModel: {},
};

export const ADMIN_MANAGED_MODEL_LABELS = [
  'Nano Banana 2',
  'Nano Banana PRO',
  'Kling 2.5 Turbo',
  'Kling 2.6',
  'Kling 3.0',
  'Motion Control 2.6',
  'Motion Control 3.0',
] as const;

const ADMIN_MANAGED_MODEL_IDS = [
  'nano-banana-2',
  'nano-banana-pro',
  'kling-2.5-turbo',
  'kling-2.6',
  'kling-3.0-video',
  'motion-control-2.6',
  'motion-control-3.0',
] as const;

export const isAdminManagedPricingModel = (modelId: string) => {
  const normalized = normalizeModelId(modelId);
  return ADMIN_MANAGED_MODEL_IDS.some((model) => normalized === model);
};

export const filterAdminManagedPricingEntries = <T extends { model: string }>(entries: T[]) =>
  entries.filter((entry) => isAdminManagedPricingModel(entry.model));

export const filterAdminManagedPricingRows = <T extends { modelId: string }>(rows: T[]) =>
  rows.filter((row) => isAdminManagedPricingModel(row.modelId));

export const filterAdminManagedRuntimeModels = <T extends { model: string }>(models: T[]) =>
  models.filter((model) => isAdminManagedPricingModel(model.model));

export const sanitizePricingEntriesWithRuntimeModels = (
  pricingEntries: TstPricingEntry[] = [],
  runtimeModels: TstRuntimeModel[] = [],
  serverAvailabilityConfig?: TstServerAvailabilityConfig | null,
) => {
  const modelMap = new Map(
    runtimeModels.map((model) => [normalizeModelId(model.model), model]),
  );

  return pricingEntries.filter((entry) => {
    const model = modelMap.get(normalizeModelId(entry.model));
    if (!model) return false;

    if (!isServerEnabledForModel(serverAvailabilityConfig, entry.model, entry.server)) {
      return false;
    }

    const normalizedServer = normalizeCatalogServer(entry.server);
    if (normalizedServer && Array.isArray(model.servers) && model.servers.length > 0) {
      const allowedServers = model.servers.map((value) => normalizeCatalogServer(value)).filter(Boolean);
      if (allowedServers.length > 0 && !allowedServers.includes(normalizedServer)) {
        return false;
      }
    }

    const normalizedResolution = normalizeCatalogResolution(entry.resolution);
    if (normalizedResolution && Array.isArray(model.capabilities?.resolutions) && model.capabilities?.resolutions?.length) {
      const allowedResolutions = model.capabilities.resolutions.map((value) => normalizeCatalogResolution(value)).filter(Boolean);
      if (allowedResolutions.length > 0 && !allowedResolutions.includes(normalizedResolution)) {
        return false;
      }
    }

    const normalizedDuration = normalizeCatalogDuration(entry.duration);
    if (normalizedDuration && Array.isArray(model.capabilities?.durations) && model.capabilities?.durations?.length) {
      const allowedDurations = model.capabilities.durations.map((value) => normalizeCatalogDuration(value)).filter(Boolean);
      if (allowedDurations.length > 0 && !allowedDurations.includes(normalizedDuration)) {
        return false;
      }
    }

    const normalizedSpeed = normalizeCatalogSpeed(entry.speed);
    if (normalizedSpeed === 'slow' && model.capabilities?.slow_mode !== true) {
      return false;
    }

    if (entry.audio === true && model.capabilities?.audio !== true) {
      return false;
    }

    return true;
  });
};

const normalizeServerAvailabilityConfig = (
  config?: TstServerAvailabilityConfig | null,
): TstServerAvailabilityConfig => {
  const disabledByModel = Object.fromEntries(
    Object.entries(config?.disabledByModel || {}).map(([modelId, servers]) => [
      normalizeModelId(modelId),
      unique((Array.isArray(servers) ? servers : []).map((serverId) => normalizeServer(serverId))),
    ]),
  );

  return {
    disabledByModel,
    updatedAt: config?.updatedAt,
  };
};

export const getDisabledServersForModel = (
  config: TstServerAvailabilityConfig | null | undefined,
  modelId: string,
) => {
  const normalizedConfig = normalizeServerAvailabilityConfig(config);
  return normalizedConfig.disabledByModel[normalizeModelId(modelId)] || [];
};

export const isServerEnabledForModel = (
  config: TstServerAvailabilityConfig | null | undefined,
  modelId: string,
  serverId?: string,
) => {
  const normalizedServerId = normalizeServer(serverId);
  if (!normalizedServerId) return true;
  return !getDisabledServersForModel(config, modelId).includes(normalizedServerId);
};

export const applyServerAvailabilityToRuntimeModels = (
  runtimeModels: TstRuntimeModel[] = [],
  config?: TstServerAvailabilityConfig | null,
) =>
  runtimeModels.map((model) => ({
    ...model,
    servers: (model.servers || []).filter((serverId) => isServerEnabledForModel(config, model.model, serverId)),
  }));

export const applyServerAvailabilityToPricingEntries = (
  pricingEntries: TstPricingEntry[] = [],
  config?: TstServerAvailabilityConfig | null,
) =>
  pricingEntries.filter((entry) => isServerEnabledForModel(config, entry.model, entry.server));

export const clearTstCatalogCache = () => {
  pricingCache = null;
  pricingPromise = null;
  modelsCache = null;
  modelsPromise = null;
  pricingCacheFetchedAt = 0;
  modelsCacheFetchedAt = 0;
};

export const getTstCatalogCacheInfo = () => ({
  ttlMs: TST_CATALOG_CACHE_TTL_MS,
  pricingFetchedAt: pricingCacheFetchedAt || null,
  pricingExpiresAt: pricingCacheFetchedAt ? pricingCacheFetchedAt + TST_CATALOG_CACHE_TTL_MS : null,
  modelsFetchedAt: modelsCacheFetchedAt || null,
  modelsExpiresAt: modelsCacheFetchedAt ? modelsCacheFetchedAt + TST_CATALOG_CACHE_TTL_MS : null,
});

const isCacheFresh = (fetchedAt: number) => fetchedAt > 0 && Date.now() - fetchedAt < TST_CATALOG_CACHE_TTL_MS;

const getFallbackImageSpec = (tier: TstGenerationTier): TstImageModelSpec => {
  const modelId = tierToModelId[tier];
  return {
    modelId,
    displayName: tier === 'flash' ? 'Nano Banana 2' : 'Nano Banana PRO',
    servers: [],
    resolutions: [],
    speeds: [],
    minCredits: 0,
    maxCredits: 0,
  };
};

const getFallbackVideoSpec = (modelId: string, name?: string): TstVideoModelSpec => {
  return {
    modelId,
    displayName: name || modelId,
    servers: [],
    resolutions: [],
    durations: [],
    aspectRatios: [],
    speeds: [],
    supportsAudio: false,
    minCredits: 0,
    maxCredits: 0,
  };
};

const getFallbackMotionSpec = (modelId: string, name?: string): TstMotionModelSpec => {
  return {
    modelId,
    displayName: name || modelId,
    servers: [],
    resolutions: [],
    speeds: [],
    minCredits: 0,
    maxCredits: 0,
  };
};

const mapPricingEntry = (entry: any): TstPricingEntry => ({
  model: String(entry.model || ''),
  server: String(entry.server || ''),
  config_key: String(entry.config_key || ''),
  credits: Number(entry.credits || 0),
  resolution: entry.resolution ? String(entry.resolution) : undefined,
  speed: entry.speed ? String(entry.speed) : undefined,
  duration: entry.duration ? String(entry.duration) : undefined,
  audio: entry.audio === true,
});

const mapRuntimeModel = (entry: any): TstRuntimeModel => ({
  model: String(entry.model || ''),
  name: String(entry.name || entry.model || ''),
  type: String(entry.type || ''),
  description: entry.description ? String(entry.description) : '',
  servers: Array.isArray(entry.servers) ? entry.servers.map((value: string) => String(value)) : [],
  capabilities: entry.capabilities || {},
});

const getPricingEntriesForModel = (modelId: string, pricingEntries: TstPricingEntry[]) =>
  pricingEntries.filter((entry) => normalizeModelId(entry.model) === normalizeModelId(modelId));

const getMatchingEntries = ({
  modelId,
  pricingEntries,
  resolution,
  speed,
  serverId,
  duration,
}: {
  modelId: string;
  pricingEntries: TstPricingEntry[];
  resolution?: string;
  speed?: string;
  serverId?: string;
  duration?: string;
}) => {
  const normalizedResolution = resolution ? normalizeResolution(resolution) : null;
  const normalizedSpeed = speed ? normalizeSpeed(speed) : null;
  const normalizedServer = serverId ? normalizeServer(serverId) : null;
  const normalizedDuration = duration ? normalizeDuration(duration) : null;

  return getPricingEntriesForModel(modelId, pricingEntries).filter((entry) => {
    if (normalizedResolution && normalizeResolution(entry.resolution) !== normalizedResolution) return false;
    if (normalizedSpeed && normalizeSpeed(entry.speed) !== normalizedSpeed) return false;
    if (normalizedServer && normalizeServer(entry.server) !== normalizedServer) return false;
    if (normalizedDuration && normalizeDuration(entry.duration) !== normalizedDuration) return false;
    return true;
  });
};

const getUniqueResolutions = (entries: TstPricingEntry[]) =>
  sortByOrder(
    unique(entries.map((entry) => normalizeCatalogResolution(entry.resolution)).filter(Boolean)),
    RESOLUTION_ORDER,
  );

const getUniqueDurations = (entries: TstPricingEntry[]) =>
  sortByOrder(unique(entries.map((entry) => normalizeCatalogDuration(entry.duration)).filter(Boolean)), DURATION_ORDER);

const getUniqueSpeeds = (entries: TstPricingEntry[]) =>
  sortByOrder(
    unique(
      entries
        .map((entry) => normalizeCatalogSpeed(entry.speed) || 'fast')
        .filter(Boolean),
    ),
    SPEED_ORDER,
  );

const getCapabilityAspectRatios = (model: TstRuntimeModel) =>
  unique([
    ...((model.capabilities?.aspect_ratios || []) as string[]),
    ...((model.capabilities?.aspectRatios || []) as string[]),
  ]);

const pickExactEntry = (entries: TstPricingEntry[], filters: Array<(entry: TstPricingEntry) => boolean>) => {
  for (const filter of filters) {
    const match = entries.find(filter);
    if (match) {
      return match;
    }
  }
  return null;
};

export const creditsToVcoin = (credits: number) =>
  Math.max(1, Math.ceil((credits * VND_PER_CREDIT) / VND_PER_VCOIN));

export const uiServerToTst = (value?: string) => {
  if (!value) return undefined;
  return uiServerMap[value] || normalizeServer(value);
};

export const tstServerToUi = (value?: string) => {
  const normalized = normalizeCatalogServer(value);
  if (!normalized) return '';
  const entry = Object.entries(uiServerMap).find(([, serverId]) => serverId === normalized);
  return entry?.[0] || normalized.toUpperCase();
};

export const uiSpeedToTst = (value?: string): TstGenerationSpeed | undefined => {
  if (!value) return undefined;
  return uiSpeedMap[value] || (normalizeSpeed(value) as TstGenerationSpeed);
};

export const tstSpeedToUi = (value?: string) => {
  const normalized = normalizeCatalogSpeed(value) || 'fast';
  if (normalized === 'slow') return 'Tiết Kiệm';
  return 'Nhanh';
};

const matchesAudioSelection = (entryAudio: boolean | undefined, requestedAudio: boolean | undefined) => {
  if (typeof requestedAudio !== 'boolean') return true;
  if (requestedAudio) return entryAudio === true;
  return entryAudio !== true;
};

const getAuditionPrice = (
  modelId: string,
  configKey: string | undefined,
  fallbackVcoin: number,
  pricingOverrides: AuditionPricingOverride[] = [],
) => {
  if (!configKey) return fallbackVcoin;

  const override = pricingOverrides.find(
    (row) =>
      normalizeModelId(row.modelId) === normalizeModelId(modelId) &&
      row.optionId === configKey &&
      Number.isFinite(row.auditionPriceVcoin) &&
      row.auditionPriceVcoin > 0,
  );

  return override?.auditionPriceVcoin ?? fallbackVcoin;
};

export const getServerDescription = (serverId: string) => serverDescriptions[normalizeServer(serverId)] ?? '';

export const fetchTstPricing = async (forceRefresh = false): Promise<TstPricingEntry[]> => {
  if (forceRefresh) {
    pricingCache = null;
    pricingPromise = null;
    pricingCacheFetchedAt = 0;
  }

  if (pricingCache && isCacheFresh(pricingCacheFetchedAt)) {
    return pricingCache;
  }

  if (!pricingPromise) {
    pricingPromise = fetch(forceRefresh ? '/api/tst-models-pricing?force=1' : '/api/tst-models-pricing')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load TST pricing: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        pricingCache = Array.isArray(data?.pricing) ? data.pricing.map(mapPricingEntry) : [];
        pricingCacheFetchedAt = Date.now();
        return pricingCache ?? [];
      })
      .finally(() => {
        pricingPromise = null;
      })
      .catch((error) => {
        pricingCache = null;
        pricingCacheFetchedAt = 0;
        throw error;
      });
  }

  return (await pricingPromise) ?? [];
};

export const fetchTstModels = async (forceRefresh = false): Promise<TstRuntimeModel[]> => {
  if (forceRefresh) {
    modelsCache = null;
    modelsPromise = null;
    modelsCacheFetchedAt = 0;
  }

  if (modelsCache && isCacheFresh(modelsCacheFetchedAt)) {
    return modelsCache;
  }

  if (!modelsPromise) {
    modelsPromise = fetch(forceRefresh ? '/api/tst-models?force=1' : '/api/tst-models')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load TST models: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        modelsCache = Array.isArray(data?.models) ? data.models.map(mapRuntimeModel) : [];
        modelsCacheFetchedAt = Date.now();
        return modelsCache ?? [];
      })
      .finally(() => {
        modelsPromise = null;
      })
      .catch((error) => {
        modelsCache = null;
        modelsCacheFetchedAt = 0;
        throw error;
      });
  }

  return (await modelsPromise) ?? [];
};

export const getGenerationModelId = (tier: TstGenerationTier) => tierToModelId[tier];

export const getGenerationModelSpec = (
  tier: TstGenerationTier,
  pricingEntries: TstPricingEntry[] = [],
): TstImageModelSpec => {
  const modelId = tierToModelId[tier];
  const entries = getPricingEntriesForModel(modelId, pricingEntries);
  const fallback = getFallbackImageSpec(tier);

  if (entries.length === 0) {
    return fallback;
  }

  const resolutions = getUniqueResolutions(entries);
  const servers = sortByOrder(
    unique(entries.map((entry) => normalizeCatalogServer(entry.server)).filter(Boolean)),
    SERVER_ORDER,
  );
  const speeds = getUniqueSpeeds(entries);
  const credits = entries.map((entry) => entry.credits).filter((credit) => Number.isFinite(credit));

  return {
    modelId,
    displayName: fallback.displayName,
    servers: servers.length > 0 ? servers : fallback.servers,
    resolutions: resolutions.length > 0 ? resolutions : fallback.resolutions,
    speeds: speeds.length > 0 ? speeds : fallback.speeds,
    minCredits: credits.length > 0 ? Math.min(...credits) : fallback.minCredits,
    maxCredits: credits.length > 0 ? Math.max(...credits) : fallback.maxCredits,
  };
};

export const getCompatibleGenerationServers = ({
  tier,
  pricingEntries = [],
  speed,
  resolution,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  speed?: string;
  resolution?: TstResolution;
}) => {
  const entries = getMatchingEntries({
    modelId: tierToModelId[tier],
    pricingEntries,
    speed,
    resolution,
  });
  if (entries.length === 0) {
    return [];
  }

  return sortByOrder(
    unique(entries.map((entry) => normalizeCatalogServer(entry.server)).filter(Boolean)),
    SERVER_ORDER,
  );
};

export const getCompatibleGenerationSpeeds = ({
  tier,
  pricingEntries = [],
  serverId,
  resolution,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  resolution?: TstResolution;
}) => {
  const entries = getMatchingEntries({
    modelId: tierToModelId[tier],
    pricingEntries,
    serverId,
    resolution,
  });
  if (entries.length === 0) {
    return [];
  }

  return getUniqueSpeeds(entries) as TstGenerationSpeed[];
};

export const getCompatibleGenerationResolutions = ({
  tier,
  pricingEntries = [],
  serverId,
  speed,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  speed?: string;
}) => {
  const entries = getMatchingEntries({
    modelId: tierToModelId[tier],
    pricingEntries,
    serverId,
    speed,
  });
  if (entries.length === 0) {
    return [];
  }
  return getUniqueResolutions(entries).map((value) => value.toUpperCase()) as TstResolution[];
};

export const getGenerationCostBreakdown = ({
  tier,
  resolution,
  speed,
  serverId,
  pricingEntries = [],
  pricingOverrides = [],
}: {
  tier: TstGenerationTier;
  resolution: TstResolution;
  speed: string;
  serverId: string;
  pricingEntries?: TstPricingEntry[];
  pricingOverrides?: AuditionPricingOverride[];
}): TstGenerationCostBreakdown => {
  const modelId = tierToModelId[tier];
  const modelEntries = getPricingEntriesForModel(modelId, pricingEntries);
  const normalizedResolution = normalizeResolution(resolution);
  const normalizedSpeed = normalizeSpeed(speed);
  const normalizedServer = normalizeServer(serverId);

  const exactEntry = pickExactEntry(modelEntries, [
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeSpeed(entry.speed) === normalizedSpeed,
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizedSpeed === 'fast' &&
      !entry.speed,
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeSpeed(entry.speed) === normalizedSpeed,
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizedSpeed === 'fast' &&
      !entry.speed,
  ]);

  if (exactEntry) {
    const fallbackVcoin = creditsToVcoin(exactEntry.credits);
    return {
      available: true,
      credits: exactEntry.credits,
      vcoin: getAuditionPrice(modelId, exactEntry.config_key, fallbackVcoin, pricingOverrides),
      configKey: exactEntry.config_key,
      modelId,
    };
  }

  return {
    available: false,
    credits: 0,
    vcoin: 0,
    modelId,
  };
};

export const getResolutionCostMap = ({
  tier,
  speed,
  serverId,
  pricingEntries = [],
  pricingOverrides = [],
}: {
  tier: TstGenerationTier;
  speed: string;
  serverId: string;
  pricingEntries?: TstPricingEntry[];
  pricingOverrides?: AuditionPricingOverride[];
}) =>
  Object.fromEntries(
    (['1K', '2K', '4K'] as TstResolution[]).map((resolution) => [
      resolution,
      getGenerationCostBreakdown({ tier, resolution, speed, serverId, pricingEntries, pricingOverrides }),
    ]),
  ) as Record<TstResolution, TstGenerationCostBreakdown>;

export const getVideoModelSpecs = (
  pricingEntries: TstPricingEntry[] = [],
  runtimeModels: TstRuntimeModel[] = [],
): TstVideoModelSpec[] => {
  const models = runtimeModels.filter((model) => {
    if (model.type !== 'video' || !isAdminManagedPricingModel(model.model)) return false;
    return getPricingEntriesForModel(model.model, pricingEntries).length > 0;
  });

  return models.map((model) => {
    const entries = getPricingEntriesForModel(model.model, pricingEntries);
    const fallback = getFallbackVideoSpec(model.model, model.name);
    const resolutions = getUniqueResolutions(entries);
    const durations = getUniqueDurations(entries);
    const speeds = getUniqueSpeeds(entries);
    const servers = sortByOrder(
      unique(entries.map((entry) => normalizeCatalogServer(entry.server)).filter(Boolean)),
      SERVER_ORDER,
    );
    const credits = entries.map((entry) => entry.credits).filter((credit) => Number.isFinite(credit));

    return {
      modelId: model.model,
      displayName: model.name || fallback.displayName,
      servers,
      resolutions,
      durations,
      aspectRatios: getCapabilityAspectRatios(model),
      speeds,
      supportsAudio: Boolean(model.capabilities?.audio ?? fallback.supportsAudio),
      minCredits: credits.length > 0 ? Math.min(...credits) : fallback.minCredits,
      maxCredits: credits.length > 0 ? Math.max(...credits) : fallback.maxCredits,
    };
  });
};

export const getMotionModelSpecs = (
  pricingEntries: TstPricingEntry[] = [],
  runtimeModels: TstRuntimeModel[] = [],
): TstMotionModelSpec[] => {
  const models = runtimeModels.filter((model) => {
    if (model.type !== 'motion-control' || !isAdminManagedPricingModel(model.model)) return false;
    return getPricingEntriesForModel(model.model, pricingEntries).length > 0;
  });

  return models.map((model) => {
    const entries = getPricingEntriesForModel(model.model, pricingEntries);
    const fallback = getFallbackMotionSpec(model.model, model.name);
    const resolutions = getUniqueResolutions(entries);
    const speeds = getUniqueSpeeds(entries);
    const servers = sortByOrder(
      unique(entries.map((entry) => normalizeCatalogServer(entry.server)).filter(Boolean)),
      SERVER_ORDER,
    );
    const credits = entries.map((entry) => entry.credits).filter((credit) => Number.isFinite(credit));

    return {
      modelId: model.model,
      displayName: model.name || fallback.displayName,
      servers,
      resolutions,
      speeds: speeds.length > 0 ? speeds : fallback.speeds,
      minCredits: credits.length > 0 ? Math.min(...credits) : fallback.minCredits,
      maxCredits: credits.length > 0 ? Math.max(...credits) : fallback.maxCredits,
    };
  });
};

export const getVideoCompatibleServers = ({
  modelId,
  pricingEntries = [],
  resolution,
  duration,
  speed,
  audio,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  resolution?: string;
  duration?: string;
  speed?: string;
  audio?: boolean;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, resolution, duration, speed }).filter((entry) =>
    matchesAudioSelection(entry.audio, audio),
  );
  if (entries.length === 0) {
    return [];
  }
  const servers = sortByOrder(
    unique(entries.map((entry) => normalizeCatalogServer(entry.server)).filter(Boolean)),
    SERVER_ORDER,
  );
  return servers;
};

export const getVideoCompatibleResolutions = ({
  modelId,
  pricingEntries = [],
  serverId,
  duration,
  speed,
  audio,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  duration?: string;
  speed?: string;
  audio?: boolean;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, serverId, duration, speed }).filter((entry) =>
    matchesAudioSelection(entry.audio, audio),
  );
  if (entries.length === 0) {
    return [];
  }
  return getUniqueResolutions(entries);
};

export const getVideoCompatibleDurations = ({
  modelId,
  pricingEntries = [],
  serverId,
  resolution,
  speed,
  audio,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  resolution?: string;
  speed?: string;
  audio?: boolean;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, serverId, resolution, speed }).filter((entry) =>
    matchesAudioSelection(entry.audio, audio),
  );
  if (entries.length === 0) {
    return [];
  }
  return getUniqueDurations(entries);
};

export const getVideoCompatibleSpeeds = ({
  modelId,
  pricingEntries = [],
  serverId,
  resolution,
  duration,
  audio,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  resolution?: string;
  duration?: string;
  audio?: boolean;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, serverId, resolution, duration }).filter((entry) =>
    matchesAudioSelection(entry.audio, audio),
  );
  if (entries.length === 0) {
    return [];
  }
  return getUniqueSpeeds(entries);
};

export const getVideoCostBreakdown = ({
  modelId,
  serverId,
  resolution,
  duration,
  speed = 'fast',
  audio,
  pricingEntries = [],
  pricingOverrides = [],
}: {
  modelId: string;
  serverId: string;
  resolution: string;
  duration: string;
  speed?: string;
  audio?: boolean;
  pricingEntries?: TstPricingEntry[];
  pricingOverrides?: AuditionPricingOverride[];
}): TstGenerationCostBreakdown => {
  const modelEntries = getPricingEntriesForModel(modelId, pricingEntries);
  const normalizedResolution = normalizeResolution(resolution);
  const normalizedSpeed = normalizeSpeed(speed);
  const normalizedServer = normalizeServer(serverId);
  const normalizedDuration = normalizeDuration(duration);

  const exactEntry = pickExactEntry(modelEntries, [
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeDuration(entry.duration) === normalizedDuration &&
      normalizeSpeed(entry.speed) === normalizedSpeed &&
      matchesAudioSelection(entry.audio, audio),
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeDuration(entry.duration) === normalizedDuration &&
      normalizedSpeed === 'fast' &&
      !entry.speed &&
      matchesAudioSelection(entry.audio, audio),
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeDuration(entry.duration) === normalizedDuration &&
      normalizeSpeed(entry.speed) === normalizedSpeed &&
      matchesAudioSelection(entry.audio, audio),
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeDuration(entry.duration) === normalizedDuration &&
      normalizedSpeed === 'fast' &&
      !entry.speed &&
      matchesAudioSelection(entry.audio, audio),
  ]);

  if (exactEntry) {
    const fallbackVcoin = creditsToVcoin(exactEntry.credits);
    return {
      available: true,
      credits: exactEntry.credits,
      vcoin: getAuditionPrice(modelId, exactEntry.config_key, fallbackVcoin, pricingOverrides),
      configKey: exactEntry.config_key,
      modelId,
    };
  }

  return { available: false, credits: 0, vcoin: 0, modelId };
};

export const getMotionCompatibleServers = ({
  modelId,
  pricingEntries = [],
  resolution,
  speed,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  resolution?: string;
  speed?: string;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, resolution, speed });
  if (entries.length === 0) {
    return [];
  }
  return sortByOrder(
    unique(entries.map((entry) => normalizeCatalogServer(entry.server)).filter(Boolean)),
    SERVER_ORDER,
  );
};

export const getMotionCompatibleSpeeds = ({
  modelId,
  pricingEntries = [],
  serverId,
  resolution,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  resolution?: string;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, serverId, resolution });
  if (entries.length === 0) {
    return [];
  }
  return getUniqueSpeeds(entries);
};

export const getMotionCompatibleResolutions = ({
  modelId,
  pricingEntries = [],
  serverId,
  speed,
}: {
  modelId: string;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  speed?: string;
}) => {
  const entries = getMatchingEntries({ modelId, pricingEntries, serverId, speed });
  if (entries.length === 0) {
    return [];
  }
  return getUniqueResolutions(entries);
};

export const getMotionCostBreakdown = ({
  modelId,
  serverId,
  resolution,
  speed = 'fast',
  pricingEntries = [],
  pricingOverrides = [],
}: {
  modelId: string;
  serverId: string;
  resolution: string;
  speed?: string;
  pricingEntries?: TstPricingEntry[];
  pricingOverrides?: AuditionPricingOverride[];
}): TstGenerationCostBreakdown => {
  const modelEntries = getPricingEntriesForModel(modelId, pricingEntries);
  const normalizedServer = normalizeServer(serverId);
  const normalizedResolution = normalizeResolution(resolution);
  const normalizedSpeed = normalizeSpeed(speed);

  const exactEntry = pickExactEntry(modelEntries, [
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeSpeed(entry.speed) === normalizedSpeed,
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizedSpeed === 'fast' &&
      !entry.speed,
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizeSpeed(entry.speed) === normalizedSpeed,
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      normalizedSpeed === 'fast' &&
      !entry.speed,
  ]);

  if (exactEntry) {
    const fallbackVcoin = creditsToVcoin(exactEntry.credits);
    return {
      available: true,
      credits: exactEntry.credits,
      vcoin: getAuditionPrice(modelId, exactEntry.config_key, fallbackVcoin, pricingOverrides),
      configKey: exactEntry.config_key,
      modelId,
    };
  }

  return { available: false, credits: 0, vcoin: 0, modelId };
};

export const getPricingRows = async (forceRefresh = false): Promise<TstPricingRow[]> => {
  const [rawPricingEntries, runtimeModels] = await Promise.all([fetchTstPricing(forceRefresh), fetchTstModels(forceRefresh)]);
  const pricingEntries = sanitizePricingEntriesWithRuntimeModels(rawPricingEntries, runtimeModels);
  const modelMap = new Map(runtimeModels.map((model) => [normalizeModelId(model.model), model]));
  const rows: Array<TstPricingRow | null> = pricingEntries.map((entry) => {
    const model = modelMap.get(normalizeModelId(entry.model));
    if (!model || !isAdminManagedPricingModel(model.model)) {
      return null;
    }

    const type = (model.type === 'motion-control' ? 'motion-control' : model.type) as TstMediaType | undefined;
    return {
      type: type || (normalizeModelId(entry.model).includes('motion-control') ? 'motion-control' : 'image'),
      modelId: entry.model,
      modelName: model.name || entry.model,
      server: normalizeCatalogServer(entry.server),
      resolution: entry.resolution,
      duration: entry.duration,
      speed: normalizeCatalogSpeed(entry.speed) || undefined,
      audio: entry.audio,
      credits: entry.credits,
      vcoin: creditsToVcoin(entry.credits),
      configKey: entry.config_key,
    };
  });

  return rows
    .filter((row): row is TstPricingRow => row !== null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.modelName !== b.modelName) return a.modelName.localeCompare(b.modelName);
      if ((a.server || '') !== (b.server || '')) return (a.server || '').localeCompare(b.server || '');
      if ((a.resolution || '') !== (b.resolution || '')) return (a.resolution || '').localeCompare(b.resolution || '');
      if ((a.duration || '') !== (b.duration || '')) return (a.duration || '').localeCompare(b.duration || '');
      return a.credits - b.credits;
    });
};
