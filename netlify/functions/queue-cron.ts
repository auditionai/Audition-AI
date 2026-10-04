import type { Handler } from '@netlify/functions';
import { runQueueDaemon } from './_queue-daemon';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { refreshAutoDisabledServerAvailability } from './_server-availability';

// Production uses Cloudflare's scheduled queue worker. Do not register a
// Netlify cron that can only return "skipped" in dedicated mode; preview
// contexts keep their queue coverage.
const usesDedicatedProductionQueue = process.env.CONTEXT === 'production'
  && process.env.QUEUE_WORKER_MODE === 'dedicated';

export const config = usesDedicatedProductionQueue ? {} : {
  schedule: '*/15 * * * *',
};

export const handler: Handler = async () => {
  try {
    if (areQueueWorkersDisabled()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'queue_workers_disabled' }),
      };
    }

    if (isDedicatedQueueWorkerMode()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'dedicated_worker_active' }),
      };
    }

    const serverAvailabilityAutoRefresh = await refreshAutoDisabledServerAvailability();
    const summary = await runQueueDaemon({
      maxRuntimeMs: 12_000,
      idleIterationsToStop: 1,
      activeDelayMs: 250,
      idleDelayMs: 500,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        watchdog: false,
        reason: 'scheduled_worker',
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
