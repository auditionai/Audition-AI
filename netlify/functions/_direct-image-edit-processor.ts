import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ImageEditRecipePayload, QueueProcessingStage, QueueProgressLogEntry } from '../../shared/queueRecipes';
import { DIRECT_IMAGE_EDIT_QUEUE_KIND } from '../../shared/queueKinds';
import { getServiceRoleClient } from './_supabase';
import { runVertexImageEdit } from './_vertex-image-edit';

const DIRECT_EDIT_LEASE_MS = 10 * 60 * 1000;

type DirectEditJobRow = {
  id: string;
  user_id: string;
  status: string | null;
  queue_kind: string | null;
  queue_payload: ImageEditRecipePayload | null;
  cost_vcoin: number | null;
  tool_name: string | null;
  image_url: string | null;
  error_message: string | null;
  processing_started_at: string | null;
  updated_at: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  attempt_count: number | null;
};

const getEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
};

const R2_ENDPOINT = getEnv('R2_ENDPOINT', 'VITE_R2_ENDPOINT');
const R2_ACCESS_KEY_ID = getEnv('R2_ACCESS_KEY_ID', 'VITE_R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = getEnv('R2_SECRET_ACCESS_KEY', 'VITE_R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = getEnv('R2_BUCKET_NAME', 'VITE_R2_BUCKET_NAME');
const R2_PUBLIC_URL = getEnv('R2_PUBLIC_URL', 'VITE_R2_PUBLIC_URL');

const r2Client =
  R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

const buildQueueLog = (
  stage: QueueProcessingStage,
  message: string,
  level: QueueProgressLogEntry['level'] = 'info',
): QueueProgressLogEntry => ({
  at: new Date().toISOString(),
  stage,
  level,
  message,
});

const appendQueueLog = (
  payload: ImageEditRecipePayload,
  stage: QueueProcessingStage,
  message: string,
  level: QueueProgressLogEntry['level'] = 'info',
): ImageEditRecipePayload => ({
  ...payload,
  __stage: stage,
  __logs: [...(((payload as any).__logs as QueueProgressLogEntry[] | undefined) || []), buildQueueLog(stage, message, level)],
});

const parseDataUrl = (value: string) => {
  const match = value.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('Invalid image payload returned by editor');
  }

  return {
    mimeType: match[1] || 'image/png',
    buffer: Buffer.from(match[2] || '', 'base64'),
  };
};

const mimeTypeToExtension = (mimeType: string) => {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
};

const uploadEditedImage = async (userId: string, imageId: string, assetDataUrl: string) => {
  if (!r2Client || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    return assetDataUrl;
  }

  const { mimeType, buffer } = parseDataUrl(assetDataUrl);
  const extension = mimeTypeToExtension(mimeType);
  const key = `edited/${userId}/${imageId}.${extension}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
};

const extractErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Direct image edit failed';
};

const loadDirectEditJob = async (jobId: string): Promise<DirectEditJobRow | null> => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('generated_images')
    .select(
      'id, user_id, status, queue_kind, queue_payload, cost_vcoin, tool_name, image_url, error_message, processing_started_at, updated_at, lease_token, lease_expires_at, attempt_count',
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DirectEditJobRow | null) || null;
};

const refundCharge = async (jobId: string, reason: string) => {
  const admin = getServiceRoleClient();
  const { error } = await admin.rpc('refund_generated_job', {
    p_generated_image_id: jobId,
    p_reason: reason,
  });

  if (error) {
    console.warn('[direct-image-edit-background] Refund failed:', error);
  }
};

const updateJob = async (jobId: string, patch: Record<string, unknown>) => {
  const admin = getServiceRoleClient();
  const { error } = await admin
    .from('generated_images')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    throw error;
  }
};

const tryClaimJob = async (job: DirectEditJobRow, leaseToken: string) => {
  const now = Date.now();
  const leaseExpiryMs = job.lease_expires_at ? Date.parse(job.lease_expires_at) : 0;
  const hasActiveLease =
    job.status === 'processing' &&
    job.lease_token &&
    job.lease_token !== leaseToken &&
    Number.isFinite(leaseExpiryMs) &&
    leaseExpiryMs > now;

  if (job.status === 'completed' || job.status === 'failed') {
    return { claimed: false, payload: job.queue_payload, reason: 'terminal' as const };
  }

  if (!job.queue_payload || job.queue_payload.recipeType !== 'image_edit_recipe_v1') {
    return { claimed: false, payload: job.queue_payload, reason: 'invalid_payload' as const };
  }

  if (hasActiveLease) {
    return { claimed: false, payload: job.queue_payload, reason: 'lease_active' as const };
  }

  const payload = appendQueueLog(
    job.queue_payload,
    'preparing',
    'Bat dau xu ly anh truc tiep tren background worker.',
  );
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + DIRECT_EDIT_LEASE_MS).toISOString();

  await updateJob(job.id, {
    status: 'processing',
    progress: 10,
    processing_started_at: job.processing_started_at || nowIso,
    lease_token: leaseToken,
    lease_expires_at: leaseExpiresAt,
    attempt_count: Number(job.attempt_count || 0) + 1,
    queue_payload: payload,
    error_message: null,
    last_error_at: null,
    finished_at: null,
  });

  return { claimed: true, payload, reason: null as const };
};

export const processDirectImageEditJob = async (jobId: string) => {
  const job = await loadDirectEditJob(jobId);
  if (!job) {
    return { status: 'skipped' as const, reason: 'not_found' };
  }

  if (job.queue_kind !== DIRECT_IMAGE_EDIT_QUEUE_KIND) {
    return { status: 'skipped' as const, reason: 'wrong_queue_kind' };
  }

  const leaseToken = randomUUID();
  const claim = await tryClaimJob(job, leaseToken);

  if (!claim.claimed) {
    if (claim.reason === 'invalid_payload') {
      await updateJob(job.id, {
        status: 'failed',
        progress: 100,
        error_message: 'Invalid direct image edit payload',
        queue_payload: job.queue_payload && job.queue_payload.recipeType === 'image_edit_recipe_v1'
          ? appendQueueLog(job.queue_payload, 'failed', 'Payload sua anh khong hop le.', 'error')
          : job.queue_payload,
        finished_at: new Date().toISOString(),
        lease_token: null,
        lease_expires_at: null,
        last_error_at: new Date().toISOString(),
      });
      if (Number(job.cost_vcoin || 0) > 0) {
        await refundCharge(job.id, `Refund: ${(job.tool_name || 'Direct image edit').trim()} failed`);
      }
      return { status: 'failed' as const, reason: 'invalid_payload' };
    }

    return { status: 'skipped' as const, reason: claim.reason };
  }

  let runtimePayload = claim.payload;

  try {
    runtimePayload = appendQueueLog(runtimePayload, 'dispatching', 'Dang goi Vertex AI de xu ly anh.');
    await updateJob(job.id, {
      progress: 35,
      queue_payload: runtimePayload,
      lease_token: leaseToken,
      lease_expires_at: new Date(Date.now() + DIRECT_EDIT_LEASE_MS).toISOString(),
    });

    const assetDataUrl = await runVertexImageEdit({
      sourceImage: runtimePayload.sourceImage,
      instruction: runtimePayload.prompt,
      modelId: runtimePayload.modelId,
      mimeType: runtimePayload.mimeType,
      resolution: runtimePayload.resolution,
      aspectRatio: runtimePayload.aspectRatio,
    });

    runtimePayload = appendQueueLog(runtimePayload, 'verifying_output', 'Dang luu anh da xu ly.');
    await updateJob(job.id, {
      progress: 80,
      queue_payload: runtimePayload,
      lease_token: leaseToken,
      lease_expires_at: new Date(Date.now() + DIRECT_EDIT_LEASE_MS).toISOString(),
    });

    const imageUrl = await uploadEditedImage(job.user_id, job.id, assetDataUrl);
    runtimePayload = appendQueueLog(runtimePayload, 'completed', 'Xu ly anh thanh cong.', 'success');

    await updateJob(job.id, {
      status: 'completed',
      progress: 100,
      image_url: imageUrl,
      error_message: null,
      queue_payload: runtimePayload,
      finished_at: new Date().toISOString(),
      lease_token: null,
      lease_expires_at: null,
      last_error_at: null,
    });

    return { status: 'completed' as const, imageUrl };
  } catch (error) {
    const message = extractErrorMessage(error);
    runtimePayload = appendQueueLog(runtimePayload, 'failed', message, 'error');

    await updateJob(job.id, {
      status: 'failed',
      progress: 100,
      error_message: message,
      queue_payload: runtimePayload,
      finished_at: new Date().toISOString(),
      lease_token: null,
      lease_expires_at: null,
      last_error_at: new Date().toISOString(),
    });

    if (Number(job.cost_vcoin || 0) > 0) {
      await refundCharge(job.id, `Refund: ${(job.tool_name || 'Direct image edit').trim()} failed`);
    }

    throw error;
  }
};
