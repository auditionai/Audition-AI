import { verifyInternalRequest } from './_internal-request-auth';
import { generateVideoScriptForRequest, type VideoScriptRequestBody } from './video-script-director';
import { getServiceRoleClient } from './_supabase';

const readJobId = (body: string) => String((JSON.parse(body || '{}') as { jobId?: string }).jobId || '').trim();

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

export default async (request: Request) => {
  const body = await request.text();
  if (request.method !== 'POST' || !verifyInternalRequest('video-script-worker-background', body, (name) => request.headers.get(name))) {
    return json({ error: 'Unauthorized internal request' }, 401);
  }
  const jobId = readJobId(body);
  if (!jobId) return json({ error: 'Missing jobId' }, 400);
  const admin = getServiceRoleClient();
  await admin.from('video_script_jobs').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', jobId).eq('status', 'queued');
  try {
    const { data: job, error } = await admin.from('video_script_jobs').select('request_payload').eq('id', jobId).maybeSingle();
    if (error || !job) throw error || new Error('VIDEO_SCRIPT_JOB_NOT_FOUND');
    const script = await generateVideoScriptForRequest(job.request_payload as VideoScriptRequestBody, request.url);
    await admin.from('video_script_jobs').update({ status: 'completed', script, updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq('id', jobId);
    return json({ success: true });
  } catch (error: any) {
    await admin.from('video_script_jobs').update({ status: 'failed', error_message: String(error?.message || error), updated_at: new Date().toISOString() }).eq('id', jobId);
    return json({ success: false });
  }
};
