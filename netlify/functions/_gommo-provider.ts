type QueueKind = 'image_generate' | 'video_generate' | 'motion_generate' | string;

export type GommoProviderKind = 'image' | 'video';

export type GommoModelPrice = {
  mode?: string;
  resolution?: string;
  duration?: string | number;
  price: number;
};

export type GommoModel = {
  id_base?: string;
  model: string;
  name: string;
  status?: string;
  server?: string;
  price?: number;
  rate_type?: string;
  prices?: GommoModelPrice[];
  ratios?: Array<{ name?: string; type?: string }>;
  resolutions?: Array<{ name?: string; type?: string }>;
  durations?: Array<{ name?: string; type?: string | number }>;
  mode?: Array<{ name?: string; type?: string; price?: number }>;
  modes?: Array<{ name?: string; type?: string; price?: number }>;
};

export type GommoCatalogMapping = {
  auditionModelId: string;
  gommoModelId: string;
  kind: GommoProviderKind | 'motion';
  fallbackSupported: boolean;
};

type GommoSubmitResult = {
  jobId: string;
  providerCost: number | null;
  mappedModelId: string;
};

const GOMMO_API_BASE = String(process.env.GOMMO_API_BASE || 'https://api.gommo.net').replace(/\/+$/, '');
const GOMMO_ACCESS_TOKEN = String(process.env.GOMMO_ACCESS_TOKEN || process.env.GOMMO_API_TOKEN || '').trim();
const GOMMO_DOMAIN = String(process.env.GOMMO_DOMAIN || 'vmedia.ai').trim();
const GOMMO_PROJECT_ID = String(process.env.GOMMO_PROJECT_ID || 'default').trim();
const GOMMO_TIMEOUT_MS = Math.max(5_000, Number(process.env.GOMMO_TIMEOUT_MS || 45_000));
const GOMMO_CATALOG_TTL_MS = Math.max(30_000, Number(process.env.GOMMO_CATALOG_TTL_MS || 5 * 60_000));

export const GOMMO_CATALOG_MAPPINGS: GommoCatalogMapping[] = [
  { auditionModelId: 'nano-banana-2', gommoModelId: 'google_image_gen_banana_2', kind: 'image', fallbackSupported: true },
  { auditionModelId: 'nano-banana-pro', gommoModelId: 'google_image_gen_banana_pro', kind: 'image', fallbackSupported: true },
  { auditionModelId: 'image-gpt-2', gommoModelId: 'imagegen_2_0', kind: 'image', fallbackSupported: true },
  { auditionModelId: 'seedance-2.0-fast', gommoModelId: 'seedance_20_pro', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'seedance-2.0', gommoModelId: 'seedance_20_pro', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'grok-i2v', gommoModelId: 'grok_video_heavy', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'kling-2.6', gommoModelId: 'kling_video_2_6', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'kling-o1-video', gommoModelId: 'kling_video_o1', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'kling-3.0-video', gommoModelId: 'kling_video_3_0', kind: 'video', fallbackSupported: true },
  // Gommo exposes equivalent motion models, but its public Create Video contract does
  // not document the required motion-video input. Keep them visible for price/status
  // comparison without dispatching production jobs through an undocumented payload.
  { auditionModelId: 'motion-control-2.6', gommoModelId: 'kling_video_motion', kind: 'motion', fallbackSupported: false },
  { auditionModelId: 'motion-control-3.0', gommoModelId: 'kling_video_motion_3', kind: 'motion', fallbackSupported: false },
];

const modelCache = new Map<GommoProviderKind, { fetchedAt: number; models: GommoModel[] }>();

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeDuration = (value: unknown) => normalize(value).replace(/s$/, '');
const normalizeResolution = (value: unknown) => normalize(value);
const normalizeRatio = (value: unknown) => String(value || '').trim().replace(/:/g, '_');

export const isGommoConfigured = () => Boolean(GOMMO_ACCESS_TOKEN && GOMMO_DOMAIN);

const getCredentials = () => {
  if (!isGommoConfigured()) {
    throw new Error('Missing GOMMO_ACCESS_TOKEN or GOMMO_DOMAIN environment variable');
  }
  return {
    access_token: GOMMO_ACCESS_TOKEN,
    domain: GOMMO_DOMAIN,
  };
};

const parseGommoError = (data: any, fallback: string) => {
  const value = data?.message || data?.error || data?.detail || fallback;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const postForm = async (path: string, values: Record<string, unknown>, timeoutMs = GOMMO_TIMEOUT_MS) => {
  const form = new URLSearchParams();
  const payload = { ...getCredentials(), ...values };

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === '') continue;
    form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  const response = await fetch(`${GOMMO_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.error === 1 || (data?.error && !data?.success && !data?.imageInfo && !data?.videoInfo)) {
    throw new Error(`GOMMO_ERROR: ${parseGommoError(data, `${response.status} ${response.statusText}`)}`);
  }

  return data;
};

export const getGommoModels = async (kind: GommoProviderKind, forceRefresh = false) => {
  const cached = modelCache.get(kind);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < GOMMO_CATALOG_TTL_MS) {
    return cached.models;
  }

  const data = await postForm('/ai/models', { type: kind });
  const models = Array.isArray(data?.data)
    ? data.data.filter((entry: any) => entry && typeof entry === 'object' && String(entry.model || '').trim()) as GommoModel[]
    : [];
  modelCache.set(kind, { fetchedAt: Date.now(), models });
  return models;
};

const getMapping = (modelId: unknown, queueKind: QueueKind) => {
  const normalizedModelId = normalize(modelId);
  const mapping = GOMMO_CATALOG_MAPPINGS.find((entry) => normalize(entry.auditionModelId) === normalizedModelId);
  if (!mapping || !mapping.fallbackSupported) return null;
  if (queueKind === 'image_generate' && mapping.kind !== 'image') return null;
  if (queueKind === 'video_generate' && mapping.kind !== 'video') return null;
  return mapping;
};

export const isGommoModelAvailable = (model: GommoModel) => {
  const status = normalize(model.status || 'on');
  return !['maintenance', 'off', 'disabled', 'inactive', 'unavailable'].includes(status);
};

const selectMode = (modelId: string, payload: Record<string, unknown>, model: GommoModel) => {
  const server = normalize(payload.server_id);
  const speed = normalize(payload.speed);
  const quality = normalize(payload.quality);
  const audio = payload.audio === true;
  const requested = (() => {
    switch (normalize(modelId)) {
      case 'seedance-2.0-fast': return 'fast';
      case 'seedance-2.0': return 'professional';
      case 'grok-i2v': return 'normal';
      case 'image-gpt-2': return quality || 'medium';
      case 'nano-banana-2':
      case 'nano-banana-pro':
        return server === 'vip3' ? 'vip3' : server === 'vip2' ? 'vip2' : 'vip';
      case 'kling-2.6':
        return audio ? 'professional_audio' : server.startsWith('vip') || speed === 'slow' ? 'professional' : 'standard';
      case 'kling-o1-video':
      case 'kling-3.0-video':
        return server.startsWith('vip') || speed === 'slow' ? 'professional' : 'standard';
      default:
        return speed || quality;
    }
  })();

  const modes = [...(model.modes || []), ...(model.mode || [])].map((entry) => normalize(entry.type)).filter(Boolean);
  if (requested && modes.includes(requested)) return requested;
  return modes[0] || requested || undefined;
};

const selectProviderPrice = (model: GommoModel, payload: Record<string, unknown>, mode?: string) => {
  const resolution = normalizeResolution(payload.resolution);
  const duration = normalizeDuration(payload.duration);
  const candidates = (model.prices || []).filter((entry) => {
    if (mode && entry.mode && normalize(entry.mode) !== normalize(mode)) return false;
    if (resolution && entry.resolution && normalizeResolution(entry.resolution) !== resolution) return false;
    if (duration && entry.duration && normalizeDuration(entry.duration) !== duration) return false;
    return Number.isFinite(Number(entry.price));
  });
  const exact = candidates.sort((a, b) => Number(a.price) - Number(b.price))[0];
  const fallback = Number(model.price);
  return exact ? Number(exact.price) : Number.isFinite(fallback) ? fallback : null;
};

const getSources = (payload: Record<string, unknown>) => {
  const raw = payload.img_url ?? payload.image_url;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
};

const readSourceImage = async (source: string) => {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) {
      throw new Error(`GOMMO_ERROR: Cannot read reference image (${response.status})`);
    }
    const contentType = String(response.headers.get('content-type') || 'image/jpeg').split(';', 1)[0];
    return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
  }

  const dataUrlMatch = source.match(/^data:([^;,]+);base64,(.+)$/is);
  const base64 = dataUrlMatch ? dataUrlMatch[2] : source;
  if (!/^[a-z0-9+/=\s]+$/i.test(base64)) {
    throw new Error('GOMMO_ERROR: Reference image must be an HTTP URL, data URL, or base64 value');
  }
  return {
    bytes: Buffer.from(base64.replace(/\s+/g, ''), 'base64'),
    contentType: dataUrlMatch?.[1] || 'image/jpeg',
  };
};

const uploadSourceImage = async (source: string) => {
  const { bytes, contentType } = await readSourceImage(source);
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const data = await postForm('/ai/image-upload', {
    data: bytes.toString('base64'),
    project_id: GOMMO_PROJECT_ID,
    file_name: `audition-reference.${extension}`,
    size: String(bytes.byteLength),
  }, 180_000);
  const imageInfo = data?.imageInfo;
  if (!imageInfo?.id_base || !imageInfo?.url) {
    throw new Error('GOMMO_ERROR: Upload image response is missing id_base or url');
  }
  return { id_base: String(imageInfo.id_base), url: String(imageInfo.url) };
};

export const canUseGommoForPayload = async (queueKind: QueueKind, payload: Record<string, unknown>) => {
  if (!isGommoConfigured()) return false;
  const mapping = getMapping(payload.model, queueKind);
  if (!mapping) return false;
  const models = await getGommoModels(mapping.kind as GommoProviderKind);
  return models.some((model) => normalize(model.model) === normalize(mapping.gommoModelId) && isGommoModelAvailable(model));
};

export const submitGommoJob = async (
  queueKind: QueueKind,
  payload: Record<string, unknown>,
): Promise<GommoSubmitResult> => {
  const mapping = getMapping(payload.model, queueKind);
  if (!mapping) {
    throw new Error(`GOMMO_UNSUPPORTED_MODEL: ${String(payload.model || 'unknown')}`);
  }

  const models = await getGommoModels(mapping.kind as GommoProviderKind);
  const model = models.find((entry) => normalize(entry.model) === normalize(mapping.gommoModelId));
  if (!model || !isGommoModelAvailable(model)) {
    throw new Error(`GOMMO_MODEL_UNAVAILABLE: ${mapping.gommoModelId}`);
  }

  const mode = selectMode(mapping.auditionModelId, payload, model);
  const providerCost = selectProviderPrice(model, payload, mode);
  const common = {
    model: mapping.gommoModelId,
    prompt: String(payload.prompt || '').trim(),
    project_id: GOMMO_PROJECT_ID,
  };

  if (queueKind === 'image_generate') {
    const subjects = getSources(payload).map((source) => /^https?:\/\//i.test(source)
      ? { id_base: '', url: source }
      : { id_base: '', data: source.replace(/^data:[^;,]+;base64,/i, '') });
    const data = await postForm('/ai/generateImage', {
      ...common,
      action_type: 'create',
      editImage: 'false',
      subjects: subjects.length ? subjects : undefined,
      ratio: normalizeRatio(payload.aspect_ratio),
    });
    const jobId = String(data?.imageInfo?.id_base || '').trim();
    if (!jobId) throw new Error('GOMMO_ERROR: Create Image did not return imageInfo.id_base');
    return { jobId, providerCost, mappedModelId: mapping.gommoModelId };
  }

  const imageSources = getSources(payload).slice(0, 2);
  const images = await Promise.all(imageSources.map(uploadSourceImage));
  const data = await postForm('/ai/create-video', {
    ...common,
    privacy: 'PRIVATE',
    translate_to_en: 'true',
    ratio: String(payload.aspect_ratio || '').trim() || undefined,
    resolution: normalizeResolution(payload.resolution) || undefined,
    duration: normalizeDuration(payload.duration) || undefined,
    mode,
    images: images.length ? images : undefined,
  });
  const jobId = String(data?.videoInfo?.id_base || '').trim();
  if (!jobId) throw new Error('GOMMO_ERROR: Create Video did not return videoInfo.id_base');
  return { jobId, providerCost, mappedModelId: mapping.gommoModelId };
};

export const pollGommoJob = async (queueKind: QueueKind, providerJobId: string) => {
  if (queueKind === 'image_generate') {
    const data = await postForm('/ai/image', { id_base: providerJobId });
    const status = normalize(data?.status);
    if (status === 'success' && data?.url) {
      return { ...data, status: 'completed', result: String(data.url), progress: 100 };
    }
    if (status === 'error' || status === 'failed') {
      return { ...data, status: 'failed', error: parseGommoError(data, 'Gommo image generation failed') };
    }
    if (status === 'pending_active' || status === 'pending_processing' || status === 'pending') {
      return { ...data, status: 'processing', progress: status.includes('processing') ? 75 : 60 };
    }
    return { ...data, status: 'failed', error: `Unexpected Gommo image status: ${status || 'empty'}` };
  }

  const data = await postForm('/ai/video', { videoId: providerJobId });
  const status = normalize(data?.status);
  if (status === 'media_generation_status_successful') {
    if (!data?.download_url) {
      return { ...data, status: 'processing', progress: 95 };
    }
    return { ...data, status: 'completed', result: String(data.download_url), progress: 100 };
  }
  if (status === 'media_generation_status_failed') {
    return { ...data, status: 'failed', error: parseGommoError(data, 'Gommo video generation failed') };
  }
  if (
    status === 'media_generation_status_pending' ||
    status === 'media_generation_status_active' ||
    status === 'media_generation_status_processing'
  ) {
    return { ...data, status: 'processing', progress: status.includes('processing') ? 75 : 60 };
  }
  return { ...data, status: 'failed', error: `Unexpected Gommo video status: ${status || 'empty'}` };
};

export const getGommoProviderCatalog = async (forceRefresh = false) => {
  if (!isGommoConfigured()) {
    return {
      configured: false,
      domain: GOMMO_DOMAIN,
      vndPerCredit: null,
      mappings: GOMMO_CATALOG_MAPPINGS,
      models: [],
    };
  }

  const [imageModels, videoModels] = await Promise.all([
    getGommoModels('image', forceRefresh),
    getGommoModels('video', forceRefresh),
  ]);
  const mappedIds = new Set(GOMMO_CATALOG_MAPPINGS.map((entry) => normalize(entry.gommoModelId)));
  const models = [...imageModels, ...videoModels]
    .filter((model) => mappedIds.has(normalize(model.model)))
    .map((model) => ({
      model: model.model,
      name: model.name,
      status: model.status || 'ON',
      server: model.server || '',
      price: Number.isFinite(Number(model.price)) ? Number(model.price) : null,
      rateType: model.rate_type || 'per_unit',
      prices: (model.prices || []).map((price) => ({
        mode: price.mode || null,
        resolution: price.resolution || null,
        duration: price.duration === undefined ? null : String(price.duration),
        price: Number(price.price),
      })).filter((price) => Number.isFinite(price.price)),
    }));
  const vndPerCredit = Number(process.env.GOMMO_VND_PER_CREDIT || '');

  return {
    configured: true,
    domain: GOMMO_DOMAIN,
    vndPerCredit: Number.isFinite(vndPerCredit) && vndPerCredit > 0 ? vndPerCredit : null,
    mappings: GOMMO_CATALOG_MAPPINGS,
    models,
  };
};
