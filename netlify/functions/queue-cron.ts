import type { Handler } from '@netlify/functions';
import { runQueueWorker } from './_queue-worker';

export const config = {
  schedule: '*/1 * * * *',
};

export const handler: Handler = async () => {
  try {
    const summary = await runQueueWorker();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, summary }),
    };
  } catch (error: any) {
    console.error('[queue-cron] Worker failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
