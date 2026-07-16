import { randomUUID } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import type { ImageEditRecipePayload, QueueProgressLogEntry } from '../../shared/queueRecipes';
import { DIRECT_IMAGE_EDIT_QUEUE_KIND, isDirectImageEditToolId } from '../../shared/queueKinds';
import { triggerBackgroundFunction } from './_queue-launcher';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DIRECT_IMAGE_EDIT_BACKGROUND_PATH = '/.netlify/functions/direct-image-edit-background';
const DIRECT_IMAGE_EDIT_RECOVERY_STALE_MS = 60_000;
const DIRECT_EDIT_DEFAULT_PRICES: Record<string, Record<string, Record<string, number>>> = {
  magic_editor_pro: {
    flash: { '1k': 2, '2k': 3, '4k': 4 },
    pro: { '1k': 4, '2k': 5, '4k': 6 },
  },
  remove_bg_pro: {
    flash: { '1k': 1, '2k': 1, '4k': 1 },
  },
  sharpen_upscale: {
    flash: { '1k': 1, '2k': 2, '4k': 3 },
  },
};

type DirectImageEditBody = {
  id?: string;
  prompt?: string;
  toolId?: string;
  toolName?: string;
  engine?: string;
  costVcoin?: number;
  showInGenerationHistory?: boolean;
  queuePayload?: ImageEditRecipePayload;
};

const buildInitialQueueLogs = (): QueueProgressLogEntry[] => ([
  {
    at: new Date().toISOString(),
    stage: 'queued',
    level: 'info',
    message: 'Da vao hang doi xu ly anh truc tiep.',
  },
]);

const normalizeJobId = (value: unknown) => {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : randomUUID();
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

const normalizeKey = (value?: unknown) => String(value || '').trim().toLowerCase();

const getDirectEditServerCost = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  toolId: string,
  queuePayload: ImageEditRecipePayload,
) => {
  const normalizedToolId = normalizeKey(toolId);
  const tier = normalizeKey(queuePayload.modelId).includes('pro') ? 'pro' : 'flash';
  const resolution = normalizeKey(queuePayload.resolution || '1K');
  const optionId = `${tier}|${resolution}`;
  const defaultPrice = DIRECT_EDIT_DEFAULT_PRICES[normalizedToolId]?.[tier]?.[resolution];

  if (!Number.isFinite(defaultPrice) || Number(defaultPrice) <= 0) {
    throw new Error('INVALID_SERVER_PRICE');
  }

  const { data, error } = await admin
    .from('model_pricing')
    .select('audition_price_vcoin')
    .eq('model_id', normalizedToolId)
    .eq('option_id', optionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const overridePrice = Number(data?.audition_price_vcoin);
  const costVcoin = Number.isFinite(overridePrice) && overridePrice > 0
    ? Math.ceil(overridePrice)
    : Math.ceil(defaultPrice);

  return {
    costVcoin,
    pricing: {
      model_id: normalizedToolId,
      config_key: optionId,
      base_vcoin: costVcoin,
      source: Number.isFinite(overridePrice) && overridePrice > 0 ? 'model_pricing_override' : 'direct_edit_default',
    },
  };
};

const triggerDirectImageEditBackground = async (rawUrl?: string | null, jobId?: string) => {
  if (!jobId) {
    return { launched: false, errorMessage: 'Missing job id for background launch' };
  }

  try {
    const launched = await triggerBackgroundFunction(DIRECT_IMAGE_EDIT_BACKGROUND_PATH, rawUrl, 5_000, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    return { launched, errorMessage: launched ? null : 'Background launch returned false' };
  } catch (error: any) {
    console.error('[direct-image-edit] Failed to launch background processor:', error);
    return {
      launched: false,
      errorMessage: error?.message || 'Background launch threw an unknown error',
    };
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    try {
      const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: false });
      const admin = getServiceRoleClient();
      const requestedId = String(event.queryStringParameters?.id || '').trim();
      if (!UUID_PATTERN.test(requestedId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid direct edit job id' }),
        };
      }

      const { data: existing, error: existingError } = await admin
        .from('generated_images')
        .select('id, user_id, status, image_url, error_message, updated_at, lease_expires_at')
        .eq('id', requestedId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existing || existing.user_id !== user.id) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Direct edit job not found' }),
        };
      }

      const now = Date.now();
      const updatedAt = Date.parse(String(existing.updated_at || ''));
      const leaseExpiresAt = Date.parse(String(existing.lease_expires_at || ''));
      const isActive = existing.status === 'queued' || existing.status === 'processing';
      const isStale = Number.isFinite(updatedAt) && now - updatedAt >= DIRECT_IMAGE_EDIT_RECOVERY_STALE_MS;
      const hasActiveLease = Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now;

      if (isActive && isStale && !hasActiveLease) {
        const recoveryTouchedAt = new Date().toISOString();
        const { data: recoveryClaim } = await admin
          .from('generated_images')
          .update({ updated_at: recoveryTouchedAt })
          .eq('id', existing.id)
          .eq('updated_at', existing.updated_at)
          .in('status', ['queued', 'processing'])
          .select('id')
          .maybeSingle();

        if (recoveryClaim?.id) {
          void triggerDirectImageEditBackground(event.rawUrl, existing.id);
        }
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
    } catch (error: any) {
      const message = error?.message || 'Internal Server Error';
      const statusCode = /Unauthorized/i.test(message) ? 401 : 500;
      return {
        statusCode,
        headers,
        body: JSON.stringify({ error: message }),
      };
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: false });
    const admin = getServiceRoleClient();
    const body = JSON.parse(event.body || '{}') as DirectImageEditBody;
    const jobId = normalizeJobId(body.id);
    const toolId = String(body.toolId || '').trim();
    const toolName = String(body.toolName || toolId || 'Image Edit').trim();
    const prompt = String(body.prompt || '').trim();
    const engine = String(body.engine || 'Vertex AI').trim();
    const showInGenerationHistory = body.showInGenerationHistory === true;
    const queuePayload = body.queuePayload;

    if (!isDirectImageEditToolId(toolId)) {
      throw new Error('Unsupported direct image edit tool');
    }

    if (!queuePayload || queuePayload.recipeType !== 'image_edit_recipe_v1') {
      throw new Error('Missing direct image edit payload');
    }

    const serverPrice = await getDirectEditServerCost(admin, toolId, queuePayload);
    const costVcoin = serverPrice.costVcoin;

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

      if (existing.status === 'queued' || existing.status === 'processing') {
        await triggerDirectImageEditBackground(event.rawUrl, existing.id);
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
      .select('id, vcoin_balance, account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      throw userError;
    }

    if (!userRow) {
      throw new Error('USER_NOT_FOUND');
    }

    if (userRow.account_status === 'locked') {
      throw new Error('AccountLocked');
    }

    if (costVcoin > Number(userRow.vcoin_balance || 0)) {
      throw new Error('INSUFFICIENT_VCOIN');
    }

    let chargeApplied = false;
    const createdAt = new Date().toISOString();
    const runtimePayload: ImageEditRecipePayload & {
      __stage: 'queued';
      __logs: QueueProgressLogEntry[];
      __showInGenerationHistory?: boolean;
    } = {
      ...queuePayload,
      __stage: 'queued',
      __logs: buildInitialQueueLogs(),
      __showInGenerationHistory: showInGenerationHistory,
    };

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
          pricing: serverPrice.pricing,
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
      status: 'queued',
      progress: 0,
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
      processing_started_at: null,
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
            pricing: serverPrice.pricing,
          },
        });
      }
      throw insertError;
    }

    const launchResult = await triggerDirectImageEditBackground(event.rawUrl, jobId);
    if (!launchResult.launched) {
      const launchErrorMessage = launchResult.errorMessage || 'Failed to start direct edit background processor';
      await admin.from('generated_images').update({
        status: 'failed',
        progress: 100,
        error_message: `Failed to start direct edit background processor: ${launchErrorMessage}`,
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      }).eq('id', jobId);

      if (chargeApplied && costVcoin > 0) {
        await admin.rpc('refund_generated_job', {
          p_generated_image_id: jobId,
          p_reason: `Refund: ${toolName} background launch failed`,
        });
      }

      throw new Error(`Failed to start direct edit background processor: ${launchErrorMessage}`);
    }

    return {
      statusCode: 202,
      headers,
      body: JSON.stringify({
        success: true,
        accepted: true,
        id: jobId,
        status: 'queued',
        updatedAt: createdAt,
      }),
    };
  } catch (error: any) {
    const mapped = mapError(error?.message || 'Internal Server Error');
    return {
      statusCode: mapped.statusCode,
      headers,
      body: JSON.stringify({ error: mapped.error }),
    };
  }
};
