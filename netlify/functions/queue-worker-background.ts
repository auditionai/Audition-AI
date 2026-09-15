import { randomUUID } from 'node:crypto';
import { runQueueDaemon } from './_queue-daemon';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { getServiceRoleClient } from './_supabase';
import { SYSTEM_QUEUE_KINDS } from '../../shared/queueKinds';
import { verifyInternalRequest } from './_internal-request-auth';

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
    .in('queue_kind', [...SYSTEM_QUEUE_KINDS])
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

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const body = await request.text();
  if (!verifyInternalRequest('queue-worker-background', body, (name) => request.headers.get(name))) {
    return json({ error: 'Unauthorized internal request' }, 401);
  }

  if (areQueueWorkersDisabled()) {
    return json({ success: true, skipped: true, reason: 'queue_workers_disabled' }, 202);
  }

  if (isDedicatedQueueWorkerMode()) {
    return json({ success: true, skipped: true, reason: 'dedicated_worker_mode' });
  }

  const lockOwner = `queue-worker:${randomUUID()}`;
  let followUpLaunchNeeded = false;
  try {
    const acquired = await tryAcquireQueueWorkerLock(lockOwner);
    if (!acquired) {
      return json({ success: true, skipped: true, reason: 'worker_locked' }, 202);
    }

    const summary = await runQueueDaemon();
    followUpLaunchNeeded = hasQueueActivity(summary) || (await hasOutstandingQueueWork());
    return json({ success: true, summary, followUpLaunchNeeded });
  } catch (error: any) {
    console.error('[queue-worker-background] failed:', error);
    return json({ error: error?.message || 'Internal Server Error' }, 500);
  } finally {
    await releaseQueueWorkerLock(lockOwner);
    if (followUpLaunchNeeded) {
      try {
        await triggerBackgroundQueueWorker(request.url, 1_000);
      } catch (error) {
        console.warn('[queue-worker-background] Failed to launch follow-up worker:', error);
      }
    }
  }
};
