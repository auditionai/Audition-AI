import type { Handler } from '@netlify/functions';
import { verifyInternalRequest } from './_internal-request-auth';
import { generateVideoScriptForRequest, type VideoScriptRequestBody } from './video-script-director';
import { getServiceRoleClient } from './_supabase';

const readJobId = (body: string) => String((JSON.parse(body || '{}') as { jobId?: string }).jobId || '').trim();

export const handler: Handler = async (event) => {
  const body = event.body || '';
  if (event.httpMethod !== 'POST' || !verifyInternalRequest('video-script-worker-background', body, (name) => event.headers[name] || event.headers[name.toLowerCase()] || '')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized internal request' }) };
  }
  const jobId = readJobId(body);
  if (!jobId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing jobId' }) };
  const admin = getServiceRoleClient();
  await admin.from('video_script_jobs').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', jobId).eq('status', 'queued');
  try {
    const { data: job, error } = await admin.from('video_script_jobs').select('request_payload').eq('id', jobId).maybeSingle();
    if (error || !job) throw error || new Error('VIDEO_SCRIPT_JOB_NOT_FOUND');
    const script = await generateVideoScriptForRequest(job.request_payload as VideoScriptRequestBody);
    await admin.from('video_script_jobs').update({ status: 'completed', script, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', jobId);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error: any) {
    await admin.from('video_script_jobs').update({ status: 'failed', error_message: String(error?.message || error), updated_at: new Date().toISOString() }).eq('id', jobId);
    return { statusCode: 200, body: JSON.stringify({ success: false }) };
  }
};
