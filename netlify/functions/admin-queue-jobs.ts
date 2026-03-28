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
const STALE_QUEUE_MS = 5 * 60 * 1000;
const OVERDUE_POLL_GRACE_MS = 2 * 60 * 1000;

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

const getQueueStage = (payload: Record<string, unknown> | null | undefined) => {
  const rawStage = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__stage : null;
  return typeof rawStage === 'string' && rawStage.trim() ? rawStage.trim() : undefined;
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
  completed: jobs.filter((job) => job.displayStatus === 'completed').length,
  failed: jobs.filter((job) => job.displayStatus === 'failed').length,
  overduePolls: jobs.filter((job) => job.status === 'processing' && !!job.jobId && job.isStuck).length,
  untouchedQueued: jobs.filter((job) => job.status === 'queued' && job.isStuck).length,
  stalledPreDispatch: jobs.filter((job) => job.status === 'processing' && !job.jobId && job.isStuck).length,
});

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
    const emailFilter = String(event.queryStringParameters?.email || '').trim().toLowerCase();
    const userIdFilter = String(event.queryStringParameters?.userId || '').trim();
    const assetTypeFilter = String(event.queryStringParameters?.assetType || 'all').trim().toLowerCase();
    const stageFilter = String(event.queryStringParameters?.stage || 'all').trim().toLowerCase();
    const stuckOnly = String(event.queryStringParameters?.stuckOnly || 'false').trim().toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(200, Number(event.queryStringParameters?.limit || DEFAULT_LIMIT)));

    let scopedUserIds: string[] | null = null;
    if (emailFilter) {
      const { data: matchedUsers, error: usersError } = await admin
        .from('users')
        .select('id')
        .ilike('email', `%${emailFilter}%`)
        .limit(100);

      if (usersError) {
        throw usersError;
      }

      scopedUserIds = (matchedUsers || []).map((row: any) => String(row.id || '')).filter(Boolean);
      if (scopedUserIds.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ jobs: [], summary: buildSummary([]) }),
        };
      }
    }

    let query = admin
      .from('generated_images')
      .select('id, user_id, prompt, tool_name, queue_kind, asset_type, status, job_id, progress, queue_payload, error_message, created_at, updated_at, next_poll_at, processing_started_at, lease_expires_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (statusFilter !== 'all' && statusFilter !== 'rescuing') {
      query = query.eq('status', statusFilter);
    }
    if (assetTypeFilter === 'image' || assetTypeFilter === 'video') {
      query = query.eq('asset_type', assetTypeFilter);
    }
    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    } else if (scopedUserIds) {
      query = query.in('user_id', scopedUserIds);
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

    let jobs: AdminQueueJob[] = rows
      .filter((row: any) => isSystemQueueKind(row.queue_kind))
      .map((row: any) => {
      const payload = row.queue_payload && typeof row.queue_payload === 'object'
        ? row.queue_payload as Record<string, unknown>
        : null;
      const profile = userMap.get(String(row.user_id || ''));
      const queueLogs = normalizeQueueLogs(payload);
      const displayErrorSource = pickQueueFailureMessage(row.error_message || undefined, queueLogs);
      const errorInfo = classifyQueueError(displayErrorSource || row.error_message || undefined);
      const displayStatus =
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
        status: (row.status || 'queued') as AdminQueueJob['status'],
        displayStatus,
        assetType: (row.asset_type || 'image') as AdminQueueJob['assetType'],
        queueKind: row.queue_kind || undefined,
        toolName: row.tool_name || undefined,
        prompt: row.prompt || undefined,
        jobId: row.job_id || undefined,
        progress: typeof row.progress === 'number' ? row.progress : undefined,
        queueStage: getQueueStage(payload),
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
      });

    if (statusFilter === 'rescuing') {
      jobs = jobs.filter((job) => job.displayStatus === 'rescuing');
    }
    if (stageFilter !== 'all') {
      jobs = jobs.filter((job) => String(job.queueStage || '').toLowerCase() === stageFilter);
    }
    if (stuckOnly) {
      jobs = jobs.filter((job) => job.isStuck);
    }

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
