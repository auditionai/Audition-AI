import { getServiceRoleClient } from './_supabase';
import { fireTelegramJobNotification } from './_telegram-notify';
import { validateQueuePayloadAgainstLiveCatalog } from './_tst-live-catalog';
import { normalizeTstOutboundPayload } from './_tst-payload-normalizer';
import {
  buildImageGenerateProviderPayload,
  prepareProviderPayloadFromQueueRecipe,
  synthesizeImageGeneratePrompt,
  uploadImageToTst,
} from './_queue-recipes';
import { runVertexImageEdit } from './_vertex-image-edit';
import {
  getImageDirectorSources,
  getImageRenderReferenceSources,
  getRecipeValidationPayload,
  isQueueRecipePayload,
  type QueueProcessingStage,
  type QueueProgressLogEntry,
  type QueueNotificationMediaEntry,
  type ImageEditRecipePayload,
  type ImageGenerateRecipePayload,
} from '../../shared/queueRecipes';

type QueueJobRow = {
  id: string;
  user_id: string;
  asset_type: 'image' | 'video';
  queue_kind: string;
  queue_payload: Record<string, unknown> | null;
  prompt: string;
  tool_id: string | null;
  tool_name: string | null;
  model_used: string | null;
  cost_vcoin: number | null;
  job_id?: string | null;
};

type QueueWorkerSummary = {
  claimedForDispatch: number;
  submitted: number;
  claimedForPoll: number;
  completed: number;
  failed: number;
  requeued: number;
};

let activeWorkerRun: Promise<QueueWorkerSummary> | null = null;

const TST_API_KEY = process.env.TST_API_KEY || '';
const TST_API_BASE = 'https://api.tramsangtao.com/v1';
const POLL_INTERVAL_SECONDS = 10;
const MAX_DISPATCH_RETRIES = 6;
const MAX_POLL_FAILURES = 8;
const MAX_PROCESSING_AGE_MS = 45 * 60 * 1000;
const MAX_PROVIDER_GENERIC_RETRIES = 2;
const SINGLE_AND_COUPLE_PREPARE_TIMEOUT_MS = 10 * 60 * 1000;
const GROUP_OF_THREE_PREPARE_TIMEOUT_MS = 15 * 60 * 1000;
const GROUP_OF_FOUR_PREPARE_TIMEOUT_MS = 20 * 60 * 1000;
const IMAGE_REFERENCE_UPLOAD_CHUNK_SIZE = 2;
const DISPATCH_CLAIM_LIMIT = 1;
const POLL_CLAIM_LIMIT = 1;
const WORKER_TICK_BUDGET_MS = 8_000;
const MAX_QUEUE_LOG_ENTRIES = 80;
const ORPHAN_CLAIM_GRACE_MS = 30_000;
const LEASE_HEARTBEAT_INTERVAL_MS = 30_000;
const DISPATCH_LEASE_SECONDS = 300;
const STALE_RECOVERY_SCAN_LIMIT = 50;
const STALE_RECOVERY_MIN_AGE_MS = 45_000;

const isTransientError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('tst_unavailable') ||
    normalized.includes('maintenance') ||
    normalized.includes('not available') ||
    normalized.includes('unavailable') ||
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('overloaded') ||
    normalized.includes('503') ||
    normalized.includes('502') ||
    normalized.includes('504') ||
    normalized.includes('network')
  );
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error || data?.message || data?.detail || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const toQueuePayloadObject = (payload?: Record<string, unknown> | null) =>
  payload && typeof payload === 'object' ? { ...payload } : {};

const stripInternalQueueMeta = (payload: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(payload).filter(([key]) => !key.startsWith('__')));

const normalizeNotificationMediaEntry = (
  entry: unknown,
): QueueNotificationMediaEntry | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const url = typeof (entry as QueueNotificationMediaEntry).url === 'string'
    ? (entry as QueueNotificationMediaEntry).url.trim()
    : '';
  if (!url) {
    return null;
  }

  const role = typeof (entry as QueueNotificationMediaEntry).role === 'string'
    ? (entry as QueueNotificationMediaEntry).role
    : 'reference';
  const kind = (entry as QueueNotificationMediaEntry).kind === 'video' ? 'video' : 'image';
  const userProvided = (entry as QueueNotificationMediaEntry).userProvided !== false;

  return {
    url,
    role: role as QueueNotificationMediaEntry['role'],
    kind,
    userProvided,
  };
};

const buildNotificationMediaEntries = (
  payload?: Record<string, unknown> | null,
): QueueNotificationMediaEntry[] => {
  const raw = toQueuePayloadObject(payload);
  const explicit = Array.isArray(raw.__notifyInputMedia)
    ? raw.__notifyInputMedia
        .map((entry) => normalizeNotificationMediaEntry(entry))
        .filter((entry): entry is QueueNotificationMediaEntry => Boolean(entry))
    : [];

  if (explicit.length > 0) {
    return explicit;
  }

  const entries: QueueNotificationMediaEntry[] = [];
  const push = (
    value: unknown,
    role: QueueNotificationMediaEntry['role'],
    kind: QueueNotificationMediaEntry['kind'] = 'image',
    userProvided = true,
  ) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    entries.push({
      url: value.trim(),
      role,
      kind,
      userProvided,
    });
  };

  if (isQueueRecipePayload(raw)) {
    switch (raw.recipeType) {
      case 'image_generate_recipe_v1':
        (raw.characterImages || []).forEach((value) => push(value, 'character', 'image', true));
        push(raw.sampleImage, 'sample', 'image', true);
        push(raw.styleImage, 'style', 'image', false);
        (raw.referenceImages || []).forEach((value) => push(value, 'reference', 'image', true));
        break;
      case 'image_edit_recipe_v1':
        push(raw.sourceImage, 'source', 'image', true);
        break;
      case 'video_generate_recipe_v1':
        push(raw.keyframeImage, 'keyframe', 'image', true);
        break;
      case 'motion_generate_recipe_v1':
        push(raw.characterImage, 'character', 'image', true);
        push(raw.motionVideoDataUrl, 'motion', 'video', true);
        break;
      default:
        break;
    }
  }

  return entries.filter(
    (entry, index, all) => all.findIndex((candidate) => candidate.url === entry.url) === index,
  );
};

const getQueueLogs = (payload?: Record<string, unknown> | null): QueueProgressLogEntry[] => {
  const rawLogs = toQueuePayloadObject(payload).__logs;
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

const buildQueueLogEntry = (
  stage: QueueProcessingStage,
  message: string,
  level: QueueProgressLogEntry['level'] = 'info',
): QueueProgressLogEntry => ({
  at: new Date().toISOString(),
  stage,
  level,
  message,
});

const withQueueLog = (
  payload: Record<string, unknown> | null | undefined,
  stage: QueueProcessingStage,
  message: string,
  level: QueueProgressLogEntry['level'] = 'info',
) => {
  const nextLogs = [...getQueueLogs(payload), buildQueueLogEntry(stage, message, level)].slice(-MAX_QUEUE_LOG_ENTRIES);
  return {
    ...toQueuePayloadObject(payload),
    __stage: stage,
    __logs: nextLogs,
  };
};

const withQueueMeta = (
  providerPayload: Record<string, unknown>,
  previousPayload?: Record<string, unknown> | null,
  stage?: QueueProcessingStage,
) => {
  const nextPayload = {
    ...stripInternalQueueMeta(providerPayload),
  } as Record<string, unknown>;

  const previousLogs = getQueueLogs(previousPayload);
  if (previousLogs.length > 0) {
    nextPayload.__logs = previousLogs;
  }

  const previousNotifyInputMedia = buildNotificationMediaEntries(previousPayload);
  if (previousNotifyInputMedia.length > 0) {
    nextPayload.__notifyInputMedia = previousNotifyInputMedia;
  }

  if (stage) {
    nextPayload.__stage = stage;
  } else {
    const previousStage = toQueuePayloadObject(previousPayload).__stage;
    if (typeof previousStage === 'string' && previousStage) {
      nextPayload.__stage = previousStage;
    }
  }

  return nextPayload;
};

const persistQueueLog = async (
  jobId: string,
  payload: Record<string, unknown> | null | undefined,
  stage: QueueProcessingStage,
  message: string,
  level: QueueProgressLogEntry['level'] = 'info',
) => {
  const nextPayload = withQueueLog(payload, stage, message, level);
  await updateGeneratedImageRecord(jobId, {
    queue_payload: nextPayload,
    updated_at: new Date().toISOString(),
  });

  return nextPayload;
};

const extractJobId = (data: any): string | null => {
  const value = data?.job_id || data?.jobId || data?.id || data?.data?.job_id || data?.data?.jobId || data?.data?.id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const extractResultUrl = (data: any): string | null => {
  if (typeof data?.result === 'string' && data.result.trim()) return data.result.trim();
  if (Array.isArray(data?.result) && typeof data.result[0] === 'string' && data.result[0].trim()) return data.result[0].trim();
  if (typeof data?.output === 'string' && data.output.trim()) return data.output.trim();
  if (typeof data?.data?.result === 'string' && data.data.result.trim()) return data.data.result.trim();
  return null;
};

const getRetryDelaySeconds = (attemptCount: number) => {
  if (attemptCount <= 0) return POLL_INTERVAL_SECONDS;
  return Math.min(300, 15 * 2 ** Math.min(attemptCount - 1, 4));
};

const isGenericProviderFailure = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('job failed, change prompt or input and try again') ||
    normalized.includes('change prompt or input and try again')
  );
};

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const hasWorkerTickBudgetRemaining = (startedAt: number) => Date.now() - startedAt < WORKER_TICK_BUDGET_MS;

const updateGeneratedImageRecord = async (jobId: string, updates: Record<string, unknown>) => {
  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('generated_images')
    .update(updates)
    .eq('id', jobId);

  if (error) {
    throw error;
  }
};

const extendJobLease = async (jobId: string, leaseSeconds = DISPATCH_LEASE_SECONDS) => {
  await updateGeneratedImageRecord(jobId, {
    lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
};

const withLeaseHeartbeat = async <T>(
  jobId: string,
  task: Promise<T>,
  leaseSeconds = DISPATCH_LEASE_SECONDS,
  intervalMs = LEASE_HEARTBEAT_INTERVAL_MS,
) => {
  await extendJobLease(jobId, leaseSeconds);

  const heartbeat = setInterval(() => {
    void extendJobLease(jobId, leaseSeconds).catch((error) => {
      console.warn('[queue-worker] Failed to extend lease:', jobId, error);
    });
  }, intervalMs);

  try {
    return await task;
  } finally {
    clearInterval(heartbeat);
  }
};

const getQueueStage = (payload?: Record<string, unknown> | null): QueueProcessingStage | null => {
  const rawStage = toQueuePayloadObject(payload).__stage;
  if (typeof rawStage !== 'string' || !rawStage.trim()) {
    return null;
  }

  return rawStage as QueueProcessingStage;
};

const humanizeQueueStage = (stage: QueueProcessingStage | null) => {
  switch (stage) {
    case 'uploading_refs':
      return 'tải ảnh tham chiếu';
    case 'synthesizing_prompt':
      return 'tổng hợp prompt';
    case 'building_payload':
      return 'dựng payload';
    case 'dispatching':
      return 'gửi provider';
    case 'polling':
      return 'chờ provider xử lý';
    default:
      return 'chuẩn bị dữ liệu';
  }
};

const resolveImageGenerateStage = (
  recipePayload: ImageGenerateRecipePayload,
  renderSources: string[],
): 'uploading_refs' | 'synthesizing_prompt' | 'building_payload' => {
  const rawStage = getQueueStage(recipePayload);
  if (
    rawStage === 'uploading_refs' ||
    rawStage === 'synthesizing_prompt' ||
    rawStage === 'building_payload'
  ) {
    return rawStage;
  }

  const uploadedUrls = (recipePayload.__uploadedUrls || []).filter((value): value is string => Boolean(value));
  if (typeof recipePayload.__synthesizedPrompt === 'string' && recipePayload.__synthesizedPrompt.trim()) {
    return 'building_payload';
  }

  if (renderSources.length > 0 && uploadedUrls.length >= renderSources.length) {
    return 'synthesizing_prompt';
  }

  return 'uploading_refs';
};

const getCharacterCountFromToolId = (toolId?: string | null) => {
  const normalizedToolId = String(toolId || '').trim().toLowerCase();

  if (normalizedToolId.includes('group_4')) return 4;
  if (normalizedToolId.includes('group_3')) return 3;
  if (normalizedToolId.includes('couple')) return 2;
  if (normalizedToolId.includes('single')) return 1;

  return null;
};

const getImageRecipeCharacterCount = (
  job: Pick<QueueJobRow, 'tool_id'>,
  payload?: Pick<ImageGenerateRecipePayload, 'characterCount'> | null,
) => {
  const payloadCharacterCount = Number(payload?.characterCount);
  if (Number.isFinite(payloadCharacterCount) && payloadCharacterCount > 0) {
    return Math.floor(payloadCharacterCount);
  }

  return getCharacterCountFromToolId(job.tool_id);
};

const getPreparationTimeoutMs = (job: Pick<QueueJobRow, 'tool_id'>, payload?: QueueJobRow['queue_payload']) => {
  if (isQueueRecipePayload(payload) && payload.recipeType === 'image_generate_recipe_v1') {
    const characterCount = getImageRecipeCharacterCount(job, payload);
    if (characterCount && characterCount >= 4) {
      return GROUP_OF_FOUR_PREPARE_TIMEOUT_MS;
    }
    if (characterCount === 3) {
      return GROUP_OF_THREE_PREPARE_TIMEOUT_MS;
    }
  }

  return SINGLE_AND_COUPLE_PREPARE_TIMEOUT_MS;
};

const getPreparationLeaseSeconds = (job: Pick<QueueJobRow, 'tool_id' | 'queue_kind'>, payload?: QueueJobRow['queue_payload']) => {
  if (job.queue_kind === 'motion_generate' || job.queue_kind === 'video_generate') {
    return 300;
  }

  if (isQueueRecipePayload(payload) && payload.recipeType === 'image_generate_recipe_v1') {
    const characterCount = getImageRecipeCharacterCount(job, payload);
    if (characterCount && characterCount >= 4) {
      return 480;
    }
    if (characterCount === 3) {
      return 360;
    }
  }

  return DISPATCH_LEASE_SECONDS;
};

const getPreparationTimeoutUserMessage = (job: Pick<QueueJobRow, 'tool_id'>, payload?: QueueJobRow['queue_payload']) => {
  const timeoutMinutes = Math.ceil(getPreparationTimeoutMs(job, payload) / 60000);
  return `Quá thời gian chuẩn bị trong ${timeoutMinutes} phút. Vui lòng tạo lại.`;
};

const getJobRuntimeState = async (jobId: string) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('generated_images')
    .select('id, status, attempt_count, processing_started_at, created_at, job_id')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const getGenerateEndpoint = (queueKind: string) => {
  switch (queueKind) {
    case 'image_generate':
      return `${TST_API_BASE}/image/generate`;
    case 'video_generate':
      return `${TST_API_BASE}/video/generate`;
    case 'motion_generate':
      return `${TST_API_BASE}/motion/generate`;
    default:
      throw new Error(`Unsupported queue kind: ${queueKind}`);
  }
};

const submitProviderJob = async (queueKind: string, providerPayload: Record<string, unknown>) => {
  if (!TST_API_KEY) {
    throw new Error('Missing TST_API_KEY environment variable');
  }
  if (!providerPayload || typeof providerPayload !== 'object') {
    throw new Error('Queue payload is missing');
  }

  const outboundPayload = normalizeTstOutboundPayload(stripInternalQueueMeta(providerPayload));

  const response = await fetch(getGenerateEndpoint(queueKind), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(outboundPayload),
    signal: AbortSignal.timeout(295000),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  const providerJobId = extractJobId(data);
  if (!providerJobId) {
    throw new Error(`Provider did not return job_id: ${JSON.stringify(data)}`);
  }

  return providerJobId;
};

const applyLivePricingConfigToPayload = (
  queueKind: string,
  providerPayload: Record<string, unknown>,
  validationResult?: { pricingMatch?: { config_key?: string } | null } | null,
) => {
  const configKey = String(validationResult?.pricingMatch?.config_key || '').trim();
  if (!configKey) {
    return providerPayload;
  }

  if (String(providerPayload.config_key || '').trim() === configKey) {
    return providerPayload;
  }

  return {
    ...providerPayload,
    config_key: configKey,
  };
};

const pollProviderJob = async (providerJobId: string) => {
  if (!TST_API_KEY) {
    throw new Error('Missing TST_API_KEY environment variable');
  }

  const response = await fetch(`${TST_API_BASE}/jobs/${encodeURIComponent(providerJobId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TST_API_KEY}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.json();
};

const releaseLease = async (jobId: string) => {
  await updateGeneratedImageRecord(jobId, {
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });
};

const markFailedAndRefund = async (job: QueueJobRow, errorMessage: string) => {
  const admin = getServiceRoleClient();
  const nextPayload = withQueueLog(job.queue_payload, 'failed', errorMessage, 'error');
  const finishedAt = new Date().toISOString();
  await updateGeneratedImageRecord(job.id, {
    status: 'failed',
    error_message: errorMessage,
    queue_payload: nextPayload,
    progress: 0,
    finished_at: finishedAt,
    lease_token: null,
    lease_expires_at: null,
    next_poll_at: null,
    last_error_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await admin.rpc('refund_generated_job', {
    p_generated_image_id: job.id,
    p_reason: `Refund: ${job.tool_name || job.queue_kind} failed`,
  });

  fireTelegramJobNotification('failed', {
    id: job.id,
    userId: job.user_id,
    prompt: job.prompt,
    assetType: job.asset_type,
    toolId: job.tool_id,
    toolName: job.tool_name,
    engine: job.model_used,
    queueKind: job.queue_kind,
    costVcoin: job.cost_vcoin,
    errorMessage,
    finishedAt,
    queuePayload: nextPayload,
  });
};

const requeueJob = async (job: QueueJobRow, errorMessage: string) => {
  const admin = getServiceRoleClient();
  const state = await getJobRuntimeState(job.id);
  const nextAttemptCount = Number(state?.attempt_count || 0) + 1;

  if (nextAttemptCount >= MAX_DISPATCH_RETRIES) {
    await markFailedAndRefund(job, errorMessage);
    return 'failed';
  }

  const nextPollAt = new Date(Date.now() + getRetryDelaySeconds(nextAttemptCount) * 1000).toISOString();

  await updateGeneratedImageRecord(job.id, {
    status: 'queued',
    job_id: null,
    processing_started_at: null,
    error_message: errorMessage,
    queue_payload: withQueueLog(job.queue_payload, 'queued', `Tạm hoãn và xếp lại hàng đợi: ${errorMessage}`, 'warning'),
    lease_token: null,
    lease_expires_at: null,
    next_poll_at: nextPollAt,
    attempt_count: nextAttemptCount,
    last_error_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return 'requeued';
};

const updatePreProviderStage = async (jobId: string, progress: number) => {
  await updateGeneratedImageRecord(jobId, {
    status: 'processing',
    progress,
    error_message: null,
    next_poll_at: null,
    updated_at: new Date().toISOString(),
  });
};

const markPreparing = async (job: QueueJobRow) => {
  const previousStage = getQueueStage(job.queue_payload);
  const resumeStage =
    isQueueRecipePayload(job.queue_payload) && previousStage && previousStage !== 'queued'
      ? previousStage
      : 'preparing';
  const nextPayload = withQueueLog(
    job.queue_payload,
    resumeStage,
    resumeStage === 'preparing'
      ? 'Worker đã nhận job. Bắt đầu chuẩn bị.'
      : `Worker đã nhận job. Tiếp tục ở bước ${humanizeQueueStage(resumeStage)}.`,
  );
  await updateGeneratedImageRecord(job.id, {
    status: 'processing',
    progress: 5,
    error_message: null,
    queue_payload: nextPayload,
    processing_started_at: new Date().toISOString(),
    next_poll_at: null,
    updated_at: new Date().toISOString(),
  });

  return nextPayload;
};

const markPreparedForDispatch = async (jobId: string) => {
  return markQueuedStage(jobId, 55);
};

const markQueuedStage = async (jobId: string, progress: number) => {
  await updateGeneratedImageRecord(jobId, {
    status: 'queued',
    progress,
    error_message: null,
    next_poll_at: new Date().toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });
};

const markSubmittingPreparedPayload = async (jobId: string, payload?: Record<string, unknown> | null) => {
  const nextPayload = withQueueLog(payload, 'dispatching', 'Đang gửi yêu cầu tới provider TST.');
  await updateGeneratedImageRecord(jobId, {
    status: 'processing',
    progress: 50,
    error_message: null,
    queue_payload: nextPayload,
    next_poll_at: null,
    updated_at: new Date().toISOString(),
  });

  return nextPayload;
};

const shouldSkipDispatch = async (job: QueueJobRow) => {
  const state = await getJobRuntimeState(job.id);
  if (!state) {
    return true;
  }

  const currentStatus = String(state.status || '').toLowerCase();
  const providerJobId = typeof state.job_id === 'string' ? state.job_id.trim() : '';

  if (providerJobId) {
    return true;
  }

  if (currentStatus === 'completed' || currentStatus === 'failed') {
    return true;
  }

  return false;
};

const markSubmitted = async (job: QueueJobRow, providerJobId: string) => {
  await updateGeneratedImageRecord(job.id, {
    status: 'processing',
    job_id: providerJobId,
    queue_payload: withQueueLog(job.queue_payload, 'submitted', `Provider đã nhận job: ${providerJobId}.`, 'success'),
    progress: 60,
    error_message: null,
    processing_started_at: new Date().toISOString(),
    next_poll_at: new Date(Date.now() + POLL_INTERVAL_SECONDS * 1000).toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });
};

const persistPreparedPayload = async (
  jobId: string,
  providerPayload: Record<string, unknown>,
  previousPayload?: Record<string, unknown> | null,
) => {
  const storedPayload = withQueueMeta(providerPayload, previousPayload, 'dispatching');
  await updateGeneratedImageRecord(jobId, {
    queue_payload: storedPayload,
    updated_at: new Date().toISOString(),
  });

  return storedPayload;
};

const persistRecipePayload = async (jobId: string, recipePayload: ImageGenerateRecipePayload) => {
  await updateGeneratedImageRecord(jobId, {
    queue_payload: recipePayload,
    updated_at: new Date().toISOString(),
  });

  return recipePayload;
};

const queueRecipeStageTransition = async (
  jobId: string,
  recipePayload: ImageGenerateRecipePayload,
  stage: 'uploading_refs' | 'synthesizing_prompt' | 'building_payload',
  message: string,
  progress: number,
  level: QueueProgressLogEntry['level'] = 'info',
) => {
  const nextPayload = withQueueLog(recipePayload, stage, message, level) as ImageGenerateRecipePayload;
  await updateGeneratedImageRecord(jobId, {
    status: 'queued',
    progress,
    error_message: null,
    queue_payload: nextPayload,
    next_poll_at: new Date().toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });

  return nextPayload;
};

const markRecipePreparedForDispatch = async (
  jobId: string,
  providerPayload: Record<string, unknown>,
  previousPayload?: Record<string, unknown> | null,
) => {
  const storedPayload = withQueueLog(
    withQueueMeta(providerPayload, previousPayload, 'dispatching'),
    'dispatching',
    'Payload đã sẵn sàng. Chờ gửi provider.',
    'success',
  );

  await updateGeneratedImageRecord(jobId, {
    status: 'queued',
    progress: 55,
    error_message: null,
    queue_payload: storedPayload,
    next_poll_at: new Date().toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });

  return storedPayload;
};

const prepareImageRecipeInStages = async (job: QueueJobRow, recipePayload: ImageGenerateRecipePayload) => {
  const renderSources =
    (recipePayload.__uploadSources || []).filter((value): value is string => Boolean(value)).length > 0
      ? (recipePayload.__uploadSources || []).filter((value): value is string => Boolean(value))
      : getImageRenderReferenceSources(recipePayload);
  const directorSources =
    (recipePayload.__directorSources || []).filter((value): value is string => Boolean(value)).length > 0
      ? (recipePayload.__directorSources || []).filter((value): value is string => Boolean(value))
      : getImageDirectorSources(recipePayload);

  if (renderSources.length === 0) {
    throw new Error('CRITICAL FAILURE: No valid image references were prepared for the generation payload.');
  }

  const currentStage = resolveImageGenerateStage(recipePayload, renderSources);
  const uploadedUrls = [...(recipePayload.__uploadedUrls || [])];

  if (currentStage === 'uploading_refs') {
    const uploadCursor = Math.max(0, Number(recipePayload.__uploadCursor || uploadedUrls.length || 0));
    const chunk = renderSources.slice(uploadCursor, uploadCursor + IMAGE_REFERENCE_UPLOAD_CHUNK_SIZE);

    if (chunk.length > 0) {
      recipePayload = await persistQueueLog(
        job.id,
        recipePayload,
        'uploading_refs',
        `Đang tải ${chunk.length} ảnh tham chiếu (${uploadCursor + 1}-${uploadCursor + chunk.length}/${renderSources.length}).`,
      ) as ImageGenerateRecipePayload;
      const chunkUrls = await Promise.all(chunk.map((source) => uploadImageToTst(source)));
      uploadedUrls.push(...chunkUrls);
    }

    const nextCursor = uploadCursor + chunk.length;
    const hasMoreUploads = nextCursor < renderSources.length;
    const nextPayload: ImageGenerateRecipePayload = {
      ...recipePayload,
      __stage: hasMoreUploads ? 'uploading_refs' : 'synthesizing_prompt',
      __uploadSources: renderSources,
      __directorSources: directorSources,
      __uploadCursor: nextCursor,
      __uploadedUrls: uploadedUrls,
    };

    recipePayload = await queueRecipeStageTransition(
      job.id,
      nextPayload,
      hasMoreUploads ? 'uploading_refs' : 'synthesizing_prompt',
      hasMoreUploads
        ? `Đã tải ${nextCursor}/${renderSources.length} ảnh tham chiếu.`
        : `Đã tải xong ${uploadedUrls.length}/${renderSources.length} ảnh tham chiếu. Chuyển sang tổng hợp prompt.`,
      hasMoreUploads ? Math.min(35, 20 + Math.round((nextCursor / renderSources.length) * 15)) : 40,
      hasMoreUploads ? 'info' : 'success',
    ) as ImageGenerateRecipePayload;
    return { type: 'requeue' as const };
  }

  if (currentStage === 'synthesizing_prompt') {
    recipePayload = await persistQueueLog(
      job.id,
      recipePayload,
      'synthesizing_prompt',
      `Đang phân tích ${directorSources.length} ảnh để tổng hợp prompt.`,
    ) as ImageGenerateRecipePayload;
    const synthesizedPrompt = await synthesizeImageGeneratePrompt(recipePayload);
    const nextPayload: ImageGenerateRecipePayload = {
      ...recipePayload,
      __synthesizedPrompt: synthesizedPrompt,
      __stage: 'building_payload',
      __uploadSources: renderSources,
      __directorSources: directorSources,
      __uploadedUrls: uploadedUrls,
    };

    recipePayload = await queueRecipeStageTransition(
      job.id,
      nextPayload,
      'building_payload',
      'Đã tổng hợp prompt. Đang dựng payload.',
      45,
      'success',
    ) as ImageGenerateRecipePayload;
    return { type: 'requeue' as const };
  }

  recipePayload = await persistQueueLog(
    job.id,
    recipePayload,
    'building_payload',
    'Đang dựng và kiểm tra payload cuối.',
  ) as ImageGenerateRecipePayload;
  const synthesizedPrompt = recipePayload.__synthesizedPrompt?.trim()
    ? recipePayload.__synthesizedPrompt.trim()
    : await synthesizeImageGeneratePrompt(recipePayload);
  const providerPayload = buildImageGenerateProviderPayload(recipePayload, uploadedUrls, synthesizedPrompt);

  const validationResult = await validateQueuePayloadAgainstLiveCatalog(job.queue_kind, stripInternalQueueMeta(providerPayload));
  const validatedProviderPayload = applyLivePricingConfigToPayload(job.queue_kind, providerPayload, validationResult);
  await markRecipePreparedForDispatch(job.id, validatedProviderPayload, recipePayload);

  return { type: 'prepared' as const, providerPayload: validatedProviderPayload };
};

const markCompletedWithAssetUrl = async (job: QueueJobRow, assetUrl: string) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'completed',
      image_url: assetUrl,
      queue_payload: withQueueLog(job.queue_payload, 'completed', 'Đã hoàn thành và nhận kết quả.', 'success'),
      progress: 100,
      error_message: null,
      attempt_count: 0,
      finished_at: new Date().toISOString(),
      next_poll_at: null,
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
};

const markPolledState = async (job: QueueJobRow, providerData: any) => {
  const admin = getServiceRoleClient();
  const providerStatus = String(providerData?.status || '').toLowerCase();
  const providerProgress = typeof providerData?.progress === 'number' ? providerData.progress : 0;
  const progress = Math.max(60, providerProgress);

  if (providerStatus === 'completed') {
    const resultUrl = extractResultUrl(providerData);
    if (!resultUrl) {
      throw new Error(`Job completed but no result URL returned: ${JSON.stringify(providerData)}`);
    }

    await admin
      .from('generated_images')
      .update({
        status: 'completed',
        image_url: resultUrl,
        queue_payload: withQueueLog(job.queue_payload, 'completed', 'Provider đã hoàn tất. Đã lưu kết quả.', 'success'),
        progress: 100,
        error_message: null,
        attempt_count: 0,
        finished_at: new Date().toISOString(),
        next_poll_at: null,
        lease_token: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    fireTelegramJobNotification('completed', {
      id: job.id,
      userId: job.user_id,
      prompt: job.prompt,
      assetType: job.asset_type,
      toolId: job.tool_id,
      toolName: job.tool_name,
      engine: job.model_used,
      queueKind: job.queue_kind,
      costVcoin: job.cost_vcoin,
      resultUrl,
      finishedAt: new Date().toISOString(),
      queuePayload: job.queue_payload,
    });
    return 'completed';
  }

  if (providerStatus === 'failed' || providerStatus === 'error' || providerStatus === 'cancelled' || providerStatus === 'canceled') {
    const failureMessage = providerData?.error || providerData?.message || 'Provider job failed';
    const currentState = await getJobRuntimeState(job.id);
    const currentAttempts = Number(currentState?.attempt_count || 0);

    if (
      job.queue_kind === 'motion_generate' &&
      isGenericProviderFailure(failureMessage) &&
      currentAttempts < MAX_PROVIDER_GENERIC_RETRIES
    ) {
      await requeueJob(job, failureMessage);
      return 'requeued';
    }

    await markFailedAndRefund(job, failureMessage);
    return 'failed';
  }

  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      queue_payload: withQueueLog(
        job.queue_payload,
        'polling',
        `Provider đang xử lý${providerProgress > 0 ? ` (${providerProgress}%)` : ''}.`,
      ),
      progress,
      error_message: null,
      next_poll_at: new Date(Date.now() + POLL_INTERVAL_SECONDS * 1000).toISOString(),
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  return 'processing';
};

const handlePollFailure = async (job: QueueJobRow, errorMessage: string) => {
  const admin = getServiceRoleClient();
  const state = await getJobRuntimeState(job.id);
  const nextAttemptCount = Number(state?.attempt_count || 0) + 1;
  const startedAt = state?.processing_started_at || state?.created_at || new Date().toISOString();
  const processingAgeMs = Date.now() - new Date(startedAt).getTime();

  if (nextAttemptCount >= MAX_POLL_FAILURES || processingAgeMs >= MAX_PROCESSING_AGE_MS) {
    await markFailedAndRefund(job, errorMessage);
    return 'failed';
  }

  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      error_message: errorMessage,
      queue_payload: withQueueLog(job.queue_payload, 'polling', `Lỗi khi hỏi provider, sẽ thử lại: ${errorMessage}`, 'warning'),
      attempt_count: nextAttemptCount,
      next_poll_at: new Date(Date.now() + getRetryDelaySeconds(nextAttemptCount) * 1000).toISOString(),
      lease_token: null,
      lease_expires_at: null,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  return 'requeued';
};

const recoverStalePreparingJobs = async () => {
  const admin = getServiceRoleClient();
  const nowIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - STALE_RECOVERY_MIN_AGE_MS).toISOString();
  const { data, error } = await admin
    .from('generated_images')
    .select('id, user_id, asset_type, queue_kind, queue_payload, prompt, tool_id, tool_name, model_used, cost_vcoin, processing_started_at, created_at, updated_at, lease_expires_at, status')
    .in('status', ['processing', 'queued'])
    .is('job_id', null)
    .lt('updated_at', staleBeforeIso)
    .order('updated_at', { ascending: true })
    .limit(STALE_RECOVERY_SCAN_LIMIT);

  if (error) {
    throw error;
  }

  let recovered = 0;
  for (const job of ((data || []) as QueueJobRow[])) {
    const startedAt = (job as any).processing_started_at || (job as any).created_at || nowIso;
    const ageMs = Date.now() - new Date(startedAt).getTime();
    const leaseExpired =
      !(job as any).lease_expires_at || String((job as any).lease_expires_at) < nowIso;
    const currentStatus = String((job as any).status || '').toLowerCase();
    const payload = job.queue_payload || {};
    const recipeStage =
      payload && typeof payload === 'object' && typeof (payload as any).__stage === 'string'
        ? String((payload as any).__stage)
        : '';
    const isRecipePayload = isQueueRecipePayload(payload);
    const isStagedRecipe =
      isRecipePayload && ['uploading_refs', 'synthesizing_prompt', 'building_payload'].includes(recipeStage);
    const missingProviderJobId = !String((job as any).job_id || '').trim();
    const logCount = getQueueLogs(payload).length;
    const isOrphanedClaim =
      currentStatus === 'processing' &&
      isRecipePayload &&
      !isStagedRecipe &&
      !recipeStage.startsWith('submitted') &&
      !recipeStage.startsWith('dispatching') &&
      missingProviderJobId &&
      ageMs >= ORPHAN_CLAIM_GRACE_MS &&
      logCount <= 1;
    const isAbandonedPreDispatchStage =
      currentStatus === 'processing' &&
      isRecipePayload &&
      missingProviderJobId &&
      isStagedRecipe &&
      leaseExpired &&
      ageMs >= ORPHAN_CLAIM_GRACE_MS;

    const preparationTimeoutMs = getPreparationTimeoutMs(job, payload);

    if (ageMs >= preparationTimeoutMs) {
      await markFailedAndRefund(job, getPreparationTimeoutUserMessage(job, payload));
      continue;
    }

    if (isOrphanedClaim) {
      const resetPayload = withQueueLog(
        payload,
        'queued',
        'Phát hiện job bị claim sớm. Đưa lại vào hàng đợi.',
        'warning',
      );
      await admin
        .from('generated_images')
        .update({
          status: 'queued',
          progress: 0,
          queue_payload: resetPayload,
          processing_started_at: null,
          lease_token: null,
          lease_expires_at: null,
          next_poll_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      recovered += 1;
      continue;
    }

    if (isAbandonedPreDispatchStage) {
      const resumedStage =
        payload.recipeType === 'image_generate_recipe_v1'
          ? resolveImageGenerateStage(
              payload,
              getImageRenderReferenceSources(payload),
            )
          : (getQueueStage(payload) || 'queued');
      const resetPayload = withQueueLog(
        {
          ...payload,
          __stage: resumedStage,
        },
        resumedStage,
        `Worker mất lease ở bước ${humanizeQueueStage(resumedStage)}. Đưa job lại vào hàng đợi.`,
        'warning',
      );
      await updateGeneratedImageRecord(job.id, {
        status: 'queued',
        progress: Math.max(5, Number((job as any).progress || 0)),
        queue_payload: resetPayload,
        error_message: null,
        job_id: null,
        lease_token: null,
        lease_expires_at: null,
        next_poll_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      recovered += 1;
      continue;
    }

    if (!leaseExpired) {
      continue;
    }

    if (currentStatus === 'processing' && !isRecipePayload) {
      await markPreparedForDispatch(job.id);
      recovered += 1;
      continue;
    }

    if (currentStatus === 'processing' && isRecipePayload) {
      const result = await requeueJob(job, 'Queue preparation timed out before dispatching to provider.');
      if (result === 'requeued') recovered += 1;
      continue;
    }

    if (currentStatus === 'queued' && isStagedRecipe) {
      recovered += 1;
    }
  }

  return recovered;
};

const runQueueWorkerInternal = async (): Promise<QueueWorkerSummary> => {
  const admin = getServiceRoleClient();
  const workerStartedAt = Date.now();
  const summary: QueueWorkerSummary = {
    claimedForDispatch: 0,
    submitted: 0,
    claimedForPoll: 0,
    completed: 0,
    failed: 0,
    requeued: 0,
  };

  summary.requeued += await recoverStalePreparingJobs();

  const { data: dispatchJobs, error: dispatchError } = await admin.rpc('claim_dispatchable_generated_jobs', {
    p_limit: DISPATCH_CLAIM_LIMIT,
    p_lease_seconds: DISPATCH_LEASE_SECONDS,
  });

  if (dispatchError) {
    throw dispatchError;
  }

  const jobsToDispatch = (dispatchJobs || []) as QueueJobRow[];
  summary.claimedForDispatch = jobsToDispatch.length;

  for (const job of jobsToDispatch) {
    if (!hasWorkerTickBudgetRemaining(workerStartedAt)) {
      break;
    }

    try {
      if (await shouldSkipDispatch(job)) {
        await releaseLease(job.id);
        continue;
      }

      const currentPayload = job.queue_payload || {};
      const preparationTimeoutMs = getPreparationTimeoutMs(job, currentPayload);
      const preparationLeaseSeconds = getPreparationLeaseSeconds(job, currentPayload);
      let submitPayload: Record<string, unknown> = currentPayload;
      let submitValidationResult: { pricingMatch?: { config_key?: string } | null } | null = null;

      if (isQueueRecipePayload(currentPayload)) {
        job.queue_payload = await markPreparing(job);
      }

      if (isQueueRecipePayload(currentPayload) && currentPayload.recipeType === 'image_edit_recipe_v1') {
        const editPayload = (job.queue_payload || currentPayload) as ImageEditRecipePayload;
        await updatePreProviderStage(job.id, 20);
        job.queue_payload = await persistQueueLog(
          job.id,
          job.queue_payload || currentPayload,
          'preparing',
          'Đang gửi yêu cầu chỉnh sửa ảnh.',
        );
        const resultUrl = await withTimeout(
          withLeaseHeartbeat(
            job.id,
            runVertexImageEdit({
              sourceImage: editPayload.sourceImage,
              instruction: editPayload.prompt,
              modelId: editPayload.modelId,
              mimeType: editPayload.mimeType,
            }),
          ),
          preparationTimeoutMs,
          'Queue preparation timed out before image edit dispatch.',
        );

        await markCompletedWithAssetUrl(job, resultUrl);
        fireTelegramJobNotification('completed', {
          id: job.id,
          userId: job.user_id,
          prompt: job.prompt,
          assetType: job.asset_type,
          toolId: job.tool_id,
          toolName: job.tool_name,
          engine: job.model_used,
          queueKind: job.queue_kind,
          costVcoin: job.cost_vcoin,
          resultUrl,
          finishedAt: new Date().toISOString(),
          queuePayload: job.queue_payload,
        });
        summary.completed += 1;
        continue;
      }

      const validationPayload = isQueueRecipePayload(currentPayload)
        ? getRecipeValidationPayload(currentPayload)
        : stripInternalQueueMeta(currentPayload);
      const validationResult = await validateQueuePayloadAgainstLiveCatalog(job.queue_kind, validationPayload);
      submitValidationResult = validationResult;

      if (isQueueRecipePayload(currentPayload) && currentPayload.recipeType === 'image_generate_recipe_v1') {
        await updatePreProviderStage(job.id, 20);
        const stagedResult = await withTimeout(
          withLeaseHeartbeat(
            job.id,
            prepareImageRecipeInStages(job, (job.queue_payload || currentPayload) as ImageGenerateRecipePayload),
            preparationLeaseSeconds,
          ),
          preparationTimeoutMs,
          'Queue preparation timed out before dispatching to provider.',
        );

        if (stagedResult.type === 'requeue') {
          summary.requeued += 1;
          continue;
        }

        submitPayload = stagedResult.providerPayload;
        submitValidationResult = { pricingMatch: { config_key: String(stagedResult.providerPayload.config_key || '') || undefined } };
        job.queue_payload = withQueueMeta(
          stagedResult.providerPayload,
          job.queue_payload || currentPayload,
          'dispatching',
        );
      }

      if (isQueueRecipePayload(currentPayload) && currentPayload.recipeType !== 'image_generate_recipe_v1') {
        await updatePreProviderStage(job.id, 20);
        if (currentPayload.recipeType === 'video_generate_recipe_v1') {
          job.queue_payload = await persistQueueLog(
            job.id,
            job.queue_payload || currentPayload,
            'building_payload',
            'Đang chuẩn bị payload video.',
          );
        } else if (currentPayload.recipeType === 'motion_generate_recipe_v1') {
          job.queue_payload = await persistQueueLog(
            job.id,
            job.queue_payload || currentPayload,
            'building_payload',
            'Đang chuẩn bị payload motion.',
          );
        }
        const providerPayload = await withTimeout(
          withLeaseHeartbeat(
            job.id,
            prepareProviderPayloadFromQueueRecipe((job.queue_payload || currentPayload) as typeof currentPayload),
            preparationLeaseSeconds,
          ),
          preparationTimeoutMs,
          'Queue preparation timed out before dispatching to provider.',
        );
        const preparedValidationResult = await validateQueuePayloadAgainstLiveCatalog(job.queue_kind, providerPayload);
        const validatedProviderPayload = applyLivePricingConfigToPayload(
          job.queue_kind,
          providerPayload,
          preparedValidationResult,
        );
        job.queue_payload = await persistPreparedPayload(job.id, validatedProviderPayload, job.queue_payload || currentPayload);
        job.queue_payload = await persistQueueLog(
          job.id,
          job.queue_payload,
          'dispatching',
          'Payload đã sẵn sàng. Chờ gửi provider.',
          'success',
        );
        await markPreparedForDispatch(job.id);
        summary.requeued += 1;
        continue;
      }

      const providerPayloadForSubmit = applyLivePricingConfigToPayload(
        job.queue_kind,
        submitPayload,
        submitValidationResult,
      );
      if (providerPayloadForSubmit !== submitPayload) {
        job.queue_payload = await persistPreparedPayload(job.id, providerPayloadForSubmit, job.queue_payload || currentPayload);
      }

      job.queue_payload = await markSubmittingPreparedPayload(job.id, job.queue_payload);
      const providerJobId = await submitProviderJob(job.queue_kind, providerPayloadForSubmit);
      await markSubmitted(job, providerJobId);
      summary.submitted += 1;
    } catch (error: any) {
      const message = error?.message || 'Queue dispatch failed';
      if (message.startsWith('INVALID_TST_CONFIG:')) {
        await markFailedAndRefund(job, message.replace('INVALID_TST_CONFIG:', '').trim());
        summary.failed += 1;
      } else if (message.includes('Queue preparation timed out before')) {
        await markFailedAndRefund(job, getPreparationTimeoutUserMessage(job, job.queue_payload));
        summary.failed += 1;
        continue;
      } else if (isTransientError(message)) {
        const result = await requeueJob(job, message);
        if (result === 'failed') {
          summary.failed += 1;
        } else {
          summary.requeued += 1;
        }
      } else {
        await markFailedAndRefund(job, message);
        summary.failed += 1;
      }
    }
  }

  if (
    summary.claimedForDispatch > 0 ||
    summary.submitted > 0 ||
    summary.requeued > 0 ||
    summary.failed > 0
  ) {
    return summary;
  }

  const { data: pollJobs, error: pollError } = await admin.rpc('claim_pollable_generated_jobs', {
    p_limit: POLL_CLAIM_LIMIT,
    p_lease_seconds: 60,
  });

  if (pollError) {
    throw pollError;
  }

  const jobsToPoll = (pollJobs || []) as QueueJobRow[];
  summary.claimedForPoll = jobsToPoll.length;

  for (const job of jobsToPoll) {
    if (!hasWorkerTickBudgetRemaining(workerStartedAt)) {
      break;
    }

    try {
      const providerData = await pollProviderJob(String(job.job_id || ''));
      const state = await markPolledState(job, providerData);
      if (state === 'completed') summary.completed += 1;
      if (state === 'failed') summary.failed += 1;
    } catch (error: any) {
      const message = error?.message || 'Queue poll failed';
      console.error('[queue-worker] Poll failed:', job.id, message);
      const result = await handlePollFailure(job, message);
      if (result === 'failed') {
        summary.failed += 1;
      } else {
        summary.requeued += 1;
      }
    }
  }

  return summary;
};

export const runQueueWorker = async (): Promise<QueueWorkerSummary> => {
  if (activeWorkerRun) {
    return activeWorkerRun;
  }

  activeWorkerRun = (async () => {
    try {
      return await runQueueWorkerInternal();
    } finally {
      activeWorkerRun = null;
    }
  })();

  return activeWorkerRun;
};
