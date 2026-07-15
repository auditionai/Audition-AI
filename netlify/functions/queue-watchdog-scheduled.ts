import type { Config, Handler } from '@netlify/functions';
import { runQueueWatchdog } from './_queue-watchdog';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';

export const config: Config = {
  schedule: '*/15 * * * *',
};

export const handler: Handler = async () => {
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
    console.error('[queue-watchdog-scheduled] failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
