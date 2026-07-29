import type { Config, Handler } from '@netlify/functions';
import { runSePayPendingReconcile } from './sepay-reconcile-pending';
import { isDedicatedQueueWorkerMode } from './_queue-runtime-mode';

export const config: Config = {
  schedule: '*/15 * * * *',
};

export const handler: Handler = async () => {
  try {
    if (isDedicatedQueueWorkerMode()) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, skipped: true, reason: 'dedicated_worker_active' }),
      };
    }

    const summary = await runSePayPendingReconcile();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    };
  } catch (error: any) {
    console.error('[sepay-reconcile-pending-scheduled] Failed to reconcile pending SePay transactions:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
