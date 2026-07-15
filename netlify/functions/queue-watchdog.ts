import type { Handler } from '@netlify/functions';
import { runQueueWatchdog } from './_queue-watchdog';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';

export const config = {
  schedule: '*/15 * * * *',
};

export const handler: Handler = async (event) => {
  const expectedSecret = process.env.CRON_SECRET || '';
  const providedSecret = event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'] || '';
  const isScheduled = event.headers['x-nf-event'] === 'schedule';
  if (!isScheduled && (!expectedSecret || providedSecret !== expectedSecret)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    if (areQueueWorkersDisabled() || isDedicatedQueueWorkerMode()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'dedicated_or_disabled_worker' }),
      };
    }

    const summary = await runQueueWatchdog({ runWorkerAfterRescue: false });
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
