import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { isDirectImageEditQueueKind } from '../../shared/queueKinds';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const GALLERY_PAGE_LIMIT = 100;
const LEDGER_RECOVERY_LIMIT = 24;
const ACTIVE_GALLERY_CACHE_TTL_MS = 10_000;
const IDLE_GALLERY_CACHE_TTL_MS = 30_000;

const GALLERY_LIGHT_SELECT =
  'id,image_url,prompt,created_at,updated_at,asset_type,queue_kind,tool_id,tool_name,model_used,user_id,user_name,is_public,status,job_id,progress,error_message,cost_vcoin';
const GALLERY_RECOVERY_SELECT =
  'id,image_url,created_at,updated_at,asset_type,queue_kind,tool_id,tool_name,model_used,user_id,user_name,is_public,status,job_id,progress,error_message,cost_vcoin';

type GalleryCacheEntry = {
  expiresAt: number;
  body: string;
};

const galleryCache = new Map<string, GalleryCacheEntry>();

const loadImagesFromLedgerReferences = async (
  admin: ReturnType<typeof getServiceRoleClient>,
  userId: string,
) => {
  const { data: ledgerRows, error: ledgerError } = await admin
    .from('vcoin_transactions')
    .select('reference_id,created_at')
    .eq('user_id', userId)
    .eq('reference_type', 'generated_image_charge')
    .order('created_at', { ascending: false })
    .limit(LEDGER_RECOVERY_LIMIT);

  if (ledgerError) {
    throw ledgerError;
  }

  const ids = Array.from(
    new Set(
      (ledgerRows || [])
        .map((row: any) => String(row?.reference_id || '').trim())
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
    ),
  );

  if (ids.length === 0) {
    return [];
  }

  const imageRows: any[] = [];
  const batchSize = 8;

  for (let index = 0; index < ids.length; index += batchSize) {
    const batchIds = ids.slice(index, index + batchSize);
    const { data: batchRows, error: batchError } = await admin
      .from('generated_images')
      .select(GALLERY_RECOVERY_SELECT)
      .in('id', batchIds);

    if (batchError) {
      console.warn('[gallery-images] ledger recovery batch failed:', batchError.message || batchError);
      continue;
    }

    imageRows.push(...(batchRows || []));
  }

  const orderMap = new Map(ids.map((id, index) => [id, index]));
  return (imageRows || [])
    .filter((row: any) => row?.user_id === userId)
    .sort((a: any, b: any) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER));
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
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
    const cached = galleryCache.get(user.id);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        statusCode: 200,
        headers,
        body: cached.body,
      };
    }

    const admin = getServiceRoleClient();

    const rpcResult = await admin.rpc('get_user_gallery_images_lightweight', {
      p_user_id: user.id,
      p_limit: GALLERY_PAGE_LIMIT,
    });

    const shouldFallbackToTable =
      rpcResult.error &&
      (rpcResult.error.code === 'PGRST202' ||
        /get_user_gallery_images_lightweight|function .* does not exist/i.test(rpcResult.error.message || ''));

    const tableResult = shouldFallbackToTable
      ? { data: await loadImagesFromLedgerReferences(admin, user.id), error: null }
      : { data: rpcResult.data, error: rpcResult.error };

    let { data, error } = tableResult;

    if (error?.code === '57014') {
      console.warn('[gallery-images] user gallery query timed out; falling back to ledger references.');
      data = await loadImagesFromLedgerReferences(admin, user.id);
      error = null;
    }

    if (error) {
      throw error;
    }

    const rows = (data || []).filter((row: any) => {
      if (!isDirectImageEditQueueKind(row?.queue_kind)) {
        return true;
      }

      return row?.queue_payload?.__showInGenerationHistory === true;
    });
    const idsMissingCost = rows
      .filter((row: any) => !Number.isFinite(Number(row?.cost_vcoin)))
      .map((row: any) => row.id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

    let chargeMap = new Map<string, number>();
    if (idsMissingCost.length > 0) {
      const { data: charges, error: chargesError } = await admin
        .from('vcoin_transactions')
        .select('reference_id,amount')
        .eq('user_id', user.id)
        .eq('reference_type', 'generated_image_charge')
        .in('reference_id', idsMissingCost);

      if (chargesError) {
        throw chargesError;
      }

      chargeMap = new Map(
        (charges || [])
          .map((row: any) => {
            const referenceId = typeof row?.reference_id === 'string' ? row.reference_id : '';
            const amount = Math.abs(Number(row?.amount) || 0);
            if (!referenceId || !Number.isFinite(amount) || amount <= 0) {
              return null;
            }
            return [referenceId, amount] as const;
          })
          .filter((entry: readonly [string, number] | null): entry is readonly [string, number] => entry !== null),
      );
    }

    const images = rows.map((row: any) => ({
      ...row,
      cost_vcoin: Number.isFinite(Number(row?.cost_vcoin)) ? Number(row.cost_vcoin) : chargeMap.get(row.id) ?? null,
    }));

    const body = JSON.stringify({ images });
    const hasActiveJobs = images.some((row: any) => row && (row.status === 'queued' || row.status === 'processing'));
    galleryCache.set(user.id, {
      expiresAt: Date.now() + (hasActiveJobs ? ACTIVE_GALLERY_CACHE_TTL_MS : IDLE_GALLERY_CACHE_TTL_MS),
      body,
    });

    return {
      statusCode: 200,
      headers,
      body,
    };
  } catch (error: any) {
    console.error('[gallery-images] failed:', error);
    try {
      const { user } = await requireAuthenticatedUser(event);
      const cached = galleryCache.get(user.id);
      if (cached?.body) {
        return {
          statusCode: 200,
          headers,
          body: cached.body,
        };
      }
    } catch {
      // ignore auth/cache fallback errors and return the original failure
    }
    const isUnauthorized = error?.message === 'Unauthorized';
    return {
      statusCode: isUnauthorized ? 401 : 500,
      headers,
      body: JSON.stringify({ error: isUnauthorized ? 'Unauthorized' : (error?.message || 'Internal Server Error') }),
    };
  }
};
