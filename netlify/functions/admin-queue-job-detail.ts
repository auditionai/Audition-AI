import type { Handler } from '@netlify/functions';
import type { AdminQueueInputMedia, AdminQueueJob, AdminQueueJobDetail, AdminQueueMediaSection } from '../../types';
import type { QueueProgressLogEntry, QueueNotificationMediaEntry, QueueVertexDiagnosticEntry } from '../../shared/queueRecipes';
import { normalizeQueueProgressLogs, repairVietnameseMojibake } from '../../shared/queueLogText';
import { classifyQueueError, isTerminalRescueFailureMessage, normalizeQueueErrorMessage, pickQueueFailureMessage } from '../../shared/queueErrorClassifier';
import { isFailedRescueStillActive } from '../../shared/queueRescueState';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const LONG_STRING_PREVIEW_LIMIT = 240;
const INLINE_PREVIEW_LIMIT = 1_500_000;
const STALE_QUEUE_MS = 5 * 60 * 1000;
const OVERDUE_POLL_GRACE_MS = 2 * 60 * 1000;
const PRE_DISPATCH_STALE_MS = 90 * 1000;
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

const getQueueClientPlatform = (payload: Record<string, unknown> | null | undefined): AdminQueueJob['clientPlatform'] => {
  const rawPlatform = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__clientPlatform : null;
  const normalized = typeof rawPlatform === 'string' ? rawPlatform.trim().toLowerCase() : '';
  if (normalized === 'mobile' || normalized === 'desktop' || normalized === 'unknown') {
    return normalized;
  }
  return undefined;
};

const toAdminJob = (row: any, profile?: { email?: string; displayName?: string }): AdminQueueJob => {
  const payload = row.queue_payload && typeof row.queue_payload === 'object'
    ? row.queue_payload as Record<string, unknown>
    : null;
  const queueLogs = normalizeQueueLogs(payload);
  const vertexDiagnostics = normalizeVertexDiagnostics(payload);
  const displayErrorSource = pickQueueFailureMessage(row.error_message || undefined, queueLogs);
  const errorInfo = classifyQueueError(displayErrorSource || row.error_message || undefined);
  const displayStatus =
    String(row.status || 'queued') === 'failed' &&
    isFailedRescueStillActive(payload) &&
    !isTerminalRescueFailureMessage(displayErrorSource) &&
    (errorInfo.category === 'provider' || errorInfo.category === 'unknown')
      ? 'rescuing'
      : ((row.status || 'queued') as AdminQueueJob['status']);
  const health = getQueueHealthReport(row, payload, displayStatus);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    userEmail: profile?.email || undefined,
    userName: profile?.displayName || undefined,
    clientPlatform: getQueueClientPlatform(payload),
    status: (row.status || 'queued') as AdminQueueJob['status'],
    displayStatus,
    assetType: (row.asset_type || 'image') as AdminQueueJob['assetType'],
    queueKind: row.queue_kind || undefined,
    toolName: row.tool_name || undefined,
    prompt: row.prompt || undefined,
    jobId: row.job_id || undefined,
    resultUrl: typeof row.image_url === 'string' && row.image_url.trim() ? row.image_url : undefined,
    progress: typeof row.progress === 'number' ? row.progress : undefined,
    queueStage: getQueueStage(payload),
    queueLogs,
    vertexDiagnostics,
    error: normalizeQueueErrorMessage(displayErrorSource || row.error_message || undefined) || undefined,
    errorCategory: errorInfo.category,
    errorRaw: repairVietnameseMojibake(row.error_message || undefined) || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    nextPollAt: row.next_poll_at || undefined,
    processingStartedAt: row.processing_started_at || undefined,
    leaseExpiresAt: row.lease_expires_at || undefined,
    isStuck: isStuckJob(row) || health?.watchdogDue || health?.code === 'pre_dispatch_provider_risk',
    health,
  };
};

const getMediaSourceType = (value: string): AdminQueueInputMedia['sourceType'] => {
  if (/^https?:\/\//i.test(value)) return 'http';
  if (/^data:/i.test(value)) return 'data';
  if (/^[A-Za-z0-9+/=]+$/.test(value.slice(0, 128))) return 'base64';
  return 'unknown';
};

const toMediaPreview = (
  url: string,
  label: string,
  role: string,
  kind: 'image' | 'video',
  userProvided = true,
): AdminQueueInputMedia => {
  const trimmed = url.trim();
  const sourceType = getMediaSourceType(trimmed);

  if ((sourceType === 'data' || sourceType === 'base64') && trimmed.length > INLINE_PREVIEW_LIMIT) {
    return {
      label,
      role,
      kind,
      sourceType,
      note: `Input nội tuyến quá lớn (${Math.round(trimmed.length / 1024)} KB), không gửi toàn bộ sang trình duyệt.`,
      userProvided,
    };
  }

  return {
    label,
    role,
    kind,
    url: sourceType === 'base64' ? `data:${kind === 'video' ? 'video/mp4' : 'image/jpeg'};base64,${trimmed}` : trimmed,
    sourceType,
    userProvided,
  };
};

const extractExplicitMedia = (payload: Record<string, unknown>): AdminQueueInputMedia[] => {
  const entries = Array.isArray(payload.__notifyInputMedia) ? payload.__notifyInputMedia : [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as QueueNotificationMediaEntry;
      if (typeof item.url !== 'string' || !item.url.trim()) return null;
      return toMediaPreview(
        item.url,
        `${item.role}${item.kind === 'video' ? ' video' : ' image'}`,
        item.role,
        item.kind === 'video' ? 'video' : 'image',
        item.userProvided !== false,
      );
    })
    .filter((entry): entry is AdminQueueInputMedia => Boolean(entry));
};

const extractRecipeMedia = (payload: Record<string, unknown>): AdminQueueInputMedia[] => {
  const media: AdminQueueInputMedia[] = [];
  const push = (value: unknown, label: string, role: string, kind: 'image' | 'video' = 'image', userProvided = true) => {
    if (typeof value !== 'string' || !value.trim()) return;
    media.push(toMediaPreview(value, label, role, kind, userProvided));
  };

  const payloadSources = [
    payload,
    toPayloadObject(payload.__recipePayload),
  ].filter((source) => Object.keys(source).length > 0);

  payloadSources.forEach((sourcePayload) => {
    const groups = Array.isArray(sourcePayload.characterReferenceGroups) ? sourcePayload.characterReferenceGroups : [];
    groups.forEach((group: any, groupIndex: number) => {
      const refs = Array.isArray(group?.references) ? group.references : [];
      refs.forEach((ref: any, refIndex: number) => {
        if (typeof ref?.source !== 'string' || !ref.source.trim()) return;
        const kind = typeof ref?.kind === 'string' ? ref.kind : 'reference';
        push(ref.source, `Character ${group?.characterIndex || groupIndex + 1} - ${kind} ${refIndex + 1}`, 'character', 'image', true);
      });
    });

    (Array.isArray(sourcePayload.characterImages) ? sourcePayload.characterImages : []).forEach((value: unknown, index: number) => {
      push(value, `Character image ${index + 1}`, 'character', 'image', true);
    });
    (Array.isArray(sourcePayload.referenceImages) ? sourcePayload.referenceImages : []).forEach((value: unknown, index: number) => {
      push(value, `Reference image ${index + 1}`, 'reference', 'image', true);
    });
    push(sourcePayload.sampleImage, 'Sample image', 'sample', 'image', true);
    push(sourcePayload.styleImage, 'Style image', 'style', 'image', false);
    push(sourcePayload.sourceImage, 'Source image', 'source', 'image', true);
    push(sourcePayload.keyframeImage, 'Keyframe image', 'keyframe', 'image', true);
    push(sourcePayload.characterImage, 'Motion character image', 'character', 'image', true);
    push(sourcePayload.motionVideoDataUrl, 'Motion video', 'motion', 'video', true);
  });

  (Array.isArray(payload.img_url) ? payload.img_url : [payload.img_url]).forEach((value: unknown, index: number) => {
    push(value, `Provider reference ${index + 1}`, 'reference', 'image', false);
  });
  push(payload.image_url, 'Provider keyframe image', 'keyframe', 'image', false);
  push(payload.character_image_url, 'Provider character image', 'character', 'image', false);
  push(payload.motion_video_url, 'Provider motion video', 'motion', 'video', false);

  return media.filter((entry, index, all) => {
    const key = `${entry.role}:${entry.kind}:${entry.url || entry.note || index}`;
    return all.findIndex((candidate, candidateIndex) => `${candidate.role}:${candidate.kind}:${candidate.url || candidate.note || candidateIndex}` === key) === index;
  });
};

const sanitizePayloadValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizePayloadValue(entry)]),
    );
  }

  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      return value.length > LONG_STRING_PREVIEW_LIMIT
        ? `${value.slice(0, LONG_STRING_PREVIEW_LIMIT)}... [truncated ${value.length} chars]`
        : value;
    }
    return value.length > LONG_STRING_PREVIEW_LIMIT
      ? `${value.slice(0, LONG_STRING_PREVIEW_LIMIT)}...`
      : value;
  }

  return value;
};

const toPayloadObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

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
      detail: 'Job đã fail nhưng provider có thể vẫn trả kết quả. Worker đang chạy chính sách rescue.',
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
      detail: 'Job đã completed.',
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
        ? `Job queued chưa được worker claim trong ${formatSeconds(secondsSinceUpdated)}. Có thể dispatch worker/slot đang bận hoặc mất heartbeat.`
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
      const riskFlags = [
        tstTouched ? '__tstTouched' : '',
        dispatchConfirmationPending ? '__dispatchConfirmationPending' : '',
        stage === 'dispatching' ? 'stage=dispatching' : '',
      ].filter(Boolean).join(', ') || 'provider-risk marker';

      return {
        code: 'pre_dispatch_provider_risk',
        label: 'Rủi ro provider duplicate',
        detail: `Job chưa có provider id nhưng đã có dấu hiệu chạm provider (${riskFlags}).`,
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
        detail: `Job chưa chạm provider, chưa có provider id, stage=${stage || 'unknown'}, im lặng ${formatSeconds(secondsSinceUpdated)}.`,
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
        ? `Job ở ${stage}, chưa chạm provider. Watchdog còn khoảng ${formatSeconds(secondsUntilWatchdogDue)} trước khi được rescue.`
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
    action: 'Xem payload/log để bổ sung rule nếu cần.',
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

const deriveRuntimeConfig = (payload: Record<string, unknown>, toolName?: string | null) => {
  const recipePayload = toPayloadObject(payload.__recipePayload);
  const source = Object.keys(recipePayload).length > 0 ? recipePayload : payload;
  const characterCount = Number(source.characterCount || 0) || undefined;
  const modelId = String(source.modelId || payload.model || '').trim() || undefined;
  const speedKey = String(source.speed || payload.speed || '').trim() || undefined;
  const serverId = String(source.serverId || payload.server_id || '').trim() || undefined;
  const resolution = String(source.resolution || payload.resolution || '').trim() || undefined;
  const aspectRatio = String(source.aspectRatio || payload.aspect_ratio || '').trim() || undefined;
  const configKey = String(payload.config_key || '').trim() || undefined;

  const generationMode =
    characterCount === 4 ? 'Nhóm 4 người' :
    characterCount === 3 ? 'Nhóm 3 người' :
    characterCount === 2 ? 'Ảnh đôi' :
    characterCount === 1 ? 'Ảnh đơn' :
    (toolName || undefined);

  const lowerModelId = String(modelId || '').toLowerCase();
  const modelMode =
    lowerModelId.includes('flash') ? 'Flash' :
    lowerModelId ? 'Pro' : undefined;

  const lowerSpeed = String(speedKey || '').toLowerCase();
  const speedMode =
    lowerSpeed === 'fast' ? 'Nhanh' :
    lowerSpeed === 'slow' ? 'Tiết kiệm' :
    undefined;

  return {
    generationMode,
    modelMode,
    modelId,
    speedMode,
    speedKey,
    serverId,
    resolution,
    aspectRatio,
    configKey,
    characterCount,
  };
};

const buildResultMedia = (row: any): AdminQueueInputMedia[] => {
  const resultUrl = typeof row.image_url === 'string' ? row.image_url.trim() : '';
  if (!resultUrl) return [];
  return [
    toMediaPreview(
      resultUrl,
      row.asset_type === 'video' ? 'Video kết quả' : 'Ảnh kết quả',
      'result',
      row.asset_type === 'video' ? 'video' : 'image',
      false,
    ),
  ];
};

const buildMediaSections = (
  inputMedia: AdminQueueInputMedia[],
  resultMedia: AdminQueueInputMedia[],
): AdminQueueMediaSection[] => {
  const referenceRoles = new Set(['character', 'reference', 'source', 'keyframe']);
  const referenceMedia = inputMedia.filter((media) => media.kind === 'image' && referenceRoles.has(media.role));
  const sampleMedia = inputMedia.filter((media) => media.kind === 'image' && media.role === 'sample');

  return [
    {
      key: 'reference',
      label: 'Ảnh tham chiếu nhân vật',
      description: 'Ảnh nhân vật, ảnh tham chiếu hoặc ảnh nguồn dùng để dựng job.',
      items: referenceMedia,
    },
    {
      key: 'sample',
      label: 'Ảnh mẫu',
      description: 'Ảnh mẫu hoặc ảnh gợi ý mà người dùng đã chọn trước khi tạo.',
      items: sampleMedia,
    },
    {
      key: 'result',
      label: 'Kết quả',
      description: 'Ảnh hoặc video đã được provider trả về và lưu thành công.',
      items: resultMedia,
    },
  ].filter((section) => section.items.length > 0);
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
    const jobId = String(event.queryStringParameters?.jobId || '').trim();
    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing jobId' }),
      };
    }

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

    const { data: row, error } = await admin
      .from('generated_images')
      .select('id, user_id, prompt, tool_name, queue_kind, asset_type, status, job_id, progress, queue_payload, error_message, created_at, updated_at, next_poll_at, processing_started_at, lease_expires_at, image_url')
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    const { data: profile } = await admin
      .from('users')
      .select('email, display_name')
      .eq('id', row.user_id)
      .maybeSingle();

    const payload = row.queue_payload && typeof row.queue_payload === 'object'
      ? row.queue_payload as Record<string, unknown>
      : {};
    const explicitMedia = extractExplicitMedia(payload);
    const inputMedia = (explicitMedia.length > 0 ? explicitMedia : extractRecipeMedia(payload))
      .filter((media) => media.role !== 'style');
    const resultMedia = buildResultMedia(row);
    const mediaSections = buildMediaSections(inputMedia, resultMedia);

    const detail: AdminQueueJobDetail = {
      job: toAdminJob(row, {
        email: profile?.email || undefined,
        displayName: profile?.display_name || undefined,
      }),
      prompt: typeof payload.prompt === 'string' && payload.prompt.trim() ? payload.prompt : row.prompt || undefined,
      queuePayloadPreview: sanitizePayloadValue(payload) as Record<string, unknown>,
      inputMedia,
      mediaSections,
      runtimeConfig: deriveRuntimeConfig(payload, row.tool_name),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(detail),
    };
  } catch (error: any) {
    console.error('[admin-queue-job-detail] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
