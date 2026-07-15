import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { refreshAutoDisabledServerAvailability } from './_server-availability';

export const config = {
  schedule: '*/5 * * * *',
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
            maxRuntimeMs: 8_000,
            idleIterationsToStop: 1,
            activeDelayMs: 50,
            idleDelayMs: 100,
          }
        : {
            maxRuntimeMs: 12_000,
            idleIterationsToStop: 2,
            activeDelayMs: 250,
            idleDelayMs: 500,
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
