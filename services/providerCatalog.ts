import type { TstPricingRow } from './tstCatalog';
import type { GenerationProviderConfig, GenerationProviderMode, ModelPricing } from './economyService';
import { DEFAULT_PROVIDER_BY_FEATURE, type GenerationProviderRouteKey } from '../shared/providerRouting';

export type GommoCatalogPrice = {
  mode: string | null;
  resolution: string | null;
  duration: string | null;
  price: number;
};

export type GommoCatalogModel = {
  auditionModelId: string;
  kind: 'image' | 'video' | 'motion';
  fallbackSupported: boolean;
  model: string;
  name: string;
  description: string;
  status: string;
  server: string;
  price: number | null;
  rateType: string;
  maxReferenceImages: number | null;
  supportsStartImage: boolean;
  supportsEndFrame: boolean;
  referenceField: 'subjects' | 'references' | 'images';
  prices: GommoCatalogPrice[];
  ratios: GommoCatalogOption[];
  resolutions: GommoCatalogOption[];
  durations: GommoCatalogOption[];
  modes: GommoCatalogOption[];
};

export type GommoCatalogOption = {
  name: string;
  type: string;
  description: string;
  group: string;
  groupSubtitle: string;
  status: string;
  statusMessage: string;
  adminEnabled?: boolean;
};

export const buildGommoCatalogPricingOptionId = (price: Pick<GommoCatalogPrice, 'mode' | 'resolution' | 'duration'>) => {
  const duration = normalizeDuration(price.duration);
  return [normalize(price.resolution), duration ? `${duration}s` : '', normalize(price.mode)]
    .filter(Boolean)
    .join('-') || 'default';
};

export const getGommoCatalogPricingOptionId = (
  model: GommoCatalogModel | null | undefined,
  input: { resolution?: string; duration?: string; providerMode?: string },
) => {
  if (!model?.prices?.length) return null;
  const resolution = normalize(input.resolution);
  const duration = normalizeDuration(input.duration);
  const providerMode = normalize(input.providerMode);
  const match = model.prices.find((price) => {
    const priceResolution = normalize(price.resolution);
    const priceDuration = normalizeDuration(price.duration);
    const priceMode = normalize(price.mode);
    return (!priceResolution || priceResolution === resolution)
      && (!priceDuration || priceDuration === duration)
      && (!priceMode || priceMode === providerMode);
  });
  return match ? buildGommoCatalogPricingOptionId(match) : null;
};

export type GommoProviderCatalog = {
  configured: boolean;
  domain: string;
  vndPerCredit: number | null;
  mappings: Array<{
    auditionModelId: string;
    gommoModelId: string;
    kind: 'image' | 'video' | 'motion';
    fallbackSupported: boolean;
  }>;
  models: GommoCatalogModel[];
};

export const GPTI2_SERVER_ID = 'gpti2';
export const GPTI2_SERVER_LABEL = 'AUDITION AI';

export const isSelectableGommoImageResolution = (auditionModelId: string, resolution: string) => {
  const modelId = String(auditionModelId || '').trim().toLowerCase();
  const normalizedResolution = String(resolution || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return !(modelId === 'image-gpt-2' && normalizedResolution === '4k_upscale');
};

export type GommoPriceComparison = {
  modelId: string;
  modelName: string;
  status: string;
  fallbackSupported: boolean;
  rateType: string;
  minCredits: number | null;
  maxCredits: number | null;
  minCostVcoin: number | null;
  maxCostVcoin: number | null;
  matchedMode?: string | null;
};

const normalize = (value?: string | number | null) => String(value || '').trim().toLowerCase();
const normalizeDuration = (value?: string | number | null) => normalize(value).replace(/s$/, '');

export const resolveProviderForModel = (
  config: GenerationProviderConfig | null | undefined,
  modelId: string,
  featureKey?: GenerationProviderRouteKey | null,
): GenerationProviderMode => {
  const normalizedModelId = normalize(modelId);
  const normalizedFeatureKey = normalize(featureKey);
  if (normalizedFeatureKey) {
    const priority = config?.providerPriorityByFeature?.[normalizedFeatureKey];
    if (Array.isArray(priority) && priority.length > 0) {
      const first = priority.find((provider) => provider === 'gpti2' || provider === 'tst' || provider === 'gommo');
      if (first) return normalizedFeatureKey === 'video_generation' || normalizedFeatureKey === 'motion_control'
        ? (first === 'gpti2' ? 'tst' : first)
        : first;
    }
    const featureProvider = config?.providerByFeature?.[normalizedFeatureKey];
    if (featureProvider) {
      return normalizedFeatureKey === 'video_generation' || normalizedFeatureKey === 'motion_control'
        ? (featureProvider === 'gpti2' ? 'tst' : featureProvider)
        : featureProvider;
    }
    const featureDefault = DEFAULT_PROVIDER_BY_FEATURE[normalizedFeatureKey as GenerationProviderRouteKey];
    if (featureDefault) return featureDefault;
    return config?.provider || 'tst';
  }
  return config?.providerByModel?.[normalizedModelId] || config?.provider || 'tst';
};

export const getGommoModelForAudition = (
  catalog: GommoProviderCatalog | null | undefined,
  modelId: string,
) => catalog?.models.find((model) => normalize(model.auditionModelId) === normalize(modelId)) || null;

export const isGommoCatalogModelAvailable = (model?: GommoCatalogModel | null) => {
  const status = normalize(model?.status || 'unavailable');
  return Boolean(model && !['maintenance', 'off', 'disabled', 'inactive', 'unavailable'].includes(status));
};

export const buildProviderPricingOptionCandidates = (input: {
  resolution?: string;
  quality?: string;
  speed?: string;
  duration?: string;
  audio?: boolean;
  providerMode?: string;
}) => {
  const resolution = normalize(input.resolution);
  const quality = normalize(input.quality);
  const speed = normalize(input.speed);
  const duration = normalizeDuration(input.duration);
  const durationWithSuffix = duration ? `${duration}s` : '';
  const providerMode = normalize(input.providerMode);
  return Array.from(new Set([
    providerMode ? [resolution, durationWithSuffix || duration, providerMode].filter(Boolean).join('-') : '',
    quality ? [resolution, quality, speed].filter(Boolean).join('-') : '',
    [resolution, durationWithSuffix, input.audio ? 'audio' : '', speed].filter(Boolean).join('-'),
    [resolution, duration, input.audio ? 'audio' : '', speed].filter(Boolean).join('-'),
    [resolution, durationWithSuffix, speed].filter(Boolean).join('-'),
    [resolution, duration, speed].filter(Boolean).join('-'),
    // Several Gommo video catalogs (notably Grok) publish a price per
    // resolution + duration while their selectable mode is metadata only.
    // Keep these exact keys ahead of generic mode/default fallbacks so the
    // storefront and the queue use the row edited in Admin.
    resolution && durationWithSuffix ? `${resolution}-${durationWithSuffix}` : '',
    resolution && duration ? `${resolution}-${duration}` : '',
    providerMode ? [resolution, providerMode].filter(Boolean).join('-') : '',
    providerMode ? [durationWithSuffix || duration, providerMode].filter(Boolean).join('-') : '',
    [resolution, speed].filter(Boolean).join('-'),
    providerMode,
    resolution,
    speed,
    speed ? `default-${speed}` : '',
    'default',
  ].filter(Boolean)));
};

export const getAuditionProviderPrice = (
  pricing: ModelPricing[],
  modelId: string,
  input: Parameters<typeof buildProviderPricingOptionCandidates>[0],
  options?: { allowGenericFallback?: boolean; preferredOptionId?: string | null },
) => {
  const rows = pricing.filter((row) => normalize(row.model_id) === normalize(modelId));
  const candidates = Array.from(new Set([
    normalize(options?.preferredOptionId),
    ...buildProviderPricingOptionCandidates(input),
  ].filter(Boolean))).filter((candidate) =>
    options?.allowGenericFallback === false
      ? !['default', normalize(input.speed), `default-${normalize(input.speed)}`].includes(candidate)
      : true,
  );
  const match = candidates
    .map((candidate) => rows.find((row) => normalize(row.option_id) === candidate))
    .find((row) => Number(row?.audition_price_vcoin) > 0);
  return match ? Math.ceil(Number(match.audition_price_vcoin)) : null;
};

export const getAuditionProviderPricing = (
  pricing: ModelPricing[],
  modelId: string,
  input: Parameters<typeof buildProviderPricingOptionCandidates>[0],
  options?: { allowGenericFallback?: boolean; preferredOptionId?: string | null },
) => {
  const rows = pricing.filter((row) => normalize(row.model_id) === normalize(modelId));
  const candidates = Array.from(new Set([
    normalize(options?.preferredOptionId),
    ...buildProviderPricingOptionCandidates(input),
  ].filter(Boolean))).filter((candidate) =>
    options?.allowGenericFallback === false
      ? !['default', normalize(input.speed), `default-${normalize(input.speed)}`].includes(candidate)
      : true,
  );
  const match = candidates
    .map((candidate) => rows.find((row) => normalize(row.option_id) === candidate))
    .find((row) => Number(row?.audition_price_vcoin) > 0);
  return match ? { optionId: match.option_id, vcoin: Math.ceil(Number(match.audition_price_vcoin)) } : null;
};

export const getGommoPricingInput = (
  modelId: string,
  input: Parameters<typeof buildProviderPricingOptionCandidates>[0],
) => {
  const normalizedModelId = normalize(modelId);
  const mode = normalize(input.providerMode);
  const modeQuality = ['low', 'medium', 'high'].find((quality) => mode === quality || mode.startsWith(`${quality}_`));
  const speed = normalizedModelId === 'seedance-2.0' || normalizedModelId === 'grok-i2v'
    ? 'standard'
    : normalizedModelId === 'nano-banana-pro' && mode === 'relaxed'
      ? 'slow'
      : input.speed || 'fast';
  const resolution = normalizedModelId === 'motion-control-2.6' || normalizedModelId === 'motion-control-3.0'
    ? mode === 'professional' ? '1080p' : mode === 'standard' ? '720p' : input.resolution
    : normalizedModelId.startsWith('kling-')
    ? mode.startsWith('professional') ? '1080p' : '720p'
    : input.resolution;
  return {
    ...input,
    resolution,
    quality: modeQuality || input.quality,
    speed,
    audio: mode.includes('audio') || input.audio === true,
  };
};

export const getMinimumAuditionModelPrice = (pricing: ModelPricing[], modelId: string) => {
  const values = pricing
    .filter((row) => normalize(row.model_id) === normalize(modelId))
    .map((row) => Number(row.audition_price_vcoin))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.ceil(Math.min(...values)) : null;
};

export const getMinimumAuditionCatalogModelPrice = (
  pricing: ModelPricing[],
  model: GommoCatalogModel | null | undefined,
) => {
  if (!model) return null;
  const currentOptionIds = new Set(model.prices.map(buildGommoCatalogPricingOptionId));
  const values = pricing
    .filter((row) => normalize(row.model_id) === normalize(model.auditionModelId))
    .filter((row) => currentOptionIds.has(normalize(row.option_id)))
    .map((row) => Number(row.audition_price_vcoin))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.ceil(Math.min(...values)) : null;
};

export const fetchProviderCatalog = async (
  forceRefresh = false,
  includeAdminDisabledServers = false,
): Promise<GommoProviderCatalog> => {
  const response = await fetch(forceRefresh ? '/api/provider-catalog?force=1' : '/api/provider-catalog');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load provider catalog');
  }
  const catalog = payload.gommo as GommoProviderCatalog;
  // Gommo is optional. The endpoint returns `gommo: null` when it is not
  // configured; that must not disable the independent TST/GPTi2 catalog.
  if (!catalog || typeof catalog !== 'object') {
    return {
      configured: false,
      domain: '',
      vndPerCredit: null,
      mappings: [],
      models: [],
    };
  }
  if (includeAdminDisabledServers) return catalog;
  return {
    ...catalog,
    models: catalog.models.map((model) => {
      const modes = model.modes.filter((mode) => mode.adminEnabled !== false);
      return {
        ...model,
        status: model.modes.length > 0 && modes.length === 0 ? 'disabled' : model.status,
        modes,
      };
    }),
  };
};

export const getGommoPriceComparison = (
  row: TstPricingRow,
  catalog?: GommoProviderCatalog | null,
): GommoPriceComparison | null => {
  if (!catalog?.configured) return null;
  const mapping = catalog.mappings.find((entry) => normalize(entry.auditionModelId) === normalize(row.modelId));
  if (!mapping) return null;
  const model = catalog.models.find((entry) => normalize(entry.model) === normalize(mapping.gommoModelId));
  if (!model) {
    return {
      modelId: mapping.gommoModelId,
      modelName: mapping.gommoModelId,
      status: 'unavailable',
      fallbackSupported: mapping.fallbackSupported,
      rateType: 'per_unit',
      minCredits: null,
      maxCredits: null,
      minCostVcoin: null,
      maxCostVcoin: null,
    };
  }

  const resolution = normalize(row.resolution);
  const duration = normalizeDuration(row.duration);
  const dimensionCandidates = model.prices.filter((price) => {
    if (resolution && price.resolution && normalize(price.resolution) !== resolution) return false;
    if (duration && price.duration && normalizeDuration(price.duration) !== duration) return false;
    return Number.isFinite(price.price);
  });
  const availableModes = Array.from(new Set(model.prices.map((price) => normalize(price.mode)).filter(Boolean)));
  const requestedMode = normalize(row.speed);
  const defaultMode = normalize(model.modes.find((mode) => mode.adminEnabled !== false)?.type)
    || availableModes[0]
    || '';
  const matchedMode = availableModes.includes(requestedMode) ? requestedMode : defaultMode;
  const exactCandidates = matchedMode
    ? dimensionCandidates.filter((price) => normalize(price.mode) === matchedMode)
    : dimensionCandidates;
  const candidates = exactCandidates.length > 0 ? exactCandidates : dimensionCandidates;
  const directProviderPrice = row.server === 'gommo' && Number.isFinite(Number(row.credits))
    ? Number(row.credits)
    : null;
  const values = directProviderPrice !== null
    ? [directProviderPrice]
    : candidates.map((price) => Number(price.price));
  if (values.length === 0 && Number.isFinite(Number(model.price))) {
    values.push(Number(model.price));
  }
  const minCredits = values.length ? Math.min(...values) : null;
  const maxCredits = values.length ? Math.max(...values) : null;
  const convertToVcoin = (credits: number | null) =>
    credits !== null && catalog.vndPerCredit
      ? Math.max(1, Math.ceil((credits * catalog.vndPerCredit) / 1000))
      : null;

  return {
    modelId: model.model,
    modelName: model.name,
    status: model.status || 'ON',
    fallbackSupported: mapping.fallbackSupported,
    rateType: model.rateType,
    minCredits,
    maxCredits,
    minCostVcoin: convertToVcoin(minCredits),
    maxCostVcoin: convertToVcoin(maxCredits),
    matchedMode: row.server === 'gommo' ? requestedMode || matchedMode : matchedMode,
  };
};
