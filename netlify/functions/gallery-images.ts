import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const GALLERY_PAGE_LIMIT = 100;
const ACTIVE_GALLERY_CACHE_TTL_MS = 10_000;
const IDLE_GALLERY_CACHE_TTL_MS = 30_000;

type GalleryCacheEntry = {
  expiresAt: number;
  body: string;
};

const galleryCache = new Map<string, GalleryCacheEntry>();

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

    const { data, error } = await admin
      .from('generated_images')
      .select('id,image_url,prompt,created_at,updated_at,asset_type,tool_id,tool_name,model_used,user_id,user_name,is_public,status,job_id,progress,error_message,cost_vcoin,queue_payload')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(GALLERY_PAGE_LIMIT);

    if (error) {
      throw error;
    }

    const rows = data || [];
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
