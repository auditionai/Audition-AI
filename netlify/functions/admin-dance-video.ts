import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAdminUser } from './_supabase';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const statuses = new Set(['pending', 'accepted', 'processing', 'completed']);

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  try {
    await requireAdminUser(event);
    const admin = getServiceRoleClient();
    if (event.httpMethod === 'GET') {
      const [templates, jobs] = await Promise.all([
        admin.from('dance_video_templates').select('*').order('display_order').order('created_at', { ascending: false }),
        admin.from('dance_video_jobs').select('*, dance_video_templates(id,title,preview_video_url,price_vcoin,category,description,required_image_count), users(display_name,email)').order('created_at', { ascending: false }).limit(300),
      ]);
      if (templates.error) throw templates.error;
      if (jobs.error) throw jobs.error;
      return { statusCode: 200, headers, body: JSON.stringify({ templates: templates.data || [], jobs: jobs.data || [] }) };
    }
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    const body = JSON.parse(event.body || '{}');
    if (body.action === 'save-template') {
      const payload = {
        title: String(body.template?.title || '').slice(0, 160), description: String(body.template?.description || '').slice(0, 1000), category: String(body.template?.category || 'Dance AI').slice(0, 80),
        preview_video_url: String(body.template?.preview_video_url || ''),
        price_vcoin: Math.max(1, Number(body.template?.price_vcoin) || 0), required_image_count: Math.min(8, Math.max(1, Number(body.template?.required_image_count) || 1)),
        is_active: body.template?.is_active !== false, display_order: Number(body.template?.display_order) || 0, updated_at: new Date().toISOString(),
      };
      if (!payload.title || !payload.preview_video_url) throw new Error('Thiếu tên hoặc video mẫu.');
      const result = body.template?.id ? await admin.from('dance_video_templates').update(payload).eq('id', body.template.id).select().single() : await admin.from('dance_video_templates').insert(payload).select().single();
      if (result.error) throw result.error;
      return { statusCode: 200, headers, body: JSON.stringify({ template: result.data }) };
    }
    if (body.action === 'delete-template') {
      const { error } = await admin.from('dance_video_templates').delete().eq('id', String(body.id || ''));
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (body.action === 'delete-job') {
      const id = String(body.id || '');
      if (!id) throw new Error('Thiếu ID đơn hàng cần xóa.');
      await admin.from('generated_images').delete().eq('id', id);
      const { error } = await admin.from('dance_video_jobs').delete().eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (body.action === 'update-job') {
      const status = String(body.status || ''); if (!statuses.has(status)) throw new Error('Trạng thái không hợp lệ.');
      const now = new Date().toISOString();
      const jobPatch: Record<string, unknown> = { status, admin_note: String(body.adminNote || '').slice(0, 1000) || null, updated_at: now };
      if (status === 'accepted') jobPatch.accepted_at = now;
      if (status === 'completed') { jobPatch.completed_at = now; jobPatch.result_video_url = String(body.resultVideoUrl || ''); }
      const { data: job, error } = await admin.from('dance_video_jobs').update(jobPatch).eq('id', String(body.id || '')).select().single();
      if (error) throw error;
      const generatedPatch: Record<string, unknown> = { updated_at: now, progress: status === 'completed' ? 100 : status === 'processing' ? 55 : status === 'accepted' ? 20 : 0, status: status === 'completed' ? 'completed' : status === 'processing' ? 'processing' : 'queued', queue_payload: { __showInGenerationHistory: true, danceJobStatus: status } };
      if (status === 'completed') generatedPatch.image_url = String(body.resultVideoUrl || '');
      await admin.from('generated_images').update(generatedPatch).eq('id', job.id);
      return { statusCode: 200, headers, body: JSON.stringify({ job }) };
    }
    throw new Error('Unsupported action');
  } catch (error: any) {
    const message = error?.message || 'Lỗi quản trị Dance AI.';
    return { statusCode: message === 'Forbidden' ? 403 : 400, headers, body: JSON.stringify({ error: message }) };
  }
};
