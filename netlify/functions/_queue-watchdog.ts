import { randomUUID } from 'node:crypto';
import { getServiceRoleClient } from './_supabase';
import { runQueueDaemon } from './_queue-daemon';
import { sendTelegramOperationalAlert } from './_telegram-notify';
import { runSePayPendingReconcile } from './sepay-reconcile-pending';
import type { QueueProcessingStage, QueueProgressLogEntry } from '../../shared/queueRecipes';

type WatchdogSummary = {
  scanned: number;
  dbInvariant?: unknown;
  healthBefore?: QueueHealthSnapshot;
  healthAfter?: QueueHealthSnapshot;
  queuedStale: number;
  nudgedQueued: number;
  requeuedPreDispatch: number;
  failedPreDispatch: number;
  nudgedPolls: number;
  staleDispatchHeartbeat: boolean;
  alertsSent: number;
  sepayReconcile?: unknown;
  sepayReconcileError?: string;
  worker?: Awaited<ReturnType<typeof runQueueDaemon>>;
  workerError?: string;
};

type QueueHealthCode =
  | 'healthy'
  | 'queued_stale'
  | 'pre_dispatch_waiting_lease'
  | 'pre_dispatch_safe_requeue_due'
  | 'pre_dispatch_provider_risk'
  | 'poll_overdue'
  | 'unknown';

type QueueHealthSnapshot = {
  generatedAt: string;
  scanned: number;
  counts: Record<QueueHealthCode, number>;
  watchdogDue: number;
  examples: Array<{
    id: string;
    userId: string;
    status: string;
    stage: string;
    code: QueueHealthCode;
    ageSeconds: number;
    leaseState: 'none' | 'active' | 'expired';
    providerRisk: boolean;
  }>;
};

const WATCHDOG_LOCK_NAME = 'queue_watchdog_lock';
const WATCHDOG_LOCK_SECONDS = 55;
const QUEUED_STALE_MS = 5 * 60 * 1000;
const PRE_DISPATCH_LEASE_GRACE_MS = 15 * 1000;
const PRE_DISPATCH_PREPARING_STALE_MS = 90 * 1000;
const MAX_PRE_DISPATCH_RECOVERIES = 8;
const MAX_PRE_DISPATCH_AGE_MS = 30 * 60 * 1000;
const OVERDUE_POLL_GRACE_MS = 2 * 60 * 1000;
const DISPATCH_HEARTBEAT_STALE_MS = 4 * 60 * 1000;
const ALERT_THROTTLE_MS = 30 * 60 * 1000;
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

const getLeaseState = (leaseExpiresAt: unknown, now = Date.now()): 'none' | 'active' | 'expired' => {
  const leaseMs = leaseExpiresAt ? new Date(String(leaseExpiresAt)).getTime() : 0;
  if (!leaseMs) return 'none';
  return leaseMs > now ? 'active' : 'expired';
};

const isProviderCommitRisk = (row: any) => {
  const payload = toPayloadObject(row.queue_payload);
  const stage = getStage(payload);
  return Boolean(row.job_id) || payload.__tstTouched === true || payload.__dispatchConfirmationPending === true || stage === 'dispatching';
};

const isStalePreDispatchWithoutProviderRisk = (row: any, updatedAgeMs: number) => {
  if (isProviderCommitRisk(row)) {
    return false;
  }

  const stage = getStage(toPayloadObject(row.queue_payload));
  return ['preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload'].includes(stage) &&
    updatedAgeMs >= PRE_DISPATCH_PREPARING_STALE_MS;
};

const getQueueHealthCode = (row: any, now = Date.now()): QueueHealthCode => {
  const status = String(row.status || '').toLowerCase();
  const updatedAtMs = new Date(String(row.updated_at || row.created_at || '')).getTime();
  const updatedAgeMs = updatedAtMs > 0 ? now - updatedAtMs : 0;
  const nextPollAtMs = row.next_poll_at ? new Date(String(row.next_poll_at)).getTime() : 0;
  const hasProviderJob = Boolean(String(row.job_id || '').trim());
  const stage = getStage(row.queue_payload);

  if (status === 'queued') {
    return updatedAgeMs > QUEUED_STALE_MS ? 'queued_stale' : 'healthy';
  }

  if (status !== 'processing') {
    return 'healthy';
  }

  if (!hasProviderJob) {
    const leaseState = getLeaseState(row.lease_expires_at, now);
    const preDispatchStage = ['preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload'].includes(stage);
    const preDispatchStale = preDispatchStage && updatedAgeMs >= PRE_DISPATCH_PREPARING_STALE_MS;
    const leaseExpired = leaseState === 'none' || (leaseState === 'expired' && row.lease_expires_at && now - new Date(String(row.lease_expires_at)).getTime() > PRE_DISPATCH_LEASE_GRACE_MS);

    if (isProviderCommitRisk(row)) {
      return leaseExpired || preDispatchStale ? 'pre_dispatch_provider_risk' : 'pre_dispatch_waiting_lease';
    }

    if (leaseExpired || preDispatchStale) {
      return 'pre_dispatch_safe_requeue_due';
    }

    return 'pre_dispatch_waiting_lease';
  }

  if (nextPollAtMs > 0 && now - nextPollAtMs > OVERDUE_POLL_GRACE_MS) {
    return 'poll_overdue';
  }

  return 'healthy';
};

const buildQueueHealthSnapshot = (rows: any[]): QueueHealthSnapshot => {
  const now = Date.now();
  const counts: Record<QueueHealthCode, number> = {
    healthy: 0,
    queued_stale: 0,
    pre_dispatch_waiting_lease: 0,
    pre_dispatch_safe_requeue_due: 0,
    pre_dispatch_provider_risk: 0,
    poll_overdue: 0,
    unknown: 0,
  };
  const riskyExamples: QueueHealthSnapshot['examples'] = [];

  for (const row of rows) {
    const code = getQueueHealthCode(row, now);
    counts[code] = (counts[code] || 0) + 1;
    if (code === 'healthy' || code === 'pre_dispatch_waiting_lease') {
      continue;
    }

    const updatedAtMs = new Date(String(row.updated_at || row.created_at || '')).getTime();
    riskyExamples.push({
      id: String(row.id),
      userId: String(row.user_id || ''),
      status: String(row.status || ''),
      stage: getStage(row.queue_payload) || 'unknown',
      code,
      ageSeconds: updatedAtMs > 0 ? Math.max(0, Math.floor((now - updatedAtMs) / 1000)) : 0,
      leaseState: getLeaseState(row.lease_expires_at, now),
      providerRisk: isProviderCommitRisk(row),
    });
  }

  const watchdogDue =
    counts.queued_stale +
    counts.pre_dispatch_safe_requeue_due +
    counts.pre_dispatch_provider_risk +
    counts.poll_overdue;

  return {
    generatedAt: nowIso(),
    scanned: rows.length,
    counts,
    watchdogDue,
    examples: riskyExamples
      .sort((a, b) => b.ageSeconds - a.ageSeconds)
      .slice(0, 12),
  };
};

const fetchQueueHealthRows = async () => {
  const admin = getServiceRoleClient();
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

  return Array.isArray(data) ? data : [];
};

const saveQueueHealthSnapshot = async (summary: WatchdogSummary) => {
  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('system_settings')
    .upsert({
      key: 'queue_watchdog_last_health_report',
      value: {
        generatedAt: nowIso(),
        summary,
      },
    }, { onConflict: 'key' });

  if (error) {
    console.warn('[queue-watchdog] Failed to save queue health snapshot:', error);
  }
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

  await sendTelegramOperationalAlert(title, details, {
    alertKey: `queue_watchdog:${key}`,
    cooldownMs: ALERT_THROTTLE_MS,
    severity: 'warning',
  });
  state[key] = nowIso();
  return true;
};

const failAndRefund = async (row: any, message: string) => {
  const admin = getServiceRoleClient();
  const failedAt = nowIso();
  const failedPayload = {
    ...withQueueLog(row.queue_payload, 'failed', message, 'error'),
    __watchdogLastActionAt: failedAt,
    __watchdogLastAction: 'failed_refunded',
    __watchdogLastReason: message,
  };

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
    __watchdogLastActionAt: nowIso(),
    __watchdogLastAction: 'requeued',
    __watchdogLastReason: message,
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

const nudgeQueuedJob = async (row: any) => {
  const admin = getServiceRoleClient();
  const nudgedAt = nowIso();
  const { error } = await admin
    .from('generated_images')
    .update({
      queue_payload: {
        ...withQueueLog(row.queue_payload, 'queued', 'Watchdog phat hien job queued qua lau. Lam moi lease/next_poll de worker claim lai.', 'warning'),
        __watchdogLastActionAt: nudgedAt,
        __watchdogLastAction: 'nudged_queued',
        __watchdogLastReason: 'queued_stale',
      },
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nudgedAt,
      error_message: null,
      updated_at: nudgedAt,
    })
    .eq('id', row.id)
    .eq('status', 'queued');

  if (error) {
    throw error;
  }
};

const nudgeProviderPoll = async (row: any) => {
  const admin = getServiceRoleClient();
  const nudgedAt = nowIso();
  const { error } = await admin
    .from('generated_images')
    .update({
      queue_payload: {
        ...withQueueLog(row.queue_payload, 'polling', 'Watchdog phat hien poll qua han. Dua job ve hang poll ngay.', 'warning'),
        __watchdogLastActionAt: nudgedAt,
        __watchdogLastAction: 'nudged_poll',
        __watchdogLastReason: 'poll_overdue',
      },
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nudgedAt,
      updated_at: nudgedAt,
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
      nudgedQueued: 0,
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
    nudgedQueued: 0,
    requeuedPreDispatch: 0,
    failedPreDispatch: 0,
    nudgedPolls: 0,
    staleDispatchHeartbeat: false,
    alertsSent: 0,
  };

  try {
    const admin = getServiceRoleClient();
    const alertState = await getAlertState();
    try {
      summary.sepayReconcile = await runSePayPendingReconcile({
        limit: 10,
        maxRuntimeMs: 20_000,
      });
    } catch (error: any) {
      summary.sepayReconcileError = error?.message || 'SePay reconcile failed';
      if (await sendThrottledAlert(alertState, 'sepay_reconcile_failed', 'SePay reconcile tu dong bi loi', {
        error: summary.sepayReconcileError,
      })) summary.alertsSent += 1;
    }

    summary.dbInvariant = await runDbInvariantRepair();
    const rows = await fetchQueueHealthRows();
    summary.scanned = rows.length;
    summary.healthBefore = buildQueueHealthSnapshot(rows);
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
        await nudgeQueuedJob(row);
        summary.nudgedQueued += 1;
        continue;
      }

      if (status !== 'processing') {
        continue;
      }

      if (!hasProviderJob) {
        const leaseExpired = !leaseExpiresAtMs || now - leaseExpiresAtMs > PRE_DISPATCH_LEASE_GRACE_MS;
        const stalePreDispatchWithoutProviderRisk = isStalePreDispatchWithoutProviderRisk(
          row,
          updatedAtMs > 0 ? now - updatedAtMs : 0,
        );
        if (!leaseExpired && !stalePreDispatchWithoutProviderRisk) {
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

    if (options.runWorkerAfterRescue !== false && (
      summary.requeuedPreDispatch > 0 ||
      summary.nudgedPolls > 0 ||
      summary.queuedStale > 0 ||
      summary.staleDispatchHeartbeat
    )) {
      try {
        summary.worker = await runQueueDaemon({
          maxRuntimeMs: 20_000,
          idleIterationsToStop: 3,
          activeDelayMs: 50,
          idleDelayMs: 500,
        });
      } catch (error: any) {
        summary.workerError = error?.message || 'Queue worker failed after watchdog rescue';
        console.error('[queue-watchdog] Worker run after rescue failed:', error);
      }
      summary.healthAfter = buildQueueHealthSnapshot(await fetchQueueHealthRows());
    }

    summary.staleDispatchHeartbeat = await inspectDispatchHeartbeat();
    summary.healthAfter = buildQueueHealthSnapshot(await fetchQueueHealthRows());

    if (summary.queuedStale > 0) {
      if (await sendThrottledAlert(alertState, 'queued_stale', 'Watchdog da day lai job queued qua 5 phut', {
        queuedStale: summary.queuedStale,
        nudgedQueued: summary.nudgedQueued,
        worker: summary.worker || null,
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
    if (summary.healthAfter.watchdogDue > 0) {
      if (await sendThrottledAlert(alertState, 'residual_watchdog_due', 'Queue van con job den han watchdog sau chu ky tu cuu', {
        watchdogDue: summary.healthAfter.watchdogDue,
        counts: summary.healthAfter.counts,
        examples: summary.healthAfter.examples.slice(0, 5),
        worker: summary.worker || null,
      })) summary.alertsSent += 1;
    }

    await saveAlertState(alertState);

    await saveQueueHealthSnapshot(summary);

    return summary;
  } finally {
    await releaseNamedLock(owner);
  }
};
