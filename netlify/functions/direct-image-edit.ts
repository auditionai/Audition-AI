import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Handler } from '@netlify/functions';
import type { ImageEditRecipePayload, QueueProcessingStage, QueueProgressLogEntry } from '../../shared/queueRecipes';
import { DIRECT_IMAGE_EDIT_QUEUE_KIND, isDirectImageEditToolId } from '../../shared/queueKinds';
import { runVertexImageEdit } from './_vertex-image-edit';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DirectImageEditBody = {
  id?: string;
  prompt?: string;
  toolId?: string;
  toolName?: string;
  engine?: string;
  costVcoin?: number;
  queuePayload?: ImageEditRecipePayload;
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

const normalizeJobId = (value: unknown) => {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : randomUUID();
};

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

const mapError = (message: string) => {
  if (/INSUFFICIENT_VCOIN/i.test(message)) {
    return { statusCode: 400, error: 'INSUFFICIENT_VCOIN' };
  }

  if (/Unauthorized/i.test(message)) {
    return { statusCode: 401, error: 'Unauthorized' };
  }

  return { statusCode: 400, error: message };
};

const updateDirectEditRecord = async (jobId: string, patch: Record<string, unknown>) => {
  const admin = getServiceRoleClient();
  await admin
    .from('generated_images')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
};

const refundCharge = async (jobId: string, reason: string) => {
  const admin = getServiceRoleClient();
  await admin.rpc('refund_generated_job', {
    p_generated_image_id: jobId,
    p_reason: reason,
  });
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const admin = getServiceRoleClient();
    const body = JSON.parse(event.body || '{}') as DirectImageEditBody;
    const jobId = normalizeJobId(body.id);
    const toolId = String(body.toolId || '').trim();
    const toolName = String(body.toolName || toolId || 'Image Edit').trim();
    const prompt = String(body.prompt || '').trim();
    const engine = String(body.engine || 'Vertex AI').trim();
    const costVcoin = Math.max(0, Number(body.costVcoin || 0));
    const queuePayload = body.queuePayload;

    if (!isDirectImageEditToolId(toolId)) {
      throw new Error('Unsupported direct image edit tool');
    }

    if (!queuePayload || queuePayload.recipeType !== 'image_edit_recipe_v1') {
      throw new Error('Missing direct image edit payload');
    }

    const { data: existing, error: existingError } = await admin
      .from('generated_images')
      .select('id, user_id, status, image_url, error_message, updated_at')
      .eq('id', jobId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      if (existing.user_id !== user.id) {
        throw new Error('JOB_ID_ALREADY_EXISTS');
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: existing.status === 'completed',
          id: existing.id,
          status: existing.status,
          imageUrl: existing.image_url || undefined,
          error: existing.error_message || undefined,
          updatedAt: existing.updated_at || undefined,
        }),
      };
    }

    const { data: userRow, error: userError } = await admin
      .from('users')
      .select('id, vcoin_balance')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      throw userError;
    }

    if (!userRow) {
      throw new Error('USER_NOT_FOUND');
    }

    if (costVcoin > Number(userRow.vcoin_balance || 0)) {
      throw new Error('INSUFFICIENT_VCOIN');
    }

    let chargeApplied = false;
    const createdAt = new Date().toISOString();
    let runtimePayload = appendQueueLog(
      appendQueueLog(queuePayload, 'preparing', 'Dang tai anh nguon va khoi tao tien trinh xu ly.'),
      'dispatching',
      'Dang gui yeu cau xu ly truc tiep toi Vertex AI.',
    );

    if (costVcoin > 0) {
      const { data: charged, error: chargeError } = await admin.rpc('apply_balance_transaction', {
        p_target_user_id: user.id,
        p_amount: -costVcoin,
        p_reason: toolName,
        p_log_type: 'usage',
        p_reference_type: 'generated_image_charge',
        p_reference_id: jobId,
        p_metadata: {
          generated_image_id: jobId,
          tool_id: toolId,
          queue_kind: DIRECT_IMAGE_EDIT_QUEUE_KIND,
          asset_type: 'image',
          cost_vcoin: costVcoin,
        },
      });

      if (chargeError) {
        throw chargeError;
      }

      if (!charged) {
        throw new Error('CHARGE_ALREADY_APPLIED');
      }

      chargeApplied = true;
    }

    const { error: insertError } = await admin.from('generated_images').insert({
      id: jobId,
      user_id: user.id,
      image_url: '',
      prompt,
      model_used: engine,
      created_at: createdAt,
      is_public: false,
      tool_id: toolId,
      tool_name: toolName,
      status: 'processing',
      progress: 15,
      cost_vcoin: costVcoin,
      asset_type: 'image',
      updated_at: createdAt,
      queue_kind: DIRECT_IMAGE_EDIT_QUEUE_KIND,
      queue_payload: runtimePayload,
      provider: 'vertex_direct',
      job_id: null,
      lease_token: null,
      lease_expires_at: null,
      next_poll_at: null,
      finished_at: null,
      processing_started_at: createdAt,
      attempt_count: 0,
      last_error_at: null,
      error_message: null,
    });

    if (insertError) {
      if (chargeApplied && costVcoin > 0) {
        await admin.rpc('apply_balance_transaction', {
          p_target_user_id: user.id,
          p_amount: costVcoin,
          p_reason: `Refund: ${toolName} direct insert failed`,
          p_log_type: 'refund',
          p_reference_type: 'generated_image_refund',
          p_reference_id: jobId,
          p_metadata: {
            generated_image_id: jobId,
            tool_id: toolId,
            queue_kind: DIRECT_IMAGE_EDIT_QUEUE_KIND,
            asset_type: 'image',
            cost_vcoin: costVcoin,
          },
        });
      }
      throw insertError;
    }

    await updateDirectEditRecord(jobId, {
      progress: 55,
      queue_payload: (runtimePayload = appendQueueLog(runtimePayload, 'building_payload', 'Dang xu ly hinh anh bang Vertex AI.')),
    });

    try {
      const resultDataUrl = await runVertexImageEdit({
        sourceImage: queuePayload.sourceImage,
        instruction: queuePayload.prompt,
        modelId: queuePayload.modelId,
        mimeType: queuePayload.mimeType,
      });

      await updateDirectEditRecord(jobId, {
        progress: 85,
        queue_payload: (runtimePayload = appendQueueLog(runtimePayload, 'verifying_output', 'Dang luu ket qua da xu ly.')),
      });

      const resultUrl = await uploadEditedImage(user.id, jobId, resultDataUrl);
      const completionPayload = appendQueueLog(runtimePayload, 'completed', 'Da hoan thanh xu ly truc tiep.', 'success');

      await updateDirectEditRecord(jobId, {
        status: 'completed',
        image_url: resultUrl,
        progress: 100,
        error_message: null,
        finished_at: new Date().toISOString(),
        queue_payload: completionPayload,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          id: jobId,
          status: 'completed',
          imageUrl: resultUrl,
          updatedAt: new Date().toISOString(),
        }),
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Direct image edit failed';
      const failedPayload = appendQueueLog(runtimePayload, 'failed', errorMessage, 'error');

      await updateDirectEditRecord(jobId, {
        status: 'failed',
        progress: 0,
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
        queue_payload: failedPayload,
      });

      if (chargeApplied && costVcoin > 0) {
        await refundCharge(jobId, `Refund: ${toolName} direct edit failed`);
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          id: jobId,
          status: 'failed',
          error: errorMessage,
          updatedAt: new Date().toISOString(),
        }),
      };
    }
  } catch (error: any) {
    const mapped = mapError(error?.message || 'Internal Server Error');
    return {
      statusCode: mapped.statusCode,
      headers,
      body: JSON.stringify({ error: mapped.error }),
    };
  }
};
