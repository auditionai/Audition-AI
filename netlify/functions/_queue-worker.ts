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
import { verifyGeneratedImageOutput } from './_vertex-image-verify';
import {
  inspectMotionVideoDurationSeconds,
  reviewMotionCharacterInput,
  reviewVideoKeyframeInput,
  type VideoInputReviewIssue,
  type VideoInputReviewResult,
} from './_vertex-video-input-review';
import {
  getImageDirectorSources,
  validateImageGenerateReferenceIntegrity,
  getImageRenderReferenceSources,
  getRecipeValidationPayload,
  isQueueRecipePayload,
  type QueueProcessingStage,
  type QueueProgressLogEntry,
  type QueueNotificationMediaEntry,
  type ImageEditRecipePayload,
  type ImageGenerateRecipePayload,
  type MotionGenerateRecipePayload,
  type VideoGenerateRecipePayload,
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
  error_message?: string | null;
  image_url?: string | null;
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
const MAX_VIDEO_PROCESSING_AGE_MS = 30 * 60 * 1000;
const MAX_SINGLE_IMAGE_PROCESSING_AGE_MS = 15 * 60 * 1000;
const MAX_COUPLE_IMAGE_PROCESSING_AGE_MS = 20 * 60 * 1000;
const MAX_GROUP3_IMAGE_PROCESSING_AGE_MS = 30 * 60 * 1000;
const MAX_GROUP4_IMAGE_PROCESSING_AGE_MS = 30 * 60 * 1000;
const MAX_PROVIDER_GENERIC_RETRIES = 2;
const MAX_OUTPUT_VERIFICATION_RETRIES = 2;
const FAILED_RESULT_RESCUE_SCAN_LIMIT = 10;
const FAILED_RESULT_RESCUE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const FAILED_RESULT_RESCUE_MAX_ATTEMPTS = 8;
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

const isAmbiguousDispatchError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('the operation was aborted due to timeout') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('network') ||
    normalized.includes('fetch failed') ||
    normalized.includes('socket hang up') ||
    normalized.includes('econnreset') ||
    normalized.includes('etimedout') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504') ||
    normalized.includes('bad gateway') ||
    normalized.includes('gateway timeout')
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

const toQueuePayloadObject = (
  payload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
): Record<string, unknown> =>
  payload && typeof payload === 'object' ? { ...payload } : {};

const stripInternalQueueMeta = (payload: Record<string, unknown> | ImageGenerateRecipePayload) =>
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
  payload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
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

const getStoredImageGenerateRecipePayload = (
  payload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
): ImageGenerateRecipePayload | null => {
  const raw = toQueuePayloadObject(payload);

  if (isQueueRecipePayload(raw) && raw.recipeType === 'image_generate_recipe_v1') {
    return raw as ImageGenerateRecipePayload;
  }

  const embeddedRecipe = raw.__recipePayload;
  if (
    embeddedRecipe &&
    typeof embeddedRecipe === 'object' &&
    isQueueRecipePayload(embeddedRecipe) &&
    embeddedRecipe.recipeType === 'image_generate_recipe_v1'
  ) {
    return embeddedRecipe as ImageGenerateRecipePayload;
  }

  return null;
};

const getOutputVerificationRetryCount = (payload?: Record<string, unknown> | ImageGenerateRecipePayload | null) => {
  const recipePayload = getStoredImageGenerateRecipePayload(payload);
  return Math.max(0, Number(recipePayload?.__outputVerificationRetryCount || 0));
};

const getFailedRescueAttemptCount = (payload?: Record<string, unknown> | ImageGenerateRecipePayload | null) =>
  Math.max(0, Number(toQueuePayloadObject(payload).__failedRescueAttemptCount || 0));

const getFailedRescueNextAt = (payload?: Record<string, unknown> | ImageGenerateRecipePayload | null) => {
  const raw = toQueuePayloadObject(payload).__nextFailedRescueAt;
  if (typeof raw !== 'string' || !raw.trim()) {
    return 0;
  }

  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getQueueLogs = (payload?: Record<string, unknown> | ImageGenerateRecipePayload | null): QueueProgressLogEntry[] => {
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
  payload: Record<string, unknown> | ImageGenerateRecipePayload | null | undefined,
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
  previousPayload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
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

  const previousTstTouched = toQueuePayloadObject(previousPayload).__tstTouched;
  if (previousTstTouched === true) {
    nextPayload.__tstTouched = true;
  }

  const previousRecipePayload = getStoredImageGenerateRecipePayload(previousPayload);
  if (previousRecipePayload) {
    nextPayload.__recipePayload = previousRecipePayload;
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

const hasTstBeenTouched = (
  payload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
) => toQueuePayloadObject(payload).__tstTouched === true;

const persistQueueLog = async (
  jobId: string,
  payload: Record<string, unknown> | ImageGenerateRecipePayload | null | undefined,
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
  if (Array.isArray(data?.output) && typeof data.output[0] === 'string' && data.output[0].trim()) return data.output[0].trim();
  if (typeof data?.data?.result === 'string' && data.data.result.trim()) return data.data.result.trim();
  if (Array.isArray(data?.data?.result) && typeof data.data.result[0] === 'string' && data.data.result[0].trim()) return data.data.result[0].trim();
  if (typeof data?.data?.output === 'string' && data.data.output.trim()) return data.data.output.trim();
  if (Array.isArray(data?.data?.output) && typeof data.data.output[0] === 'string' && data.data.output[0].trim()) return data.data.output[0].trim();
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

const getQueueStage = (payload?: Record<string, unknown> | ImageGenerateRecipePayload | null): QueueProcessingStage | null => {
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
    case 'verifying_output':
      return 'hau kiem ket qua';
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

const getMaxProcessingAgeMs = (job: Pick<QueueJobRow, 'queue_kind'>) => {
  if (job.queue_kind === 'video_generate' || job.queue_kind === 'motion_generate') {
    return MAX_VIDEO_PROCESSING_AGE_MS;
  }

  return MAX_PROCESSING_AGE_MS;
};

const getImageProcessingAgeMs = (
  job: Pick<QueueJobRow, 'tool_id'>,
  payload?: QueueJobRow['queue_payload'],
) => {
  if (isQueueRecipePayload(payload) && payload.recipeType === 'image_generate_recipe_v1') {
    const characterCount = getImageRecipeCharacterCount(job, payload);
    if (characterCount && characterCount >= 4) {
      return MAX_GROUP4_IMAGE_PROCESSING_AGE_MS;
    }
    if (characterCount === 3) {
      return MAX_GROUP3_IMAGE_PROCESSING_AGE_MS;
    }
    if (characterCount === 2) {
      return MAX_COUPLE_IMAGE_PROCESSING_AGE_MS;
    }
    if (characterCount === 1) {
      return MAX_SINGLE_IMAGE_PROCESSING_AGE_MS;
    }
  }

  const characterCount = getCharacterCountFromToolId(job.tool_id);
  if (characterCount && characterCount >= 4) {
    return MAX_GROUP4_IMAGE_PROCESSING_AGE_MS;
  }
  if (characterCount === 3) {
    return MAX_GROUP3_IMAGE_PROCESSING_AGE_MS;
  }
  if (characterCount === 2) {
    return MAX_COUPLE_IMAGE_PROCESSING_AGE_MS;
  }
  if (characterCount === 1) {
    return MAX_SINGLE_IMAGE_PROCESSING_AGE_MS;
  }

  return MAX_PROCESSING_AGE_MS;
};

const getProviderProcessingTimeoutMs = (
  job: Pick<QueueJobRow, 'queue_kind' | 'tool_id'>,
  payload?: QueueJobRow['queue_payload'],
) => {
  if (job.queue_kind === 'video_generate' || job.queue_kind === 'motion_generate') {
    return MAX_VIDEO_PROCESSING_AGE_MS;
  }

  return getImageProcessingAgeMs(job, payload);
};

const getProcessingTimeoutUserMessage = (
  job: Pick<QueueJobRow, 'queue_kind' | 'tool_id'>,
  payload?: QueueJobRow['queue_payload'],
) => {
  const timeoutMinutes = Math.ceil(getProviderProcessingTimeoutMs(job, payload) / 60000);
  if (job.queue_kind === 'video_generate' || job.queue_kind === 'motion_generate') {
    return `Video da qua thoi gian cho ${timeoutMinutes} phut. Vui long tao lai video moi.`;
  }

  return `Anh da qua thoi gian cho ${timeoutMinutes} phut tu luc gui sang he thong tao anh. Vui long thu lai.`;
};

const shouldRefundFailure = (
  job: Pick<QueueJobRow, 'queue_kind' | 'queue_payload'>,
  payloadOverride?: Record<string, unknown> | ImageGenerateRecipePayload | null,
) => {
  if (job.queue_kind !== 'video_generate' && job.queue_kind !== 'motion_generate') {
    return true;
  }

  return !hasTstBeenTouched(payloadOverride ?? job.queue_payload);
};

const buildReviewIssueMessages = (issues: VideoInputReviewIssue[]) => {
  const unique = [...new Set(issues)];
  const messages: string[] = [];

  if (unique.includes('no_character')) messages.push('khong tim thay nhan vat ro rang trong anh');
  if (unique.includes('multiple_characters')) messages.push('anh co tu 2 nhan vat tro len');
  if (unique.includes('blurry_subject')) messages.push('nhan vat bi mo, nhin khong du ro net');
  if (unique.includes('small_subject')) messages.push('nhan vat qua nho trong khung hinh');
  if (unique.includes('occluded_subject')) messages.push('nhan vat bi che khuat qua nhieu');
  if (unique.includes('missing_character_details')) messages.push('khong tach duoc chi tiet nhan vat');
  if (unique.includes('unclear_background')) messages.push('boi canh hau canh khong ro rang');
  if (unique.includes('missing_scene_details')) messages.push('khong lay duoc chi tiet boi canh');
  if (unique.includes('too_dark')) messages.push('anh qua toi');
  if (unique.includes('too_bright')) messages.push('anh qua sang hoac chay sang');
  if (unique.includes('uncertain')) messages.push('he thong khong du tu tin de phe duyet');

  return messages;
};

const summarizeInputReviewFailure = (
  prefix: string,
  review: VideoInputReviewResult,
) => {
  const issueMessages = buildReviewIssueMessages(review.issues);
  const detail = issueMessages.length > 0
    ? issueMessages.join('; ')
    : (review.summary || 'du lieu dau vao khong dat yeu cau');

  return `${prefix}: ${detail}.`;
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

const markFailed = async (
  job: QueueJobRow,
  errorMessage: string,
  options?: {
    refund?: boolean;
  },
) => {
  const admin = getServiceRoleClient();
  const shouldRefund = options?.refund !== false;
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

  if (shouldRefund) {
    await admin.rpc('refund_generated_job', {
      p_generated_image_id: job.id,
      p_reason: `Refund: ${job.tool_name || job.queue_kind} failed`,
    });
  }

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

const markFailedRespectingRefundPolicy = async (
  job: QueueJobRow,
  errorMessage: string,
  payloadOverride?: Record<string, unknown> | ImageGenerateRecipePayload | null,
) =>
  markFailed(job, errorMessage, {
    refund: shouldRefundFailure(job, payloadOverride),
  });

const markFailedAndRefund = async (job: QueueJobRow, errorMessage: string) =>
  markFailed(job, errorMessage, { refund: true });

const requeueJob = async (job: QueueJobRow, errorMessage: string) => {
  const admin = getServiceRoleClient();
  const state = await getJobRuntimeState(job.id);
  const nextAttemptCount = Number(state?.attempt_count || 0) + 1;

  if (nextAttemptCount >= MAX_DISPATCH_RETRIES) {
    await markFailedRespectingRefundPolicy(job, errorMessage);
    return 'failed';
  }

  const nextPollAt = new Date(Date.now() + getRetryDelaySeconds(nextAttemptCount) * 1000).toISOString();
  const restoredRecipePayload = getStoredImageGenerateRecipePayload(job.queue_payload);
  const requeuePayload =
    job.queue_kind === 'image_generate' && restoredRecipePayload
      ? restoredRecipePayload
      : toQueuePayloadObject(job.queue_payload);

  await updateGeneratedImageRecord(job.id, {
    status: 'queued',
    job_id: null,
    processing_started_at: null,
    error_message: errorMessage,
    queue_payload: withQueueLog(requeuePayload, 'queued', `Tam hoan va xep lai hang doi: ${errorMessage}`, 'warning'),
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

const markTstTouched = async (
  jobId: string,
  payload: Record<string, unknown> | ImageGenerateRecipePayload | null | undefined,
  message: string,
) => {
  const nextPayload = withQueueLog(
    {
      ...toQueuePayloadObject(payload),
      __tstTouched: true,
    },
    'building_payload',
    message,
  );

  await updateGeneratedImageRecord(jobId, {
    queue_payload: nextPayload,
    updated_at: new Date().toISOString(),
  });

  return nextPayload;
};

const reviewVideoInputsBeforeTst = async (
  job: QueueJobRow,
  payload: VideoGenerateRecipePayload | MotionGenerateRecipePayload,
) => {
  if (payload.recipeType === 'video_generate_recipe_v1') {
    if (!payload.keyframeImage) {
      throw new Error(
        'Khong duyet video: vui long tai len anh keyframe ro net co nhan vat va boi canh ro rang.',
      );
    }

    const review = await reviewVideoKeyframeInput(payload.keyframeImage);
    if (!review.approved) {
      throw new Error(summarizeInputReviewFailure('Khong duyet video', review));
    }

    return {
      successMessage:
        review.detectedPersonCount && review.detectedPersonCount > 1
          ? `Anh keyframe dat duyet. He thong nhan dien ${review.detectedPersonCount} nhan vat ro rang va tiep tuc tao payload video.`
          : 'Anh keyframe dat duyet. Tiep tuc tao payload video.',
    };
  }

  const durationSeconds = await inspectMotionVideoDurationSeconds(
    payload.motionVideoDataUrl,
    payload.motionVideoDurationSeconds,
  );

  if (!durationSeconds || durationSeconds < 3 || durationSeconds > 30) {
    throw new Error(
      'Khong duyet motion control: video chuyen dong phai dai tu 3 giay den 30 giay.',
    );
  }

  const review = await reviewMotionCharacterInput(payload.characterImage);
  if (!review.approved) {
    throw new Error(summarizeInputReviewFailure('Khong duyet motion control', review));
  }

  if (review.detectedPersonCount !== null && review.detectedPersonCount !== 1) {
    throw new Error('Khong duyet motion control: anh nhan vat phai chi co dung 1 nhan vat ro rang.');
  }

  return {
    successMessage: `Anh motion control dat duyet va video tham chieu ${durationSeconds.toFixed(1)}s hop le. Tiep tuc tao payload motion.`,
  };
};

const markPreparedForDispatch = async (jobId: string) => {
  return markQueuedStage(jobId, 55);
};

const markQueuedStage = async (jobId: string, progress: number) => {
  await updateGeneratedImageRecord(jobId, {
    status: 'queued',
    progress,
    error_message: null,
    processing_started_at: null,
    next_poll_at: new Date().toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });
};

const markSubmittingPreparedPayload = async (jobId: string, payload?: Record<string, unknown> | null) => {
  const nextPayload = withQueueLog(
    {
      ...toQueuePayloadObject(payload),
      __tstTouched: true,
      __dispatchConfirmationPending: true,
    },
    'dispatching',
    'Đang gửi yêu cầu tới provider TST.',
  );
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

const markDispatchAwaitingProviderConfirmation = async (
  job: QueueJobRow,
  errorMessage: string,
  payload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
) => {
  const nextPayload = withQueueLog(
    {
      ...toQueuePayloadObject(payload ?? job.queue_payload),
      __tstTouched: true,
      __dispatchConfirmationPending: true,
      __lastDispatchError: errorMessage,
    },
    'dispatching',
    `Khong tu dong gui lai lenh de tranh trung job. Dang cho xac nhan provider sau loi mang/timeout: ${errorMessage}`,
    'warning',
  );

  await updateGeneratedImageRecord(job.id, {
    status: 'processing',
    progress: 55,
    error_message: null,
    queue_payload: nextPayload,
    job_id: null,
    next_poll_at: null,
    lease_token: null,
    lease_expires_at: null,
    last_error_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
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
  previousPayload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
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
    processing_started_at: null,
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
  previousPayload?: Record<string, unknown> | ImageGenerateRecipePayload | null,
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
    processing_started_at: null,
    next_poll_at: new Date().toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });

  return storedPayload;
};

const prepareImageRecipeInStages = async (job: QueueJobRow, recipePayload: ImageGenerateRecipePayload) => {
  validateImageGenerateReferenceIntegrity(recipePayload);
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
    return prepareImageRecipeInStages(job, recipePayload);
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
    return prepareImageRecipeInStages(job, recipePayload);
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

const completePolledJobWithResultUrl = async (
  job: QueueJobRow,
  resultUrl: string,
  options?: {
    completionMessage?: string;
    completionLevel?: QueueProgressLogEntry['level'];
  },
) => {
  const admin = getServiceRoleClient();
  let completionPayload = job.queue_payload;
  const storedImageRecipe =
    job.queue_kind === 'image_generate'
      ? getStoredImageGenerateRecipePayload(job.queue_payload)
      : null;

  if (storedImageRecipe) {
    const verifyingPayload = await persistQueueLog(
      job.id,
      completionPayload,
      'verifying_output',
      'Dang hau kiem ket qua AI de bao toan identity.',
    );

    try {
      const verificationResult = await verifyGeneratedImageOutput(storedImageRecipe, resultUrl);
      const verificationSummary =
        verificationResult.summary ||
        verificationResult.issues.join('; ') ||
        'Identity guard completed.';

      if (!verificationResult.pass) {
        const nextVerifyRetryCount = getOutputVerificationRetryCount(storedImageRecipe) + 1;
        const retryPayload = {
          ...storedImageRecipe,
          __stage: 'verifying_output',
          __logs: getQueueLogs(verifyingPayload),
          __notifyInputMedia: buildNotificationMediaEntries(verifyingPayload),
          __outputVerificationRetryCount: nextVerifyRetryCount,
          __lastOutputVerificationSummary: verificationSummary,
        } as ImageGenerateRecipePayload & Record<string, unknown>;
        const retryMessage = `Identity guard failed: ${verificationSummary}`;

        if (nextVerifyRetryCount >= MAX_OUTPUT_VERIFICATION_RETRIES) {
          await markFailedAndRefund(
            {
              ...job,
              queue_payload: retryPayload,
            },
            `${retryMessage}. Retry limit reached.`,
          );
          return 'failed' as const;
        }

        return requeueJob(
          {
            ...job,
            queue_payload: retryPayload,
          },
          retryMessage,
        );
      }

      completionPayload = withQueueLog(
        verifyingPayload,
        'verifying_output',
        `Identity guard passed: ${verificationSummary}`,
        'success',
      );
    } catch (verificationError) {
      const verificationMessage =
        verificationError instanceof Error ? verificationError.message : String(verificationError || 'Unknown verification error');
      completionPayload = withQueueLog(
        verifyingPayload,
        'verifying_output',
        `Identity guard unavailable, completing without auto-retry: ${verificationMessage}`,
        'warning',
      );
    }
  }

  await admin
    .from('generated_images')
    .update({
      status: 'completed',
      image_url: resultUrl,
      queue_payload: withQueueLog(
        completionPayload,
        'completed',
        options?.completionMessage || 'Provider da hoan tat. Da luu ket qua.',
        options?.completionLevel || 'success',
      ),
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
    queuePayload: completionPayload,
  });
  return 'completed' as const;
};

const getFailedRescueDelaySeconds = (attemptCount: number) => {
  if (attemptCount <= 0) return 30;
  return Math.min(60 * 60, 60 * 2 ** Math.min(attemptCount - 1, 5));
};

const scheduleFailedJobRescueRetry = async (
  job: QueueJobRow,
  message: string,
  attemptCount: number,
) => {
  const nextAttempt = attemptCount + 1;
  const nextRetryAt = new Date(Date.now() + getFailedRescueDelaySeconds(nextAttempt) * 1000).toISOString();
  const nextPayload = withQueueLog(
    {
      ...toQueuePayloadObject(job.queue_payload),
      __failedRescueAttemptCount: nextAttempt,
      __nextFailedRescueAt: nextRetryAt,
    },
    'failed',
    `Rescue TST chua tim thay ket qua hop le. Se thu lai sau: ${message}`,
    'warning',
  );

  await updateGeneratedImageRecord(job.id, {
    status: 'failed',
    error_message: job.error_message || message,
    queue_payload: nextPayload,
    updated_at: new Date().toISOString(),
  });
};

const reviveFailedJobToProcessing = async (
  job: QueueJobRow,
  providerData: any,
) => {
  const providerProgress = typeof providerData?.progress === 'number' ? providerData.progress : 0;
  const progress = Math.max(60, providerProgress);
  const nextPayload = withQueueLog(
    {
      ...toQueuePayloadObject(job.queue_payload),
      __failedRescueAttemptCount: 0,
      __nextFailedRescueAt: null,
    },
    'polling',
    'Rescue TST: provider van dang xu ly. Chuyen job tro lai trang thai processing.',
    'warning',
  );

  await updateGeneratedImageRecord(job.id, {
    status: 'processing',
    progress,
    error_message: null,
    queue_payload: nextPayload,
    finished_at: null,
    next_poll_at: new Date(Date.now() + POLL_INTERVAL_SECONDS * 1000).toISOString(),
    lease_token: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  });
};

const rescueFailedJobsWithProviderResults = async () => {
  const admin = getServiceRoleClient();
  const lookbackIso = new Date(Date.now() - FAILED_RESULT_RESCUE_LOOKBACK_MS).toISOString();
  const now = Date.now();
  const { data, error } = await admin
    .from('generated_images')
    .select('id, user_id, asset_type, queue_kind, queue_payload, prompt, tool_id, tool_name, model_used, cost_vcoin, job_id, status, error_message, created_at, updated_at, finished_at, processing_started_at, next_poll_at, attempt_count, image_url')
    .eq('status', 'failed')
    .not('job_id', 'is', null)
    .gte('created_at', lookbackIso)
    .order('updated_at', { ascending: true })
    .limit(FAILED_RESULT_RESCUE_SCAN_LIMIT * 4);

  if (error) {
    throw error;
  }

  let rescued = 0;
  const candidates = ((data || []) as any[])
    .filter((job) => !String(job?.image_url || '').trim())
    .filter((job) => getFailedRescueAttemptCount(job?.queue_payload) < FAILED_RESULT_RESCUE_MAX_ATTEMPTS)
    .filter((job) => {
      const nextAt = getFailedRescueNextAt(job?.queue_payload);
      return !nextAt || nextAt <= now;
    })
    .slice(0, FAILED_RESULT_RESCUE_SCAN_LIMIT);

  for (const job of candidates as QueueJobRow[]) {
    try {
      const providerData = await pollProviderJob(String(job.job_id || ''));
      const providerStatus = String(providerData?.status || '').toLowerCase();
      const resultUrl = extractResultUrl(providerData);

      if (resultUrl) {
        const state = await completePolledJobWithResultUrl(job, resultUrl, {
          completionMessage:
            providerStatus === 'failed' || providerStatus === 'error' || providerStatus === 'cancelled' || providerStatus === 'canceled'
              ? `Rescue TST: provider tung bao loi nhung van tra ve ket qua hop le. Da tu dong luu ket qua.`
              : 'Rescue TST: da tim lai ket qua hop le va dong bo thanh cong.',
          completionLevel: 'warning',
        });
        if (state === 'completed') {
          rescued += 1;
        }
        continue;
      }

      if (providerStatus === 'processing' || providerStatus === 'queued' || providerStatus === 'pending' || providerStatus === 'submitted') {
        await reviveFailedJobToProcessing(job, providerData);
        rescued += 1;
        continue;
      }

      await scheduleFailedJobRescueRetry(
        job,
        String(providerData?.error || providerData?.message || providerStatus || 'Khong co ket qua tu provider'),
        getFailedRescueAttemptCount(job.queue_payload),
      );
    } catch (error: any) {
      await scheduleFailedJobRescueRetry(
        job,
        String(error?.message || 'Queue rescue poll failed'),
        getFailedRescueAttemptCount(job.queue_payload),
      );
    }
  }

  return rescued;
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
    return completePolledJobWithResultUrl(job, resultUrl);
  }

  if (providerStatus === 'failed' || providerStatus === 'error' || providerStatus === 'cancelled' || providerStatus === 'canceled') {
    const failureMessage = providerData?.error || providerData?.message || 'Provider job failed';
    const resultUrl = extractResultUrl(providerData);
    if (resultUrl) {
      return completePolledJobWithResultUrl(job, resultUrl, {
        completionMessage: `Provider bao "${failureMessage}" nhung van tra ve ket qua hop le. Da luu ket qua thay vi danh that bai.`,
        completionLevel: 'warning',
      });
    }
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

    await markFailedRespectingRefundPolicy(job, failureMessage);
    return 'failed';
  }

  const currentState = await getJobRuntimeState(job.id);
  const startedAt = currentState?.processing_started_at || currentState?.created_at || new Date().toISOString();
  const processingAgeMs = Date.now() - new Date(startedAt).getTime();
  if (processingAgeMs >= getProviderProcessingTimeoutMs(job, job.queue_payload)) {
    await markFailedRespectingRefundPolicy(job, getProcessingTimeoutUserMessage(job, job.queue_payload));
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

  if (nextAttemptCount >= MAX_POLL_FAILURES || processingAgeMs >= getProviderProcessingTimeoutMs(job, job.queue_payload)) {
    const finalMessage =
      processingAgeMs >= getProviderProcessingTimeoutMs(job, job.queue_payload)
        ? getProcessingTimeoutUserMessage(job, job.queue_payload)
        : errorMessage;
    await markFailedRespectingRefundPolicy(job, finalMessage);
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
      const result = await requeueJob(job, 'Worker preparation lease expired before dispatching to provider.');
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

    let providerPayloadForSubmit: Record<string, unknown> | null = null;
    let providerDispatchStarted = false;

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
        const editPayload = (job.queue_payload || currentPayload) as unknown as ImageEditRecipePayload;
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
            prepareImageRecipeInStages(job, (job.queue_payload || currentPayload) as unknown as ImageGenerateRecipePayload),
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
        const reviewStartMessage =
          currentPayload.recipeType === 'video_generate_recipe_v1'
            ? 'Dang kiem duyet anh keyframe truoc khi gui du lieu len TST.'
            : 'Dang kiem duyet anh nhan vat va video motion truoc khi gui du lieu len TST.';
        job.queue_payload = await persistQueueLog(
          job.id,
          job.queue_payload || currentPayload,
          'preparing',
          reviewStartMessage,
        );
        const reviewResult = await withTimeout(
          withLeaseHeartbeat(
            job.id,
            reviewVideoInputsBeforeTst(
              job,
              currentPayload as VideoGenerateRecipePayload | MotionGenerateRecipePayload,
            ),
            preparationLeaseSeconds,
          ),
          preparationTimeoutMs,
          'Queue preparation timed out before dispatching to provider.',
        );
        job.queue_payload = await persistQueueLog(
          job.id,
          job.queue_payload,
          'preparing',
          reviewResult.successMessage,
          'success',
        );
        job.queue_payload = await markTstTouched(
          job.id,
          job.queue_payload,
          'Da bat dau chuan bi payload va gui du lieu len he thong TST.',
        );
        if (currentPayload.recipeType === 'video_generate_recipe_v1') {
          job.queue_payload = await persistQueueLog(
            job.id,
            job.queue_payload,
            'building_payload',
            'Đang chuẩn bị payload video.',
          );
        } else if (currentPayload.recipeType === 'motion_generate_recipe_v1') {
          job.queue_payload = await persistQueueLog(
            job.id,
            job.queue_payload,
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

      providerPayloadForSubmit = applyLivePricingConfigToPayload(
        job.queue_kind,
        submitPayload,
        submitValidationResult,
      );
      if (providerPayloadForSubmit !== submitPayload) {
        job.queue_payload = await persistPreparedPayload(job.id, providerPayloadForSubmit, job.queue_payload || currentPayload);
      }

      job.queue_payload = await markSubmittingPreparedPayload(job.id, job.queue_payload);
      providerDispatchStarted = true;
      const providerJobId = await submitProviderJob(job.queue_kind, providerPayloadForSubmit);
      await markSubmitted(job, providerJobId);
      summary.submitted += 1;
    } catch (error: any) {
      const message = error?.message || 'Queue dispatch failed';
      if (providerDispatchStarted && isAmbiguousDispatchError(message)) {
        await markDispatchAwaitingProviderConfirmation(job, message, providerPayloadForSubmit || job.queue_payload);
        continue;
      }
      if (message.startsWith('INVALID_TST_CONFIG:')) {
        await markFailedRespectingRefundPolicy(job, message.replace('INVALID_TST_CONFIG:', '').trim());
        summary.failed += 1;
      } else if (message.includes('Queue preparation timed out before')) {
        const result = await requeueJob(job, message);
        if (result === 'failed') {
          summary.failed += 1;
        } else {
          summary.requeued += 1;
        }
        continue;
      } else if (isTransientError(message)) {
        const result = await requeueJob(job, message);
        if (result === 'failed') {
          summary.failed += 1;
        } else {
          summary.requeued += 1;
        }
      } else {
        await markFailedRespectingRefundPolicy(job, message);
        summary.failed += 1;
      }
    }
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

  if (hasWorkerTickBudgetRemaining(workerStartedAt)) {
    summary.completed += await rescueFailedJobsWithProviderResults();
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
