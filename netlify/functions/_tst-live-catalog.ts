import { getServerAvailabilityConfig, isServerAllowedBySnapshot } from './_server-availability';

const TST_API_BASE = 'https://api.tramsangtao.com/v1';
export const TST_LIVE_CATALOG_TTL_MS = 60_000;

type TstProviderPricingEntry = {
  model: string;
  server?: string;
  config_key?: string;
  credits?: number;
  resolution?: string;
  quality?: string;
  speed?: string;
  duration?: string;
  audio?: boolean;
};

type TstProviderModel = {
  model: string;
  name?: string;
  type?: string;
  servers?: string[];
  capabilities?: {
    resolutions?: string[] | null;
    durations?: string[] | null;
    aspect_ratios?: string[] | null;
    aspectRatios?: string[] | null;
    slow_mode?: boolean;
    audio?: boolean;
  };
};

let pricingCache: TstProviderPricingEntry[] | null = null;
let pricingFetchedAt = 0;
let pricingPromise: Promise<TstProviderPricingEntry[]> | null = null;
let modelsCache: TstProviderModel[] | null = null;
let modelsFetchedAt = 0;
let modelsPromise: Promise<TstProviderModel[]> | null = null;

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();
const normalizeSpeed = (value?: string | null) => normalize(value || 'fast');
const normalizeResolution = (value?: string | null) => normalize(value);
const normalizeQuality = (value?: string | null) => normalize(value);
const normalizeDuration = (value?: string | null) => normalize(value);
const normalizeServer = (value?: string | null) => normalize(value);
const isFresh = (timestamp: number) => timestamp > 0 && Date.now() - timestamp < TST_LIVE_CATALOG_TTL_MS;

const getApiKey = () => {
  const apiKey = process.env.TST_API_KEY;
  if (!apiKey) {
    throw new Error('TST_UNAVAILABLE: Missing TST_API_KEY environment variable');
  }
  return apiKey;
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error || data?.message || data?.detail || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const fetchCatalogEndpoint = async (path: string) => {
  const apiKey = getApiKey();
  const response = await fetch(`${TST_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`TST_UNAVAILABLE: ${await parseErrorMessage(response)}`);
  }

  return response.json();
};

const parseGptImage2ConfigKey = (configKey?: string) => {
  const match = String(configKey || '').trim().toLowerCase().match(/^(1k|2k|4k)-(low|medium|high)(?:-(fast|slow))?/);
  return {
    resolution: match?.[1],
    quality: match?.[2],
    speed: match?.[3],
  };
};

const normalizePricingEntryForValidation = (entry: TstProviderPricingEntry): TstProviderPricingEntry => {
  if (normalize(entry.model) !== 'image-gpt-2') {
    return entry;
  }
  const parsed = parseGptImage2ConfigKey(entry.config_key);
  return {
    ...entry,
    resolution: parsed.resolution || entry.resolution,
    quality: parsed.quality || entry.quality || entry.resolution,
    speed: entry.speed || parsed.speed,
  };
};

export const getTstCatalogMetadata = () => ({
  ttlMs: TST_LIVE_CATALOG_TTL_MS,
  pricingFetchedAt: pricingFetchedAt || null,
  pricingExpiresAt: pricingFetchedAt ? pricingFetchedAt + TST_LIVE_CATALOG_TTL_MS : null,
  modelsFetchedAt: modelsFetchedAt || null,
  modelsExpiresAt: modelsFetchedAt ? modelsFetchedAt + TST_LIVE_CATALOG_TTL_MS : null,
});

export const clearTstLiveCatalogCache = () => {
  pricingCache = null;
  pricingFetchedAt = 0;
  pricingPromise = null;
  modelsCache = null;
  modelsFetchedAt = 0;
  modelsPromise = null;
};

export const getTstProviderPricing = async (forceRefresh = false): Promise<TstProviderPricingEntry[]> => {
  if (forceRefresh) {
    pricingCache = null;
    pricingFetchedAt = 0;
    pricingPromise = null;
  }

  if (pricingCache && isFresh(pricingFetchedAt)) {
    return pricingCache;
  }

  if (!pricingPromise) {
    pricingPromise = fetchCatalogEndpoint('/models/pricing')
      .then((data) => {
        pricingCache = Array.isArray(data?.pricing) ? data.pricing.map(normalizePricingEntryForValidation) : [];
        pricingFetchedAt = Date.now();
        return pricingCache;
      })
      .finally(() => {
        pricingPromise = null;
      })
      .catch((error) => {
        pricingCache = null;
        pricingFetchedAt = 0;
        throw error;
      });
  }

  return pricingPromise;
};

export const getTstProviderModels = async (forceRefresh = false): Promise<TstProviderModel[]> => {
  if (forceRefresh) {
    modelsCache = null;
    modelsFetchedAt = 0;
    modelsPromise = null;
  }

  if (modelsCache && isFresh(modelsFetchedAt)) {
    return modelsCache;
  }

  if (!modelsPromise) {
    modelsPromise = fetchCatalogEndpoint('/models')
      .then((data) => {
        modelsCache = Array.isArray(data?.models) ? data.models : [];
        modelsFetchedAt = Date.now();
        return modelsCache;
      })
      .finally(() => {
        modelsPromise = null;
      })
      .catch((error) => {
        modelsCache = null;
        modelsFetchedAt = 0;
        throw error;
      });
  }

  return modelsPromise;
};

const getMatchingPricingEntries = (modelId: string, pricing: TstProviderPricingEntry[]) =>
  pricing.filter((entry) => normalize(entry.model) === normalize(modelId));

const matchesFastSpeed = (entrySpeed?: string, requestedSpeed?: string) => {
  const normalizedRequested = normalizeSpeed(requestedSpeed);
  const normalizedEntry = normalizeSpeed(entrySpeed);
  if (!requestedSpeed) return true;
  if (normalizedEntry === normalizedRequested) return true;
  return normalizedRequested === 'fast' && !normalize(entrySpeed);
};

const getAspectRatios = (model: TstProviderModel) => {
  const ratios = [
    ...((model.capabilities?.aspect_ratios || []) as string[]),
    ...((model.capabilities?.aspectRatios || []) as string[]),
  ].map((value) => String(value).trim());
  return Array.from(new Set(ratios.filter(Boolean)));
};

const findPricingMatch = (
  entries: TstProviderPricingEntry[],
  {
    serverId,
    resolution,
    quality,
    duration,
    speed,
    audio,
  }: {
    serverId?: string;
    resolution?: string;
    quality?: string;
    duration?: string;
    speed?: string;
    audio?: boolean;
  },
) => entries.find((entry) => {
  if (serverId && normalizeServer(entry.server) !== normalizeServer(serverId)) return false;
  if (resolution && normalizeResolution(entry.resolution) !== normalizeResolution(resolution)) return false;
  if (quality && normalizeQuality(entry.quality) !== normalizeQuality(quality)) return false;
  if (duration && normalizeDuration(entry.duration) !== normalizeDuration(duration)) return false;
  if (!matchesFastSpeed(entry.speed, speed)) return false;
  if (typeof audio === 'boolean' && typeof entry.audio === 'boolean' && entry.audio !== audio) return false;
  return true;
});

export const validateQueuePayloadAgainstLiveCatalog = async (
  queueKind: string,
  queuePayload: Record<string, unknown> | null | undefined,
) => {
  if (!queuePayload || typeof queuePayload !== 'object') {
    throw new Error('INVALID_TST_CONFIG: Queue payload is missing');
  }

  const [models, pricing, serverAvailabilityConfig] = await Promise.all([
    getTstProviderModels(),
    getTstProviderPricing(),
    getServerAvailabilityConfig(),
  ]);
  const modelId = normalize(String(queuePayload.model || ''));

  if (!modelId) {
    throw new Error('INVALID_TST_CONFIG: Missing model id');
  }

  const model = models.find((entry) => normalize(entry.model) === modelId);
  if (!model) {
    throw new Error(`INVALID_TST_CONFIG: Model ${modelId} is not available on TST`);
  }

  const expectedType =
    queueKind === 'image_generate' ? 'image' :
    queueKind === 'video_generate' ? 'video' :
    queueKind === 'motion_generate' ? 'motion-control' :
    '';

  if (expectedType && normalize(model.type) !== expectedType) {
    throw new Error(`INVALID_TST_CONFIG: Model ${modelId} is not available for ${queueKind}`);
  }

  const modelPricing = getMatchingPricingEntries(modelId, pricing).filter(
    (entry) => isServerAllowedBySnapshot(serverAvailabilityConfig, modelId, entry.server, entry.speed),
  );
  if (modelPricing.length === 0) {
    throw new Error(`INVALID_TST_CONFIG: Model ${modelId} has no live pricing on TST`);
  }

  const serverId = normalizeServer(String(queuePayload.server_id || ''));
  const resolution = normalizeResolution(String(queuePayload.resolution || ''));
  const quality = normalizeQuality(String(queuePayload.quality || ''));
  const duration = normalizeDuration(String(queuePayload.duration || ''));
  const speed = normalizeSpeed(String(queuePayload.speed || ''));
  const audio = typeof queuePayload.audio === 'boolean' ? queuePayload.audio : undefined;
  const aspectRatio = String(queuePayload.aspect_ratio || '').trim();

  if (serverId && !isServerAllowedBySnapshot(serverAvailabilityConfig, modelId, serverId, speed)) {
    throw new Error(`INVALID_TST_CONFIG: Server ${serverId} đang tạm ẩn do quá tải ở chế độ ${speed || 'default'}. Vui lòng chọn server khác.`);
  }

  if (serverId && Array.isArray(model.servers) && model.servers.length > 0) {
    const availableServers = model.servers
      .map((value) => normalizeServer(value))
      .filter((value) => !(serverAvailabilityConfig.disabledByModel[modelId] || []).includes(value));
    if (!availableServers.includes(serverId)) {
      throw new Error(`INVALID_TST_CONFIG: Server ${serverId} is disabled for ${modelId}`);
    }
  }

  if (resolution && Array.isArray(model.capabilities?.resolutions) && model.capabilities!.resolutions!.length > 0) {
    const availableResolutions = model.capabilities!.resolutions!.map((value) => normalizeResolution(value));
    if (!availableResolutions.includes(resolution)) {
      throw new Error(`INVALID_TST_CONFIG: Resolution ${resolution} is disabled for ${modelId}`);
    }
  }

  if (duration && Array.isArray(model.capabilities?.durations) && model.capabilities!.durations!.length > 0) {
    const availableDurations = model.capabilities!.durations!.map((value) => normalizeDuration(value));
    if (!availableDurations.includes(duration)) {
      throw new Error(`INVALID_TST_CONFIG: Duration ${duration} is disabled for ${modelId}`);
    }
  }

  if (speed === 'slow' && model.capabilities?.slow_mode !== true) {
    throw new Error(`INVALID_TST_CONFIG: Slow mode is disabled for ${modelId}`);
  }

  if (audio === true && model.capabilities?.audio !== true) {
    throw new Error(`INVALID_TST_CONFIG: Audio is disabled for ${modelId}`);
  }

  const aspectRatios = getAspectRatios(model);
  if (aspectRatio && aspectRatios.length > 0 && !aspectRatios.includes(aspectRatio)) {
    throw new Error(`INVALID_TST_CONFIG: Aspect ratio ${aspectRatio} is disabled for ${modelId}`);
  }

  const pricingMatch = findPricingMatch(modelPricing, {
    serverId: serverId || undefined,
    resolution: resolution || undefined,
    quality: quality || undefined,
    duration: duration || undefined,
    speed: speed || undefined,
    audio,
  });

  if (!pricingMatch) {
    throw new Error(`INVALID_TST_CONFIG: Selected configuration is no longer available for ${modelId}`);
  }

  return {
    modelId,
    modelName: model.name || model.model,
    pricingMatch,
  };
};
