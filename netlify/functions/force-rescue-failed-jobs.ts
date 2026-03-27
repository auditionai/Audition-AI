import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { clearFailedRescueMeta, hasFailedRescueFinalized } from '../../shared/queueRescueState';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TST_API_KEY = process.env.TST_API_KEY || '';
const TST_API_BASE = 'https://api.tramsangtao.com/v1';
const POLL_INTERVAL_SECONDS = 10;
const MAX_QUEUE_LOG_ENTRIES = 80;
const DEFAULT_LOOKBACK_HOURS = 72;
const DEFAULT_LIMIT = 20;

type RescueJobRow = {
  id: string;
  user_id: string;
  asset_type: 'image' | 'video';
  queue_kind: string;
  queue_payload: Record<string, unknown> | null;
  prompt: string;
  tool_id: string | null;
  tool_name: string | null;
  model_used: string | null;
  cost_vcoin: number | null;
  job_id?: string | null;
  error_message?: string | null;
  image_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type QueueProgressLogEntry = {
  at: string;
  stage: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

type RescueRequestBody = {
  jobId?: string;
  idPrefix?: string;
  limit?: number;
  lookbackHours?: number;
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error || data?.message || data?.detail || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const toPayloadObject = (payload?: Record<string, unknown> | null): Record<string, unknown> =>
  payload && typeof payload === 'object' ? { ...payload } : {};

const getQueueLogs = (payload?: Record<string, unknown> | null): QueueProgressLogEntry[] => {
  const rawLogs = toPayloadObject(payload).__logs;
  if (!Array.isArray(rawLogs)) {
    return [];
  }

  return rawLogs.filter(
    (entry): entry is QueueProgressLogEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as QueueProgressLogEntry).at === 'string' &&
      typeof (entry as QueueProgressLogEntry).stage === 'string' &&
      typeof (entry as QueueProgressLogEntry).level === 'string' &&
      typeof (entry as QueueProgressLogEntry).message === 'string',
  );
};

const withQueueLog = (
  payload: Record<string, unknown> | null | undefined,
  stage: string,
  message: string,
  level: QueueProgressLogEntry['level'] = 'info',
) => {
  const nextEntry = {
    at: new Date().toISOString(),
    stage,
    level,
    message,
  } satisfies QueueProgressLogEntry;
  const previousLogs = getQueueLogs(payload);
  const lastEntry = previousLogs.at(-1);
  const nextLogs =
    lastEntry &&
    lastEntry.stage === nextEntry.stage &&
    lastEntry.level === nextEntry.level &&
    lastEntry.message === nextEntry.message
      ? [...previousLogs.slice(0, -1), { ...lastEntry, at: nextEntry.at }].slice(-MAX_QUEUE_LOG_ENTRIES)
      : [...previousLogs, nextEntry].slice(-MAX_QUEUE_LOG_ENTRIES);

  return {
    ...toPayloadObject(payload),
    __stage: stage,
    __logs: nextLogs,
  };
};

const extractResultUrl = (data: any): string | null => {
  if (typeof data?.result === 'string' && data.result.trim()) return data.result.trim();
  if (Array.isArray(data?.result) && typeof data.result[0] === 'string' && data.result[0].trim()) return data.result[0].trim();
  if (typeof data?.output === 'string' && data.output.trim()) return data.output.trim();
  if (Array.isArray(data?.output) && typeof data.output[0] === 'string' && data.output[0].trim()) return data.output[0].trim();
  if (typeof data?.data?.result === 'string' && data.data.result.trim()) return data.data.result.trim();
  if (Array.isArray(data?.data?.result) && typeof data.data.result[0] === 'string' && data.data.result[0].trim()) return data.data.result[0].trim();
  if (typeof data?.data?.output === 'string' && data.data.output.trim()) return data.data.output.trim();
  if (Array.isArray(data?.data?.output) && typeof data.data.output[0] === 'string' && data.data.output[0].trim()) return data.data.output[0].trim();
  return null;
};

const pollProviderJob = async (providerJobId: string) => {
  if (!TST_API_KEY) {
    throw new Error('Missing TST_API_KEY environment variable');
  }

  const response = await fetch(`${TST_API_BASE}/jobs/${encodeURIComponent(providerJobId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TST_API_KEY}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.json();
};

const rescueCompletedJob = async (job: RescueJobRow, resultUrl: string, providerStatus: string, providerMessage: string) => {
  const admin = getServiceRoleClient();
  const nextPayload = clearFailedRescueMeta(
    withQueueLog(
      job.queue_payload,
      'completed',
      providerStatus === 'completed'
        ? 'Force rescue: da tim thay ket qua hop le tren TST va dong bo lai thanh cong.'
        : `Force rescue: TST bao "${providerMessage}" nhung van tra ve ket qua hop le. Da uu tien luu anh ket qua.`,
      'warning',
    ),
  );
  await admin
    .from('generated_images')
    .update({
      status: 'completed',
      image_url: resultUrl,
      error_message: null,
      progress: 100,
      finished_at: new Date().toISOString(),
      next_poll_at: null,
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
      queue_payload: nextPayload,
    })
    .eq('id', job.id);
};

const reviveProcessingJob = async (job: RescueJobRow, providerStatus: string) => {
  const admin = getServiceRoleClient();
  const nextPayload = {
    ...withQueueLog(
      job.queue_payload,
      'polling',
      `Force rescue: TST hien dang o trang thai ${providerStatus}. Da dua job tro lai processing de tiep tuc dong bo.`,
      'warning',
    ),
    __failedRescueFinalized: false,
  };
  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      error_message: null,
      finished_at: null,
      progress: 60,
      next_poll_at: new Date(Date.now() + POLL_INTERVAL_SECONDS * 1000).toISOString(),
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
      queue_payload: nextPayload,
    })
    .eq('id', job.id);
};

const markRescueCheckedWithoutResult = async (job: RescueJobRow, providerStatus: string, providerMessage: string) => {
  const admin = getServiceRoleClient();
  const nextPayload = clearFailedRescueMeta(
    withQueueLog(
      job.queue_payload,
      'failed',
      `Force rescue: da kiem tra lai TST, chua co ket qua de cuu. Trang thai provider = ${providerStatus || 'unknown'}. ${providerMessage || ''}`.trim(),
      'warning',
    ),
  );
  await admin
    .from('generated_images')
    .update({
      updated_at: new Date().toISOString(),
      queue_payload: nextPayload,
    })
    .eq('id', job.id);
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
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
    const { data: requester, error: requesterError } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (requesterError) {
      throw requesterError;
    }

    if (!requester?.is_admin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden' }),
      };
    }

    const body = JSON.parse(event.body || '{}') as RescueRequestBody;
    const lookbackHours = Math.max(1, Math.min(168, Number(body.lookbackHours || DEFAULT_LOOKBACK_HOURS)));
    const limit = Math.max(1, Math.min(50, Number(body.limit || DEFAULT_LIMIT)));
    const exactJobId = String(body.jobId || '').trim().toLowerCase();
    const idPrefix = String(body.idPrefix || '').trim().toLowerCase();
    const lookbackIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from('generated_images')
      .select('id, user_id, asset_type, queue_kind, queue_payload, prompt, tool_id, tool_name, model_used, cost_vcoin, job_id, error_message, image_url, created_at, updated_at')
      .eq('status', 'failed')
      .not('job_id', 'is', null)
      .gte('created_at', lookbackIso)
      .order('updated_at', { ascending: true })
      .limit(limit * 5);

    if (error) {
      throw error;
    }

    const jobs = ((data || []) as RescueJobRow[])
      .filter((job) => !String(job.image_url || '').trim())
      .filter((job) => !hasFailedRescueFinalized(job.queue_payload))
      .filter((job) => !exactJobId || job.id.toLowerCase() === exactJobId)
      .filter((job) => !idPrefix || job.id.toLowerCase().startsWith(idPrefix))
      .slice(0, limit);

    let rescued = 0;
    let revived = 0;
    let checked = 0;
    const results: Array<{ id: string; providerJobId: string; action: string; detail?: string }> = [];

    for (const job of jobs) {
      const providerJobId = String(job.job_id || '').trim();
      if (!providerJobId) {
        continue;
      }

      checked += 1;
      try {
        const providerData = await pollProviderJob(providerJobId);
        const providerStatus = String(providerData?.status || '').toLowerCase();
        const providerMessage = String(providerData?.error || providerData?.message || '').trim();
        const resultUrl = extractResultUrl(providerData);

        if (resultUrl) {
          await rescueCompletedJob(job, resultUrl, providerStatus, providerMessage);
          rescued += 1;
          results.push({ id: job.id, providerJobId, action: 'rescued', detail: providerStatus || 'result_found' });
          continue;
        }

        if (['processing', 'queued', 'pending', 'submitted'].includes(providerStatus)) {
          await reviveProcessingJob(job, providerStatus);
          revived += 1;
          results.push({ id: job.id, providerJobId, action: 'revived', detail: providerStatus });
          continue;
        }

        await markRescueCheckedWithoutResult(job, providerStatus, providerMessage);
        results.push({ id: job.id, providerJobId, action: 'no_result', detail: providerMessage || providerStatus || 'no_result_url' });
      } catch (pollError: any) {
        const detail = String(pollError?.message || 'Failed to poll provider');
        await markRescueCheckedWithoutResult(job, 'poll_error', detail);
        results.push({ id: job.id, providerJobId, action: 'poll_error', detail });
      }
    }

    if (revived > 0) {
      try {
        await triggerBackgroundQueueWorker(event.rawUrl, 1_000);
      } catch (workerError) {
        console.warn('[force-rescue-failed-jobs] Failed to trigger background worker:', workerError);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checked,
        rescued,
        revived,
        totalCandidates: jobs.length,
        results,
      }),
    };
  } catch (error: any) {
    console.error('[force-rescue-failed-jobs] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
