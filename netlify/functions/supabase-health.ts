import type { Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const timeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
    };
  }

  const startedAt = Date.now();

  try {
    const admin = getServiceRoleClient();
    const result = await timeout(
      admin.from('users').select('id', { head: true, count: 'exact' }).limit(1),
      8000,
      'Supabase health check',
    );

    if (result.error) {
      throw result.error;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        latencyMs: Date.now() - startedAt,
        checked: 'public.users head select',
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 504,
      headers,
      body: JSON.stringify({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error?.message || 'Supabase health check failed',
      }),
    };
  }
};
