import type { Handler } from '@netlify/functions';
import { triggerBackgroundQueueWorker } from './_queue-launcher';
import { areQueueWorkersDisabled, isDedicatedQueueWorkerMode } from './_queue-runtime-mode';
import { runQueueDaemon } from './_queue-daemon';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (areQueueWorkersDisabled()) {
    return {
      statusCode: 202,
      headers,
      body: JSON.stringify({ success: true, accepted: false, skipped: true, reason: 'queue_workers_disabled' }),
    };
  }

  if (isDedicatedQueueWorkerMode()) {
    const summary = await runQueueDaemon({
      lane: 'dispatch',
      maxRuntimeMs: 20_000,
      idleIterationsToStop: 2,
      activeDelayMs: 50,
      idleDelayMs: 250,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accepted: true,
        background: false,
        reason: 'dedicated_worker_inline_dispatch',
        summary,
      }),
    };
  }

  try {
    await triggerBackgroundQueueWorker(event.rawUrl);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, accepted: true, background: true }),
    };
  } catch (error: any) {
    const message = error?.message || 'Internal Server Error';
    if (
      message.includes('Missing SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Missing SUPABASE_URL')
    ) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, disabled: true, error: message }),
      };
    }
    console.error('[queue-tick] Worker failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: message }),
    };
  }
};
