import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAdminUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod || '')) {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { user: actor } = await requireAdminUser(event);
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const userId = String(body.userId || event.queryStringParameters?.userId || '').trim();
    if (!userId) throw Object.assign(new Error('userId is required'), { statusCode: 400 });
    const admin = getServiceRoleClient();

    if (event.httpMethod === 'POST') {
      const reason = String(body.reason || '').trim();
      if (!reason) throw Object.assign(new Error('Cần nhập lý do mở khóa.'), { statusCode: 400 });
      const { error } = await admin.rpc('admin_unlock_user_account', {
        p_user_id: userId,
        p_reason: reason,
        p_actor_user_id: actor.id,
      });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    const { data: target, error: targetError } = await admin
      .from('users')
      .select('id, account_status, locked_at, lock_reason')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw Object.assign(new Error('USER_NOT_FOUND'), { statusCode: 404 });

    const { data: bindings, error: bindingsError } = await admin
      .from('user_browser_keys')
      .select('browser_key_hash, account_index, is_checkin_allowed, first_seen_at, last_seen_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });
    if (bindingsError) throw bindingsError;

    const browserKeys = [...new Set((bindings || []).map((binding: any) => binding.browser_key_hash).filter(Boolean))];
    const { data: relatedBindings, error: relatedError } = browserKeys.length
      ? await admin
          .from('user_browser_keys')
          .select('browser_key_hash, account_index, is_checkin_allowed, first_seen_at, last_seen_at, users!inner(id, email, display_name, account_status)')
          .in('browser_key_hash', browserKeys)
          .order('account_index', { ascending: true })
      : { data: [], error: null };
    if (relatedError) throw relatedError;

    const { data: events, error: eventsError } = await admin
      .from('account_lock_events')
      .select('id, event_type, reason_code, reason, evidence, actor_user_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (eventsError) throw eventsError;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: target,
        bindings: bindings || [],
        relatedAccounts: relatedBindings || [],
        events: events || [],
      }),
    };
  } catch (error: any) {
    const statusCode = error?.statusCode || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : 500);
    return { statusCode, headers, body: JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }) };
  }
};
