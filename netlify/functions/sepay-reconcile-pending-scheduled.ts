import type { Config, Handler } from '@netlify/functions';
import { runSePayPendingReconcile } from './sepay-reconcile-pending';

export const config: Config = {
  schedule: '*/15 * * * *',
};

export const handler: Handler = async () => {
  try {
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
