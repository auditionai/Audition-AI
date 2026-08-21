import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { validateQueuePayloadAgainstLiveCatalog } from './_tst-live-catalog';
import { normalizeAndValidateGommoPayload } from './_gommo-provider';
import { isProviderServerAllowedByConfig } from './_server-availability';
import { getGommoServerIdForMode } from '../../shared/gommoServerRouting';
import {
  DEFAULT_PROVIDER_BY_FEATURE,
  getAllowedModelsForFeature,
  inferGenerationProviderRouteKey,
  type GenerationProviderRouteKey,
} from '../../shared/providerRouting';
import {
  getRecipeValidationPayload,
  isQueueRecipePayload,
  type QueueProcessingStage,
  type QueueProgressLogEntry,
} from '../../shared/queueRecipes';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Platform',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const USER_QUEUE_LIMIT = 3;
const PROVIDER_CONCURRENCY_LIMITS = {
  tst: { userImage: 3, userVideo: 3 },
  gommo: { userImage: 3, userVideo: 3 },
  gpti2: { userImage: Number.POSITIVE_INFINITY, userVideo: 0 },
} as const;
const TST_QUEUE_KINDS = new Set(['image_generate', 'video_generate', 'motion_generate']);
const VIDEO_OR_MOTION_QUEUE_KINDS = new Set(['video_generate', 'motion_generate']);
const TST_QUEUE_KIND_VALUES = Array.from(TST_QUEUE_KINDS);
type GenerationProvider = 'tst' | 'gommo' | 'gpti2';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_USER_AGENT_PATTERN = /iphone|ipod|android.+mobile|windows phone|blackberry|opera mini|mobile safari/i;
const VND_PER_CREDIT = 40;
const VND_PER_VCOIN = 1000;

type QueueClientPlatform = 'mobile' | 'desktop' | 'unknown';

type QueueBody = {
  id?: string;
  prompt?: string;
  toolId?: string;
  toolName?: string;
  engine?: string;
  assetType?: 'image' | 'video';
  costVcoin?: number;
  queueKind?: string;
  queuePayload?: Record<string, unknown>;
  clientPlatform?: QueueClientPlatform | string;
};

const buildInitialQueueLogs = (queueKind: string): QueueProgressLogEntry[] => {
  const stage: QueueProcessingStage = 'queued';
  const message =
    queueKind === 'image_generate'
      ? 'Đã vào hàng đợi. Chờ worker chuẩn bị.'
      : 'Đã vào hàng đợi. Chờ worker xử lý.';

  return [
    {
      at: new Date().toISOString(),
      stage,
      level: 'info',
      message,
    },
  ];
};

const mapQueueError = (message: string) => {
  if (/AccountLocked|ACCOUNT_LOCKED/i.test(message)) {
    return { statusCode: 403, error: 'AccountLocked' };
  }
  if (/missing tst_api_key/i.test(message) || /khong the nhan job moi/i.test(message)) {
    return {
      statusCode: 503,
      error: message,
    };
  }

  if (/SYSTEM_QUEUE_FULL|USER_QUEUE_LIMIT_REACHED|IMAGE_USER_LIMIT_REACHED|VIDEO_USER_LIMIT_REACHED/i.test(message)) {
    return { statusCode: 409, error: message };
  }

  if (/INSUFFICIENT_VCOIN/i.test(message)) {
    return { statusCode: 400, error: 'INSUFFICIENT_VCOIN' };
  }

  if (/server_enqueue_generated_job/i.test(message) || /function .* does not exist/i.test(message)) {
    return {
      statusCode: 500,
      error: 'Missing server_enqueue_generated_job database function. Please run scripts/supabase_atomic_queue_hardening.sql',
    };
  }

  return { statusCode: 400, error: message };
};

const asQueueAssetType = (value: unknown): 'image' | 'video' => {
  return value === 'video' ? 'video' : 'image';
};

const getGenerationProvider = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  modelId: string,
  featureKey?: GenerationProviderRouteKey | null,
): Promise<{ provider: GenerationProvider; smartFallbackEnabled: boolean; allowedModels: string[] | null; priority: GenerationProvider[] }> => {
  const fallback = String(process.env.GENERATION_PROVIDER_DEFAULT || 'tst').trim().toLowerCase() === 'gommo'
    ? 'gommo'
    : 'tst';
  const defaultPriority = (provider: GenerationProvider): GenerationProvider[] =>
    featureKey === 'video_generation' || featureKey === 'motion_control'
      ? provider === 'tst' ? ['tst', 'gommo'] : [provider, 'tst']
      : provider === 'gpti2' ? ['gpti2', 'tst', 'gommo'] : provider === 'tst' ? ['tst', 'gommo'] : ['gommo', 'tst'];
  try {
    const { data, error } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'generation_provider_mode')
      .maybeSingle();
    if (error) throw error;
    const allowedModels = getAllowedModelsForFeature(data?.value, featureKey);
    const configuredPriority = (featureKey && data?.value?.providerPriorityByFeature?.[featureKey]) || data?.value?.providerPriorityByModel?.[modelId];
    let priority = Array.isArray(configuredPriority) ? configuredPriority.filter((provider: unknown): provider is GenerationProvider => provider === 'tst' || provider === 'gommo' || provider === 'gpti2') : [];
    if (featureKey === 'video_generation' || featureKey === 'motion_control') {
      priority = priority.filter((provider) => provider === 'tst' || provider === 'gommo');
    }
    const featureProvider = String(featureKey ? data?.value?.providerByFeature?.[featureKey] || '' : '').trim().toLowerCase();
    if (!priority.length && (featureProvider === 'gommo' || featureProvider === 'tst' || featureProvider === 'gpti2')) {
      priority = defaultPriority(featureProvider);
      if (featureKey === 'video_generation' || featureKey === 'motion_control') {
        priority = priority.filter((provider) => provider === 'tst' || provider === 'gommo');
      }
    }
    if (priority.length) {
      return { provider: priority[0], smartFallbackEnabled: data?.value?.smartFallbackEnabled !== false, allowedModels, priority };
    }
    const featureDefault = featureKey ? DEFAULT_PROVIDER_BY_FEATURE[featureKey] : undefined;
    if (featureDefault) {
      const featurePriority = defaultPriority(featureDefault).filter((provider) => featureKey === 'video_generation' || featureKey === 'motion_control' ? provider !== 'gpti2' : true);
      return { provider: featurePriority[0], smartFallbackEnabled: data?.value?.smartFallbackEnabled !== false, allowedModels, priority: featurePriority };
    }
    const selected = String(data?.value?.provider || '').trim().toLowerCase();
    if (featureKey) {
      return {
        provider: (selected === 'gommo' || selected === 'tst') && (featureKey === 'video_generation' || featureKey === 'motion_control') ? selected : selected === 'gommo' ? 'gommo' : selected === 'gpti2' ? 'gpti2' : selected === 'tst' ? 'tst' : fallback,
        smartFallbackEnabled: data?.value?.smartFallbackEnabled !== false,
        allowedModels, priority: (featureKey === 'video_generation' || featureKey === 'motion_control') ? ['tst', 'gommo'] : defaultPriority(fallback),
      };
    }
    const modelProvider = String(data?.value?.providerByModel?.[modelId] || '').trim().toLowerCase();
    if (modelProvider === 'gommo' || modelProvider === 'tst' || modelProvider === 'gpti2') {
      return { provider: modelProvider, smartFallbackEnabled: data?.value?.smartFallbackEnabled !== false, allowedModels, priority: priority.length ? priority : defaultPriority(modelProvider) };
    }
    return {
      provider: selected === 'gommo' ? 'gommo' : selected === 'gpti2' ? 'gpti2' : selected === 'tst' ? 'tst' : fallback,
      smartFallbackEnabled: data?.value?.smartFallbackEnabled !== false,
      allowedModels, priority: priority.length ? priority : defaultPriority(fallback),
    };
  } catch (error) {
    console.warn('[queue-submit] Could not read generation provider mode; using deployment default.', error);
    return { provider: fallback, smartFallbackEnabled: true, allowedModels: getAllowedModelsForFeature(null, featureKey), priority: defaultPriority(fallback) };
  }
};

const getQueueModelId = (queuePayload?: Record<string, unknown> | null) => {
  const raw = queuePayload && typeof queuePayload === 'object' ? queuePayload : {};
  const recipe = raw.__recipePayload && typeof raw.__recipePayload === 'object'
    ? raw.__recipePayload as Record<string, unknown>
    : raw;
  return String(raw.model || raw.modelId || recipe.model || recipe.modelId || '').trim().toLowerCase();
};

const ensureProviderConfiguredForQueueKind = (queueKind: string | undefined, provider: GenerationProvider) => {
  const normalizedQueueKind = String(queueKind || '').trim().toLowerCase();
  if (!VIDEO_OR_MOTION_QUEUE_KINDS.has(normalizedQueueKind)) {
    return;
  }

  if (provider === 'gpti2') {
    throw new Error('GPTi2 chỉ hỗ trợ tạo ảnh; video và Motion Control chỉ dùng API 2 (TST) hoặc API 3 (Gommo).');
  }

  const hasTst = Boolean(String(process.env.TST_API_KEY || '').trim());
  const hasGommo = Boolean(
    String(process.env.GOMMO_ACCESS_TOKEN || process.env.GOMMO_API_TOKEN || '').trim() &&
    String(process.env.GOMMO_DOMAIN || 'vmedia.ai').trim(),
  );
  if (provider === 'tst' && !hasTst) {
    throw new Error('May chu Audition AI dang thieu TST_API_KEY nen tam thoi khong the nhan job moi.');
  }
  if (provider === 'gommo' && !hasGommo) {
    throw new Error('May chu Audition AI dang thieu GOMMO_ACCESS_TOKEN nen tam thoi khong the nhan job moi.');
  }
};

const normalizeJobId = (value: unknown) => {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : randomUUID();
};

const normalizeQueueClientPlatform = (value: unknown): QueueClientPlatform | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'desktop' || normalized === 'unknown') {
    return normalized;
  }
  return null;
};

const inferQueueClientPlatformFromUserAgent = (userAgent?: string | null): QueueClientPlatform => {
  const normalizedUserAgent = String(userAgent || '').trim().toLowerCase();
  if (!normalizedUserAgent) {
    return 'unknown';
  }

  return PHONE_USER_AGENT_PATTERN.test(normalizedUserAgent) ? 'mobile' : 'desktop';
};

const resolveQueueClientPlatform = (event: HandlerEventLike, body: QueueBody): QueueClientPlatform => {
  const bodyPlatform = normalizeQueueClientPlatform(body.clientPlatform);
  if (bodyPlatform) {
    return bodyPlatform;
  }

  const headerPlatform = normalizeQueueClientPlatform(
    event.headers['x-client-platform'] ||
    event.headers['X-Client-Platform'],
  );
  if (headerPlatform) {
    return headerPlatform;
  }

  return inferQueueClientPlatformFromUserAgent(
    event.headers['user-agent'] ||
    event.headers['User-Agent'],
  );
};

type HandlerEventLike = {
  headers: Record<string, string | undefined>;
};

const getImageGenerateToolMetadata = (
  queueKind: string,
  queuePayload: Record<string, unknown> | undefined,
  fallbackToolId?: string,
  fallbackToolName?: string,
) => {
  if (queueKind !== 'image_generate' || !queuePayload || typeof queuePayload !== 'object') {
    return {
      toolId: fallbackToolId || queueKind,
      toolName: fallbackToolName || queueKind,
    };
  }

  const raw = queuePayload;
  const recipePayload =
    raw.__recipePayload && typeof raw.__recipePayload === 'object'
      ? raw.__recipePayload as Record<string, unknown>
      : raw;
  const recipeType = String(recipePayload.recipeType || '').trim().toLowerCase();
  if (recipeType !== 'image_generate_recipe_v1') {
    return {
      toolId: fallbackToolId || queueKind,
      toolName: fallbackToolName || queueKind,
    };
  }

  const groupCount = Array.isArray(recipePayload.characterReferenceGroups)
    ? recipePayload.characterReferenceGroups.length
    : 0;
  const flatCount = Array.isArray(recipePayload.characterImages)
    ? recipePayload.characterImages.length
    : 0;
  const characterCount = Math.max(1, Math.floor(Number(recipePayload.characterCount || 0)) || groupCount || flatCount || 1);

  if (characterCount >= 3) {
    return { toolId: `group_${Math.min(8, characterCount)}_gen`, toolName: `Group of ${Math.min(8, characterCount)}` };
  }
  if (characterCount === 2) {
    return { toolId: 'couple_photo_gen', toolName: 'Couple 3D Mode' };
  }

  return { toolId: 'single_photo_gen', toolName: 'Single 3D Character' };
};

const buildInitialQueuePayload = (
  queuePayload: Record<string, unknown> | undefined,
  queueKind: string,
  clientPlatform: QueueClientPlatform,
) =>
  queuePayload && typeof queuePayload === 'object'
    ? {
        ...queuePayload,
        __stage: 'queued',
        __logs: buildInitialQueueLogs(queueKind),
        __clientPlatform: clientPlatform,
      }
    : queuePayload;

const countRows = async (query: PromiseLike<{ count: number | null; error: any }>) => {
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count ?? 0;
};

const normalizeKey = (value?: unknown) => String(value || '').trim().toLowerCase();

const creditsToVcoin = (credits: number) =>
  Math.max(1, Math.ceil((Math.max(0, Number(credits) || 0) * VND_PER_CREDIT) / VND_PER_VCOIN));

const getAuditionPriceOverride = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  modelId: string,
  optionId?: string | null,
) => {
  const normalizedOptionId = String(optionId || '').trim();
  if (!modelId || !normalizedOptionId) return null;

  const { data, error } = await admin
    .from('model_pricing')
    .select('audition_price_vcoin')
    .eq('model_id', modelId)
    .eq('option_id', normalizedOptionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const price = Number(data?.audition_price_vcoin);
  return Number.isFinite(price) && price > 0 ? Math.ceil(price) : null;
};

const getImageBillingMultiplier = (queuePayload: Record<string, unknown>) => {
  const recipeType = normalizeKey(queuePayload.recipeType);
  if (recipeType === 'prompt_image_generate_recipe_v1') {
    const explicitUnits = Math.floor(Number((queuePayload as any).__billingUnits || 0));
    const referenceCount = Array.isArray((queuePayload as any).referenceImages)
      ? (queuePayload as any).referenceImages.filter(Boolean).length
      : 0;
    return Math.max(1, Math.min(8, explicitUnits || referenceCount || 1));
  }

  if (recipeType === 'image_generate_recipe_v1') {
    const groupCount = Array.isArray((queuePayload as any).characterReferenceGroups)
      ? (queuePayload as any).characterReferenceGroups.length
      : 0;
    const flatCount = Array.isArray((queuePayload as any).characterImages)
      ? (queuePayload as any).characterImages.length
      : 0;
    const characterCount = Math.floor(Number((queuePayload as any).characterCount || 0));
    return Math.max(1, Math.min(8, characterCount || groupCount || flatCount || 1));
  }

  return 1;
};

const normalizePricingPart = (value: unknown) => String(value || '').trim().toLowerCase();

const getLocalPricingPayload = (queuePayload: Record<string, unknown>) => {
  const embeddedRecipe = queuePayload.__recipePayload && typeof queuePayload.__recipePayload === 'object'
    ? queuePayload.__recipePayload as Record<string, unknown>
    : null;
  const candidate = embeddedRecipe || queuePayload;
  if (isQueueRecipePayload(candidate)) {
    return getRecipeValidationPayload(candidate);
  }
  return candidate;
};

export const buildLocalPricingOptionCandidates = (queuePayload: Record<string, unknown>) => {
  const payload = getLocalPricingPayload(queuePayload) as Record<string, unknown>;
  const explicitConfigKey = normalizePricingPart(payload.config_key || queuePayload.config_key);
  const resolution = normalizePricingPart(payload.resolution);
  const quality = normalizePricingPart(payload.quality);
  const speed = normalizePricingPart(payload.speed);
  const duration = normalizePricingPart(payload.duration).replace(/s$/, '');
  const durationWithSuffix = duration ? `${duration}s` : '';
  const audio = payload.audio === true;
  const providerMode = normalizePricingPart(payload.provider_mode || payload.providerMode);
  const candidates = [
    explicitConfigKey,
    providerMode ? [resolution, durationWithSuffix || duration, providerMode].filter(Boolean).join('-') : '',
    quality ? [resolution, quality, speed].filter(Boolean).join('-') : '',
    [resolution, durationWithSuffix, audio ? 'audio' : '', speed].filter(Boolean).join('-'),
    [resolution, duration, audio ? 'audio' : '', speed].filter(Boolean).join('-'),
    [resolution, durationWithSuffix, speed].filter(Boolean).join('-'),
    [resolution, duration, speed].filter(Boolean).join('-'),
    // Grok and a few other Gommo video models price by resolution + duration;
    // their UI mode (normal/fun/...) is not part of the provider price key.
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
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
};

const resolveGommoCostFromAuditionPricing = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  queueKind: string,
  queuePayload: Record<string, unknown>,
) => {
  const modelId = getQueueModelId(queuePayload);
  const optionCandidates = buildLocalPricingOptionCandidates(queuePayload);
  if (!modelId || optionCandidates.length === 0) {
    throw new Error('INVALID_SERVER_PRICE');
  }

  const { data, error } = await admin
    .from('model_pricing')
    .select('option_id, audition_price_vcoin, tst_price_credits')
    .eq('model_id', modelId)
    .in('option_id', optionCandidates);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const selected = optionCandidates
    .map((optionId) => rows.find((row) => normalizePricingPart(row.option_id) === optionId))
    .find((row) => Number(row?.audition_price_vcoin) > 0);
  if (!selected) {
    throw new Error(`INVALID_SERVER_PRICE: Missing AUDITION AI price for ${modelId}`);
  }

  const baseVcoin = Math.ceil(Number(selected.audition_price_vcoin));
  const embeddedRecipe = queuePayload.__recipePayload && typeof queuePayload.__recipePayload === 'object'
    ? queuePayload.__recipePayload as Record<string, unknown>
    : queuePayload;
  const multiplier = queueKind === 'image_generate'
    ? getImageBillingMultiplier(queuePayload)
    : queueKind === 'motion_generate'
      ? Math.max(1, Math.ceil(Number(embeddedRecipe.motionVideoDurationSeconds || embeddedRecipe.duration || 1)))
      : 1;
  return {
    costVcoin: Math.ceil(baseVcoin * multiplier),
    pricing: {
      model_id: modelId,
      config_key: String(selected.option_id || ''),
      provider_credits: Number(selected.tst_price_credits || 0),
      base_vcoin: baseVcoin,
      multiplier,
      source: 'model_pricing_override',
    },
  };
};

const resolveServerCostVcoin = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  queueKind: string,
  queuePayload: Record<string, unknown>,
  targetProvider?: GenerationProvider,
) => {
  const storedProvider = String(queuePayload.__targetProvider || '').trim().toLowerCase();
  const resolvedProvider = targetProvider || (
    storedProvider === 'gommo' || storedProvider === 'gpti2' ? storedProvider : 'tst'
  );
  if (resolvedProvider === 'gommo' || resolvedProvider === 'gpti2') {
    return resolveGommoCostFromAuditionPricing(admin, queueKind, queuePayload);
  }
  const validation = await validateQueuePayloadAgainstLiveCatalog(queueKind, queuePayload, {
    ignoreServerAvailability: false,
  });
  const modelId = String(validation.modelId || '').trim();
  const configKey = String(validation.pricingMatch?.config_key || '').trim();
  const fallbackVcoin = creditsToVcoin(Number(validation.pricingMatch?.credits || 0));
  const overrideVcoin = await getAuditionPriceOverride(admin, modelId, configKey);
  const baseVcoin = overrideVcoin ?? fallbackVcoin;
  const multiplier = queueKind === 'image_generate' ? getImageBillingMultiplier(queuePayload) : 1;
  const costVcoin = Math.ceil(baseVcoin * multiplier);

  if (!Number.isFinite(costVcoin) || costVcoin <= 0) {
    throw new Error('INVALID_SERVER_PRICE');
  }

  return {
    costVcoin,
    pricing: {
      model_id: modelId,
      config_key: configKey || null,
      provider_credits: Number(validation.pricingMatch?.credits || 0),
      base_vcoin: baseVcoin,
      multiplier,
      source: overrideVcoin ? 'model_pricing_override' : 'provider_pricing',
    },
  };
};

export const enqueueDirectly = async (userId: string, body: QueueBody) => {
  const admin = getServiceRoleClient();
  const jobId = normalizeJobId(body.id);
  const assetType = asQueueAssetType(body.assetType);
  const queueKind = body.queueKind || (assetType === 'video' ? 'video_generate' : 'image_generate');
  const clientPlatform = normalizeQueueClientPlatform(body.clientPlatform) || 'unknown';
  const queuePayload = body.queuePayload ?? {};
  const requestedProvider = String(queuePayload.__targetProvider || '').trim().toLowerCase();
  const targetProvider: GenerationProvider = requestedProvider === 'gommo' || requestedProvider === 'gpti2'
    ? requestedProvider
    : 'tst';
  const providerLimits = PROVIDER_CONCURRENCY_LIMITS[targetProvider];
  const serverPrice = await resolveServerCostVcoin(admin, queueKind, queuePayload);
  const costVcoin = serverPrice.costVcoin;
  const normalizedToolMeta = getImageGenerateToolMetadata(queueKind, queuePayload, body.toolId, body.toolName);
  const effectiveToolId = normalizedToolMeta.toolId;
  const effectiveToolName = normalizedToolMeta.toolName;
  let chargeApplied = false;

  const { data: existing, error: existingError } = await admin
    .from('generated_images')
    .select('id, user_id, status')
    .eq('id', jobId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    if (existing.user_id !== userId) {
      throw new Error('JOB_ID_ALREADY_EXISTS');
    }

    return {
      id: existing.id,
      status: existing.status || 'queued',
      queue_position: existing.status === 'queued' ? 1 : 0,
    };
  }

  const { data: userRow, error: userError } = await admin
    .from('users')
    .select('id, vcoin_balance, account_status')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!userRow) {
    throw new Error('USER_NOT_FOUND');
  }

  if (userRow.account_status === 'locked') {
    throw new Error('AccountLocked');
  }

  if (costVcoin > Number(userRow.vcoin_balance || 0)) {
    throw new Error('INSUFFICIENT_VCOIN');
  }

  const [myImageProcessing, myVideoProcessing, myQueued, systemQueued, systemImageProcessing] =
    await Promise.all([
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('provider', targetProvider)
          .eq('asset_type', 'image'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('provider', targetProvider)
          .eq('asset_type', 'video'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'queued')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('provider', targetProvider),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'queued')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('provider', targetProvider),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('provider', targetProvider)
          .eq('asset_type', 'image'),
      ),
    ]);

  const canDispatchNow =
    assetType === 'image'
      ? myImageProcessing < providerLimits.userImage && (targetProvider !== 'gpti2' || systemImageProcessing < 20)
      : myVideoProcessing < providerLimits.userVideo;

  if (myQueued >= USER_QUEUE_LIMIT) {
    throw new Error('USER_QUEUE_LIMIT_REACHED');
  }

  if (costVcoin > 0) {
    const { data: charged, error: chargeError } = await admin.rpc('apply_balance_transaction', {
      p_target_user_id: userId,
      p_amount: -costVcoin,
      p_reason: effectiveToolName || queueKind,
      p_log_type: 'usage',
      p_reference_type: 'generated_image_charge',
      p_reference_id: jobId,
      p_metadata: {
        generated_image_id: jobId,
        tool_id: effectiveToolId,
        queue_kind: queueKind,
        asset_type: assetType,
        cost_vcoin: costVcoin,
        pricing: serverPrice.pricing,
      },
    });

    if (chargeError) {
      throw chargeError;
    }

    if (!charged) {
      throw new Error('CHARGE_ALREADY_APPLIED');
    }

    chargeApplied = true;
  }

  const now = new Date().toISOString();
  const queuePayloadWithLogs = buildInitialQueuePayload(queuePayload, queueKind, clientPlatform);
  const { error: insertError } = await admin.from('generated_images').insert({
    id: jobId,
    user_id: userId,
    image_url: '',
    prompt: body.prompt || '',
    model_used: body.engine || effectiveToolName || queueKind,
    created_at: now,
    is_public: false,
    tool_id: effectiveToolId,
    tool_name: effectiveToolName,
    status: 'queued',
    progress: 0,
    cost_vcoin: costVcoin,
    asset_type: assetType,
    updated_at: now,
    queue_kind: queueKind,
    queue_payload: queuePayloadWithLogs,
    provider: targetProvider,
    job_id: null,
    lease_token: null,
    lease_expires_at: null,
    next_poll_at: null,
    finished_at: null,
    processing_started_at: null,
    attempt_count: 0,
    last_error_at: null,
    error_message: null,
  });

  if (insertError) {
    if (chargeApplied && costVcoin > 0) {
      await admin.rpc('apply_balance_transaction', {
        p_target_user_id: userId,
        p_amount: costVcoin,
        p_reason: `Refund: ${(effectiveToolName || queueKind)} enqueue failed`,
        p_log_type: 'refund',
        p_reference_type: 'generated_image_refund',
        p_reference_id: jobId,
        p_metadata: {
          generated_image_id: jobId,
          tool_id: effectiveToolId,
          queue_kind: queueKind,
          asset_type: assetType,
          cost_vcoin: costVcoin,
          pricing: serverPrice.pricing,
        },
      });
    }
    throw insertError;
  }

  return {
    id: jobId,
    status: 'queued',
    queue_position: canDispatchNow ? 0 : systemQueued + 1,
  };
};

const runSafeWorkerTick = async (rawUrl?: string | null) => {
  try {
    if (isDedicatedQueueWorkerMode()) {
      // Render owns dispatch and polling in dedicated mode. Running another
      // daemon inside this request makes users wait and bills Netlify compute
      // for work that the background worker will claim on its next cheap probe.
      return;
    }

    await triggerBackgroundQueueWorker(rawUrl);
  } catch (workerError) {
    console.error('[queue-submit] Failed to launch background queue worker:', workerError);
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: true });
    const admin = getServiceRoleClient();
    const body = JSON.parse(event.body || '{}') as QueueBody;
    const clientPlatform = resolveQueueClientPlatform(event, body);

    if (!body.queueKind || !body.queuePayload || !body.assetType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required queue payload fields' }),
      };
    }

    if (
      body.queuePayload.recipeType === 'image_generate_recipe_v1' &&
      Math.floor(Number(body.queuePayload.characterCount || 0)) >= 8
    ) {
      body.queuePayload = {
        ...body.queuePayload,
        sampleImage: null,
        sampleAnalysisImage: null,
      };
    }

    const modelId = getQueueModelId(body.queuePayload);
    const providerRouteKey = inferGenerationProviderRouteKey({
      queueKind: body.queueKind,
      toolId: body.toolId,
      queuePayload: body.queuePayload,
    });
    const routingConfig = await getGenerationProvider(admin, modelId, providerRouteKey);
    if (routingConfig.allowedModels && !routingConfig.allowedModels.includes(modelId)
      && !(providerRouteKey !== 'video_generation' && providerRouteKey !== 'motion_control' && routingConfig.provider === 'gpti2' && ['gpt-image-2', 'nano-banana-2', 'nano-banana-pro'].includes(modelId))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `MODEL_NOT_ALLOWED_FOR_FEATURE: Model ${modelId || '(empty)'} is not enabled for ${providerRouteKey || 'this feature'}.`,
          allowedModels: routingConfig.allowedModels,
        }),
      };
    }
    const normalizedQueueKind = String(body.queueKind || '').trim().toLowerCase();
    const isVideoOrMotionQueue = body.assetType === 'video' || normalizedQueueKind === 'video_generate' || normalizedQueueKind === 'motion_generate';
    const targetProvider: GenerationProvider = isVideoOrMotionQueue && routingConfig.provider === 'gpti2'
      ? routingConfig.priority.find((provider) => provider === 'tst' || provider === 'gommo') || 'tst'
      : routingConfig.provider;
    ensureProviderConfiguredForQueueKind(body.queueKind, targetProvider);
    if (
      TST_QUEUE_KINDS.has(String(body.queueKind || '').trim().toLowerCase()) &&
      targetProvider === 'gommo'
    ) {
      const gommoValidationPayload = isQueueRecipePayload(body.queuePayload)
        ? getRecipeValidationPayload(body.queuePayload)
        : { ...body.queuePayload, model: modelId };
      const gommoValidation = await normalizeAndValidateGommoPayload(body.queueKind, gommoValidationPayload);
      const gommoServerId = getGommoServerIdForMode(gommoValidation.model, gommoValidation.mode);
      if (!(await isProviderServerAllowedByConfig('gommo', modelId, gommoServerId))) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({
            error: `GOMMO_SERVER_DISABLED: Server ${gommoServerId || '(unknown)'} của model ${modelId} đang bị khóa trong Admin.`,
          }),
        };
      }
    }
    body.queuePayload = {
      ...body.queuePayload,
      __targetProvider: targetProvider,
      __providerRouteKey: providerRouteKey,
      __smartProviderFallbackEnabled: routingConfig.smartFallbackEnabled,
      __providerPriority: routingConfig.priority,
    };

    let row: any;
    const queuePayloadWithLogs = buildInitialQueuePayload(body.queuePayload, body.queueKind, clientPlatform);
    const normalizedToolMeta = getImageGenerateToolMetadata(body.queueKind, queuePayloadWithLogs, body.toolId, body.toolName);
    const serverPrice = await resolveServerCostVcoin(admin, body.queueKind, queuePayloadWithLogs, targetProvider);
    const normalizedBody: QueueBody = {
      ...body,
      costVcoin: serverPrice.costVcoin,
      toolId: normalizedToolMeta.toolId,
      toolName: normalizedToolMeta.toolName,
      clientPlatform,
      queuePayload: queuePayloadWithLogs,
    };

    // The deployed queue RPC predates GPTi2 and coerces every non-Gommo job
    // to TST. Use the server-side direct path until the database migration is
    // installed, otherwise a valid GPTi2 job is dispatched to the wrong API.
    if (targetProvider === 'gpti2') {
      row = await enqueueDirectly(user.id, normalizedBody);
    } else {
      const rpcResult = await admin.rpc('server_enqueue_generated_job', {
        p_id: normalizeJobId(body.id),
        p_user_id: user.id,
        p_prompt: body.prompt || '',
        p_tool_id: normalizedToolMeta.toolId,
        p_tool_name: normalizedToolMeta.toolName,
        p_engine: body.engine || normalizedToolMeta.toolName || body.queueKind,
        p_asset_type: asQueueAssetType(body.assetType),
        p_cost_vcoin: serverPrice.costVcoin,
        p_queue_kind: body.queueKind,
        p_queue_payload: queuePayloadWithLogs,
      });

      if (rpcResult.error) {
      const message = rpcResult.error.message || 'Failed to enqueue job';
      const shouldFallback =
        rpcResult.error.code === 'PGRST202' ||
        /server_enqueue_generated_job/i.test(message) ||
        /function .* does not exist/i.test(message);

      if (!shouldFallback) {
        const mapped = mapQueueError(message);
        return {
          statusCode: mapped.statusCode,
          headers,
          body: JSON.stringify({ error: mapped.error }),
        };
      }

      console.warn('[queue-submit] Falling back to direct enqueue because RPC is unavailable:', message);
      row = await enqueueDirectly(user.id, normalizedBody);
      } else {
        row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      }
    }

    await runSafeWorkerTick(event.rawUrl);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        userId: user.id,
        job: row,
      }),
    };
  } catch (error: any) {
    const mapped = mapQueueError(error?.message || 'Internal Server Error');
    return {
      statusCode: error?.message === 'Unauthorized' ? 401 : mapped.statusCode,
      headers,
      body: JSON.stringify({ error: error?.message === 'Unauthorized' ? 'Unauthorized' : mapped.error }),
    };
  }
};
