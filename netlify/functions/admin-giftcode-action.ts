import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const admin = getServiceRoleClient();
    const { data: requester, error: requesterError } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (requesterError) throw requesterError;
    if (!requester?.is_admin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const action = String(body?.action || '').trim();
    const userId = String(body?.userId || '').trim();
    const usageId = String(body?.usageId || '').trim();
    const reason = String(body?.reason || 'Giftcode abuse').trim();

    let result;
    if (action === 'revoke') {
      if (!usageId) throw new Error('usageId is required');
      result = await admin.rpc('revoke_giftcode_usage', {
        p_usage_id: usageId,
        p_reason: reason,
      });
    } else if (action === 'warn') {
      if (!userId) throw new Error('userId is required');
      result = await admin.rpc('warn_user_account', {
        p_user_id: userId,
        p_message: reason,
      });
    } else if (action === 'lock') {
      if (!userId) throw new Error('userId is required');
      result = await admin.rpc('lock_user_account', {
        p_user_id: userId,
        p_reason: reason,
      });
    } else if (action === 'unlock') {
      if (!userId) throw new Error('userId is required');
      result = await admin.rpc('unlock_user_account', {
        p_user_id: userId,
      });
    } else {
      throw new Error('Unsupported action');
    }

    if (result.error) throw result.error;
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: result.data }) };
  } catch (error: any) {
    return {
      statusCode: error?.message === 'Unauthorized' ? 401 : error?.message === 'AccountLocked' ? 403 : 500,
      headers,
      body: JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }),
    };
  }
};
