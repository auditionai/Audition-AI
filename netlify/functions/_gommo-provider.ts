import {
  getServerAvailabilityConfig,
  isProviderServerAllowedByConfig,
  isProviderServerAllowedBySnapshot,
} from './_server-availability';
import { getGommoServerIdForMode } from '../../shared/gommoServerRouting';
import { isResultUrlCompatibleWithAssetType } from '../../shared/providerResultUrl';

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
  description?: string;
  status?: string;
  server?: string;
  price?: number;
  rate_type?: string;
  prices?: GommoModelPrice[];
  ratios?: GommoModelOption[];
  resolutions?: GommoModelOption[];
  durations?: GommoModelOption[];
  mode?: GommoModelOption[];
  modes?: GommoModelOption[];
  maxSubject?: number;
  withSubject?: boolean;
  withReference?: boolean;
  startText?: boolean;
  startImage?: boolean;
  startImageAndEnd?: boolean;
  withMotion?: boolean;
  configs?: {
    motion?: {
      enabled?: boolean;
      limits?: { max_video_seconds?: number; max_video_size_mb?: number };
    };
  };
};

export type GommoModelOption = {
  name?: string;
  type?: string | number;
  price?: number;
  description?: string;
  group?: string;
  group_subtitle?: string;
  status?: string;
  status_message?: string;
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

// Keep the production default on Gommo's documented public API. The base remains
// overridable for an explicitly configured staging/white-label environment.
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
  { auditionModelId: 'kling-2.5-video', gommoModelId: 'kling_video_2_5', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'veo-3.1', gommoModelId: 'veo_3_1', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'veo-omni', gommoModelId: 'veo_omni', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'hailuo-2.3', gommoModelId: 'hailuo_2_3', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'wan-2.5', gommoModelId: 'wan_2_5', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'happy-horse-1', gommoModelId: 'happy_horse_1', kind: 'video', fallbackSupported: true },
  { auditionModelId: 'motion-control-2.6', gommoModelId: 'kling_video_motion', kind: 'motion', fallbackSupported: true },
  { auditionModelId: 'motion-control-wan-2.2', gommoModelId: 'wan_2_2', kind: 'motion', fallbackSupported: true },
  // The live catalog currently reports configs.motion.enabled=false for Kling 3.0.
  { auditionModelId: 'motion-control-3.0', gommoModelId: 'kling_video_motion_3', kind: 'motion', fallbackSupported: false },
];

const modelCache = new Map<GommoProviderKind, { fetchedAt: number; models: GommoModel[] }>();

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeDuration = (value: unknown) => normalize(value).replace(/s$/, '');
const normalizeResolution = (value: unknown) => normalize(value);
const canonicalRatio = (value: unknown) => normalize(value).replace(/[:_x]/g, '');

const getOptionType = (option: GommoModelOption) => String(option.type ?? option.name ?? '').trim();
const getAvailableOptions = (options?: GommoModelOption[]) =>
  (options || []).filter((option) => {
    const status = normalize(option.status || 'on');
    return getOptionType(option) && !['maintenance', 'off', 'disabled', 'inactive', 'unavailable'].includes(status);
  });

const matchOption = (
  options: GommoModelOption[] | undefined,
  requested: unknown,
  canonicalize: (value: unknown) => string = normalize,
) => {
  const available = getAvailableOptions(options);
  const requestedKey = canonicalize(requested);
  return requestedKey
    ? available.find((option) => canonicalize(getOptionType(option)) === requestedKey)
    : available[0];
};

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
  // The v2 gateway keeps the provider's useful failure reason under `raw`, while
  // validation/transport failures normally expose it at the response root.
  const candidates = [
    data?.message,
    data?.error,
    data?.detail,
    data?.data?.message,
    data?.data?.error,
    data?.data?.detail,
    data?.imageInfo?.message,
    data?.imageInfo?.error,
    data?.videoInfo?.message,
    data?.videoInfo?.error,
    data?.raw?.imageInfo?.message,
    data?.raw?.imageInfo?.error,
    data?.raw?.imageInfo?.detail,
    data?.raw?.videoInfo?.message,
    data?.raw?.videoInfo?.error,
    data?.raw?.videoInfo?.detail,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '') || fallback;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

export const buildGommoFormBody = (values: Record<string, unknown>) => {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;

    // Vmedia's production client sends media references as PHP-style form
    // keys. A JSON-encoded `subjects` field can be accepted as a job request
    // while still being silently ignored by the image generator.
    if ((key === 'subjects' || key === 'images') && Array.isArray(value)) {
      value.forEach((entry, index) => {
        const url = typeof entry === 'string'
          ? entry.trim()
          : String((entry as Record<string, unknown> | null)?.url || '').trim();
        if (url) form.append(`${key}[${index}][url]`, url);
      });
      continue;
    }

    form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  return form;
};

const postForm = async (path: string, values: Record<string, unknown>, timeoutMs = GOMMO_TIMEOUT_MS) => {
  const credentials = getCredentials();
  const payload = { access_token: credentials.access_token, domain: credentials.domain, ...values };
  const form = buildGommoFormBody(payload);

  const response = await fetch(`${GOMMO_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    data?.success === false ||
    data?.error === 1 ||
    Boolean(data?.error)
  ) {
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
  if (queueKind === 'motion_generate' && mapping.kind !== 'motion') return null;
  return mapping;
};

export const isGommoModelAvailable = (model: GommoModel) => {
  const status = normalize(model.status || 'on');
  return !['maintenance', 'off', 'disabled', 'inactive', 'unavailable'].includes(status);
};

const selectMode = (modelId: string, payload: Record<string, unknown>, model: GommoModel) => {
  const explicitMode = normalize(payload.provider_mode || payload.mode);
  const server = normalize(payload.server_id);
  const speed = normalize(payload.speed);
  const quality = normalize(payload.quality);
  const audio = payload.audio === true;
  const requested = explicitMode || (() => {
    switch (normalize(modelId)) {
      case 'seedance-2.0-fast': return 'fast';
      case 'seedance-2.0': return 'professional';
      case 'grok-i2v': return 'normal';
      // Basic is the application default for Gommo GPT. An explicit provider_mode
      // from the UI still wins, so users can intentionally select Premium.
      case 'image-gpt-2': return `${quality || 'low'}_basic`;
      case 'nano-banana-2':
      case 'nano-banana-pro':
        return server === 'vip3' ? 'vip3' : server === 'vip2' ? 'vip2' : 'vip';
      case 'kling-2.6':
        return audio ? 'professional_audio' : server.startsWith('vip') || speed === 'slow' ? 'professional' : 'standard';
      case 'kling-o1-video':
      case 'kling-3.0-video':
        return server.startsWith('vip') || speed === 'slow' ? 'professional' : 'standard';
      case 'motion-control-2.6':
      case 'motion-control-3.0':
        return quality === '1080p' || normalize(payload.resolution) === '1080p' ? 'professional' : 'standard';
      default:
        return speed || quality;
    }
  })();

  const modes = getAvailableOptions([...(model.modes || []), ...(model.mode || [])])
    .map((entry) => normalize(getOptionType(entry)))
    .filter(Boolean);
  if (requested && modes.includes(requested)) return requested;
  return modes[0] || requested || undefined;
};

export type NormalizedGommoPayload = {
  mapping: GommoCatalogMapping;
  model: GommoModel;
  payload: Record<string, unknown>;
  mode?: string;
  providerCost: number | null;
};

export const normalizeAndValidateGommoPayload = async (
  queueKind: QueueKind,
  payload: Record<string, unknown>,
): Promise<NormalizedGommoPayload> => {
  const mapping = getMapping(payload.model || payload.modelId, queueKind);
  if (!mapping) {
    throw new Error(`GOMMO_UNSUPPORTED_MODEL: ${String(payload.model || payload.modelId || 'unknown')}`);
  }

  const models = await getGommoModels(mapping.kind === 'motion' ? 'video' : mapping.kind);
  const model = models.find((entry) => normalize(entry.model) === normalize(mapping.gommoModelId));
  if (!model || !isGommoModelAvailable(model) || (mapping.kind === 'motion' && model.configs?.motion?.enabled === false)) {
    throw new Error(`GOMMO_MODEL_UNAVAILABLE: ${mapping.gommoModelId}`);
  }

  const resolutionOption = matchOption(model.resolutions, payload.resolution);
  const ratioOption = matchOption(model.ratios, payload.aspect_ratio || payload.aspectRatio, canonicalRatio);
  const durationOption = matchOption(model.durations, payload.duration, normalizeDuration);
  const mode = selectMode(mapping.auditionModelId, payload, model);
  const availableModes = getAvailableOptions([...(model.modes || []), ...(model.mode || [])]);
  const modeOption = matchOption(availableModes, mode);

  const requestedResolution = normalizeResolution(payload.resolution);
  if (requestedResolution && model.resolutions?.length && !resolutionOption) {
    throw new Error(`GOMMO_INVALID_RESOLUTION: ${requestedResolution}`);
  }
  const requestedRatio = canonicalRatio(payload.aspect_ratio || payload.aspectRatio);
  if (requestedRatio && model.ratios?.length && !ratioOption) {
    throw new Error(`GOMMO_INVALID_RATIO: ${String(payload.aspect_ratio || payload.aspectRatio)}`);
  }
  const requestedDuration = normalizeDuration(payload.duration);
  if (requestedDuration && model.durations?.length && !durationOption) {
    throw new Error(`GOMMO_INVALID_DURATION: ${requestedDuration}`);
  }
  const requestedMode = normalize(payload.provider_mode || payload.mode);
  if (
    requestedMode &&
    availableModes.length &&
    !availableModes.some((option) => normalize(getOptionType(option)) === requestedMode)
  ) {
    throw new Error(`GOMMO_INVALID_MODE: ${requestedMode}`);
  }

  const normalizedPayload: Record<string, unknown> = {
    ...payload,
    model: mapping.auditionModelId,
  };
  if (resolutionOption) normalizedPayload.resolution = getOptionType(resolutionOption).toLowerCase();
  if (ratioOption) normalizedPayload.aspect_ratio = getOptionType(ratioOption);
  if (durationOption) normalizedPayload.duration = normalizeDuration(getOptionType(durationOption));
  if (modeOption) normalizedPayload.provider_mode = getOptionType(modeOption).toLowerCase();

  return {
    mapping,
    model,
    payload: normalizedPayload,
    mode: modeOption ? getOptionType(modeOption).toLowerCase() : mode,
    providerCost: selectProviderPrice(model, normalizedPayload, modeOption ? getOptionType(modeOption) : mode),
  };
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
  const raw = payload.image_urls ?? payload.img_url ?? payload.image_url;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
};

type GommoMediaReference = {
  id_base: string;
  url: string;
  data: string;
};

const GOMMO_MAX_INPUT_IMAGE_BYTES = 25 * 1024 * 1024;

const getGommoUploadFileName = (sourceUrl: string, index: number) => {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const candidate = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '').trim();
    if (candidate) return candidate.slice(-180);
  } catch {
    // Use the deterministic fallback below.
  }
  return `audition-reference-${index + 1}.jpg`;
};

const uploadImageToGommo = async (sourceUrl: string, index: number): Promise<GommoMediaReference> => {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(GOMMO_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Cannot download reference image ${index + 1} (${response.status})`);
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Reference ${index + 1} is not an image (${contentType})`);
  }
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > GOMMO_MAX_INPUT_IMAGE_BYTES) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Reference ${index + 1} exceeds 25 MB`);
  }
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > GOMMO_MAX_INPUT_IMAGE_BYTES) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Reference ${index + 1} is empty or exceeds 25 MB`);
  }

  const upload = await postForm('/ai/image-upload', {
    data: Buffer.from(bytes).toString('base64'),
    project_id: GOMMO_PROJECT_ID,
    file_name: getGommoUploadFileName(sourceUrl, index),
    size: bytes.byteLength,
  });
  const imageInfo = upload?.imageInfo || upload?.data?.imageInfo || upload?.data;
  const idBase = String(imageInfo?.id_base || '').trim();
  const url = String(imageInfo?.url || '').trim();
  if (!idBase || !/^https?:\/\//i.test(url)) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Upload Image did not return imageInfo.id_base and imageInfo.url for reference ${index + 1}`);
  }
  return { id_base: idBase, url, data: '' };
};

const downloadGommoMultipartMedia = async (
  sourceUrl: string,
  kind: 'image' | 'video',
  maxBytes: number,
) => {
  if (!/^https?:\/\//i.test(sourceUrl)) throw new Error(`GOMMO_UPLOAD_ERROR: Missing ${kind} URL`);
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(GOMMO_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GOMMO_UPLOAD_ERROR: Cannot download ${kind} (${response.status})`);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith(`${kind}/`)) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Motion ${kind} has invalid content type (${contentType})`);
  }
  const allowedTypes = kind === 'image'
    ? new Set(['image/jpeg', 'image/png', 'image/webp'])
    : new Set(['video/mp4', 'video/webm']);
  if (contentType && !allowedTypes.has(contentType)) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Motion ${kind} type ${contentType} is not supported by Gommo`);
  }
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxBytes) {
    throw new Error(`GOMMO_UPLOAD_ERROR: Motion ${kind} is empty or exceeds ${Math.floor(maxBytes / 1024 / 1024)} MB`);
  }
  const mimeType = contentType || (kind === 'image' ? 'image/jpeg' : 'video/mp4');
  const extension = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'video/webm'
        ? 'webm'
        : kind === 'image' ? 'jpg' : 'mp4';
  return {
    blob: new Blob([bytes], { type: mimeType }),
    fileName: kind === 'image' ? `audition-character.${extension}` : `audition-motion.${extension}`,
  };
};

const postMultipart = async (
  path: string,
  values: Record<string, unknown>,
  files: Array<{ field: string; blob: Blob; fileName: string }>,
) => {
  const credentials = getCredentials();
  const form = new FormData();
  const payload = { access_token: credentials.access_token, domain: credentials.domain, ...values };
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === '') continue;
    form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  for (const file of files) form.set(file.field, file.blob, file.fileName);
  const response = await fetch(`${GOMMO_API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.access_token}` },
    body: form,
    signal: AbortSignal.timeout(Math.max(GOMMO_TIMEOUT_MS, 120_000)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false || data?.error === 1 || data?.error) {
    throw new Error(`GOMMO_ERROR: ${parseGommoError(data, `${response.status} ${response.statusText}`)}`);
  }
  return data;
};

export const buildGommoImageReferenceFields = (model: GommoModel, sources: GommoMediaReference[]) => {
  const providerLimit = Number(model.maxSubject);
  const limit = Number.isFinite(providerLimit) && providerLimit > 0 ? Math.floor(providerLimit) : 8;
  const limitedSources = sources.slice(0, limit);
  if (!limitedSources.length) return {};
  // Gommo's current image client sends subjects as a JSON array of uploaded
  // image URL strings. Passing the upload response objects themselves causes
  // "Cấu trúc ảnh tham chiếu không hợp lệ" and no generation job is created.
  if (model.withSubject) return { subjects: limitedSources.map((source) => source.url) };
  return {
    images: (model.startImageAndEnd ? limitedSources.slice(0, 2) : limitedSources.slice(0, 1))
      .map((source) => ({ url: source.url })),
  };
};

export const buildGommoVideoReferenceFields = (model: GommoModel, sources: GommoMediaReference[]) => {
  if (!model.startImage || !sources.length) return {};
  const limit = model.startImageAndEnd ? 2 : 1;
  // Match Vmedia's create-video client exactly. Upload responses contain more
  // fields, but the generation endpoint accepts media references as url/id_base.
  return {
    images: sources.slice(0, limit).map((source) => ({
      url: source.url,
      ...(source.id_base ? { id_base: source.id_base } : {}),
    })),
  };
};

const getGatewayJobData = (data: any) => {
  if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) return data.data;
  if (data?.imageInfo && typeof data.imageInfo === 'object') return data.imageInfo;
  if (data?.videoInfo && typeof data.videoInfo === 'object') return data.videoInfo;
  return data;
};

export const extractGommoCreateJobId = (data: any, media: 'image' | 'video') => {
  // Create Image documents `success: true`; Create Video currently omits that
  // flag and returns videoInfo directly, so keep their acceptance contracts separate.
  if (media === 'image' && data?.success !== true) return '';
  const job = media === 'image'
    ? data?.imageInfo || data?.data?.imageInfo
    : data?.videoInfo || data?.data?.videoInfo;
  if (!job || typeof job !== 'object') return '';
  const status = normalize(job.status);
  const acceptedStatuses = media === 'image'
    ? new Set(['pending', 'pending_active', 'pending_processing', 'processing', 'success'])
    : new Set([
        'pending', 'pending_active', 'pending_processing', 'processing', 'active', 'success',
        'media_generation_status_pending', 'media_generation_status_active',
        'media_generation_status_processing', 'media_generation_status_successful',
      ]);
  if (status && !acceptedStatuses.has(status)) return '';
  return String(job.id_base || job.job_id || '').trim();
};

export const canUseGommoForPayload = async (queueKind: QueueKind, payload: Record<string, unknown>) => {
  if (!isGommoConfigured()) return false;
  try {
    await normalizeAndValidateGommoPayload(queueKind, payload);
    return true;
  } catch {
    return false;
  }
};

export const submitGommoJob = async (
  queueKind: QueueKind,
  payload: Record<string, unknown>,
): Promise<GommoSubmitResult> => {
  const normalized = await normalizeAndValidateGommoPayload(queueKind, payload);
  const { mapping, payload: providerPayload, mode, providerCost } = normalized;
  const gommoServerId = getGommoServerIdForMode(normalized.model, mode);
  if (!(await isProviderServerAllowedByConfig('gommo', mapping.auditionModelId, gommoServerId))) {
    throw new Error(`GOMMO_SERVER_DISABLED: Server ${gommoServerId || '(unknown)'} của model ${mapping.auditionModelId} đang bị khóa trong Admin.`);
  }
  const common = {
    prompt: String(providerPayload.prompt || '').trim(),
    project_id: GOMMO_PROJECT_ID,
  };

  if (queueKind === 'image_generate') {
    const sources = getSources(providerPayload).filter((source) => /^https?:\/\//i.test(source));
    const uploadedSources = await Promise.all(sources.map((source, index) => uploadImageToGommo(source, index)));
    const data = await postForm('/ai/generateImage', {
      ...common,
      action_type: 'create',
      model: mapping.gommoModelId,
      ...buildGommoImageReferenceFields(normalized.model, uploadedSources),
      ratio: providerPayload.aspect_ratio,
      resolution: providerPayload.resolution,
      mode,
    });
    const jobId = extractGommoCreateJobId(data, 'image');
    if (!jobId) throw new Error(`GOMMO_ERROR: Create Image was not accepted (${parseGommoError(data, 'missing imageInfo generation job')})`);
    return { jobId, providerCost, mappedModelId: mapping.gommoModelId };
  }

  if (queueKind === 'motion_generate') {
    const characterImageUrl = String(providerPayload.character_image_url || '').trim();
    const motionVideoUrl = String(providerPayload.motion_video_url || '').trim();
    if (mapping.gommoModelId === 'wan_2_2') {
      if (!/^https?:\/\//i.test(characterImageUrl) || !/^https?:\/\//i.test(motionVideoUrl)) {
        throw new Error('GOMMO_UPLOAD_ERROR: Wan Animate requires a public character image and motion video URL');
      }
      const uploadedCharacter = await uploadImageToGommo(characterImageUrl, 0);
      const data = await postForm('/ai/create-video', {
        ...common,
        model: mapping.gommoModelId,
        privacy: 'PRIVATE',
        ...buildGommoVideoReferenceFields(normalized.model, [uploadedCharacter]),
        video_url: motionVideoUrl,
        ratio: getAvailableOptions(normalized.model.ratios).length
          ? String(providerPayload.aspect_ratio || '').trim() || undefined
          : undefined,
        resolution: getAvailableOptions(normalized.model.resolutions).length
          ? normalizeResolution(providerPayload.resolution) || undefined
          : undefined,
        mode,
      });
      const jobId = extractGommoCreateJobId(data, 'video');
      if (!jobId) throw new Error('GOMMO_ERROR: Wan Animate did not return videoInfo.id_base');
      const billedSeconds = Math.max(1, Math.ceil(Number(providerPayload.duration) || 1));
      return {
        jobId,
        providerCost: providerCost === null ? null : providerCost * billedSeconds,
        mappedModelId: mapping.gommoModelId,
      };
    }
    const maxVideoMb = Math.max(1, Number(normalized.model.configs?.motion?.limits?.max_video_size_mb || 50));
    const [characterImage, motionVideo] = await Promise.all([
      downloadGommoMultipartMedia(characterImageUrl, 'image', GOMMO_MAX_INPUT_IMAGE_BYTES),
      downloadGommoMultipartMedia(motionVideoUrl, 'video', maxVideoMb * 1024 * 1024),
    ]);
    const data = await postMultipart('/ai/create-video', {
      ...common,
      model: mapping.gommoModelId,
      privacy: 'PRIVATE',
      mode,
      background_source: String(providerPayload.background_source || 'input_image'),
    }, [
      { field: 'character_image', ...characterImage },
      { field: 'motion_video', ...motionVideo },
    ]);
    const jobId = extractGommoCreateJobId(data, 'video');
    if (!jobId) throw new Error('GOMMO_ERROR: Motion Control did not return videoInfo.id_base');
    const billedSeconds = Math.max(1, Math.ceil(Number(providerPayload.duration) || 1));
    return {
      jobId,
      providerCost: providerCost === null ? null : providerCost * billedSeconds,
      mappedModelId: mapping.gommoModelId,
    };
  }

  const imageSources = getSources(providerPayload)
    .filter((source) => /^https?:\/\//i.test(source))
    .slice(0, normalized.model.startImageAndEnd ? 2 : 1);
  const uploadedImages = await Promise.all(imageSources.map((source, index) => uploadImageToGommo(source, index)));
  const data = await postForm('/ai/create-video', {
    ...common,
    model: mapping.gommoModelId,
    privacy: 'PRIVATE',
    translate_to_en: 'false',
    ...buildGommoVideoReferenceFields(normalized.model, uploadedImages),
    ratio: getAvailableOptions(normalized.model.ratios).length
      ? String(providerPayload.aspect_ratio || '').trim() || undefined
      : undefined,
    resolution: getAvailableOptions(normalized.model.resolutions).length
      ? normalizeResolution(providerPayload.resolution) || undefined
      : undefined,
    duration: getAvailableOptions(normalized.model.durations).length
      ? normalizeDuration(providerPayload.duration) || undefined
      : undefined,
    mode: getAvailableOptions([...(normalized.model.modes || []), ...(normalized.model.mode || [])]).length
      ? mode
      : undefined,
  });
  const jobId = extractGommoCreateJobId(data, 'video');
  if (!jobId) throw new Error('GOMMO_ERROR: Create Video did not return data.id_base or data.job_id');
  return { jobId, providerCost, mappedModelId: mapping.gommoModelId };
};

export const pollGommoJob = async (queueKind: QueueKind, providerJobId: string) => {
  const media = queueKind === 'image_generate' ? 'image' : 'video';
  const data = await postForm(media === 'image' ? '/ai/image' : '/ai/video', {
    project_id: GOMMO_PROJECT_ID,
    ...(media === 'image' ? { id_base: providerJobId } : { videoId: providerJobId }),
  });
  const job = getGatewayJobData(data);
  const rawStatus = normalize(job?.status || data?.raw?.imageInfo?.status || data?.raw?.videoInfo?.status);
  const result = String(
    job?.result_url ||
    job?.url ||
    job?.download_url ||
    data?.raw?.imageInfo?.url ||
    data?.raw?.videoInfo?.download_url ||
    '',
  ).trim();
  const compatibleResult = isResultUrlCompatibleWithAssetType(result, media) ? result : '';
  const successStatuses = new Set([
    'success', 'succeeded', 'done', 'completed', 'media_generation_status_successful',
  ]);
  const processingStatuses = new Set([
    'processing', 'pending', 'queued', 'active', 'pending_active', 'pending_processing',
    'media_generation_status_pending', 'media_generation_status_active', 'media_generation_status_processing',
  ]);
  const failedStatuses = new Set([
    'failed', 'error', 'cancelled', 'canceled', 'rejected', 'media_generation_status_failed',
  ]);

  if (compatibleResult && !processingStatuses.has(rawStatus)) {
    return { ...job, status: 'completed', result: compatibleResult, progress: 100 };
  }
  if (successStatuses.has(rawStatus)) {
    return compatibleResult
      ? { ...job, status: 'completed', result: compatibleResult, progress: 100 }
      : { ...job, status: 'processing', progress: 95 };
  }
  if (failedStatuses.has(rawStatus)) {
    return { ...job, status: 'failed', error: parseGommoError(data, `Gommo ${media} generation failed`) };
  }
  if (processingStatuses.has(rawStatus)) {
    return { ...job, status: 'processing', progress: rawStatus.includes('processing') ? 75 : 60 };
  }
  return { ...job, status: 'failed', error: `Unexpected Gommo ${media} status: ${rawStatus || 'empty'}` };
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

  const [imageModels, videoModels, serverAvailabilityConfig] = await Promise.all([
    getGommoModels('image', forceRefresh),
    getGommoModels('video', forceRefresh),
    getServerAvailabilityConfig(forceRefresh),
  ]);
  const modelByProviderId = new Map(
    [...imageModels, ...videoModels].map((model) => [normalize(model.model), model]),
  );
  const models = GOMMO_CATALOG_MAPPINGS
    .map((mapping) => ({ mapping, model: modelByProviderId.get(normalize(mapping.gommoModelId)) }))
    .filter((entry): entry is { mapping: GommoCatalogMapping; model: GommoModel } => Boolean(entry.model))
    .map(({ mapping, model }) => {
      const serializeOptions = (options?: GommoModelOption[], applyServerAvailability = false) => getAvailableOptions(options).map((option) => ({
        name: String(option.name || option.type || ''),
        type: getOptionType(option),
        description: option.description || '',
        group: option.group || '',
        groupSubtitle: option.group_subtitle || '',
        status: option.status || 'on',
        statusMessage: option.status_message || '',
        adminEnabled: !applyServerAvailability || isProviderServerAllowedBySnapshot(
          serverAvailabilityConfig,
          'gommo',
          mapping.auditionModelId,
          getGommoServerIdForMode(model, getOptionType(option)),
        ),
      }));
      const modes = [...(model.modes || []), ...(model.mode || [])];
      const uniqueModes = Array.from(new Map(modes.map((option) => [normalize(getOptionType(option)), option])).values());
      return {
        auditionModelId: mapping.auditionModelId,
        kind: mapping.kind,
        fallbackSupported: mapping.fallbackSupported,
        model: model.model,
        name: model.name,
        description: model.description || '',
        status: model.status || 'ON',
        server: model.server || '',
        price: Number.isFinite(Number(model.price)) ? Number(model.price) : null,
        rateType: model.rate_type || 'per_unit',
        maxReferenceImages: Number.isFinite(Number(model.maxSubject)) && Number(model.maxSubject) > 0
          ? Math.floor(Number(model.maxSubject))
          : null,
        supportsStartImage: Boolean(model.startImage),
        supportsEndFrame: Boolean(model.startImageAndEnd),
        referenceField: model.withSubject ? 'subjects' : 'images',
        ratios: serializeOptions(model.ratios),
        resolutions: serializeOptions(model.resolutions),
        durations: serializeOptions(model.durations),
        modes: serializeOptions(uniqueModes, true),
        prices: (model.prices || []).map((price) => ({
          mode: price.mode || null,
          resolution: price.resolution || null,
          duration: price.duration === undefined ? null : String(price.duration),
          price: Number(price.price),
        })).filter((price) => Number.isFinite(price.price)),
      };
    });
  const vndPerCredit = Number(process.env.GOMMO_VND_PER_CREDIT || '');

  return {
    configured: true,
    domain: GOMMO_DOMAIN,
    vndPerCredit: Number.isFinite(vndPerCredit) && vndPerCredit > 0 ? vndPerCredit : null,
    mappings: GOMMO_CATALOG_MAPPINGS,
    models,
  };
};
