import type { Handler } from '@netlify/functions';
import { runQueueWorker } from './_queue-worker';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Queue tick exceeded safe execution window')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
    const summary = await withTimeout(runQueueWorker(), 9_000);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, accepted: true, summary }),
    };
  } catch (error: any) {
    const message = error?.message || 'Internal Server Error';
    if (
      message.includes('Missing SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Missing SUPABASE_URL')
    ) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, disabled: true, error: message }),
      };
    }
    console.error('[queue-tick] Worker failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: message }),
    };
  }
};
