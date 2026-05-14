import type { Handler } from '@netlify/functions';
import { runQueueWatchdog } from './_queue-watchdog';

export const config = {
  schedule: '*/1 * * * *',
};

export const handler: Handler = async () => {
  try {
    const summary = await runQueueWatchdog({ runWorkerAfterRescue: true });
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, summary }),
    };
  } catch (error: any) {
    console.error('[queue-watchdog] failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
