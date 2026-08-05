import type { Handler } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { isSystemQueueKind } from '../../shared/queueKinds';
import { getAuthenticatedRequestErrorStatus, getServiceRoleClient, requireAdminUser } from './_supabase';
import { triggerBackgroundQueueWorker } from './_queue-launcher';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type AdminRetryProvider = 'tst' | 'gommo';

const toPayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const assertProviderConfigured = (provider: AdminRetryProvider) => {
  if (provider === 'tst' && !String(process.env.TST_API_KEY || '').trim()) {
    throw new Error('API 1 chưa được cấu hình TST_API_KEY.');
  }
  if (
    provider === 'gommo' &&
    !String(process.env.GOMMO_ACCESS_TOKEN || process.env.GOMMO_API_TOKEN || '').trim()
  ) {
    throw new Error('API 2 chưa được cấu hình GOMMO_ACCESS_TOKEN.');
  }
};

const buildRetryPayload = (
  sourcePayload: unknown,
  sourceJobId: string,
  retryJobId: string,
  provider: AdminRetryProvider,
  requestedBy: string,
) => {
  const source = toPayload(sourcePayload);
  const next: Record<string, unknown> = {};

  // Keep the generation recipe and user-facing options, but never copy provider
  // dispatch/lease/rescue state into the new queue item.
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('__')) next[key] = value;
  }
  for (const key of ['__recipePayload', '__showInGenerationHistory', '__clientPlatform']) {
    if (source[key] !== undefined) next[key] = source[key];
  }

  const now = new Date().toISOString();
  return {
    ...next,
    __stage: 'queued',
    __targetProvider: provider,
    __smartProviderFallbackEnabled: false,
    __adminRetrySourceJobId: sourceJobId,
    __adminRetryJobId: retryJobId,
    __adminRetryProvider: provider,
    __adminRetryRequestedBy: requestedBy,
    __adminRetriedAt: now,
    __logs: [{
      at: now,
      stage: 'queued',
      level: 'info',
      message: `Quản trị viên chạy lại job bằng ${provider === 'tst' ? 'API 1' : 'API 2'}.`,
    }],
  };
};

export const retryFailedQueueJob = async (params: {
  jobId: string;
  provider: AdminRetryProvider;
  requestedBy: string;
  rawUrl?: string | null;
}) => {
  const admin = getServiceRoleClient();
  const jobId = String(params.jobId || '').trim();
  const provider = params.provider;
  assertProviderConfigured(provider);

  const { data: source, error: sourceError } = await admin
    .from('generated_images')
    .select('id, user_id, status, prompt, tool_id, tool_name, model_used, asset_type, cost_vcoin, queue_kind, queue_payload')
    .eq('id', jobId)
    .maybeSingle();

  if (sourceError) throw sourceError;
  if (!source) throw new Error('JOB_NOT_FOUND');
  if (String(source.status || '').toLowerCase() !== 'failed') {
    throw new Error('ONLY_FAILED_JOB_CAN_RETRY');
  }
  if (!isSystemQueueKind(source.queue_kind)) {
    throw new Error('UNSUPPORTED_RETRY_QUEUE_KIND');
  }

  // Return an active child when the admin double-clicks instead of charging twice.
  const { data: activeRetries, error: activeRetryError } = await admin
    .from('generated_images')
    .select('id, status, cost_vcoin, created_at')
    .contains('queue_payload', {
      __adminRetrySourceJobId: jobId,
      __adminRetryProvider: provider,
    })
    .in('status', ['queued', 'processing', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (activeRetryError) throw activeRetryError;
  if (activeRetries?.[0]) {
    return {
      success: true,
      reused: true,
      sourceJobId: jobId,
      retryJobId: String(activeRetries[0].id),
      status: String(activeRetries[0].status),
      provider,
      costVcoin: Number(activeRetries[0].cost_vcoin || source.cost_vcoin || 0),
    };
  }

  const retryJobId = randomUUID();
  const retryPayload = buildRetryPayload(
    source.queue_payload,
    jobId,
    retryJobId,
    provider,
    params.requestedBy,
  );
  const costVcoin = Math.max(0, Math.floor(Number(source.cost_vcoin || 0)));
  const { data: enqueueData, error: enqueueError } = await admin.rpc('server_enqueue_generated_job', {
    p_id: retryJobId,
    p_user_id: source.user_id,
    p_prompt: source.prompt || '',
    p_tool_id: source.tool_id || source.queue_kind,
    p_tool_name: source.tool_name || source.queue_kind,
    p_engine: source.model_used || source.tool_name || source.queue_kind,
    p_asset_type: source.asset_type === 'video' ? 'video' : 'image',
    p_cost_vcoin: costVcoin,
    p_queue_kind: source.queue_kind,
    p_queue_payload: retryPayload,
  });

  if (enqueueError) throw enqueueError;

  const sourcePayload = toPayload(source.queue_payload);
  const sourceLogs = Array.isArray(sourcePayload.__logs) ? sourcePayload.__logs : [];
  const now = new Date().toISOString();
  await admin
    .from('generated_images')
    .update({
      queue_payload: {
        ...sourcePayload,
        __adminRetryLatestJobId: retryJobId,
        __adminRetryProvider: provider,
        __adminRetriedAt: now,
        __logs: [...sourceLogs, {
          at: now,
          stage: 'failed',
          level: 'info',
          message: `Đã tạo job chạy lại #${retryJobId.slice(0, 12)} bằng ${provider === 'tst' ? 'API 1' : 'API 2'}.`,
        }].slice(-80),
      },
      updated_at: now,
    })
    .eq('id', jobId);

  try {
    await triggerBackgroundQueueWorker(params.rawUrl);
  } catch (workerError) {
    console.warn('[admin-retry-queue-job] queued but worker launch failed:', workerError);
  }

  const queuedRow = Array.isArray(enqueueData) ? enqueueData[0] : enqueueData;
  return {
    success: true,
    reused: false,
    sourceJobId: jobId,
    retryJobId,
    status: String(queuedRow?.status || 'queued'),
    queuePosition: Number(queuedRow?.queue_position || 0),
    provider,
    costVcoin,
  };
};

const mapError = (message: string) => {
  if (message === 'Forbidden') return { statusCode: 403, error: 'Forbidden' };
  if (message === 'JOB_NOT_FOUND') return { statusCode: 404, error: 'Không tìm thấy job.' };
  if (message === 'ONLY_FAILED_JOB_CAN_RETRY') return { statusCode: 409, error: 'Chỉ có thể chạy lại job đã thất bại.' };
  if (message === 'UNSUPPORTED_RETRY_QUEUE_KIND') return { statusCode: 400, error: 'Loại job này chưa hỗ trợ chạy lại an toàn.' };
  if (/INSUFFICIENT_BALANCE/i.test(message)) return { statusCode: 409, error: 'Tài khoản người dùng không đủ Vcoin để chạy lại job.' };
  if (/QUEUE_LIMIT_REACHED/i.test(message)) return { statusCode: 409, error: 'Người dùng đang đạt giới hạn queue, vui lòng thử lại sau.' };
  return { statusCode: 500, error: message || 'Internal Server Error' };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAdminUser(event);
    const body = JSON.parse(event.body || '{}');
    const jobId = String(body?.jobId || '').trim();
    const provider = String(body?.provider || '').trim().toLowerCase();
    if (!jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Thiếu jobId.' }) };
    if (provider !== 'tst' && provider !== 'gommo') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Provider phải là API 1 hoặc API 2.' }) };
    }

    const result = await retryFailedQueueJob({
      jobId,
      provider,
      requestedBy: user.id,
      rawUrl: event.rawUrl,
    });
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (error: any) {
    console.error('[admin-retry-queue-job] failed:', error);
    const message = error?.message || 'Internal Server Error';
    const mapped = mapError(message);
    const authStatus = getAuthenticatedRequestErrorStatus(error, mapped.statusCode);
    return { statusCode: authStatus, headers, body: JSON.stringify({ error: mapped.error }) };
  }
};
