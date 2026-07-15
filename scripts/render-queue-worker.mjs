import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { runQueueDaemon } from '../netlify/functions/_queue-daemon.ts';
import { runQueueWatchdog } from '../netlify/functions/_queue-watchdog.ts';
import { refreshAutoDisabledServerAvailability } from '../netlify/functions/_server-availability.ts';
import { getServiceRoleClient } from '../netlify/functions/_supabase.ts';

const normalizeLane = (value) => {
  if (value === 'dispatch' || value === 'poll') {
    return value;
  }

  return 'all';
};

const parsePositiveIntEnv = (name, fallback, minimum = 1) => {
  const raw = Number.parseInt(String(process.env[name] || '').trim(), 10);
  if (!Number.isFinite(raw) || raw < minimum) {
    return fallback;
  }

  return raw;
};

const lane = normalizeLane(process.env.RENDER_QUEUE_WORKER_LANE);
const label = String(process.env.RENDER_QUEUE_WORKER_LABEL || `render-queue-${lane}`).trim() || `render-queue-${lane}`;
const lockName = String(process.env.RENDER_QUEUE_WORKER_LOCK_NAME || `queue_worker_lock:${lane}`).trim() || `queue_worker_lock:${lane}`;

const WORKER_LOCK_LEASE_SECONDS = parsePositiveIntEnv('RENDER_QUEUE_WORKER_LEASE_SECONDS', 180, 15);
const IDLE_DELAY_MS = parsePositiveIntEnv('RENDER_QUEUE_WORKER_IDLE_DELAY_MS', 15_000, 10_000);
const ACTIVE_DELAY_MS = parsePositiveIntEnv('RENDER_QUEUE_WORKER_ACTIVE_DELAY_MS', 500, 50);
const LOCKED_DELAY_MS = parsePositiveIntEnv('RENDER_QUEUE_WORKER_LOCKED_DELAY_MS', 5_000, 100);
const ERROR_DELAY_MS = parsePositiveIntEnv('RENDER_QUEUE_WORKER_ERROR_DELAY_MS', 10_000, 100);
const DAEMON_MAX_RUNTIME_MS = parsePositiveIntEnv('RENDER_QUEUE_DAEMON_MAX_RUNTIME_MS', 30_000, 5_000);
const DAEMON_IDLE_ITERATIONS = Math.min(parsePositiveIntEnv('RENDER_QUEUE_DAEMON_IDLE_ITERATIONS', 1, 1), 2);
const DAEMON_ACTIVE_DELAY_MS = parsePositiveIntEnv('RENDER_QUEUE_DAEMON_ACTIVE_DELAY_MS', 50, 10);
const DAEMON_IDLE_DELAY_MS = parsePositiveIntEnv('RENDER_QUEUE_DAEMON_IDLE_DELAY_MS', 1_000, 50);
const WATCHDOG_INTERVAL_MS = parsePositiveIntEnv('RENDER_QUEUE_WATCHDOG_INTERVAL_MS', 10 * 60_000, 5 * 60_000);
const SERVER_AVAILABILITY_INTERVAL_MS = parsePositiveIntEnv('RENDER_SERVER_AVAILABILITY_INTERVAL_MS', 5 * 60_000, 60_000);

let shouldStop = false;
let lastWatchdogRunAt = 0;
let lastServerAvailabilityRunAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (...args) => {
  console.log(`[${label}]`, ...args);
};

const tryAcquireNamedQueueWorkerLock = async (owner) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('try_acquire_named_queue_worker_lock', {
    p_owner: owner,
    p_lock_name: lockName,
    p_lease_seconds: WORKER_LOCK_LEASE_SECONDS,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /try_acquire_named_queue_worker_lock/i.test(message)) {
      return null;
    }
    throw error;
  }

  return data !== false;
};

const releaseNamedQueueWorkerLock = async (owner) => {
  const admin = getServiceRoleClient();
  const { error } = await admin.rpc('release_named_queue_worker_lock', {
    p_owner: owner,
    p_lock_name: lockName,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /release_named_queue_worker_lock/i.test(message)) {
      return false;
    }
    throw error;
  }

  return true;
};

const tryAcquireLegacyQueueWorkerLock = async (owner) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('try_acquire_queue_worker_lock', {
    p_owner: owner,
    p_lease_seconds: WORKER_LOCK_LEASE_SECONDS,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /try_acquire_queue_worker_lock/i.test(message)) {
      log('Legacy lock RPC missing, continuing without distributed lock.');
      return true;
    }
    throw error;
  }

  return data !== false;
};

const releaseLegacyQueueWorkerLock = async (owner) => {
  const admin = getServiceRoleClient();
  const { error } = await admin.rpc('release_queue_worker_lock', {
    p_owner: owner,
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /release_queue_worker_lock/i.test(message)) {
      return;
    }
    console.warn(`[${label}] Failed to release legacy queue worker lock:`, error);
  }
};

const tryAcquireQueueWorkerLock = async (owner) => {
  const namedLockAcquired = await tryAcquireNamedQueueWorkerLock(owner);
  if (namedLockAcquired !== null) {
    return { acquired: namedLockAcquired, mode: 'named' };
  }

  log('Named lane lock RPC missing, falling back to legacy global queue lock.', { lockName, lane });
  return {
    acquired: await tryAcquireLegacyQueueWorkerLock(owner),
    mode: 'legacy',
  };
};

const releaseQueueWorkerLock = async (owner, mode) => {
  if (mode === 'named') {
    try {
      await releaseNamedQueueWorkerLock(owner);
      return;
    } catch (error) {
      console.warn(`[${label}] Failed to release named queue worker lock:`, error);
      return;
    }
  }

  await releaseLegacyQueueWorkerLock(owner);
};

const hasQueueActivity = (summary) =>
  Number(summary.claimedForDispatch || 0) > 0 ||
  Number(summary.submitted || 0) > 0 ||
  Number(summary.claimedForPoll || 0) > 0 ||
  Number(summary.completed || 0) > 0 ||
  Number(summary.failed || 0) > 0 ||
  Number(summary.requeued || 0) > 0;

const registerSignalHandlers = () => {
  const stop = (signal) => {
    if (shouldStop) {
      return;
    }
    shouldStop = true;
    log(`Received ${signal}. Waiting for current loop to finish before exit.`);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
};

const shouldRunIntegratedWatchdog = () => lane === 'poll' || lane === 'all';

const hasDueQueueWork = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('get_queue_worker_due_state', {
    p_lane: lane,
  });

  if (error) {
    if (/get_queue_worker_due_state|function|schema/i.test(String(error.message || ''))) {
      log('Queue due-state RPC is unavailable; running one compatibility worker tick.');
      return true;
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row?.has_dispatch_work === true || row?.has_poll_work === true;
};

const refreshServerAvailabilityIfDue = async () => {
  if (lane === 'poll' || Date.now() - lastServerAvailabilityRunAt < SERVER_AVAILABILITY_INTERVAL_MS) {
    return;
  }

  lastServerAvailabilityRunAt = Date.now();
  const summary = await refreshAutoDisabledServerAvailability();
  if (summary.changed || summary.triggered > 0) {
    log('Server availability snapshot updated.', summary);
  }
};

const runIntegratedWatchdogIfDue = async () => {
  if (!shouldRunIntegratedWatchdog()) {
    return;
  }

  const now = Date.now();
  if (lastWatchdogRunAt > 0 && now - lastWatchdogRunAt < WATCHDOG_INTERVAL_MS) {
    return;
  }

  lastWatchdogRunAt = now;
  try {
    const summary = await runQueueWatchdog({ runWorkerAfterRescue: false });
    log('Integrated watchdog cycle finished.', summary);
  } catch (error) {
    console.warn(`[${label}] Integrated watchdog failed:`, error);
  }
};

const main = async () => {
  registerSignalHandlers();

  const owner = `${label}:${randomUUID()}`;
  log('Starting queue worker loop.', { owner, lane, lockName });

  while (!shouldStop) {
    let acquired = false;
    let lockMode = 'legacy';

    try {
      await runIntegratedWatchdogIfDue();

      if (!(await hasDueQueueWork())) {
        await sleep(IDLE_DELAY_MS);
        continue;
      }

      const lockResult = await tryAcquireQueueWorkerLock(owner);
      acquired = lockResult.acquired;
      lockMode = lockResult.mode;

      if (!acquired) {
        log('Another queue worker owns this lane lock. Retrying soon.', { lane, lockName, lockMode });
        await sleep(LOCKED_DELAY_MS);
        continue;
      }

      await refreshServerAvailabilityIfDue();

      const summary = await runQueueDaemon({
        lane,
        maxRuntimeMs: DAEMON_MAX_RUNTIME_MS,
        idleIterationsToStop: DAEMON_IDLE_ITERATIONS,
        activeDelayMs: DAEMON_ACTIVE_DELAY_MS,
        idleDelayMs: DAEMON_IDLE_DELAY_MS,
      });

      log('Queue daemon cycle finished.', { lane, ...summary });
      await sleep(hasQueueActivity(summary) ? ACTIVE_DELAY_MS : IDLE_DELAY_MS);
    } catch (error) {
      console.error(`[${label}] Worker loop failed:`, error);
      await sleep(ERROR_DELAY_MS);
    } finally {
      if (acquired) {
        await releaseQueueWorkerLock(owner, lockMode);
      }
    }
  }

  log('Queue worker stopped.');
};

main().catch((error) => {
  console.error(`[${label}] Fatal startup error:`, error);
  process.exitCode = 1;
});
