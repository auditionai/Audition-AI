import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { getServiceRoleClient } from './_supabase';

const WORKER_LOCK_LEASE_SECONDS = 180;

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

const tryAcquireQueueWorkerLock = async (owner: string) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('try_acquire_queue_worker_lock', {
    p_owner: owner,
    p_lease_seconds: WORKER_LOCK_LEASE_SECONDS,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /try_acquire_queue_worker_lock/i.test(message)) {
      console.warn('[queue-worker-background] Lock RPC missing, continuing without distributed lock.');
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
    console.warn('[queue-worker-background] Failed to release queue worker lock:', error);
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const lockOwner = `queue-worker:${randomUUID()}`;
  let followUpLaunchNeeded = false;
  try {
    const acquired = await tryAcquireQueueWorkerLock(lockOwner);
    if (!acquired) {
      return {
        statusCode: 202,
        body: JSON.stringify({ success: true, skipped: true, reason: 'worker_locked' }),
      };
    }

    const summary = await runQueueDaemon();
    followUpLaunchNeeded = hasQueueActivity(summary) || (await hasOutstandingQueueWork());
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, summary, followUpLaunchNeeded }),
    };
  } catch (error: any) {
    console.error('[queue-worker-background] failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  } finally {
    await releaseQueueWorkerLock(lockOwner);
    if (followUpLaunchNeeded) {
      try {
        await triggerBackgroundQueueWorker(event.rawUrl, 1_000);
      } catch (error) {
        console.warn('[queue-worker-background] Failed to launch follow-up worker:', error);
      }
    }
  }
};
