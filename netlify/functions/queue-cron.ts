import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { refreshAutoDisabledServerAvailability } from './_server-availability';

export const config = {
  schedule: '*/1 * * * *',
};

export const handler: Handler = async () => {
  try {
    if (areQueueWorkersDisabled()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'queue_workers_disabled' }),
      };
    }

    const serverAvailabilityAutoRefresh = await refreshAutoDisabledServerAvailability();
    const dedicatedWorkerMode = isDedicatedQueueWorkerMode();
    const summary = await runQueueDaemon(
      dedicatedWorkerMode
        ? {
            maxRuntimeMs: 20_000,
            idleIterationsToStop: 3,
            activeDelayMs: 50,
            idleDelayMs: 500,
          }
        : {
            maxRuntimeMs: 45_000,
            idleIterationsToStop: 8,
            activeDelayMs: 250,
            idleDelayMs: 1_000,
          },
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        watchdog: dedicatedWorkerMode,
        reason: dedicatedWorkerMode ? 'dedicated_worker_watchdog' : 'scheduled_worker',
        serverAvailabilityAutoRefresh,
        summary,
      }),
    };
  } catch (error: any) {
    console.error('[queue-cron] Worker failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
