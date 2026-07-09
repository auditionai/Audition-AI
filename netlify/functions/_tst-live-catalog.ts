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
const ASPECT_RATIO_ORDER = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];
const TST_DOCS_VIDEO_ASPECT_RATIO_FALLBACKS: Record<string, string[]> = {
  'seedance-2.0-fast': ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
  'seedance-2.0': ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
  'grok-i2v': ['9:16', '16:9', '1:1'],
  'kling-o1-video': ['9:16', '16:9', '1:1'],
  'kling-3.0-video': ['16:9', '9:16', '1:1'],
};
const GROK_VIDEO_DURATIONS = ['5s', '10s'];

const sortByOrder = (values: string[], order: string[]) =>
  [...values].sort((a, b) => {
    const rankA = order.indexOf(a);
    const rankB = order.indexOf(b);
    const resolvedRankA = rankA === -1 ? order.length : rankA;
    const resolvedRankB = rankB === -1 ? order.length : rankB;
    if (resolvedRankA !== resolvedRankB) return resolvedRankA - resolvedRankB;
    return a.localeCompare(b);
  });

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

const parseVideoConfigKey = (configKey?: string) => {
  const normalized = String(configKey || '').trim().toLowerCase();
  const resolution = normalized.match(/(?:^|[-_|])(480p|720p|1080p|1k|2k|4k)(?:$|[-_|])/)?.[1];
  const durationToken = normalized.match(/(?:^|[-_|])(\d+(?:\.\d+)?s?)(?:$|[-_|])/)?.[1];
  const duration = durationToken ? (durationToken.endsWith('s') ? durationToken : `${durationToken}s`) : undefined;
  const speed = normalized.match(/(?:^|[-_|])(fast|slow)(?:$|[-_|])/)?.[1];
  const audioToken = normalized.match(/(?:^|[-_|])audio[-_]?(on|off|true|false)(?:$|[-_|])/)?.[1];
  return {
    resolution,
    duration,
    speed,
    audio: audioToken ? ['on', 'true'].includes(audioToken) : undefined,
  };
};

const getDefaultServerForModel = (modelId: string) =>
  normalize(modelId).startsWith('grok') ? 'default' : 'fast';

const isGrokModel = (modelId: string) => normalize(modelId).startsWith('grok');

const isDurationAllowedForModel = (modelId: string, duration?: string) => {
  const normalizedDuration = normalizeDuration(duration);
  if (!normalizedDuration) return true;
  return !isGrokModel(modelId) || GROK_VIDEO_DURATIONS.includes(normalizedDuration);
};

const serversMatchForModel = (modelId: string, entryServer?: string, requestedServer?: string) => {
  const normalizedRequested = normalizeServer(requestedServer);
  if (!normalizedRequested) return true;
  const normalizedEntry = normalizeServer(entryServer);
  if (normalizedEntry === normalizedRequested) return true;
  if (isGrokModel(modelId)) {
    const grokServerAliases = new Set(['default', 'fast']);
    return grokServerAliases.has(normalizedEntry) && grokServerAliases.has(normalizedRequested);
  }
  return false;
};

const matchesResolutionForModel = (modelId: string, entryResolution?: string, requestedResolution?: string) => {
  const normalizedRequested = normalizeResolution(requestedResolution);
  if (!normalizedRequested) return true;
  const normalizedEntry = normalizeResolution(entryResolution);
  if (normalizedEntry === normalizedRequested) return true;
  return isGrokModel(modelId) && !normalizedEntry;
};

const matchesDurationForModel = (modelId: string, entryDuration?: string, requestedDuration?: string) => {
  const normalizedRequested = normalizeDuration(requestedDuration);
  if (!normalizedRequested) return true;
  if (!isDurationAllowedForModel(modelId, normalizedRequested)) return false;
  const normalizedEntry = normalizeDuration(entryDuration);
  if (normalizedEntry === normalizedRequested) return true;
  const perSecondModel = normalize(modelId).startsWith('motion-control-');
  return (isGrokModel(modelId) || perSecondModel) && !normalizedEntry;
};

const normalizePricingEntryForValidation = (entry: TstProviderPricingEntry): TstProviderPricingEntry => {
  if (normalize(entry.model) === 'image-gpt-2') {
    const parsed = parseGptImage2ConfigKey(entry.config_key);
  return {
    ...entry,
    server: String((entry as any).server || (entry as any).server_id || (entry as any).serverId || getDefaultServerForModel(entry.model)),
    resolution: parsed.resolution || entry.resolution,
    quality: parsed.quality || entry.quality || entry.resolution,
    speed: entry.speed || parsed.speed,
    };
  }

  const parsed = parseVideoConfigKey(entry.config_key);
  return {
    ...entry,
    server: String((entry as any).server || (entry as any).server_id || (entry as any).serverId || getDefaultServerForModel(entry.model)),
    resolution: parsed.resolution || entry.resolution,
    duration: parsed.duration || entry.duration,
    speed: entry.speed || parsed.speed,
    audio: entry.audio === true || parsed.audio === true,
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
    ...(TST_DOCS_VIDEO_ASPECT_RATIO_FALLBACKS[normalize(model.model)] || []),
  ].map((value) => String(value).trim());
  return sortByOrder(Array.from(new Set(ratios.filter(Boolean))), ASPECT_RATIO_ORDER);
};

const findPricingMatch = (
  modelId: string,
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
  const isGptFastGenericEntry =
    normalize(modelId) === 'image-gpt-2' &&
    normalizeServer(entry.server) === 'fast' &&
    !normalizeResolution(entry.resolution) &&
    !normalizeQuality(entry.quality) &&
    normalizeSpeed(entry.speed) === 'fast';

  if (isGptFastGenericEntry) {
    if (serverId && normalizeServer(serverId) !== 'fast') return false;
    if (speed && normalizeSpeed(speed) !== 'fast') return false;
    return true;
  }

  if (!serversMatchForModel(modelId, entry.server, serverId)) return false;
  if (!matchesResolutionForModel(modelId, entry.resolution, resolution)) return false;
  if (quality && normalizeQuality(entry.quality) !== normalizeQuality(quality)) return false;
  if (!matchesDurationForModel(modelId, entry.duration, duration)) return false;
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
  const modelId = normalize(String(queuePayload.model || queuePayload.modelId || ''));

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

  const serverId = normalizeServer(String(queuePayload.server_id || queuePayload.serverId || ''));
  const resolution = normalizeResolution(String(queuePayload.resolution || ''));
  const quality = normalizeQuality(String(queuePayload.quality || ''));
  const duration = normalizeDuration(String(queuePayload.duration || ''));
  const speed = normalizeSpeed(String(queuePayload.speed || ''));
  const audio = typeof queuePayload.audio === 'boolean' ? queuePayload.audio : undefined;
  const aspectRatio = String(queuePayload.aspect_ratio || queuePayload.aspectRatio || '').trim();

  if (serverId && !isServerAllowedBySnapshot(serverAvailabilityConfig, modelId, serverId, speed)) {
    throw new Error(`INVALID_TST_CONFIG: Server ${serverId} đang tạm ẩn do quá tải ở chế độ ${speed || 'default'}. Vui lòng chọn server khác.`);
  }

  if (serverId && Array.isArray(model.servers) && model.servers.length > 0) {
    const availableServers = model.servers
      .map((value) => normalizeServer(value))
      .filter((value) => !(serverAvailabilityConfig.disabledByModel[modelId] || []).includes(value));
    const hasLivePricingForServer = modelPricing.some((entry) => serversMatchForModel(modelId, entry.server, serverId));
    if (!availableServers.includes(serverId) && !hasLivePricingForServer) {
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
    if (!availableDurations.includes(duration) || !isDurationAllowedForModel(modelId, duration)) {
      throw new Error(`INVALID_TST_CONFIG: Duration ${duration} is disabled for ${modelId}`);
    }
  } else if (duration && !isDurationAllowedForModel(modelId, duration)) {
    throw new Error(`INVALID_TST_CONFIG: Duration ${duration} is disabled for ${modelId}`);
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

  const pricingMatch = findPricingMatch(modelId, modelPricing, {
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
