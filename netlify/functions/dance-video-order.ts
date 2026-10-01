import type { Handler } from '@netlify/functions';
import { getAuthenticatedRequestErrorStatus, getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  try {
    const { user } = await requireAuthenticatedUser(event, { bindBrowserKey: true });
    const body = JSON.parse(event.body || '{}');
    const templateId = String(body.templateId || '');
    const imageUrls = Array.isArray(body.characterImageUrls) ? body.characterImageUrls.filter((url) => typeof url === 'string' && url.length < 2048) : [];
    if (!templateId || imageUrls.length === 0) throw new Error('INVALID_ORDER_DATA');
    const admin = getServiceRoleClient();
    const { data, error } = await admin.rpc('create_dance_video_order', {
      p_user_id: user.id, p_template_id: templateId, p_character_image_urls: imageUrls,
      p_customer_name: String(body.customerName || '').slice(0, 120) || null,
      p_contact_zalo: String(body.contactZalo || '').slice(0, 120) || null,
      p_note: String(body.note || '').slice(0, 1000) || null,
    });
    if (error) throw error;
    return { statusCode: 201, headers, body: JSON.stringify({ id: data }) };
  } catch (error: any) {
    const message = error?.message || 'Không thể tạo đơn đặt video.';
    const statusCode = /INSUFFICIENT_VCOIN/.test(message) ? 400 : getAuthenticatedRequestErrorStatus(error, 400);
    return { statusCode, headers, body: JSON.stringify({ error: message }) };
  }
};
