import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { runQueueDaemon } from '../netlify/functions/_queue-daemon';
import { refreshAutoDisabledServerAvailability } from '../netlify/functions/_server-availability';
import { getServiceRoleClient } from '../netlify/functions/_supabase';

const WORKER_LOCK_LEASE_SECONDS = 180;
const IDLE_DELAY_MS = 2_000;
const ACTIVE_DELAY_MS = 250;
const LOCKED_DELAY_MS = 5_000;
const ERROR_DELAY_MS = 10_000;

let shouldStop = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (...args: unknown[]) => {
  console.log('[render-queue-worker]', ...args);
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
      log('Lock RPC missing, continuing without distributed lock.');
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
    console.warn('[render-queue-worker] Failed to release queue worker lock:', error);
  }
};

const hasQueueActivity = (summary: Awaited<ReturnType<typeof runQueueDaemon>>) =>
  Number(summary.claimedForDispatch || 0) > 0 ||
  Number(summary.submitted || 0) > 0 ||
  Number(summary.claimedForPoll || 0) > 0 ||
  Number(summary.completed || 0) > 0 ||
  Number(summary.failed || 0) > 0 ||
  Number(summary.requeued || 0) > 0;

const registerSignalHandlers = () => {
  const stop = (signal: NodeJS.Signals) => {
    if (shouldStop) {
      return;
    }
    shouldStop = true;
    log(`Received ${signal}. Waiting for current loop to finish before exit.`);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
};

const main = async () => {
  registerSignalHandlers();

  const owner = `render-worker:${randomUUID()}`;
  log('Starting queue worker loop.', { owner });

  while (!shouldStop) {
    let acquired = false;

    try {
      acquired = await tryAcquireQueueWorkerLock(owner);
      if (!acquired) {
        log('Another queue worker owns the lock. Retrying soon.');
        await sleep(LOCKED_DELAY_MS);
        continue;
      }

      const serverAvailabilitySummary = await refreshAutoDisabledServerAvailability();
      if (serverAvailabilitySummary.changed || serverAvailabilitySummary.triggered > 0) {
        log('Server availability snapshot updated.', serverAvailabilitySummary);
      }

      const summary = await runQueueDaemon({
        maxRuntimeMs: 75_000,
        idleIterationsToStop: 30,
        activeDelayMs: 50,
        idleDelayMs: 1_000,
      });

      log('Queue daemon cycle finished.', summary);
      await sleep(hasQueueActivity(summary) ? ACTIVE_DELAY_MS : IDLE_DELAY_MS);
    } catch (error) {
      console.error('[render-queue-worker] Worker loop failed:', error);
      await sleep(ERROR_DELAY_MS);
    } finally {
      if (acquired) {
        await releaseQueueWorkerLock(owner);
      }
    }
  }

  log('Queue worker stopped.');
};

main().catch((error) => {
  console.error('[render-queue-worker] Fatal startup error:', error);
  process.exitCode = 1;
});
