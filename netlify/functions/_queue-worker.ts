import { getServiceRoleClient } from './_supabase';
import { validateQueuePayloadAgainstLiveCatalog } from './_tst-live-catalog';
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
const POLL_CLAIM_LIMIT = 2;
const WORKER_TICK_BUDGET_MS = 22_000;

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

const getPreparationTimeoutUserMessage = (job: Pick<QueueJobRow, 'tool_id'>, payload?: QueueJobRow['queue_payload']) => {
  const timeoutMinutes = Math.ceil(getPreparationTimeoutMs(job, payload) / 60000);
  return `Tien trinh chuan bi/tong hop da vuot qua ${timeoutMinutes} phut. Vui long tao lai.`;
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

  const response = await fetch(getGenerateEndpoint(queueKind), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(providerPayload),
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
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
};

const markFailedAndRefund = async (job: QueueJobRow, errorMessage: string) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'failed',
      error_message: errorMessage,
      progress: 0,
      finished_at: new Date().toISOString(),
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: null,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  await admin.rpc('refund_generated_job', {
    p_generated_image_id: job.id,
    p_reason: `Refund: ${job.tool_name || job.queue_kind} failed`,
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

  await admin
    .from('generated_images')
    .update({
      status: 'queued',
      job_id: null,
      processing_started_at: null,
      error_message: errorMessage,
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: nextPollAt,
      attempt_count: nextAttemptCount,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  return 'requeued';
};

const updatePreProviderStage = async (jobId: string, progress: number) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      progress,
      error_message: null,
      next_poll_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
};

const markPreparing = async (job: QueueJobRow) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      progress: 5,
      error_message: null,
      processing_started_at: new Date().toISOString(),
      next_poll_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
};

const markPreparedForDispatch = async (jobId: string) => {
  return markQueuedStage(jobId, 55);
};

const markQueuedStage = async (jobId: string, progress: number) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'queued',
      progress,
      error_message: null,
      next_poll_at: new Date().toISOString(),
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
};

const markSubmittingPreparedPayload = async (jobId: string) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      progress: 50,
      error_message: null,
      next_poll_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
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
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'processing',
      job_id: providerJobId,
      progress: 60,
      error_message: null,
      processing_started_at: new Date().toISOString(),
      next_poll_at: new Date(Date.now() + POLL_INTERVAL_SECONDS * 1000).toISOString(),
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
};

const persistPreparedPayload = async (jobId: string, providerPayload: Record<string, unknown>) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      queue_payload: providerPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
};

const persistRecipePayload = async (jobId: string, recipePayload: ImageGenerateRecipePayload) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      queue_payload: recipePayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
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

  const currentStage = recipePayload.__stage || 'uploading_refs';
  const uploadedUrls = [...(recipePayload.__uploadedUrls || [])];

  if (currentStage === 'uploading_refs') {
    const uploadCursor = Math.max(0, Number(recipePayload.__uploadCursor || uploadedUrls.length || 0));
    const chunk = renderSources.slice(uploadCursor, uploadCursor + IMAGE_REFERENCE_UPLOAD_CHUNK_SIZE);

    if (chunk.length > 0) {
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

    await persistRecipePayload(job.id, nextPayload);

    if (hasMoreUploads) {
      const uploadProgress = Math.min(35, 20 + Math.round((nextCursor / renderSources.length) * 15));
      await markQueuedStage(job.id, uploadProgress);
      return { type: 'requeue' as const };
    }

    await markQueuedStage(job.id, 40);
    return { type: 'requeue' as const };
  }

  if (currentStage === 'synthesizing_prompt') {
    const synthesizedPrompt = await synthesizeImageGeneratePrompt(recipePayload);
    const nextPayload: ImageGenerateRecipePayload = {
      ...recipePayload,
      __synthesizedPrompt: synthesizedPrompt,
      __stage: 'building_payload',
      __uploadSources: renderSources,
      __directorSources: directorSources,
      __uploadedUrls: uploadedUrls,
    };

    await persistRecipePayload(job.id, nextPayload);
    await markQueuedStage(job.id, 45);
    return { type: 'requeue' as const };
  }

  const synthesizedPrompt = recipePayload.__synthesizedPrompt?.trim()
    ? recipePayload.__synthesizedPrompt.trim()
    : await synthesizeImageGeneratePrompt(recipePayload);
  const providerPayload = buildImageGenerateProviderPayload(recipePayload, uploadedUrls, synthesizedPrompt);

  const validationResult = await validateQueuePayloadAgainstLiveCatalog(job.queue_kind, providerPayload);
  const validatedProviderPayload = applyLivePricingConfigToPayload(job.queue_kind, providerPayload, validationResult);
  await persistPreparedPayload(job.id, validatedProviderPayload);
  await markPreparedForDispatch(job.id);

  return { type: 'prepared' as const, providerPayload: validatedProviderPayload };
};

const markCompletedWithAssetUrl = async (job: QueueJobRow, assetUrl: string) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      status: 'completed',
      image_url: assetUrl,
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
  const { data, error } = await admin
    .from('generated_images')
    .select('id, user_id, asset_type, queue_kind, queue_payload, prompt, tool_id, tool_name, model_used, cost_vcoin, processing_started_at, created_at, lease_expires_at, status')
    .in('status', ['processing', 'queued'])
    .is('job_id', null);

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

    const preparationTimeoutMs = getPreparationTimeoutMs(job, payload);

    if (ageMs >= preparationTimeoutMs) {
      await markFailedAndRefund(job, getPreparationTimeoutUserMessage(job, payload));
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
    p_lease_seconds: 120,
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
      const validationPayload = isQueueRecipePayload(currentPayload)
        ? getRecipeValidationPayload(currentPayload)
        : currentPayload;

      if (isQueueRecipePayload(currentPayload)) {
        await markPreparing(job);
      }

      const validationResult = await validateQueuePayloadAgainstLiveCatalog(job.queue_kind, validationPayload);

      if (isQueueRecipePayload(currentPayload) && currentPayload.recipeType === 'image_edit_recipe_v1') {
        const editPayload = currentPayload as ImageEditRecipePayload;
        await updatePreProviderStage(job.id, 20);
        const resultUrl = await withTimeout(
          runVertexImageEdit({
            sourceImage: editPayload.sourceImage,
            instruction: editPayload.prompt,
            modelId: editPayload.modelId,
            mimeType: editPayload.mimeType,
          }),
          preparationTimeoutMs,
          'Queue preparation timed out before image edit dispatch.',
        );

        await markCompletedWithAssetUrl(job, resultUrl);
        summary.completed += 1;
        continue;
      }

      if (isQueueRecipePayload(currentPayload) && currentPayload.recipeType === 'image_generate_recipe_v1') {
        await updatePreProviderStage(job.id, 20);
        const stagedResult = await withTimeout(
          prepareImageRecipeInStages(job, currentPayload as ImageGenerateRecipePayload),
          preparationTimeoutMs,
          'Queue preparation timed out before dispatching to provider.',
        );

        if (stagedResult.type === 'requeue') {
          summary.requeued += 1;
          continue;
        }
      }

      if (isQueueRecipePayload(currentPayload) && currentPayload.recipeType !== 'image_generate_recipe_v1') {
        await updatePreProviderStage(job.id, 20);
        const providerPayload = await withTimeout(
          prepareProviderPayloadFromQueueRecipe(currentPayload),
          preparationTimeoutMs,
          'Queue preparation timed out before dispatching to provider.',
        );
        const preparedValidationResult = await validateQueuePayloadAgainstLiveCatalog(job.queue_kind, providerPayload);
        const validatedProviderPayload = applyLivePricingConfigToPayload(
          job.queue_kind,
          providerPayload,
          preparedValidationResult,
        );
        await persistPreparedPayload(job.id, validatedProviderPayload);
        job.queue_payload = validatedProviderPayload;
        await markPreparedForDispatch(job.id);
        summary.requeued += 1;
        continue;
      }

      const providerPayloadForSubmit = applyLivePricingConfigToPayload(
        job.queue_kind,
        currentPayload,
        validationResult,
      );
      if (providerPayloadForSubmit !== currentPayload) {
        await persistPreparedPayload(job.id, providerPayloadForSubmit);
        job.queue_payload = providerPayloadForSubmit;
      }

      await markSubmittingPreparedPayload(job.id);
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
