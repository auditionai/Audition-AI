import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { refreshAutoDisabledServerAvailability } from './_server-availability';
import type { QueueProgressLogEntry } from '../../shared/queueRecipes';
import { classifyQueueError, isTerminalRescueFailureMessage, normalizeQueueErrorMessage, pickQueueFailureMessage } from '../../shared/queueErrorClassifier';
import { clearFailedRescueMeta, hasFailedRescuePending, isFailedRescueStale } from '../../shared/queueRescueState';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const WORKER_LOCK_LEASE_SECONDS = 120;
const STALE_PRE_DISPATCH_RECONCILE_MS = 45_000;

const tryAcquireQueueWorkerLock = async (owner: string) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('try_acquire_queue_worker_lock', {
    p_owner: owner,
    p_lease_seconds: WORKER_LOCK_LEASE_SECONDS,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /try_acquire_queue_worker_lock/i.test(message)) {
      console.warn('[queue-reconcile] Lock RPC missing, continuing without distributed lock.');
      return true;
    }
    throw error;
  }

  return data !== false;
};

const releaseQueueWorkerLock = async (owner: string) => {
  const admin = getServiceRoleClient();
  const { error } = await admin.rpc('release_queue_worker_lock', {
    p_owner: owner,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /release_queue_worker_lock/i.test(message)) {
      return;
    }
    console.warn('[queue-reconcile] Failed to release queue worker lock:', error);
  }
};

const hasQueueActivity = (summary: Awaited<ReturnType<typeof runQueueDaemon>>) =>
  Number(summary.claimedForDispatch || 0) > 0 ||
  Number(summary.submitted || 0) > 0 ||
  Number(summary.claimedForPoll || 0) > 0 ||
  Number(summary.completed || 0) > 0 ||
  Number(summary.failed || 0) > 0 ||
  Number(summary.requeued || 0) > 0;

const hasOutstandingQueueWork = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('generated_images')
    .select('id')
    .in('status', ['queued', 'processing'])
    .limit(1);

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length > 0;
};

const normalizeQueueLogs = (payload: Record<string, unknown> | null | undefined): QueueProgressLogEntry[] => {
  const rawLogs = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__logs : null;
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

const finalizeTerminalFailedRescues = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('generated_images')
    .select('id, status, error_message, queue_payload')
    .eq('status', 'failed')
    .not('job_id', 'is', null)
    .limit(200);

  if (error) {
    throw error;
  }

  let finalized = 0;

  for (const row of (data || []) as any[]) {
    const payload = row?.queue_payload && typeof row.queue_payload === 'object'
      ? row.queue_payload as Record<string, unknown>
      : null;

    if (!hasFailedRescuePending(payload)) {
      continue;
    }

    if (isFailedRescueStale(payload)) {
      await admin
        .from('generated_images')
        .update({
          queue_payload: clearFailedRescueMeta(payload),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      finalized += 1;
      continue;
    }

    const queueLogs = normalizeQueueLogs(payload);
    const chosenMessage = pickQueueFailureMessage(row?.error_message || '', queueLogs);
    const category = classifyQueueError(chosenMessage).category;

    if (!isTerminalRescueFailureMessage(chosenMessage) && category !== 'input' && category !== 'config') {
      continue;
    }

    await admin
      .from('generated_images')
      .update({
        error_message: normalizeQueueErrorMessage(chosenMessage),
        queue_payload: clearFailedRescueMeta(payload),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    finalized += 1;
  }

  return finalized;
};

const resetStaleQueueStateForReconcile = async () => {
  const admin = getServiceRoleClient();
  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - STALE_PRE_DISPATCH_RECONCILE_MS).toISOString();

  const { data: processingRows, error: processingError } = await admin
    .from('generated_images')
    .update({
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nowIso,
      updated_at: nowIso,
      error_message: null,
    })
    .eq('status', 'processing')
    .not('job_id', 'is', null)
    .select('id');

  if (processingError) {
    throw processingError;
  }

  const { data: stalledPreDispatchRows, error: stalledPreDispatchError } = await admin
    .from('generated_images')
    .select('id, updated_at, lease_expires_at')
    .eq('status', 'processing')
    .is('job_id', null)
    .not('queue_payload', 'is', null)
    .limit(200);

  if (stalledPreDispatchError) {
    throw stalledPreDispatchError;
  }

  const stalledPreDispatchIds = ((stalledPreDispatchRows || []) as Array<{ id: string; updated_at?: string | null; lease_expires_at?: string | null }>)
    .filter((row) => {
      const leaseExpired =
        !row.lease_expires_at ||
        new Date(row.lease_expires_at).getTime() <= Date.now();
      const isStale =
        !row.updated_at ||
        new Date(row.updated_at).getTime() <= new Date(staleBeforeIso).getTime();
      return leaseExpired || isStale;
    })
    .map((row) => row.id);

  let resetStalledPreDispatch = 0;
  if (stalledPreDispatchIds.length > 0) {
    const { data: resetRows, error: resetError } = await admin
      .from('generated_images')
      .update({
        status: 'queued',
        job_id: null,
        processing_started_at: null,
        lease_token: null,
        lease_expires_at: null,
        next_poll_at: nowIso,
        updated_at: nowIso,
        error_message: null,
      })
      .in('id', stalledPreDispatchIds)
      .select('id');

    if (resetError) {
      throw resetError;
    }

    resetStalledPreDispatch = Array.isArray(resetRows) ? resetRows.length : 0;
  }

  const { data: queuedRows, error: queuedError } = await admin
    .from('generated_images')
    .update({
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nowIso,
      updated_at: nowIso,
      error_message: null,
    })
    .eq('status', 'queued')
    .not('queue_payload', 'is', null)
    .select('id');

  if (queuedError) {
    throw queuedError;
  }

  return {
    resetProcessing: Array.isArray(processingRows) ? processingRows.length : 0,
    resetStalledPreDispatch,
    resetQueued: Array.isArray(queuedRows) ? queuedRows.length : 0,
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

  const lockOwner = `queue-reconcile:${randomUUID()}`;
  let followUpLaunchNeeded = false;

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

    const acquired = await tryAcquireQueueWorkerLock(lockOwner);
    if (!acquired) {
      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({ success: true, skipped: true, reason: 'worker_locked' }),
      };
    }

    const resetSummary = await resetStaleQueueStateForReconcile();
    const finalizedFailedRescues = await finalizeTerminalFailedRescues();
    const serverAvailabilityAutoRefresh = await refreshAutoDisabledServerAvailability();

    if (isDedicatedQueueWorkerMode()) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          skipped: true,
          reason: 'dedicated_worker_mode',
          resetSummary,
          finalizedFailedRescues,
          serverAvailabilityAutoRefresh,
          summary: null,
          followUpLaunchNeeded: false,
        }),
      };
    }

    const summary = await runQueueDaemon({
      maxRuntimeMs: 45_000,
      idleIterationsToStop: 24,
      activeDelayMs: 50,
      idleDelayMs: 500,
    });
    followUpLaunchNeeded = hasQueueActivity(summary) || (await hasOutstandingQueueWork());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, resetSummary, finalizedFailedRescues, serverAvailabilityAutoRefresh, summary, followUpLaunchNeeded }),
    };
  } catch (error: any) {
    console.error('[queue-reconcile] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  } finally {
    await releaseQueueWorkerLock(lockOwner);
    if (followUpLaunchNeeded) {
      try {
        await triggerBackgroundQueueWorker(event.rawUrl, 1_000);
      } catch (error) {
        console.warn('[queue-reconcile] Failed to launch follow-up worker:', error);
      }
    }
  }
};
