import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAdminUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    await requireAdminUser(event);
    const body = JSON.parse(event.body || '{}');
    const userId = String(body?.userId || '').trim();
    const password = String(body?.password || '');
    if (!userId) throw Object.assign(new Error('userId is required'), { statusCode: 400 });
    if (password.length < 6) throw Object.assign(new Error('Mật khẩu mới phải có ít nhất 6 ký tự.'), { statusCode: 400 });

    const admin = getServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (error: any) {
    const statusCode = error?.statusCode || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : 500);
    return { statusCode, headers, body: JSON.stringify({ success: false, error: error?.message || 'Internal Server Error' }) };
  }
};
