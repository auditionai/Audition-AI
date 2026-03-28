import type { Handler } from '@netlify/functions';
import type { AdminQueueJob, AdminQueueSummary } from '../../types';
import type { QueueProgressLogEntry } from '../../shared/queueRecipes';
import { normalizeQueueProgressLogs, repairVietnameseMojibake } from '../../shared/queueLogText';
import { classifyQueueError, isTerminalRescueFailureMessage, normalizeQueueErrorMessage, pickQueueFailureMessage } from '../../shared/queueErrorClassifier';
import { isFailedRescueStillActive } from '../../shared/queueRescueState';
import { isSystemQueueKind } from '../../shared/queueKinds';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const DEFAULT_LIMIT = 100;
const SEARCH_LIMIT = 240;
const STALE_QUEUE_MS = 5 * 60 * 1000;
const OVERDUE_POLL_GRACE_MS = 2 * 60 * 1000;
const SUMMARY_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const USER_LOOKUP_CHUNK_SIZE = 40;
const EMPTY_SUMMARY: AdminQueueSummary = {
  total: 0,
  queued: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  overduePolls: 0,
  untouchedQueued: 0,
  stalledPreDispatch: 0,
};

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

const normalizeQueueLogsFromRow = (row: any) => {
  if (row.queue_payload && typeof row.queue_payload === 'object') {
    return normalizeQueueLogs(row.queue_payload as Record<string, unknown>);
  }

  if (Array.isArray(row.queue_logs)) {
    return normalizeQueueProgressLogs(row.queue_logs.filter(
      (entry: any): entry is QueueProgressLogEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof entry.at === 'string' &&
        typeof entry.stage === 'string' &&
        typeof entry.level === 'string' &&
        typeof entry.message === 'string',
    ));
  }

  return [];
};

const getQueueStage = (payload: Record<string, unknown> | null | undefined) => {
  const rawStage = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__stage : null;
  return typeof rawStage === 'string' && rawStage.trim() ? rawStage.trim() : undefined;
};

const getQueueStageFromRow = (row: any) => {
  if (row.queue_payload && typeof row.queue_payload === 'object') {
    return getQueueStage(row.queue_payload as Record<string, unknown>);
  }
  return typeof row.queue_stage === 'string' && row.queue_stage.trim() ? row.queue_stage.trim() : undefined;
};

const getQueueClientPlatform = (payload: Record<string, unknown> | null | undefined): AdminQueueJob['clientPlatform'] => {
  const rawPlatform = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__clientPlatform : null;
  const normalized = typeof rawPlatform === 'string' ? rawPlatform.trim().toLowerCase() : '';
  if (normalized === 'mobile' || normalized === 'desktop' || normalized === 'unknown') {
    return normalized;
  }
  return undefined;
};

const getQueueClientPlatformFromRow = (row: any): AdminQueueJob['clientPlatform'] => {
  if (row.queue_payload && typeof row.queue_payload === 'object') {
    return getQueueClientPlatform(row.queue_payload as Record<string, unknown>);
  }

  const normalized = typeof row.queue_client_platform === 'string' ? row.queue_client_platform.trim().toLowerCase() : '';
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

const buildSummary = (jobs: Array<Pick<AdminQueueJob, 'status' | 'displayStatus' | 'jobId' | 'isStuck'>>): AdminQueueSummary => ({
  total: jobs.length,
  queued: jobs.filter((job) => job.status === 'queued').length,
  processing: jobs.filter((job) => job.status === 'processing').length,
  completed: jobs.filter((job) => (job.displayStatus || job.status) === 'completed').length,
  failed: jobs.filter((job) => (job.displayStatus || job.status) === 'failed').length,
  overduePolls: jobs.filter((job) => job.status === 'processing' && !!job.jobId && !!job.isStuck).length,
  untouchedQueued: jobs.filter((job) => job.status === 'queued' && !!job.isStuck).length,
  stalledPreDispatch: jobs.filter((job) => job.status === 'processing' && !job.jobId && !!job.isStuck).length,
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

const isLikelyJobSearch = (value: string) => /^[0-9a-f-]{4,}$/i.test(value);

const matchesSearch = (job: AdminQueueJob, search: string) => {
  if (!search) return true;
  const haystacks = [
    job.id,
    job.jobId || '',
    job.userEmail || '',
    job.userName || '',
  ].map((value) => value.toLowerCase());
  return haystacks.some((value) => value.includes(search));
};

const mapRowToAdminJob = (
  row: any,
  profile?: { email?: string; displayName?: string },
): AdminQueueJob => {
  const payload = row.queue_payload && typeof row.queue_payload === 'object'
    ? row.queue_payload as Record<string, unknown>
    : null;
  const queueLogs = normalizeQueueLogsFromRow(row);
  const displayErrorSource = pickQueueFailureMessage(row.error_message || undefined, queueLogs);
  const errorInfo = classifyQueueError(displayErrorSource || row.error_message || undefined);
  const displayStatus =
    payload &&
    String(row.status || 'queued') === 'failed' &&
    isFailedRescueStillActive(payload) &&
    !isTerminalRescueFailureMessage(displayErrorSource) &&
    (errorInfo.category === 'provider' || errorInfo.category === 'unknown')
      ? 'rescuing'
      : ((row.status || 'queued') as AdminQueueJob['status']);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    userEmail: profile?.email || undefined,
    userName: profile?.displayName || undefined,
    clientPlatform: getQueueClientPlatformFromRow(row),
    status: (row.status || 'queued') as AdminQueueJob['status'],
    displayStatus,
    assetType: (row.asset_type || 'image') as AdminQueueJob['assetType'],
    queueKind: row.queue_kind || undefined,
    toolName: row.tool_name || undefined,
    prompt: row.prompt || undefined,
    jobId: row.job_id || undefined,
    resultUrl: typeof row.image_url === 'string' && row.image_url.trim() ? row.image_url : undefined,
    progress: typeof row.progress === 'number' ? row.progress : undefined,
    queueStage: getQueueStageFromRow(row),
    queueLogs,
    error: normalizeQueueErrorMessage(displayErrorSource || row.error_message || undefined) || undefined,
    errorCategory: errorInfo.category,
    errorRaw: repairVietnameseMojibake(row.error_message || undefined) || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    nextPollAt: row.next_poll_at || undefined,
    processingStartedAt: row.processing_started_at || undefined,
    leaseExpiresAt: row.lease_expires_at || undefined,
    isStuck: isStuckJob(row),
  };
};

const fetchUserMapInChunks = async (admin: ReturnType<typeof getServiceRoleClient>, userIds: string[]) => {
  const userMap = new Map<string, { email: string; displayName: string }>();
  for (let index = 0; index < userIds.length; index += USER_LOOKUP_CHUNK_SIZE) {
    const chunk = userIds.slice(index, index + USER_LOOKUP_CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const { data, error } = await admin
      .from('users')
      .select('id, email, display_name')
      .in('id', chunk);

    if (error) {
      throw error;
    }

    for (const row of (data || []) as any[]) {
      userMap.set(String(row.id || ''), {
        email: typeof row.email === 'string' ? row.email : '',
        displayName: typeof row.display_name === 'string' ? row.display_name : '',
      });
    }
  }

  return userMap;
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
    const limit = Math.max(1, Math.min(240, Number(event.queryStringParameters?.limit || DEFAULT_LIMIT)));

    let matchedUserIds: string[] = [];
    if (!userIdFilter && searchFilter) {
      const { data: matchedUsers, error: matchedUsersError } = await admin
        .from('users')
        .select('id')
        .ilike('email', `%${searchFilter}%`)
        .limit(200);

      if (matchedUsersError) {
        throw matchedUsersError;
      }

      matchedUserIds = (matchedUsers || []).map((row: any) => String(row.id || '')).filter(Boolean);
      if (matchedUserIds.length === 0 && !isLikelyJobSearch(searchFilter)) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ jobs: [], summary: EMPTY_SUMMARY }),
        };
      }
    }

    const useLightweightPayload = timeScope === 'all' && !searchFilter && statusFilter !== 'rescuing' && stageFilter === 'all' && !stuckOnly;
    const selectClause = useLightweightPayload
      ? 'id, user_id, prompt, tool_name, queue_kind, asset_type, status, job_id, progress, error_message, created_at, updated_at, next_poll_at, processing_started_at, lease_expires_at, image_url, queue_stage:queue_payload->>__stage, queue_client_platform:queue_payload->>__clientPlatform, queue_logs:queue_payload->__logs'
      : 'id, user_id, prompt, tool_name, queue_kind, asset_type, status, job_id, progress, queue_payload, error_message, created_at, updated_at, next_poll_at, processing_started_at, lease_expires_at, image_url';

    let query = admin
      .from('generated_images')
      .select(selectClause)
      .order('updated_at', { ascending: false })
      .limit(searchFilter ? Math.max(limit, SEARCH_LIMIT) : limit);

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
    } else if (matchedUserIds.length > 0) {
      query = query.in('user_id', matchedUserIds);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const userIds = [...new Set(rows.map((row: any) => String(row.user_id || '')).filter(Boolean))];
    const userMap = userIds.length > 0 ? await fetchUserMapInChunks(admin, userIds) : new Map();

    let jobs = rows
      .filter((row: any) => isSystemQueueKind(row.queue_kind))
      .map((row: any) => mapRowToAdminJob(row, userMap.get(String(row.user_id || ''))));

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

    const filteredJobs = jobs.slice(0, limit);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jobs: filteredJobs,
        summary: buildSummary(filteredJobs),
      }),
    };
  } catch (error: any) {
    console.error('[admin-queue-jobs] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error?.message || 'Internal Server Error',
        summary: EMPTY_SUMMARY,
      }),
    };
  }
};
