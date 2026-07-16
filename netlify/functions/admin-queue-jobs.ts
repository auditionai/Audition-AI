import type { Handler } from '@netlify/functions';
import type { AdminQueueJob, AdminQueueSummary } from '../../types';
import type { QueueProgressLogEntry, QueueVertexDiagnosticEntry } from '../../shared/queueRecipes';
import { normalizeQueueProgressLogs } from '../../shared/queueLogText';
import { SYSTEM_QUEUE_KINDS } from '../../shared/queueKinds';
import { classifyQueueError, isTerminalRescueFailureMessage, normalizeQueueErrorMessage, pickQueueFailureMessage } from '../../shared/queueErrorClassifier';
import { isFailedRescueStillActive } from '../../shared/queueRescueState';
import { repairVietnameseMojibake } from '../../shared/queueLogText';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const DEFAULT_LIMIT = 100;
const FILTER_OVERFETCH_MULTIPLIER = 5;
const MAX_FILTER_OVERFETCH = 1000;
const STALE_QUEUE_MS = 5 * 60 * 1000;
const OVERDUE_POLL_GRACE_MS = 2 * 60 * 1000;
const PRE_DISPATCH_STALE_MS = 90 * 1000;
const SUMMARY_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const PRE_DISPATCH_STAGES = new Set(['preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload']);

const normalizeQueueLogs = (payload: Record<string, unknown> | null | undefined): QueueProgressLogEntry[] => {
  const rawLogs = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__logs : null;
  if (!Array.isArray(rawLogs)) {
    return [];
  }

  return normalizeQueueProgressLogs(rawLogs.filter(
    (entry): entry is QueueProgressLogEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as QueueProgressLogEntry).at === 'string' &&
      typeof (entry as QueueProgressLogEntry).stage === 'string' &&
      typeof (entry as QueueProgressLogEntry).level === 'string' &&
      typeof (entry as QueueProgressLogEntry).message === 'string',
  ));
};

const normalizeVertexDiagnostics = (payload: Record<string, unknown> | null | undefined): QueueVertexDiagnosticEntry[] => {
  const rawDiagnostics = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__vertexDiagnostics : null;
  if (!Array.isArray(rawDiagnostics)) {
    return [];
  }

  return rawDiagnostics.filter(
    (entry): entry is QueueVertexDiagnosticEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as QueueVertexDiagnosticEntry).at === 'string' &&
      typeof (entry as QueueVertexDiagnosticEntry).task === 'string' &&
      typeof (entry as QueueVertexDiagnosticEntry).status === 'string' &&
      typeof (entry as QueueVertexDiagnosticEntry).message === 'string',
  );
};

const getQueueStage = (payload: Record<string, unknown> | null | undefined) => {
  const rawStage = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__stage : null;
  return typeof rawStage === 'string' && rawStage.trim() ? rawStage.trim() : undefined;
};

const toPayloadObject = (payload: Record<string, unknown> | null | undefined): Record<string, unknown> =>
  payload && typeof payload === 'object' ? payload : {};

const getBooleanPayloadFlag = (payload: Record<string, unknown> | null | undefined, key: string) =>
  toPayloadObject(payload)[key] === true;

const getNumericPayloadValue = (payload: Record<string, unknown> | null | undefined, key: string) => {
  const value = Number(toPayloadObject(payload)[key] || 0);
  return Number.isFinite(value) ? value : 0;
};

const formatSeconds = (seconds: number) => {
  const normalized = Math.max(0, Math.ceil(seconds));
  if (normalized < 60) return `${normalized}s`;
  return `${Math.ceil(normalized / 60)} phút`;
};

const getQueueHealthReport = (
  row: any,
  payload: Record<string, unknown> | null | undefined,
  displayStatus: AdminQueueJob['displayStatus'],
): AdminQueueJob['health'] => {
  const now = Date.now();
  const status = String(row.status || '').toLowerCase();
  const stage = getQueueStage(payload) || '';
  const updatedAtMs = new Date(row.updated_at || row.created_at || now).getTime();
  const leaseExpiresAtMs = row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : 0;
  const nextPollAtMs = row.next_poll_at ? new Date(row.next_poll_at).getTime() : 0;
  const secondsSinceUpdated = Number.isFinite(updatedAtMs) ? Math.max(0, Math.floor((now - updatedAtMs) / 1000)) : 0;
  const secondsSinceLeaseExpired = leaseExpiresAtMs > 0 ? Math.floor((now - leaseExpiresAtMs) / 1000) : 0;
  const missingProviderJob = !String(row.job_id || '').trim();
  const tstTouched = getBooleanPayloadFlag(payload, '__tstTouched');
  const dispatchConfirmationPending = getBooleanPayloadFlag(payload, '__dispatchConfirmationPending');
  const recoveries = getNumericPayloadValue(payload, '__watchdogRecoveries');
  const providerRisk = Boolean(row.job_id) || tstTouched || dispatchConfirmationPending || stage === 'dispatching';
  const leaseState: NonNullable<AdminQueueJob['health']>['leaseState'] =
    leaseExpiresAtMs <= 0 ? 'none' : leaseExpiresAtMs > now ? 'active' : 'expired';

  if (displayStatus === 'rescuing') {
    return {
      code: 'rescuing_failed_provider',
      label: 'Đang cứu kết quả provider',
      detail: 'Job đã fail nhưng còn khả năng provider vẫn có kết quả. Worker đang theo chính sách rescue.',
      action: 'Theo dõi rescue, không dispatch lại job này.',
      severity: 'warning',
      providerRisk: true,
      safeToRequeue: false,
      watchdogDue: false,
      leaseState,
      secondsSinceUpdated,
      secondsSinceLeaseExpired,
      recoveries,
    };
  }

  if (status === 'completed') {
    return {
      code: 'completed',
      label: 'Đã hoàn thành',
      detail: 'Job đã có trạng thái completed.',
      action: 'Không cần xử lý.',
      severity: 'ok',
      providerRisk: false,
      safeToRequeue: false,
      watchdogDue: false,
      leaseState,
      secondsSinceUpdated,
      secondsSinceLeaseExpired,
      recoveries,
    };
  }

  if (status === 'failed') {
    return {
      code: 'failed',
      label: 'Đã thất bại',
      detail: 'Job đã kết thúc ở trạng thái failed.',
      action: 'Xem log lỗi/refund nếu cần đối soát.',
      severity: 'critical',
      providerRisk,
      safeToRequeue: false,
      watchdogDue: false,
      leaseState,
      secondsSinceUpdated,
      secondsSinceLeaseExpired,
      recoveries,
    };
  }

  if (status === 'queued') {
    const queuedStale = secondsSinceUpdated * 1000 >= STALE_QUEUE_MS;
    return {
      code: queuedStale ? 'queued_stale' : 'healthy',
      label: queuedStale ? 'Queued quá lâu' : 'Đang chờ slot',
      detail: queuedStale
        ? `Job queued không được claim trong ${formatSeconds(secondsSinceUpdated)}. Có thể worker/slot dispatch đang bận hoặc mất heartbeat.`
        : 'Job đang chờ worker claim theo slot hệ thống và giới hạn mỗi user.',
      action: queuedStale ? 'Watchdog sẽ alert. Kiểm tra dispatch worker heartbeat và capacity.' : 'Chờ worker dispatch.',
      severity: queuedStale ? 'warning' : 'info',
      providerRisk: false,
      safeToRequeue: false,
      watchdogDue: queuedStale,
      leaseState,
      secondsSinceUpdated,
      secondsSinceLeaseExpired,
      recoveries,
    };
  }

  if (status === 'processing' && missingProviderJob) {
    const preDispatchStage = PRE_DISPATCH_STAGES.has(stage);
    const preDispatchStale = preDispatchStage && secondsSinceUpdated * 1000 >= PRE_DISPATCH_STALE_MS;
    const leaseExpired = leaseState === 'none' || leaseState === 'expired';
    const watchdogDue = !providerRisk && (preDispatchStale || leaseExpired);
    const secondsUntilWatchdogDue =
      !providerRisk && preDispatchStage && !preDispatchStale
        ? Math.ceil((PRE_DISPATCH_STALE_MS - secondsSinceUpdated * 1000) / 1000)
        : 0;

    if (providerRisk) {
      return {
        code: 'pre_dispatch_provider_risk',
        label: 'Rủi ro provider duplicate',
        detail: `Job chưa có provider id nhưng đã có dấu hiệu chạm TST (${[
          tstTouched ? '__tstTouched' : '',
          dispatchConfirmationPending ? '__dispatchConfirmationPending' : '',
          stage === 'dispatching' ? 'stage=dispatching' : '',
        ].filter(Boolean).join(', ')}).`,
        action: 'Không tự dispatch lại. Watchdog sẽ fail/refund hoặc chờ xác minh để tránh tạo trùng provider job.',
        severity: 'critical',
        providerRisk: true,
        safeToRequeue: false,
        watchdogDue: leaseExpired || preDispatchStale,
        leaseState,
        secondsUntilWatchdogDue,
        secondsSinceUpdated,
        secondsSinceLeaseExpired,
        recoveries,
      };
    }

    if (watchdogDue) {
      return {
        code: 'pre_dispatch_safe_requeue_due',
        label: 'Pre-dispatch stale, an toàn để requeue',
        detail: `Job chưa chạm TST, chưa có provider id, stage=${stage || 'unknown'}, im lặng ${formatSeconds(secondsSinceUpdated)}.`,
        action: 'Watchdog/DB invariant phải đưa job về queue ở chu kỳ kế tiếp.',
        severity: 'critical',
        providerRisk: false,
        safeToRequeue: true,
        watchdogDue: true,
        leaseState,
        secondsUntilWatchdogDue: 0,
        secondsSinceUpdated,
        secondsSinceLeaseExpired,
        recoveries,
      };
    }

    return {
      code: 'pre_dispatch_waiting_lease',
      label: 'Đang chuẩn bị, chưa tới hạn watchdog',
      detail: preDispatchStage
        ? `Job ở ${stage}, chưa chạm TST. Watchdog còn khoảng ${formatSeconds(secondsUntilWatchdogDue)} trước khi được phép rescue.`
        : 'Job đang processing trước provider nhưng stage chưa đủ điều kiện stale nhanh.',
      action: 'Chờ worker tiếp tục hoặc watchdog rescue khi hết ngưỡng.',
      severity: 'warning',
      providerRisk: false,
      safeToRequeue: false,
      watchdogDue: false,
      leaseState,
      secondsUntilWatchdogDue,
      secondsSinceUpdated,
      secondsSinceLeaseExpired,
      recoveries,
    };
  }

  if (status === 'processing' && !missingProviderJob && nextPollAtMs > 0) {
    const overdueSeconds = Math.floor((now - nextPollAtMs) / 1000);
    const overdue = overdueSeconds * 1000 >= OVERDUE_POLL_GRACE_MS;
    return {
      code: overdue ? 'poll_overdue' : 'healthy',
      label: overdue ? 'Poll provider quá hạn' : 'Đang chờ poll provider',
      detail: overdue
        ? `Provider job đã quá lịch poll ${formatSeconds(overdueSeconds)}.`
        : 'Provider đã nhận job, worker sẽ poll khi tới lịch.',
      action: overdue ? 'Watchdog phải clear lease và đẩy next_poll_at về hiện tại.' : 'Chờ poll worker.',
      severity: overdue ? 'critical' : 'info',
      providerRisk: true,
      safeToRequeue: false,
      watchdogDue: overdue,
      leaseState,
      secondsSinceUpdated,
      secondsSinceLeaseExpired,
      recoveries,
    };
  }

  return {
    code: 'unknown',
    label: 'Chưa phân loại',
    detail: 'Không khớp rule health hiện tại.',
    action: 'Mở chi tiết job để xem payload/log.',
    severity: 'warning',
    providerRisk,
    safeToRequeue: false,
    watchdogDue: false,
    leaseState,
    secondsSinceUpdated,
    secondsSinceLeaseExpired,
    recoveries,
  };
};

const getLastQueueLog = (payload: Record<string, unknown> | null | undefined) => {
  const logs = normalizeQueueLogs(payload);
  return logs.length > 0 ? logs[logs.length - 1] : null;
};

const getQueueClientPlatform = (payload: Record<string, unknown> | null | undefined): AdminQueueJob['clientPlatform'] => {
  const rawPlatform = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__clientPlatform : null;
  const normalized = typeof rawPlatform === 'string' ? rawPlatform.trim().toLowerCase() : '';
  if (normalized === 'mobile' || normalized === 'desktop' || normalized === 'unknown') {
    return normalized;
  }
  return undefined;
};

const isStuckJob = (row: any) => {
  const now = Date.now();
  const updatedAt = new Date(row.updated_at || row.created_at || now).getTime();
  const nextPollAt = row.next_poll_at ? new Date(row.next_poll_at).getTime() : 0;
  const missingProviderJob = !String(row.job_id || '').trim();
  const status = String(row.status || '').toLowerCase();

  if (status === 'queued') {
    return now - updatedAt >= STALE_QUEUE_MS;
  }

  if (status === 'processing' && missingProviderJob) {
    return now - updatedAt >= STALE_QUEUE_MS;
  }

  if (status === 'processing' && !missingProviderJob && nextPollAt > 0) {
    return now - nextPollAt >= OVERDUE_POLL_GRACE_MS;
  }

  return false;
};

const buildSummary = (jobs: AdminQueueJob[]): AdminQueueSummary => ({
  total: jobs.length,
  queued: jobs.filter((job) => job.status === 'queued').length,
  processing: jobs.filter((job) => job.status === 'processing').length,
  completed: jobs.filter((job) => (job.displayStatus || job.status) === 'completed').length,
  failed: jobs.filter((job) => (job.displayStatus || job.status) === 'failed').length,
  overduePolls: jobs.filter((job) => job.health?.code === 'poll_overdue').length,
  untouchedQueued: jobs.filter((job) => job.health?.code === 'queued_stale').length,
  stalledPreDispatch: jobs.filter((job) => ['pre_dispatch_safe_requeue_due', 'pre_dispatch_provider_risk'].includes(job.health?.code || '')).length,
});

const getSaigonTodayStartIso = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SUMMARY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return new Date(`${year}-${month}-${day}T00:00:00+07:00`).toISOString();
};

const matchesSearch = (job: AdminQueueJob, search: string) => {
  if (!search) return true;
  const normalized = search.toLowerCase();
  return [
    job.id,
    job.jobId || '',
    job.userEmail || '',
    job.userName || '',
  ].some((value) => String(value || '').toLowerCase().includes(normalized));
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
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

    const statusFilter = String(event.queryStringParameters?.status || 'all').trim().toLowerCase();
    const searchFilter = String(event.queryStringParameters?.search || event.queryStringParameters?.email || '').trim().toLowerCase();
    const userIdFilter = String(event.queryStringParameters?.userId || '').trim();
    const assetTypeFilter = String(event.queryStringParameters?.assetType || 'all').trim().toLowerCase();
    const timeScope = String(event.queryStringParameters?.timeScope || 'today').trim().toLowerCase();
    const stageFilter = String(event.queryStringParameters?.stage || 'all').trim().toLowerCase();
    const stuckOnly = String(event.queryStringParameters?.stuckOnly || 'false').trim().toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(200, Number(event.queryStringParameters?.limit || DEFAULT_LIMIT)));

    const needsInMemoryFiltering = Boolean(searchFilter)
      || stageFilter !== 'all'
      || stuckOnly
      || statusFilter === 'rescuing';
    const queryLimit = needsInMemoryFiltering
      ? Math.min(MAX_FILTER_OVERFETCH, Math.max(limit * FILTER_OVERFETCH_MULTIPLIER, limit))
      : limit;

    let query = admin
      .from('admin_generated_images_queue_lightweight')
      .select('id, user_id, tool_name, queue_kind, asset_type, status, job_id, progress, queue_payload, error_message, created_at, updated_at, next_poll_at, processing_started_at, lease_expires_at')
      .order('updated_at', { ascending: false })
      .limit(queryLimit);

    if (statusFilter !== 'all' && statusFilter !== 'rescuing') {
      query = query.eq('status', statusFilter);
    }
    if (assetTypeFilter === 'image' || assetTypeFilter === 'video') {
      query = query.eq('asset_type', assetTypeFilter);
    }
    if (timeScope === 'today') {
      query = query.gte('created_at', getSaigonTodayStartIso());
    }
    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const userIds = [...new Set(rows.map((row: any) => String(row.user_id || '')).filter(Boolean))];
    const { data: userRows, error: userRowsError } = userIds.length > 0
      ? await admin
          .from('users')
          .select('id, email, display_name')
          .in('id', userIds)
      : { data: [], error: null };

    if (userRowsError) {
      throw userRowsError;
    }

    const userMap = new Map(
      ((userRows || []) as any[]).map((row) => [
        String(row.id || ''),
        {
          email: typeof row.email === 'string' ? row.email : '',
          displayName: typeof row.display_name === 'string' ? row.display_name : '',
        },
      ]),
    );

    let jobs: AdminQueueJob[] = rows.map((row: any) => {
      const payload = row.queue_payload && typeof row.queue_payload === 'object'
        ? row.queue_payload as Record<string, unknown>
        : null;
      const profile = userMap.get(String(row.user_id || ''));
      const lastQueueLog = getLastQueueLog(payload);
      const normalizedStatus = String(row.status || 'queued').toLowerCase();
      const queueLogs = normalizeQueueLogs(payload);
      const vertexDiagnostics = normalizeVertexDiagnostics(payload);
      const displayErrorSource = pickQueueFailureMessage(row.error_message || undefined, queueLogs);
      const errorInfo = classifyQueueError(displayErrorSource || row.error_message || undefined);

      const displayStatus =
        normalizedStatus === 'failed' &&
        isFailedRescueStillActive(payload) &&
        !isTerminalRescueFailureMessage(displayErrorSource) &&
        (errorInfo.category === 'provider' || errorInfo.category === 'unknown')
          ? 'rescuing'
          : ((normalizedStatus === 'queued' || normalizedStatus === 'processing' || normalizedStatus === 'completed' || normalizedStatus === 'failed')
            ? normalizedStatus
            : 'queued') as AdminQueueJob['status'];

      const health = getQueueHealthReport(row, payload, displayStatus);

      return {
        id: String(row.id),
        userId: String(row.user_id),
        userEmail: profile?.email || undefined,
        userName: profile?.displayName || undefined,
        clientPlatform: getQueueClientPlatform(payload),
        status: (normalizedStatus === 'queued' || normalizedStatus === 'processing' || normalizedStatus === 'completed' || normalizedStatus === 'failed'
          ? normalizedStatus
          : 'queued') as AdminQueueJob['status'],
        displayStatus,
        assetType: (row.asset_type || 'image') as AdminQueueJob['assetType'],
        queueKind: row.queue_kind || undefined,
        toolName: row.tool_name || undefined,
        jobId: row.job_id || undefined,
        progress: typeof row.progress === 'number' ? row.progress : undefined,
        queueStage: getQueueStage(payload),
        queueLogs,
        vertexDiagnostics,
        lastLogMessage: lastQueueLog?.message || undefined,
        lastLogAt: lastQueueLog?.at || undefined,
        error: normalizeQueueErrorMessage(displayErrorSource || row.error_message || undefined) || undefined,
        errorCategory: errorInfo.category,
        errorRaw: repairVietnameseMojibake(row.error_message || undefined) || undefined,
        createdAt: row.created_at || undefined,
        updatedAt: row.updated_at || undefined,
        nextPollAt: row.next_poll_at || undefined,
        processingStartedAt: row.processing_started_at || undefined,
        leaseExpiresAt: row.lease_expires_at || undefined,
        isStuck: isStuckJob(row) || health.watchdogDue || health.code === 'pre_dispatch_provider_risk',
        health,
      };
    });

    if (searchFilter) {
      jobs = jobs.filter((job) => matchesSearch(job, searchFilter));
    }
    if (statusFilter === 'rescuing') {
      jobs = jobs.filter((job) => job.displayStatus === 'rescuing');
    }
    if (stageFilter !== 'all') {
      jobs = jobs.filter((job) => String(job.queueStage || '').toLowerCase() === stageFilter);
    }
    if (stuckOnly) {
      jobs = jobs.filter((job) => job.isStuck);
    }

    jobs = jobs.slice(0, limit);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobs,
        summary: buildSummary(jobs),
      }),
    };
  } catch (error: any) {
    console.error('[admin-queue-jobs] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
