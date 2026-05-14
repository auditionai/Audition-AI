import { randomUUID } from 'node:crypto';
import { getServiceRoleClient } from './_supabase';
import { runQueueDaemon } from './_queue-daemon';
import { sendTelegramOperationalAlert } from './_telegram-notify';
import type { QueueProcessingStage, QueueProgressLogEntry } from '../../shared/queueRecipes';

type WatchdogSummary = {
  scanned: number;
  dbInvariant?: unknown;
  queuedStale: number;
  requeuedPreDispatch: number;
  failedPreDispatch: number;
  nudgedPolls: number;
  staleDispatchHeartbeat: boolean;
  alertsSent: number;
  worker?: Awaited<ReturnType<typeof runQueueDaemon>>;
};

const WATCHDOG_LOCK_NAME = 'queue_watchdog_lock';
const WATCHDOG_LOCK_SECONDS = 55;
const QUEUED_STALE_MS = 5 * 60 * 1000;
const PRE_DISPATCH_LEASE_GRACE_MS = 15 * 1000;
const MAX_PRE_DISPATCH_RECOVERIES = 8;
const MAX_PRE_DISPATCH_AGE_MS = 30 * 60 * 1000;
const OVERDUE_POLL_GRACE_MS = 2 * 60 * 1000;
const DISPATCH_HEARTBEAT_STALE_MS = 4 * 60 * 1000;
const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const SYSTEM_QUEUE_KINDS = ['image_generate', 'video_generate', 'motion_generate'];
const MAX_QUEUE_LOG_ENTRIES = 80;

const nowIso = () => new Date().toISOString();
const toPayloadObject = (payload: unknown): Record<string, unknown> =>
  payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {};

const getQueueLogs = (payload: unknown): QueueProgressLogEntry[] => {
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
  payload: unknown,
  stage: QueueProcessingStage,
  message: string,
  level: QueueProgressLogEntry['level'] = 'warning',
) => {
  const previousLogs = getQueueLogs(payload);
  const entry: QueueProgressLogEntry = {
    at: nowIso(),
    stage,
    level,
    message,
  };

  return {
    ...toPayloadObject(payload),
    __stage: stage,
    __logs: [...previousLogs, entry].slice(-MAX_QUEUE_LOG_ENTRIES),
  };
};

const getWatchdogRecoveryCount = (payload: unknown) => {
  const value = Number(toPayloadObject(payload).__watchdogRecoveries || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

const getStage = (payload: unknown) => {
  const stage = toPayloadObject(payload).__stage;
  return typeof stage === 'string' ? stage : '';
};

const isProviderCommitRisk = (row: any) => {
  const payload = toPayloadObject(row.queue_payload);
  const stage = getStage(payload);
  return Boolean(row.job_id) || payload.__tstTouched === true || payload.__dispatchConfirmationPending === true || stage === 'dispatching';
};

const tryAcquireNamedLock = async (owner: string) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('try_acquire_named_queue_worker_lock', {
    p_owner: owner,
    p_lock_name: WATCHDOG_LOCK_NAME,
    p_lease_seconds: WATCHDOG_LOCK_SECONDS,
  });

  if (error) {
    throw error;
  }

  return data !== false;
};

const releaseNamedLock = async (owner: string) => {
  const admin = getServiceRoleClient();
  const { error } = await admin.rpc('release_named_queue_worker_lock', {
    p_owner: owner,
    p_lock_name: WATCHDOG_LOCK_NAME,
  });

  if (error) {
    console.warn('[queue-watchdog] Failed to release watchdog lock:', error);
  }
};

const getAlertState = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'queue_watchdog_alert_state')
    .maybeSingle();

  if (error) {
    console.warn('[queue-watchdog] Failed to load alert state:', error);
    return {};
  }

  return toPayloadObject(data?.value);
};

const saveAlertState = async (state: Record<string, unknown>) => {
  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('system_settings')
    .upsert({ key: 'queue_watchdog_alert_state', value: state }, { onConflict: 'key' });

  if (error) {
    console.warn('[queue-watchdog] Failed to save alert state:', error);
  }
};

const sendThrottledAlert = async (
  state: Record<string, unknown>,
  key: string,
  title: string,
  details: Record<string, unknown>,
) => {
  const lastSentAt = typeof state[key] === 'string' ? new Date(String(state[key])).getTime() : 0;
  if (lastSentAt > 0 && Date.now() - lastSentAt < ALERT_THROTTLE_MS) {
    return false;
  }

  await sendTelegramOperationalAlert(title, details);
  state[key] = nowIso();
  return true;
};

const failAndRefund = async (row: any, message: string) => {
  const admin = getServiceRoleClient();
  const failedAt = nowIso();
  const failedPayload = withQueueLog(row.queue_payload, 'failed', message, 'error');

  const { error } = await admin
    .from('generated_images')
    .update({
      status: 'failed',
      error_message: message,
      queue_payload: failedPayload,
      progress: 0,
      finished_at: failedAt,
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: null,
      last_error_at: failedAt,
      updated_at: failedAt,
    })
    .eq('id', row.id);

  if (error) {
    throw error;
  }

  const { error: refundError } = await admin.rpc('refund_generated_job', {
    p_generated_image_id: row.id,
    p_reason: `Refund: watchdog failed stale ${row.tool_name || row.queue_kind || 'queue job'}`,
  });

  if (refundError) {
    console.warn('[queue-watchdog] Refund failed:', row.id, refundError);
  }
};

const requeuePreDispatch = async (row: any, message: string) => {
  const admin = getServiceRoleClient();
  const recoveries = getWatchdogRecoveryCount(row.queue_payload) + 1;
  const payload = {
    ...withQueueLog(row.queue_payload, 'queued', message, 'warning'),
    __watchdogRecoveries: recoveries,
  };

  const { error } = await admin
    .from('generated_images')
    .update({
      status: 'queued',
      job_id: null,
      image_url: null,
      finished_at: null,
      processing_started_at: null,
      error_message: null,
      queue_payload: payload,
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nowIso(),
      last_error_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', row.id);

  if (error) {
    throw error;
  }
};

const nudgeProviderPoll = async (row: any) => {
  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('generated_images')
    .update({
      queue_payload: withQueueLog(row.queue_payload, 'polling', 'Watchdog phat hien poll qua han. Dua job ve hang poll ngay.', 'warning'),
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', row.id);

  if (error) {
    throw error;
  }
};

const inspectDispatchHeartbeat = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'queue_worker_lock:dispatch')
    .maybeSingle();

  if (error) {
    console.warn('[queue-watchdog] Failed to inspect dispatch heartbeat:', error);
    return false;
  }

  const heartbeatAt = String(toPayloadObject(data?.value).heartbeatAt || '');
  const heartbeatMs = heartbeatAt ? new Date(heartbeatAt).getTime() : 0;
  return !heartbeatMs || Date.now() - heartbeatMs > DISPATCH_HEARTBEAT_STALE_MS;
};

const runDbInvariantRepair = async () => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin.rpc('repair_stale_generated_queue_jobs', {
    p_pre_dispatch_grace_seconds: Math.ceil(PRE_DISPATCH_LEASE_GRACE_MS / 1000),
    p_max_recoveries: MAX_PRE_DISPATCH_RECOVERIES,
    p_max_pre_dispatch_age_minutes: Math.ceil(MAX_PRE_DISPATCH_AGE_MS / 60000),
    p_overdue_poll_grace_seconds: Math.ceil(OVERDUE_POLL_GRACE_MS / 1000),
  });

  if (error) {
    const message = String(error.message || '');
    if (error.code === 'PGRST202' || /repair_stale_generated_queue_jobs/i.test(message)) {
      return null;
    }
    throw error;
  }

  return data;
};

export const runQueueWatchdog = async (options: { runWorkerAfterRescue?: boolean } = {}): Promise<WatchdogSummary> => {
  const owner = `queue-watchdog:${randomUUID()}`;
  const acquired = await tryAcquireNamedLock(owner);
  if (!acquired) {
    return {
      scanned: 0,
      queuedStale: 0,
      requeuedPreDispatch: 0,
      failedPreDispatch: 0,
      nudgedPolls: 0,
      staleDispatchHeartbeat: false,
      alertsSent: 0,
    };
  }

  const summary: WatchdogSummary = {
    scanned: 0,
    queuedStale: 0,
    requeuedPreDispatch: 0,
    failedPreDispatch: 0,
    nudgedPolls: 0,
    staleDispatchHeartbeat: false,
    alertsSent: 0,
  };

  try {
    const admin = getServiceRoleClient();
    const alertState = await getAlertState();
    summary.dbInvariant = await runDbInvariantRepair();
    const { data, error } = await admin
      .from('generated_images')
      .select('id, user_id, asset_type, queue_kind, queue_payload, prompt, tool_id, tool_name, model_used, cost_vcoin, status, job_id, progress, created_at, updated_at, processing_started_at, lease_expires_at, next_poll_at')
      .in('status', ['queued', 'processing'])
      .in('queue_kind', SYSTEM_QUEUE_KINDS)
      .order('updated_at', { ascending: true })
      .limit(500);

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    summary.scanned = rows.length;
    const now = Date.now();

    for (const row of rows) {
      const status = String(row.status || '').toLowerCase();
      const updatedAtMs = new Date(String(row.updated_at || row.created_at || '')).getTime();
      const createdAtMs = new Date(String(row.created_at || '')).getTime();
      const processingStartedAtMs = new Date(String(row.processing_started_at || row.created_at || '')).getTime();
      const leaseExpiresAtMs = row.lease_expires_at ? new Date(String(row.lease_expires_at)).getTime() : 0;
      const nextPollAtMs = row.next_poll_at ? new Date(String(row.next_poll_at)).getTime() : 0;
      const hasProviderJob = Boolean(String(row.job_id || '').trim());

      if (status === 'queued' && updatedAtMs > 0 && now - updatedAtMs > QUEUED_STALE_MS) {
        summary.queuedStale += 1;
        continue;
      }

      if (status !== 'processing') {
        continue;
      }

      if (!hasProviderJob) {
        const leaseExpired = !leaseExpiresAtMs || now - leaseExpiresAtMs > PRE_DISPATCH_LEASE_GRACE_MS;
        if (!leaseExpired) {
          continue;
        }

        const ageMs = processingStartedAtMs > 0 ? now - processingStartedAtMs : now - createdAtMs;
        const recoveries = getWatchdogRecoveryCount(row.queue_payload);
        if (isProviderCommitRisk(row) || recoveries >= MAX_PRE_DISPATCH_RECOVERIES || ageMs > MAX_PRE_DISPATCH_AGE_MS) {
          await failAndRefund(
            row,
            isProviderCommitRisk(row)
              ? 'Watchdog dung job dispatch khong co provider id de tranh tao trung job.'
              : 'Watchdog dung job chuan bi qua lau sau nhieu lan tu cuu khong thanh cong.',
          );
          summary.failedPreDispatch += 1;
          continue;
        }

        await requeuePreDispatch(row, 'Watchdog phat hien job processing chua co provider id bi het lease. Dua lai hang doi tu dong.');
        summary.requeuedPreDispatch += 1;
        continue;
      }

      if (nextPollAtMs > 0 && now - nextPollAtMs > OVERDUE_POLL_GRACE_MS) {
        await nudgeProviderPoll(row);
        summary.nudgedPolls += 1;
      }
    }

    summary.staleDispatchHeartbeat = await inspectDispatchHeartbeat();

    if (summary.queuedStale > 0) {
      if (await sendThrottledAlert(alertState, 'queued_stale', 'Queue co job queued qua 5 phut', {
        queuedStale: summary.queuedStale,
      })) summary.alertsSent += 1;
    }
    if (summary.requeuedPreDispatch > 0 || summary.failedPreDispatch > 0) {
      if (await sendThrottledAlert(alertState, 'predispatch_recovered', 'Watchdog da tu xu ly job pre-dispatch stale', {
        requeuedPreDispatch: summary.requeuedPreDispatch,
        failedPreDispatch: summary.failedPreDispatch,
      })) summary.alertsSent += 1;
    }
    if (summary.nudgedPolls > 0) {
      if (await sendThrottledAlert(alertState, 'poll_overdue', 'Watchdog da day lai job poll qua han', {
        nudgedPolls: summary.nudgedPolls,
      })) summary.alertsSent += 1;
    }
    if (summary.staleDispatchHeartbeat) {
      if (await sendThrottledAlert(alertState, 'dispatch_heartbeat', 'Dispatch worker mat heartbeat', {
        thresholdMs: DISPATCH_HEARTBEAT_STALE_MS,
      })) summary.alertsSent += 1;
    }

    await saveAlertState(alertState);

    if (options.runWorkerAfterRescue !== false && (summary.requeuedPreDispatch > 0 || summary.nudgedPolls > 0 || summary.queuedStale > 0)) {
      summary.worker = await runQueueDaemon({
        maxRuntimeMs: 20_000,
        idleIterationsToStop: 3,
        activeDelayMs: 50,
        idleDelayMs: 500,
      });
    }

    return summary;
  } finally {
    await releaseNamedLock(owner);
  }
};
