import type { Handler } from '@netlify/functions';
import type { AdminQueueInputMedia, AdminQueueJob, AdminQueueJobDetail } from '../../types';
import type { QueueProgressLogEntry, QueueNotificationMediaEntry } from '../../shared/queueRecipes';
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

const getQueueClientPlatform = (payload: Record<string, unknown> | null | undefined): AdminQueueJob['clientPlatform'] => {
  const rawPlatform = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).__clientPlatform : null;
  const normalized = typeof rawPlatform === 'string' ? rawPlatform.trim().toLowerCase() : '';
  if (normalized === 'mobile' || normalized === 'desktop' || normalized === 'unknown') {
    return normalized;
  }
  return undefined;
};

const toAdminJob = (row: any, profile?: { email?: string; displayName?: string }): AdminQueueJob => {
  const queueLogs = normalizeQueueLogs(row.queue_payload || null);
  const displayErrorSource = pickQueueFailureMessage(row.error_message || undefined, queueLogs);
  const errorInfo = classifyQueueError(displayErrorSource || row.error_message || undefined);
  const displayStatus =
    String(row.status || 'queued') === 'failed' &&
    isFailedRescueStillActive(row.queue_payload || null) &&
    !isTerminalRescueFailureMessage(displayErrorSource) &&
    (errorInfo.category === 'provider' || errorInfo.category === 'unknown')
      ? 'rescuing'
      : ((row.status || 'queued') as AdminQueueJob['status']);

  return ({
  id: String(row.id),
  userId: String(row.user_id),
  userEmail: profile?.email || undefined,
  userName: profile?.displayName || undefined,
  clientPlatform: getQueueClientPlatform(row.queue_payload || null),
  status: (row.status || 'queued') as AdminQueueJob['status'],
  displayStatus,
  assetType: (row.asset_type || 'image') as AdminQueueJob['assetType'],
  queueKind: row.queue_kind || undefined,
  toolName: row.tool_name || undefined,
  prompt: row.prompt || undefined,
  jobId: row.job_id || undefined,
  progress: typeof row.progress === 'number' ? row.progress : undefined,
  queueStage: getQueueStage(row.queue_payload || null),
  queueLogs,
  error: normalizeQueueErrorMessage(displayErrorSource || row.error_message || undefined) || undefined,
  errorCategory: errorInfo.category,
  errorRaw: repairVietnameseMojibake(row.error_message || undefined) || undefined,
  createdAt: row.created_at || undefined,
  updatedAt: row.updated_at || undefined,
  nextPollAt: row.next_poll_at || undefined,
  processingStartedAt: row.processing_started_at || undefined,
  leaseExpiresAt: row.lease_expires_at || undefined,
  isStuck: false,
  });
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

  const groups = Array.isArray(payload.characterReferenceGroups) ? payload.characterReferenceGroups : [];
  groups.forEach((group: any, groupIndex: number) => {
    const refs = Array.isArray(group?.references) ? group.references : [];
    refs.forEach((ref: any, refIndex: number) => {
      if (typeof ref?.source !== 'string' || !ref.source.trim()) return;
      const kind = typeof ref?.kind === 'string' ? ref.kind : 'reference';
      push(ref.source, `Character ${group?.characterIndex || groupIndex + 1} - ${kind} ${refIndex + 1}`, 'character', 'image', true);
    });
  });

  (Array.isArray(payload.characterImages) ? payload.characterImages : []).forEach((value: unknown, index: number) => {
    push(value, `Character image ${index + 1}`, 'character', 'image', true);
  });
  (Array.isArray(payload.referenceImages) ? payload.referenceImages : []).forEach((value: unknown, index: number) => {
    push(value, `Reference image ${index + 1}`, 'reference', 'image', true);
  });
  push(payload.sampleImage, 'Sample image', 'sample', 'image', true);
  push(payload.styleImage, 'Style image', 'style', 'image', false);
  push(payload.sourceImage, 'Source image', 'source', 'image', true);
  push(payload.keyframeImage, 'Keyframe image', 'keyframe', 'image', true);
  push(payload.characterImage, 'Motion character image', 'character', 'image', true);
  push(payload.motionVideoDataUrl, 'Motion video', 'motion', 'video', true);

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
      .select('id, user_id, prompt, tool_name, queue_kind, asset_type, status, job_id, progress, queue_payload, error_message, created_at, updated_at, next_poll_at, processing_started_at, lease_expires_at')
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
    const inputMedia = explicitMedia.length > 0 ? explicitMedia : extractRecipeMedia(payload);

    const detail: AdminQueueJobDetail = {
      job: toAdminJob(row, {
        email: profile?.email || undefined,
        displayName: profile?.display_name || undefined,
      }),
      prompt: typeof payload.prompt === 'string' && payload.prompt.trim() ? payload.prompt : row.prompt || undefined,
      queuePayloadPreview: sanitizePayloadValue(payload) as Record<string, unknown>,
      inputMedia,
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
