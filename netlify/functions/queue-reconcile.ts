import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const WORKER_LOCK_LEASE_SECONDS = 120;

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

    const summary = await runQueueDaemon({
      maxRuntimeMs: 45_000,
      idleIterationsToStop: 3,
      activeDelayMs: 50,
      idleDelayMs: 500,
    });
    followUpLaunchNeeded = hasQueueActivity(summary) && !summary.exitedIdle;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, summary, followUpLaunchNeeded }),
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
