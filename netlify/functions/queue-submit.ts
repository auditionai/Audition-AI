import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { runQueueWorker } from './_queue-worker';
import type { QueueProcessingStage, QueueProgressLogEntry } from '../../shared/queueRecipes';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_IMAGE_LIMIT = 4;
const SYSTEM_VIDEO_LIMIT = 4;
const SYSTEM_QUEUE_LIMIT = 10;
const USER_IMAGE_LIMIT = 1;
const USER_VIDEO_LIMIT = 1;
const USER_QUEUE_LIMIT = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const isImmediateStartCandidate = (row: any) => Number(row?.queue_position ?? 1) === 0;

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`QUEUE_SUBMIT_TICK_TIMEOUT_${timeoutMs}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const mapQueueError = (message: string) => {
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

const normalizeJobId = (value: unknown) => {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : randomUUID();
};

const countRows = async (query: PromiseLike<{ count: number | null; error: any }>) => {
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count ?? 0;
};

export const enqueueDirectly = async (userId: string, body: QueueBody) => {
  const admin = getServiceRoleClient();
  const jobId = normalizeJobId(body.id);
  const assetType = asQueueAssetType(body.assetType);
  const costVcoin = Number(body.costVcoin || 0);
  const queueKind = body.queueKind || (assetType === 'video' ? 'video_generate' : 'image_generate');
  const queuePayload = body.queuePayload ?? {};
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
          .eq('asset_type', 'image'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'processing')
          .eq('asset_type', 'video'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'queued'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing')
          .eq('asset_type', 'image'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing')
          .eq('asset_type', 'video'),
      ),
      countRows(
        admin
          .from('generated_images')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'queued'),
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
      p_reason: body.toolName || queueKind,
      p_log_type: 'usage',
      p_reference_type: 'generated_image_charge',
      p_reference_id: jobId,
      p_metadata: {
        generated_image_id: jobId,
        tool_id: body.toolId || queueKind,
        queue_kind: queueKind,
        asset_type: assetType,
        cost_vcoin: costVcoin,
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
  const queuePayloadWithLogs =
    queuePayload && typeof queuePayload === 'object'
      ? {
          ...queuePayload,
          __stage: 'queued',
          __logs: buildInitialQueueLogs(queueKind),
        }
      : queuePayload;
  const { error: insertError } = await admin.from('generated_images').insert({
    id: jobId,
    user_id: userId,
    image_url: '',
    prompt: body.prompt || '',
    model_used: body.engine || body.toolName || queueKind,
    created_at: now,
    is_public: false,
    tool_id: body.toolId || queueKind,
    tool_name: body.toolName || queueKind,
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
        p_reason: `Refund: ${(body.toolName || queueKind)} enqueue failed`,
        p_log_type: 'refund',
        p_reference_type: 'generated_image_refund',
        p_reference_id: jobId,
        p_metadata: {
          generated_image_id: jobId,
          tool_id: body.toolId || queueKind,
          queue_kind: queueKind,
          asset_type: assetType,
          cost_vcoin: costVcoin,
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

const runSafeWorkerTick = async (awaitCompletion = false) => {
  if (awaitCompletion) {
    try {
      await withTimeout(runQueueWorker(), 9000);
    } catch (workerError) {
      console.error('[queue-submit] Immediate worker tick failed:', workerError);
    }
    return;
  }

  runQueueWorker().catch((workerError) => {
    console.error('[queue-submit] Immediate worker tick failed:', workerError);
  });
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

    if (!body.queueKind || !body.queuePayload || !body.assetType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required queue payload fields' }),
      };
    }

    let row: any;
    const queuePayloadWithLogs =
      body.queuePayload && typeof body.queuePayload === 'object'
        ? {
            ...body.queuePayload,
            __stage: 'queued',
            __logs: buildInitialQueueLogs(body.queueKind),
          }
        : body.queuePayload;

    const rpcResult = await admin.rpc('server_enqueue_generated_job', {
      p_id: normalizeJobId(body.id),
      p_user_id: user.id,
      p_prompt: body.prompt || '',
      p_tool_id: body.toolId || body.queueKind,
      p_tool_name: body.toolName || body.queueKind,
      p_engine: body.engine || body.toolName || body.queueKind,
      p_asset_type: asQueueAssetType(body.assetType),
      p_cost_vcoin: Number(body.costVcoin || 0),
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
      row = await enqueueDirectly(user.id, body);
    } else {
      row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    }

    await runSafeWorkerTick(isImmediateStartCandidate(row));

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
