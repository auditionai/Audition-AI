import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { runQueueDaemon } from './_queue-daemon';
import { isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { validateQueuePayloadAgainstLiveCatalog } from './_tst-live-catalog';
import type { QueueProcessingStage, QueueProgressLogEntry } from '../../shared/queueRecipes';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Platform',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_IMAGE_LIMIT = 4;
const SYSTEM_VIDEO_LIMIT = 4;
const SYSTEM_QUEUE_LIMIT = 10;
const USER_IMAGE_LIMIT = 1;
const USER_VIDEO_LIMIT = 1;
const USER_QUEUE_LIMIT = 1;
const TST_QUEUE_KINDS = new Set(['image_generate', 'video_generate', 'motion_generate']);
const TST_QUEUE_KIND_VALUES = Array.from(TST_QUEUE_KINDS);
const INLINE_QUEUE_KICK_MAX_RUNTIME_MS = 8_000;
const INLINE_QUEUE_WAKE_WINDOW_MS = 30_000;
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

let dedicatedDispatchWakePromise: Promise<void> | null = null;

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

const ensureProviderConfiguredForQueueKind = (queueKind?: string) => {
  const normalizedQueueKind = String(queueKind || '').trim().toLowerCase();
  if (!TST_QUEUE_KINDS.has(normalizedQueueKind)) {
    return;
  }

  if (!String(process.env.TST_API_KEY || '').trim()) {
    throw new Error(
      'May chu Audition AI dang thieu TST_API_KEY nen tam thoi khong the nhan job moi. Day la loi cau hinh server cua app, khong phai TST ben ngoai bi down.',
    );
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

  if (characterCount >= 5) {
    return { toolId: 'group_5_gen', toolName: 'Group of 5' };
  }
  if (characterCount === 4) {
    return { toolId: 'group_4_gen', toolName: 'Clan of 4' };
  }
  if (characterCount === 3) {
    return { toolId: 'group_3_gen', toolName: 'Squad of 3' };
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
    return Math.max(1, Math.min(5, explicitUnits || referenceCount || 1));
  }

  if (recipeType === 'image_generate_recipe_v1') {
    const groupCount = Array.isArray((queuePayload as any).characterReferenceGroups)
      ? (queuePayload as any).characterReferenceGroups.length
      : 0;
    const flatCount = Array.isArray((queuePayload as any).characterImages)
      ? (queuePayload as any).characterImages.length
      : 0;
    const characterCount = Math.floor(Number((queuePayload as any).characterCount || 0));
    return Math.max(1, Math.min(5, characterCount || groupCount || flatCount || 1));
  }

  return 1;
};

const resolveServerCostVcoin = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  queueKind: string,
  queuePayload: Record<string, unknown>,
) => {
  const validation = await validateQueuePayloadAgainstLiveCatalog(queueKind, queuePayload);
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
    .select('id, vcoin_balance')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!userRow) {
    throw new Error('USER_NOT_FOUND');
  }

  if (costVcoin > Number(userRow.vcoin_balance || 0)) {
    throw new Error('INSUFFICIENT_VCOIN');
  }

  const [myImageProcessing, myVideoProcessing, myQueued, systemImageProcessing, systemVideoProcessing, systemQueued] =
    await Promise.all([
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('asset_type', 'image'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('asset_type', 'video'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'queued')
          .in('queue_kind', TST_QUEUE_KIND_VALUES),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('asset_type', 'image'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing')
          .in('queue_kind', TST_QUEUE_KIND_VALUES)
          .eq('asset_type', 'video'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'queued')
          .in('queue_kind', TST_QUEUE_KIND_VALUES),
      ),
    ]);

  const canDispatchNow =
    assetType === 'image'
      ? myImageProcessing < USER_IMAGE_LIMIT && systemImageProcessing < SYSTEM_IMAGE_LIMIT
      : myVideoProcessing < USER_VIDEO_LIMIT && systemVideoProcessing < SYSTEM_VIDEO_LIMIT;

  if (!canDispatchNow && myQueued >= USER_QUEUE_LIMIT) {
    throw new Error('USER_QUEUE_LIMIT_REACHED');
  }

  if (!canDispatchNow && systemQueued >= SYSTEM_QUEUE_LIMIT) {
    throw new Error('SYSTEM_QUEUE_FULL');
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
    provider: 'tst',
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
      if (!dedicatedDispatchWakePromise) {
        dedicatedDispatchWakePromise = (async () => {
          const stopAt = Date.now() + INLINE_QUEUE_WAKE_WINDOW_MS;
          while (Date.now() < stopAt) {
            const summary = await runQueueDaemon({
              lane: 'dispatch',
              maxRuntimeMs: INLINE_QUEUE_KICK_MAX_RUNTIME_MS,
              idleIterationsToStop: 1,
              activeDelayMs: 50,
              idleDelayMs: 100,
            });

            const hadDispatchActivity =
              Number(summary.claimedForDispatch || 0) > 0 ||
              Number(summary.submitted || 0) > 0 ||
              Number(summary.failed || 0) > 0 ||
              Number(summary.requeued || 0) > 0;

            if (!hadDispatchActivity) {
              break;
            }
          }
        })().catch((workerError) => {
          console.error('[queue-submit] Inline dedicated dispatch wake failed:', workerError);
        }).finally(() => {
          dedicatedDispatchWakePromise = null;
        });
      }
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
    const { user } = await requireAuthenticatedUser(event);
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

    ensureProviderConfiguredForQueueKind(body.queueKind);

    let row: any;
    const queuePayloadWithLogs = buildInitialQueuePayload(body.queuePayload, body.queueKind, clientPlatform);
    const normalizedToolMeta = getImageGenerateToolMetadata(body.queueKind, queuePayloadWithLogs, body.toolId, body.toolName);
    const serverPrice = await resolveServerCostVcoin(admin, body.queueKind, queuePayloadWithLogs);
    const normalizedBody: QueueBody = {
      ...body,
      costVcoin: serverPrice.costVcoin,
      toolId: normalizedToolMeta.toolId,
      toolName: normalizedToolMeta.toolName,
      clientPlatform,
    };

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
