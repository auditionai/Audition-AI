import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { user } = await requireAuthenticatedUser(event);
    const admin = getServiceRoleClient();

    const payload = {
      id: user.id,
      email: user.email || '',
      display_name: getDisplayName(user),
      photo_url: getPhotoUrl(user),
      vcoin_balance: 0,
      is_admin: false,
      last_active: new Date().toISOString(),
      created_at: user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await admin
      .from('users')
      .upsert(payload, {
        onConflict: 'id',
        ignoreDuplicates: true,
      });

    if (insertError) {
      throw insertError;
    }

    const { data: existing, error: readError } = await admin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    const needsPatch =
      !existing?.email ||
      !existing?.display_name ||
      existing.display_name === 'User' ||
      existing.photo_url == null;

    if (existing && needsPatch) {
      const { error: patchError } = await admin
        .from('users')
        .update({
          email: existing.email || payload.email,
          display_name: existing.display_name && existing.display_name !== 'User'
            ? existing.display_name
            : payload.display_name,
          photo_url: existing.photo_url || payload.photo_url,
          last_active: payload.last_active,
        })
        .eq('id', user.id);

      if (patchError) {
        throw patchError;
      }
    }

    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ profile }),
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
