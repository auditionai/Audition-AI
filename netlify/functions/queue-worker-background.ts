import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const summary = await runQueueDaemon();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, summary }),
    };
  } catch (error: any) {
    console.error('[queue-worker-background] failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
