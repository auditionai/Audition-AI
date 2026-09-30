import type { Handler } from '@netlify/functions';
import { getAuthenticatedRequestErrorStatus, getServiceRoleClient, requireAuthenticatedUser } from './_supabase';
import { getTstApiKey } from './_secrets';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const TST_API_KEY = getTstApiKey() || '';
const TST_API_BASE = 'https://api.tramsangtao.com/v1';

const requestProviderCancellation = async (providerJobId?: string | null) => {
  const id = String(providerJobId || '').trim();
  if (!id || !TST_API_KEY) return false;
  try {
    const response = await fetch(`${TST_API_BASE}/jobs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${TST_API_KEY}` }, signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  try {
    const { user } = await requireAuthenticatedUser(event, { checkAccountStatus: true });
    const body = JSON.parse(event.body || '{}');
    const jobId = String(body.jobId || '').trim();
    const action = String(body.action || 'preview');
    if (!jobId || !['preview', 'cancel'].includes(action)) throw new Error('INVALID_CANCEL_REQUEST');
    const admin = getServiceRoleClient();
    const { data: job, error: jobError } = await admin
      .from('generated_images')
      .select('id, status, job_id, tool_id, cost_vcoin')
      .eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new Error('GENERATION_JOB_NOT_FOUND');
    const { data: danceOrder, error: danceError } = await admin
      .from('dance_video_jobs').select('status').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (danceError) throw danceError;
    const cancellable = ['queued', 'processing'].includes(String(job.status || ''));
    if (!cancellable) throw new Error('GENERATION_JOB_NOT_CANCELLABLE');
    const refundEligible = job.status === 'queued' && (!danceOrder || danceOrder.status === 'pending');
    if (action === 'preview') {
      return { statusCode: 200, headers, body: JSON.stringify({ cancellable, refundEligible, amount: refundEligible ? Number(job.cost_vcoin || 0) : 0, state: job.status }) };
    }
    const { data: result, error: cancelError } = await admin.rpc('cancel_user_generated_job', {
      p_user_id: user.id, p_generated_image_id: jobId,
    });
    if (cancelError) throw cancelError;
    const providerCancelRequested = await requestProviderCancellation(result?.provider_job_id);
    return { statusCode: 200, headers, body: JSON.stringify({ ...result, providerCancelRequested }) };
  } catch (error: any) {
    const message = String(error?.message || 'Unable to cancel this job.');
    const notCancellable = message.includes('GENERATION_JOB_NOT_CANCELLABLE');
    return { statusCode: notCancellable ? 409 : getAuthenticatedRequestErrorStatus(error, 400), headers, body: JSON.stringify({ error: notCancellable ? 'Job này không còn có thể hủy.' : message }) };
  }
};
