import modelsMarkdown from '../models.md?raw';

export type TstGenerationTier = 'flash' | 'pro' | 'gpt';
export type TstGenerationSpeed = 'fast' | 'slow';
export type TstResolution = '1K' | '2K' | '4K';
export type TstMediaType = 'image' | 'video' | 'motion-control' | 'edit';

export interface TstPricingEntry {
  model: string;
  server: string;
  config_key: string;
  credits: number;
  resolution?: string;
  quality?: string;
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
    qualities?: string[] | null;
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
  billingUnit?: 'flat' | 'second';
  unitVcoin?: number;
  billedSeconds?: number;
}

export interface AuditionPricingOverride {
  modelId: string;
  optionId: string;
  auditionPriceVcoin: number;
}

export interface TstServerAvailabilityConfig {
  disabledByModel: Record<string, string[]>;
  autoDisabledCombos?: Record<string, Array<{
    serverId: string;
    speed: string;
    disabledUntil: string;
    hiddenAt?: string;
    reason?: string;
    hitCount?: number;
    windowHours?: number;
  }>>;
  manualReopenedCombos?: Record<string, Array<{
    serverId: string;
    speed: string;
    reopenedAt: string;
  }>>;
  updatedAt?: string;
}

export interface TstPricingRow {
  type: TstMediaType;
  modelId: string;
  modelName: string;
  server: string;
  resolution?: string;
  quality?: string;
  duration?: string;
  speed?: string;
  audio?: boolean;
  credits: number;
  vcoin: number;
  configKey: string;
  defaultAuditionVcoin?: number;
  billingUnit?: 'flat' | 'second';
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
const TST_CATALOG_FETCH_TIMEOUT_MS = 15_000;
const TST_CATALOG_FETCH_RETRIES = 1;
const TST_CATALOG_FETCH_RETRY_DELAY_MS = 750;
const SERVER_ORDER = ['cheap', 'fast', 'standard', 'default', 'vip2', 'vip1'];
const SPEED_ORDER = ['fast', 'slow'];
const RESOLUTION_ORDER = ['default', '480p', '720p', '1080p', '1k', '2k', '4k'];
const GPT_IMAGE_QUALITY_VALUES = ['low', 'medium', 'high'];
const DURATION_ORDER = ['3s', '5s', '6s', '8s', '10s', '15s', '25s'];
const ASPECT_RATIO_ORDER = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];
const TST_DOCS_VIDEO_ASPECT_RATIO_FALLBACKS: Record<string, string[]> = {
  'seedance-2.0-fast': ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
  'seedance-2.0': ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
  'grok-i2v': ['9:16', '16:9', '1:1'],
  'kling-o1-video': ['9:16', '16:9', '1:1'],
  'kling-3.0-video': ['16:9', '9:16', '1:1'],
};

const tierToModelId: Record<TstGenerationTier, string> = {
  flash: 'nano-banana-2',
  pro: 'nano-banana-pro',
  gpt: 'image-gpt-2',
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
  'Tiết kiệm': 'slow',
  'Tiáº¿t Kiá»‡m': 'slow',
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
const normalizeQuality = (value?: string) => (value || '').trim().toLowerCase();
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchCatalogJson = async (url: string, label: string) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TST_CATALOG_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${label}: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(TST_CATALOG_FETCH_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const fetchCatalogJsonWithRetry = async (url: string, label: string) => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= TST_CATALOG_FETCH_RETRIES; attempt += 1) {
    try {
      return await fetchCatalogJson(url, label);
    } catch (error) {
      lastError = error;
      if (attempt >= TST_CATALOG_FETCH_RETRIES) {
        break;
      }
      await delay(TST_CATALOG_FETCH_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
};

export const DEFAULT_TST_SERVER_AVAILABILITY_CONFIG: TstServerAvailabilityConfig = {
  disabledByModel: {},
  autoDisabledCombos: {},
  manualReopenedCombos: {},
};

export const ADMIN_MANAGED_MODEL_LABELS = [
  'Nano Banana 2',
  'Nano Banana PRO',
  'GPT Image 2',
  'Kling 2.5 Turbo',
  'Kling 2.6',
  'Kling 3.0',
  'Kling O1 Video',
  'Seedance 2.0',
  'Seedance 2.0 Fast',
  'Grok Video',
  'Motion Control 2.6',
  'Motion Control 3.0',
  'Chỉnh sửa ảnh',
  'Tách nền',
  'Làm nét',
] as const;

const ADMIN_MANAGED_MODEL_IDS = [
  'nano-banana-2',
  'nano-banana-pro',
  'image-gpt-2',
  'kling-2.5-turbo',
  'kling-2.6',
  'kling-3.0-video',
  'kling-o1-video',
  'seedance-2.0',
  'seedance-2.0-fast',
  'grok-i2v',
  'motion-control-2.6',
  'motion-control-3.0',
  'magic_editor_pro',
  'remove_bg_pro',
  'sharpen_upscale',
] as const;

const VERTEX_EDIT_PRICING_CONFIG = [
  {
    modelId: 'magic_editor_pro',
    toolName: 'Chỉnh sửa ảnh',
    tiers: {
      flash: { '1K': 2, '2K': 3, '4K': 4 },
      pro: { '1K': 4, '2K': 5, '4K': 6 },
    },
  },
  {
    modelId: 'remove_bg_pro',
    toolName: 'Tách nền',
    tiers: {
      flash: { '1K': 1, '2K': 1, '4K': 1 },
    },
  },
  {
    modelId: 'sharpen_upscale',
    toolName: 'Làm nét',
    tiers: {
      flash: { '1K': 1, '2K': 2, '4K': 3 },
    },
  },
] as const;

const buildVertexEditPricingKey = (tier: string, resolution: TstResolution) =>
  `${tier}|${resolution.toLowerCase()}`;

const parseVertexEditPricingKey = (configKey: string) => {
  const [tier, resolution] = configKey.split('|');
  return {
    tier: normalizeModelId(tier || 'flash'),
    resolution: ((resolution || '1k').toUpperCase()) as TstResolution,
  };
};

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

export const getVertexEditPricingRows = (): TstPricingRow[] =>
  VERTEX_EDIT_PRICING_CONFIG.flatMap((tool) =>
    Object.entries(tool.tiers).flatMap(([tier, resolutions]) =>
      (Object.entries(resolutions) as Array<[TstResolution, number]>).map(([resolution, defaultAuditionVcoin]) => ({
        type: 'edit' as const,
        modelId: tool.modelId,
        modelName: `${tool.toolName} • ${tier === 'pro' ? 'Pro' : 'Flash'}`,
        server: '',
        resolution,
        duration: undefined,
        speed: undefined,
        audio: false,
        credits: 0,
        vcoin: 0,
        configKey: buildVertexEditPricingKey(tier, resolution),
        defaultAuditionVcoin,
      })),
    ),
  );

export const getVertexEditToolCostBreakdown = ({
  toolId,
  tier,
  resolution,
  pricingOverrides = [],
}: {
  toolId: string;
  tier: TstGenerationTier;
  resolution: TstResolution;
  pricingOverrides?: AuditionPricingOverride[];
}): TstGenerationCostBreakdown => {
  const normalizedToolId = normalizeModelId(toolId);
  const normalizedTier = normalizeModelId(tier);
  const configKey = buildVertexEditPricingKey(normalizedTier, resolution);
  const manualRow = getVertexEditPricingRows().find(
    (row) =>
      normalizeModelId(row.modelId) === normalizedToolId &&
      row.configKey === configKey,
  );

  if (!manualRow) {
    return { available: false, credits: 0, vcoin: 0, modelId: toolId };
  }

  const override = pricingOverrides.find(
    (item) =>
      normalizeModelId(item.modelId) === normalizedToolId &&
      item.optionId === configKey,
  );

  return {
    available: true,
    credits: 0,
    vcoin: override?.auditionPriceVcoin ?? manualRow.defaultAuditionVcoin ?? manualRow.vcoin ?? 0,
    configKey,
    modelId: manualRow.modelId,
  };
};

export const getVertexEditResolutionCostMap = ({
  toolId,
  tier,
  pricingOverrides = [],
}: {
  toolId: string;
  tier: TstGenerationTier;
  pricingOverrides?: AuditionPricingOverride[];
}) => {
  return {
    '1K': {
      vcoin: getVertexEditToolCostBreakdown({ toolId, tier, resolution: '1K', pricingOverrides }).vcoin,
    },
    '2K': {
      vcoin: getVertexEditToolCostBreakdown({ toolId, tier, resolution: '2K', pricingOverrides }).vcoin,
    },
    '4K': {
      vcoin: getVertexEditToolCostBreakdown({ toolId, tier, resolution: '4K', pricingOverrides }).vcoin,
    },
  } as Record<TstResolution, { vcoin: number }>;
};

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

    if (!isServerEnabledForModel(serverAvailabilityConfig, entry.model, entry.server, entry.speed)) {
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

  const autoDisabledCombos = Object.fromEntries(
    Object.entries(config?.autoDisabledCombos || {}).map(([modelId, combos]) => [
      normalizeModelId(modelId),
      (Array.isArray(combos) ? combos : [])
        .map((entry) => ({
          serverId: normalizeServer(entry?.serverId),
          speed: normalizeSpeed(entry?.speed),
          disabledUntil: typeof entry?.disabledUntil === 'string' ? entry.disabledUntil : '',
          hiddenAt: typeof entry?.hiddenAt === 'string' ? entry.hiddenAt : undefined,
          reason: typeof entry?.reason === 'string' ? entry.reason : undefined,
          hitCount: Number(entry?.hitCount || 0) || undefined,
          windowHours: Number(entry?.windowHours || 0) || undefined,
        }))
        .filter((entry) => entry.serverId && entry.speed && entry.disabledUntil),
    ]),
  );

  const manualReopenedCombos = Object.fromEntries(
    Object.entries(config?.manualReopenedCombos || {}).map(([modelId, combos]) => [
      normalizeModelId(modelId),
      (Array.isArray(combos) ? combos : [])
        .map((entry) => ({
          serverId: normalizeServer(entry?.serverId),
          speed: normalizeSpeed(entry?.speed),
          reopenedAt: typeof entry?.reopenedAt === 'string' ? entry.reopenedAt : '',
        }))
        .filter((entry) => entry.serverId && entry.speed && entry.reopenedAt),
    ]),
  );

  return {
    disabledByModel,
    autoDisabledCombos,
    manualReopenedCombos,
    updatedAt: config?.updatedAt,
  };
};

export const getActiveAutoDisabledServerCombosForModel = (
  config: TstServerAvailabilityConfig | null | undefined,
  modelId: string,
  now = Date.now(),
) => {
  const normalizedConfig = normalizeServerAvailabilityConfig(config);
  return (normalizedConfig.autoDisabledCombos?.[normalizeModelId(modelId)] || []).filter((entry) => {
    const disabledUntilMs = new Date(entry.disabledUntil).getTime();
    return Number.isFinite(disabledUntilMs) && disabledUntilMs > now;
  });
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
  speed?: string,
) => {
  const normalizedServerId = normalizeServer(serverId);
  if (!normalizedServerId) return true;
  if (getDisabledServersForModel(config, modelId).includes(normalizedServerId)) {
    return false;
  }

  const normalizedSpeed = normalizeSpeed(speed);
  if (!normalizedSpeed) {
    return true;
  }

  return !getActiveAutoDisabledServerCombosForModel(config, modelId).some(
    (entry) => entry.serverId === normalizedServerId && entry.speed === normalizedSpeed,
  );
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
  pricingEntries.filter((entry) => isServerEnabledForModel(config, entry.model, entry.server, entry.speed));

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
  const displayName =
    tier === 'flash' ? 'Nano Banana 2' :
    tier === 'pro' ? 'Nano Banana PRO' :
    'GPT Image 2';
  return {
    modelId,
    displayName,
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

const parseGptImage2ConfigKey = (configKey?: string) => {
  const match = String(configKey || '').trim().toLowerCase().match(/^(1k|2k|4k)-(low|medium|high)(?:-(fast|slow))?/);
  return {
    resolution: match?.[1],
    quality: match?.[2],
    speed: match?.[3],
  };
};

export const parseDurationSeconds = (value?: string | number | null) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  const match = String(value || '').trim().toLowerCase().match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
};

export const isPerSecondVideoBillingModel = (modelId: string) =>
  normalizeModelId(modelId).startsWith('kling-');

export const isPerSecondMotionBillingModel = (modelId: string) =>
  normalizeModelId(modelId).startsWith('motion-control-') ||
  normalizeModelId(modelId).startsWith('kling-');

export const isPerSecondBillingModel = (modelId: string, type?: TstMediaType) =>
  type === 'motion-control'
    ? isPerSecondMotionBillingModel(modelId)
    : type === 'video'
      ? isPerSecondVideoBillingModel(modelId)
      : isPerSecondVideoBillingModel(modelId) || isPerSecondMotionBillingModel(modelId);

export const getPerSecondPricingKey = ({
  modelId,
  serverId,
  resolution,
  speed,
  audio,
}: {
  modelId: string;
  serverId?: string;
  resolution?: string;
  speed?: string;
  audio?: boolean;
}) =>
  [
    normalizeModelId(modelId),
    normalizeServer(serverId),
    normalizeResolution(resolution),
    normalizeSpeed(speed),
    typeof audio === 'boolean' ? `audio-${audio ? 'on' : 'off'}` : '',
    'per-second',
  ].filter(Boolean).join('|');

const parseVideoConfigKey = (configKey?: string) => {
  const normalized = String(configKey || '').trim().toLowerCase();
  const resolution = normalized.match(/(?:^|[-_|])(480p|720p|1080p|1k|2k|4k)(?:$|[-_|])/)?.[1];
  const duration = normalized.match(/(?:^|[-_|])(\d+s)(?:$|[-_|])/)?.[1];
  const speed = normalized.match(/(?:^|[-_|])(fast|slow)(?:$|[-_|])/)?.[1];
  const audioToken = normalized.match(/(?:^|[-_|])audio[-_]?(on|off|true|false)(?:$|[-_|])/)?.[1];
  return {
    resolution,
    duration,
    speed,
    audio: audioToken ? ['on', 'true'].includes(audioToken) : undefined,
  };
};

const mapPricingEntry = (entry: any): TstPricingEntry => {
  const model = String(entry.model || '');
  const configKey = String(entry.config_key || '');
  let resolution = entry.resolution ? String(entry.resolution) : undefined;
  let quality = entry.quality ? String(entry.quality) : undefined;
  let speed = entry.speed ? String(entry.speed) : undefined;
  let duration = entry.duration ? String(entry.duration) : undefined;
  let audio = entry.audio === true;

  if (normalizeModelId(model) === 'image-gpt-2') {
    const parsed = parseGptImage2ConfigKey(configKey);
    if (parsed.resolution) {
      resolution = parsed.resolution;
    }
    if (parsed.quality) {
      quality = parsed.quality;
    } else if (resolution && GPT_IMAGE_QUALITY_VALUES.includes(normalizeQuality(resolution))) {
      quality = resolution;
      resolution = undefined;
    }
    if (!speed && parsed.speed) {
      speed = parsed.speed;
    }
  } else {
    const parsed = parseVideoConfigKey(configKey);
    resolution = resolution || parsed.resolution;
    duration = duration || parsed.duration;
    speed = speed || parsed.speed;
    audio = entry.audio === true || parsed.audio === true;
  }

  return {
    model,
    server: String(entry.server || ''),
    config_key: configKey,
    credits: Number(entry.credits || 0),
    resolution,
    quality,
    speed,
    duration,
    audio,
  };
};

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
  quality,
  speed,
  serverId,
  duration,
}: {
  modelId: string;
  pricingEntries: TstPricingEntry[];
  resolution?: string;
  quality?: string;
  speed?: string;
  serverId?: string;
  duration?: string;
}) => {
  const normalizedResolution = resolution ? normalizeResolution(resolution) : null;
  const normalizedQuality = quality ? normalizeQuality(quality) : null;
  const normalizedSpeed = speed ? normalizeSpeed(speed) : null;
  const normalizedServer = serverId ? normalizeServer(serverId) : null;
  const normalizedDuration = duration ? normalizeDuration(duration) : null;

  return getPricingEntriesForModel(modelId, pricingEntries).filter((entry) => {
    if (normalizedResolution && normalizeResolution(entry.resolution) !== normalizedResolution) return false;
    if (normalizedQuality && normalizeQuality(entry.quality) !== normalizedQuality) return false;
    if (normalizedSpeed && normalizeSpeed(entry.speed) !== normalizedSpeed) return false;
    if (normalizedServer && normalizeServer(entry.server) !== normalizedServer) return false;
    if (normalizedDuration && normalizeDuration(entry.duration) !== normalizedDuration) {
      const perSecondModel = isPerSecondBillingModel(modelId, 'video');
      if (!perSecondModel || normalizeDuration(entry.duration)) return false;
    }
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
  sortByOrder(
    unique([
      ...((model.capabilities?.aspect_ratios || []) as string[]),
      ...((model.capabilities?.aspectRatios || []) as string[]),
      ...(TST_DOCS_VIDEO_ASPECT_RATIO_FALLBACKS[normalizeModelId(model.model)] || []),
    ].map((value) => String(value).trim()).filter(Boolean)),
    ASPECT_RATIO_ORDER,
  );

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
  if (normalized === 'slow') return 'Tiết kiệm';
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
    const url = forceRefresh ? '/api/tst-models-pricing?force=1' : '/api/tst-models-pricing';
    pricingPromise = fetchCatalogJsonWithRetry(url, 'Failed to load TST pricing')
      .then(async (data) => {
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
    const url = forceRefresh ? '/api/tst-models?force=1' : '/api/tst-models';
    modelsPromise = fetchCatalogJsonWithRetry(url, 'Failed to load TST models')
      .then(async (data) => {
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
  quality,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  speed?: string;
  resolution?: TstResolution;
  quality?: string;
}) => {
  const entries = getMatchingEntries({
    modelId: tierToModelId[tier],
    pricingEntries,
    speed,
    resolution,
    quality,
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
  quality,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  resolution?: TstResolution;
  quality?: string;
}) => {
  const entries = getMatchingEntries({
    modelId: tierToModelId[tier],
    pricingEntries,
    serverId,
    resolution,
    quality,
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
  quality,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  serverId?: string;
  speed?: string;
  quality?: string;
}) => {
  const entries = getMatchingEntries({
    modelId: tierToModelId[tier],
    pricingEntries,
    serverId,
    speed,
    quality,
  });
  if (entries.length === 0) {
    return [];
  }
  return getUniqueResolutions(entries).map((value) => value.toUpperCase()) as TstResolution[];
};

export const resolveGenerationSelection = ({
  tier,
  pricingEntries = [],
  resolution,
  quality,
  speed,
  serverId,
}: {
  tier: TstGenerationTier;
  pricingEntries?: TstPricingEntry[];
  resolution: TstResolution;
  quality?: string;
  speed: string;
  serverId: string;
}) => {
  const modelId = tierToModelId[tier];
  const modelEntries = getPricingEntriesForModel(modelId, pricingEntries);
  if (modelEntries.length === 0) {
    return { resolution, speed, serverId, available: false };
  }

  const normalizedResolution = normalizeResolution(resolution);
  const normalizedQuality = normalizeQuality(quality);
  const normalizedSpeed = normalizeSpeed(speed);
  const normalizedServer = normalizeServer(serverId);
  const exactEntry = modelEntries.find(
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) &&
      normalizeSpeed(entry.speed) === normalizedSpeed &&
      normalizeServer(entry.server) === normalizedServer,
  );

  if (exactEntry) {
    return { resolution, speed, serverId, available: true };
  }

  const nextEntry =
    modelEntries.find(
      (entry) =>
        normalizeResolution(entry.resolution) === normalizedResolution &&
        (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) &&
        normalizeSpeed(entry.speed) === normalizedSpeed,
    ) ||
    modelEntries.find((entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality)
    ) ||
    modelEntries.find((entry) => !normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) ||
    modelEntries[0];

  return {
    resolution: (normalizeResolution(nextEntry.resolution).toUpperCase() || resolution) as TstResolution,
    speed: normalizeSpeed(nextEntry.speed) || speed,
    serverId: normalizeServer(nextEntry.server) || serverId,
    available: true,
  };
};

export const getGenerationCostBreakdown = ({
  tier,
  resolution,
  quality,
  speed,
  serverId,
  pricingEntries = [],
  pricingOverrides = [],
}: {
  tier: TstGenerationTier;
  resolution: TstResolution;
  quality?: string;
  speed: string;
  serverId: string;
  pricingEntries?: TstPricingEntry[];
  pricingOverrides?: AuditionPricingOverride[];
}): TstGenerationCostBreakdown => {
  const modelId = tierToModelId[tier];
  const modelEntries = getPricingEntriesForModel(modelId, pricingEntries);
  const normalizedResolution = normalizeResolution(resolution);
  const normalizedQuality = normalizeQuality(quality);
  const normalizedSpeed = normalizeSpeed(speed);
  const normalizedServer = normalizeServer(serverId);

  const exactEntry = pickExactEntry(modelEntries, [
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) &&
      normalizeSpeed(entry.speed) === normalizedSpeed,
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) &&
      normalizedSpeed === 'fast' &&
      !entry.speed,
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) &&
      normalizeSpeed(entry.speed) === normalizedSpeed,
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      (!normalizedQuality || normalizeQuality(entry.quality) === normalizedQuality) &&
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
  quality,
  speed,
  serverId,
  pricingEntries = [],
  pricingOverrides = [],
}: {
  tier: TstGenerationTier;
  quality?: string;
  speed: string;
  serverId: string;
  pricingEntries?: TstPricingEntry[];
  pricingOverrides?: AuditionPricingOverride[];
}) =>
  Object.fromEntries(
    (['1K', '2K', '4K'] as TstResolution[]).map((resolution) => [
      resolution,
      getGenerationCostBreakdown({ tier, resolution, quality, speed, serverId, pricingEntries, pricingOverrides }),
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
    const capabilityDurations = sortByOrder(
      unique(((model.capabilities?.durations || []) as string[]).map((value) => normalizeCatalogDuration(value)).filter(Boolean)),
      DURATION_ORDER,
    );
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
      durations: durations.length > 0 ? durations : (capabilityDurations.length > 0 ? capabilityDurations : fallback.durations),
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
  const perSecondModel = isPerSecondVideoBillingModel(modelId);
  const matchesVideoDuration = (entry: TstPricingEntry) =>
    normalizeDuration(entry.duration) === normalizedDuration ||
    (perSecondModel && !normalizeDuration(entry.duration));

  const exactEntry = pickExactEntry(modelEntries, [
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      matchesVideoDuration(entry) &&
      normalizeSpeed(entry.speed) === normalizedSpeed &&
      matchesAudioSelection(entry.audio, audio),
    (entry) =>
      normalizeServer(entry.server) === normalizedServer &&
      normalizeResolution(entry.resolution) === normalizedResolution &&
      matchesVideoDuration(entry) &&
      normalizedSpeed === 'fast' &&
      !entry.speed &&
      matchesAudioSelection(entry.audio, audio),
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      matchesVideoDuration(entry) &&
      normalizeSpeed(entry.speed) === normalizedSpeed &&
      matchesAudioSelection(entry.audio, audio),
    (entry) =>
      normalizeResolution(entry.resolution) === normalizedResolution &&
      matchesVideoDuration(entry) &&
      normalizedSpeed === 'fast' &&
      !entry.speed &&
      matchesAudioSelection(entry.audio, audio),
  ]);

  if (exactEntry) {
    const fallbackVcoin = creditsToVcoin(exactEntry.credits);
    if (perSecondModel) {
      const billedSeconds = Math.max(1, parseDurationSeconds(duration));
      const unitConfigKey = getPerSecondPricingKey({ modelId, serverId, resolution, speed, audio });
      const entryDurationSeconds = parseDurationSeconds(exactEntry.duration);
      const unitFallbackVcoin = entryDurationSeconds > 1
        ? Math.max(1, Math.ceil(fallbackVcoin / entryDurationSeconds))
        : fallbackVcoin;
      const unitVcoin = getAuditionPrice(modelId, unitConfigKey, unitFallbackVcoin, pricingOverrides);
      return {
        available: true,
        credits: exactEntry.credits,
        vcoin: unitVcoin * billedSeconds,
        configKey: unitConfigKey,
        modelId,
        billingUnit: 'second',
        unitVcoin,
        billedSeconds,
      };
    }
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
  durationSeconds,
  pricingEntries = [],
  pricingOverrides = [],
}: {
  modelId: string;
  serverId: string;
  resolution: string;
  speed?: string;
  durationSeconds?: number | null;
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
    if (isPerSecondMotionBillingModel(modelId)) {
      const billedSeconds = Math.max(1, Math.ceil(durationSeconds || 1));
      const unitConfigKey = getPerSecondPricingKey({ modelId, serverId, resolution, speed });
      const entryDurationSeconds = parseDurationSeconds(exactEntry.duration);
      const unitFallbackVcoin = entryDurationSeconds > 1
        ? Math.max(1, Math.ceil(fallbackVcoin / entryDurationSeconds))
        : fallbackVcoin;
      const unitVcoin = getAuditionPrice(modelId, unitConfigKey, unitFallbackVcoin, pricingOverrides);
      return {
        available: true,
        credits: exactEntry.credits,
        vcoin: unitVcoin * billedSeconds,
        configKey: unitConfigKey,
        modelId,
        billingUnit: 'second',
        unitVcoin,
        billedSeconds,
      };
    }
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
    const perSecond = isPerSecondBillingModel(entry.model, type);
    const defaultVcoin = creditsToVcoin(entry.credits);
    const durationSeconds = Math.max(1, parseDurationSeconds(entry.duration) || 1);
    return {
      type: type || (normalizeModelId(entry.model).includes('motion-control') ? 'motion-control' : 'image'),
      modelId: entry.model,
      modelName: model.name || entry.model,
      server: normalizeCatalogServer(entry.server),
      resolution: entry.resolution,
      quality: entry.quality,
      duration: entry.duration,
      speed: normalizeCatalogSpeed(entry.speed) || undefined,
      audio: entry.audio,
      credits: entry.credits,
      vcoin: perSecond ? Math.max(1, Math.ceil(defaultVcoin / durationSeconds)) : defaultVcoin,
      configKey: perSecond
        ? getPerSecondPricingKey({
            modelId: entry.model,
            serverId: entry.server,
            resolution: entry.resolution,
            speed: entry.speed,
            audio: entry.audio,
          })
        : entry.config_key,
      billingUnit: perSecond ? 'second' : 'flat',
    };
  });

  return [...rows.filter((row): row is TstPricingRow => row !== null), ...getVertexEditPricingRows()]
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.modelName !== b.modelName) return a.modelName.localeCompare(b.modelName);
      if ((a.server || '') !== (b.server || '')) return (a.server || '').localeCompare(b.server || '');
      if ((a.resolution || '') !== (b.resolution || '')) return (a.resolution || '').localeCompare(b.resolution || '');
      if ((a.quality || '') !== (b.quality || '')) return (a.quality || '').localeCompare(b.quality || '');
      if ((a.duration || '') !== (b.duration || '')) return (a.duration || '').localeCompare(b.duration || '');
      return a.credits - b.credits;
    });
};
