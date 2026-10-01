import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAdminUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    await requireAdminUser(event);

    const body = JSON.parse(event.body || '{}');
    const jobId = String(body.jobId || '').trim();
    const customNote = String(body.customNote || '').trim().slice(0, 1000);

    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Thiếu Job ID cần cập nhật ghi chú.' }),
      };
    }

    const admin = getServiceRoleClient();
    const { data: currentJob, error: fetchErr } = await admin
      .from('generated_images')
      .select('id, error_message, queue_payload')
      .eq('id', jobId)
      .single();

    if (fetchErr || !currentJob) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Không tìm thấy job trong hệ thống.' }),
      };
    }

    const currentPayload =
      typeof currentJob.queue_payload === 'object' && currentJob.queue_payload
        ? { ...(currentJob.queue_payload as Record<string, unknown>) }
        : {};

    currentPayload.__adminErrorNote = customNote || null;

    let updatedErrorMessage = currentJob.error_message || null;
    if (customNote) {
      updatedErrorMessage = `[ADMIN]: ${customNote}`;
    } else if (updatedErrorMessage && updatedErrorMessage.startsWith('[ADMIN]:')) {
      updatedErrorMessage = 'Tiến trình đã được cập nhật bởi quản trị viên.';
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from('generated_images')
      .update({
        error_message: updatedErrorMessage,
        queue_payload: currentPayload,
        updated_at: now,
      })
      .eq('id', jobId);

    if (updateErr) {
      throw updateErr;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobId,
        customNote,
        errorMessage: updatedErrorMessage,
      }),
    };
  } catch (error: any) {
    const message = error?.message || 'Lỗi cập nhật ghi chú job.';
    return {
      statusCode: message === 'Forbidden' ? 403 : 400,
      headers,
      body: JSON.stringify({ error: message }),
    };
  }
};
