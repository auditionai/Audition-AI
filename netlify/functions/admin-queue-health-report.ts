import type { Handler } from '@netlify/functions';
import { getAuthenticatedRequestErrorStatus, getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
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

const getRowProvider = (row: any): 'tst' | 'gommo' =>
  String(row?.provider || row?.queue_payload?.__targetProvider || 'tst').trim().toLowerCase() === 'gommo'
    ? 'gommo'
    : 'tst';

const PROVIDER_LIMITS = {
  tst: { image: 4, video: 4, userImage: 1, userVideo: 1 },
  gommo: { image: 12, video: 12, userImage: 3, userVideo: 3 },
} as const;

const buildDispatchDiagnostics = async (admin: ReturnType<typeof getServiceRoleClient>) => {
  const now = Date.now();
  const [{ data: activeRows, error: activeError }, { data: lockRows, error: lockError }] = await Promise.all([
    admin
      .from('generated_images')
      .select('id, user_id, status, asset_type, queue_kind, queue_payload, provider, created_at, updated_at, lease_expires_at')
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
  const capacityByProvider = Object.fromEntries((['tst', 'gommo'] as const).map((provider) => {
    const rows = processingRows.filter((row) => getRowProvider(row) === provider);
    const systemImageProcessing = rows.filter((row) => (row.asset_type || 'image') !== 'video').length;
    const systemVideoProcessing = rows.filter((row) => row.asset_type === 'video').length;
    return [provider, {
      systemImageProcessing,
      systemVideoProcessing,
      imageSlots: Math.max(0, PROVIDER_LIMITS[provider].image - systemImageProcessing),
      videoSlots: Math.max(0, PROVIDER_LIMITS[provider].video - systemVideoProcessing),
    }];
  })) as Record<'tst' | 'gommo', { systemImageProcessing: number; systemVideoProcessing: number; imageSlots: number; videoSlots: number }>;

  const userProcessing = new Map<string, { image: number; video: number }>();
  for (const row of processingRows) {
    const key = `${row.user_id}:${getRowProvider(row)}`;
    const current = userProcessing.get(key) || { image: 0, video: 0 };
    if (row.asset_type === 'video') current.video += 1;
    else current.image += 1;
    userProcessing.set(key, current);
  }

  const eligible = queuedRows.filter((row) => {
    const leaseMs = toTimeMs(row.lease_expires_at);
    const provider = getRowProvider(row);
    const providerCapacity = capacityByProvider[provider];
    const limits = PROVIDER_LIMITS[provider];
    const userCounts = userProcessing.get(`${row.user_id}:${provider}`) || { image: 0, video: 0 };
    if (!row.queue_payload) return false;
    if (leaseMs > now) return false;
    if (row.asset_type === 'video') return providerCapacity.videoSlots > 0 && userCounts.video < limits.userVideo;
    return providerCapacity.imageSlots > 0 && userCounts.image < limits.userImage;
  });

  const blockedQueued = queuedRows
    .filter((row) => !eligible.some((candidate) => candidate.id === row.id))
    .slice(0, 20)
    .map((row) => {
      const leaseMs = toTimeMs(row.lease_expires_at);
      const provider = getRowProvider(row);
      const providerCapacity = capacityByProvider[provider];
      const limits = PROVIDER_LIMITS[provider];
      const userCounts = userProcessing.get(`${row.user_id}:${provider}`) || { image: 0, video: 0 };
      const isVideo = row.asset_type === 'video';
      const reasons = [
        !row.queue_payload ? 'missing_payload' : '',
        leaseMs > now ? 'lease_active' : '',
        isVideo && providerCapacity.videoSlots <= 0 ? `${provider}_video_slots_full` : '',
        !isVideo && providerCapacity.imageSlots <= 0 ? `${provider}_image_slots_full` : '',
        isVideo && userCounts.video >= limits.userVideo ? `${provider}_user_video_limit` : '',
        !isVideo && userCounts.image >= limits.userImage ? `${provider}_user_image_limit` : '',
      ].filter(Boolean);

      return {
        id: row.id,
        userId: row.user_id,
        assetType: row.asset_type || 'image',
        provider,
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
      byProvider: capacityByProvider,
      systemImageProcessing: capacityByProvider.tst.systemImageProcessing + capacityByProvider.gommo.systemImageProcessing,
      systemVideoProcessing: capacityByProvider.tst.systemVideoProcessing + capacityByProvider.gommo.systemVideoProcessing,
      imageSlots: capacityByProvider.tst.imageSlots + capacityByProvider.gommo.imageSlots,
      videoSlots: capacityByProvider.tst.videoSlots + capacityByProvider.gommo.videoSlots,
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
      provider: getRowProvider(row),
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
      statusCode: getAuthenticatedRequestErrorStatus(error),
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
