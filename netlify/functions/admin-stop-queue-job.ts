import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { markManualStopMeta } from '../../shared/queueRescueState';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type QueueProgressLogEntry = {
  at: string;
  stage: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

const MAX_QUEUE_LOG_ENTRIES = 80;

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
  level: QueueProgressLogEntry['level'] = 'warning',
) => {
  const nextEntry: QueueProgressLogEntry = {
    at: new Date().toISOString(),
    stage,
    level,
    message,
  };
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
    __stage: 'failed',
    __logs: nextLogs,
  };
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

    if (requesterError) throw requesterError;
    if (!requester?.is_admin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const jobId = String(body?.jobId || '').trim();
    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing jobId' }),
      };
    }

    const { data: row, error } = await admin
      .from('generated_images')
      .select('id, status, queue_payload, job_id, tool_name')
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    if (String(row.status || '').toLowerCase() === 'completed') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Completed jobs cannot be stopped.' }),
      };
    }

    const stoppedPayload = markManualStopMeta(
      withQueueLog(row.queue_payload || null, 'failed', 'Quản trị viên đã dừng thủ công tiến trình này.', 'warning'),
    );

    await admin
      .from('generated_images')
      .update({
        status: 'failed',
        error_message: 'Admin manually stopped this job.',
        queue_payload: stoppedPayload,
        progress: 0,
        finished_at: new Date().toISOString(),
        next_poll_at: null,
        lease_token: null,
        lease_expires_at: null,
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    let refunded = false;
    if (String(row.status || '').toLowerCase() === 'queued' || String(row.status || '').toLowerCase() === 'processing') {
      const { error: refundError } = await admin.rpc('refund_generated_job', {
        p_generated_image_id: jobId,
        p_reason: `Refund: admin stopped ${row.tool_name || 'queue job'}`,
      });
      refunded = !refundError;
      if (refundError) {
        console.warn('[admin-stop-queue-job] refund_failed', refundError);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        refunded,
        jobId,
        providerJobId: row.job_id || null,
      }),
    };
  } catch (error: any) {
    console.error('[admin-stop-queue-job] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
