import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROFILE_SELECT =
  'id, email, display_name, photo_url, vcoin_balance, is_admin, created_at, last_active, account_status, account_warning, account_warning_at, locked_at, lock_reason';
const PROFILE_DB_TIMEOUT_MS = 2_500;

const getAbortSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
};

const getDisplayName = (user: any) => {
  const metadata = user?.user_metadata || {};
  return (
    metadata.display_name ||
    metadata.full_name ||
    metadata.name ||
    user?.email?.split('@')[0] ||
    'User'
  );
};

const getPhotoUrl = (user: any) => {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || '';
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
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
    const nowIso = new Date().toISOString();

    const payload = {
      id: user.id,
      email: user.email || '',
      display_name: getDisplayName(user),
      photo_url: getPhotoUrl(user),
      vcoin_balance: 0,
      is_admin: false,
      last_active: nowIso,
      created_at: user.created_at || nowIso,
      updated_at: nowIso,
    };

    const readTimeout = getAbortSignal(PROFILE_DB_TIMEOUT_MS);
    const { data: existing, error: readError } = await admin
      .from('users')
      .select(PROFILE_SELECT)
      .eq('id', user.id)
      .maybeSingle()
      .abortSignal(readTimeout.signal)
      .finally(() => readTimeout.clear());

    if (readError) {
      throw readError;
    }

    const needsPatch =
      !existing?.email ||
      !existing?.display_name ||
      existing.display_name === 'User' ||
      existing.photo_url == null;

    if (existing && !needsPatch) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ profile: existing }),
      };
    }

    if (existing && needsPatch) {
      const patch = {
        email: existing.email || payload.email,
        display_name: existing.display_name && existing.display_name !== 'User'
          ? existing.display_name
          : payload.display_name,
        photo_url: existing.photo_url || payload.photo_url,
        last_active: payload.last_active,
      };
      const updateTimeout = getAbortSignal(PROFILE_DB_TIMEOUT_MS);
      const { error: patchError } = await admin
        .from('users')
        .update(patch)
        .eq('id', user.id)
        .abortSignal(updateTimeout.signal)
        .finally(() => updateTimeout.clear());

      if (patchError) {
        throw patchError;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ profile: { ...existing, ...patch } }),
      };
    }

    const insertTimeout = getAbortSignal(PROFILE_DB_TIMEOUT_MS);
    const { error: insertError } = await admin
      .from('users')
      .upsert(payload, {
        onConflict: 'id',
        ignoreDuplicates: true,
      })
      .abortSignal(insertTimeout.signal)
      .finally(() => insertTimeout.clear());

    if (insertError) {
      throw insertError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ profile: payload }),
    };
  } catch (error: any) {
    console.error('[ensure-user-profile] failed:', error);
    const isUnauthorized = error?.message === 'Unauthorized';
    const isLocked = error?.message === 'AccountLocked';
    return {
      statusCode: isUnauthorized ? 401 : isLocked ? 403 : 500,
      headers,
      body: JSON.stringify({ error: isLocked ? 'AccountLocked' : isUnauthorized ? 'Unauthorized' : (error?.message || 'Internal Server Error') }),
    };
  }
};
