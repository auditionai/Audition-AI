import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { refreshAutoDisabledServerAvailability } from './_server-availability';

export const config = {
  schedule: '*/1 * * * *',
};

export const handler: Handler = async () => {
  try {
    const serverAvailabilityAutoRefresh = await refreshAutoDisabledServerAvailability();
    const summary = await runQueueDaemon({ maxRuntimeMs: 50_000, idleIterationsToStop: 15 });
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, serverAvailabilityAutoRefresh, summary }),
    };
  } catch (error: any) {
    console.error('[queue-cron] Worker failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
