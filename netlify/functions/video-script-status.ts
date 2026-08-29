import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: false });
    const id = String(event.queryStringParameters?.id || '').trim();
    const { data, error } = await getServiceRoleClient().from('video_script_jobs').select('status,script,error_message').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error || !data) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Video script job not found.' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ status: data.status, script: data.script || null, error: data.error_message || null }) };
  } catch (error: any) {
    return { statusCode: /Unauthorized/i.test(String(error?.message || '')) ? 401 : 500, headers, body: JSON.stringify({ error: error?.message || 'Failed to read video script job.' }) };
  }
};
