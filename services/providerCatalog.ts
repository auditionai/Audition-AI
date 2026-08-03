import type { TstPricingRow } from './tstCatalog';

export type GommoCatalogPrice = {
  mode: string | null;
  resolution: string | null;
  duration: string | null;
  price: number;
};

export type GommoCatalogModel = {
  model: string;
  name: string;
  status: string;
  server: string;
  price: number | null;
  rateType: string;
  prices: GommoCatalogPrice[];
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
};

const normalize = (value?: string | number | null) => String(value || '').trim().toLowerCase();
const normalizeDuration = (value?: string | number | null) => normalize(value).replace(/s$/, '');

export const fetchProviderCatalog = async (forceRefresh = false): Promise<GommoProviderCatalog> => {
  const response = await fetch(forceRefresh ? '/api/provider-catalog?force=1' : '/api/provider-catalog');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load provider catalog');
  }
  return payload.gommo as GommoProviderCatalog;
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
  let candidates = model.prices.filter((price) => {
    if (resolution && price.resolution && normalize(price.resolution) !== resolution) return false;
    if (duration && price.duration && normalizeDuration(price.duration) !== duration) return false;
    return Number.isFinite(price.price);
  });
  if (candidates.length === 0) {
    candidates = model.prices.filter((price) => Number.isFinite(price.price));
  }
  const values = candidates.map((price) => Number(price.price));
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
  };
};
