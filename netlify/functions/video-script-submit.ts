import type { Handler } from '@netlify/functions';
import { createInternalRequestHeaders } from './_internal-request-auth';
import { triggerBackgroundFunction } from './_queue-launcher';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const workerPath = '/.netlify/functions/video-script-worker-background';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  try {
    const { user } = await requireAuthenticatedUser(event);
    const requestPayload = JSON.parse(event.body || '{}');
    const admin = getServiceRoleClient();
    const { data, error } = await admin.from('video_script_jobs').insert({ user_id: user.id, request_payload: requestPayload }).select('id').single();
    if (error || !data?.id) throw error || new Error('VIDEO_SCRIPT_JOB_CREATE_FAILED');
    const body = JSON.stringify({ jobId: data.id });
    const launched = await triggerBackgroundFunction(workerPath, event.rawUrl, 5_000, {
      headers: { 'Content-Type': 'application/json', ...createInternalRequestHeaders('video-script-worker-background', body) },
      body,
    });
    if (!launched) throw new Error('VIDEO_SCRIPT_WORKER_LAUNCH_FAILED');
    return { statusCode: 202, headers, body: JSON.stringify({ jobId: data.id, status: 'queued' }) };
  } catch (error: any) {
    return { statusCode: /Unauthorized/i.test(String(error?.message || '')) ? 401 : 500, headers, body: JSON.stringify({ error: error?.message || 'Failed to queue video script.' }) };
  }
};
