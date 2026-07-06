import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { isSystemQueueKind, SYSTEM_QUEUE_KINDS } from '../../shared/queueKinds';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const QUEUE_WORKER_LOCK_KEYS = [
  'queue_worker_lock',
  'queue_worker_lock:all',
  'queue_worker_lock:dispatch',
  'queue_worker_lock:poll',
];

const toTimeMs = (value?: string | null) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPayloadStage = (payload: unknown) =>
  payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).__stage === 'string'
    ? String((payload as Record<string, unknown>).__stage)
    : '';

const buildDispatchDiagnostics = async (admin: ReturnType<typeof getServiceRoleClient>) => {
  const now = Date.now();
  const [{ data: activeRows, error: activeError }, { data: lockRows, error: lockError }] = await Promise.all([
    admin
      .from('generated_images')
      .select('id, user_id, status, asset_type, queue_kind, queue_payload, created_at, updated_at, lease_expires_at')
      .in('status', ['queued', 'processing'])
      .in('queue_kind', SYSTEM_QUEUE_KINDS)
      .order('created_at', { ascending: true })
      .limit(500),
    admin
      .from('system_settings')
      .select('key, value, updated_at')
      .in('key', QUEUE_WORKER_LOCK_KEYS),
  ]);

  if (activeError) throw activeError;
  if (lockError) throw lockError;

  const queueRows = ((activeRows || []) as any[]).filter((row) => isSystemQueueKind(row.queue_kind));
  const processingRows = queueRows.filter((row) => row.status === 'processing');
  const queuedRows = queueRows.filter((row) => row.status === 'queued');
  const systemImageProcessing = processingRows.filter((row) => (row.asset_type || 'image') !== 'video').length;
  const systemVideoProcessing = processingRows.filter((row) => row.asset_type === 'video').length;
  const imageSlots = Math.max(0, 4 - systemImageProcessing);
  const videoSlots = Math.max(0, 4 - systemVideoProcessing);

  const userProcessing = new Map<string, { image: number; video: number }>();
  for (const row of processingRows) {
    const current = userProcessing.get(row.user_id) || { image: 0, video: 0 };
    if (row.asset_type === 'video') current.video += 1;
    else current.image += 1;
    userProcessing.set(row.user_id, current);
  }

  const eligible = queuedRows.filter((row) => {
    const leaseMs = toTimeMs(row.lease_expires_at);
    const userCounts = userProcessing.get(row.user_id) || { image: 0, video: 0 };
    if (!row.queue_payload) return false;
    if (leaseMs > now) return false;
    if (row.asset_type === 'video') return videoSlots > 0 && userCounts.video === 0;
    return imageSlots > 0 && userCounts.image === 0;
  });

  const blockedQueued = queuedRows
    .filter((row) => !eligible.some((candidate) => candidate.id === row.id))
    .slice(0, 20)
    .map((row) => {
      const leaseMs = toTimeMs(row.lease_expires_at);
      const userCounts = userProcessing.get(row.user_id) || { image: 0, video: 0 };
      const isVideo = row.asset_type === 'video';
      const reasons = [
        !row.queue_payload ? 'missing_payload' : '',
        leaseMs > now ? 'lease_active' : '',
        isVideo && videoSlots <= 0 ? 'system_video_slots_full' : '',
        !isVideo && imageSlots <= 0 ? 'system_image_slots_full' : '',
        isVideo && userCounts.video > 0 ? 'user_video_processing_exists' : '',
        !isVideo && userCounts.image > 0 ? 'user_image_processing_exists' : '',
      ].filter(Boolean);

      return {
        id: row.id,
        userId: row.user_id,
        assetType: row.asset_type || 'image',
        queueKind: row.queue_kind,
        stage: getPayloadStage(row.queue_payload),
        updatedAt: row.updated_at,
        leaseExpiresAt: row.lease_expires_at,
        reasons,
      };
    });

  return {
    generatedAt: new Date(now).toISOString(),
    capacity: {
      systemImageProcessing,
      systemVideoProcessing,
      imageSlots,
      videoSlots,
    },
    counts: {
      queued: queuedRows.length,
      queuedImages: queuedRows.filter((row) => (row.asset_type || 'image') !== 'video').length,
      queuedVideos: queuedRows.filter((row) => row.asset_type === 'video').length,
      eligibleForDispatch: eligible.length,
      processing: processingRows.length,
    },
    locks: (lockRows || []).map((row: any) => ({
      key: row.key,
      owner: row.value?.owner || null,
      expiresAt: row.value?.expiresAt || null,
      heartbeatAt: row.value?.heartbeatAt || null,
      updatedAt: row.updated_at,
      expired: toTimeMs(row.value?.expiresAt) <= now,
    })),
    oldestEligibleQueued: eligible.slice(0, 10).map((row) => ({
      id: row.id,
      userId: row.user_id,
      assetType: row.asset_type || 'image',
      queueKind: row.queue_kind,
      stage: getPayloadStage(row.queue_payload),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    blockedQueued,
  };
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

    if (requesterError) throw requesterError;
    if (!requester?.is_admin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden' }),
      };
    }

    const [{ data: lastReportRow, error: lastReportError }, liveReportResult, dispatchDiagnostics] = await Promise.all([
      admin
        .from('system_settings')
        .select('value, updated_at')
        .eq('key', 'queue_watchdog_last_health_report')
        .maybeSingle(),
      admin.rpc('get_generated_queue_health_report'),
      buildDispatchDiagnostics(admin),
    ]);

    if (lastReportError) throw lastReportError;

    const liveError = liveReportResult.error;
    const liveDbReport = liveError
      ? {
          error: liveError.message || 'get_generated_queue_health_report failed',
          code: liveError.code,
        }
      : liveReportResult.data;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        lastWatchdogReport: lastReportRow?.value || null,
        lastWatchdogReportUpdatedAt: lastReportRow?.updated_at || null,
        liveDbReport,
        dispatchDiagnostics,
      }),
    };
  } catch (error: any) {
    console.error('[admin-queue-health-report] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
