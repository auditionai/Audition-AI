import type { Handler } from '@netlify/functions';
import { runQueueWorker } from './_queue-worker';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const summary = await runQueueWorker();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, summary }),
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
