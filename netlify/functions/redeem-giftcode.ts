import { createHash } from 'node:crypto';
import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const normalizeIp = (value?: string | null) => String(value || '').trim();

const getClientIp = (event: Parameters<Handler>[0]) => {
  const direct =
    normalizeIp(event.headers['x-nf-client-connection-ip']) ||
    normalizeIp(event.headers['client-ip']) ||
    normalizeIp(event.headers['cf-connecting-ip']) ||
    normalizeIp(event.headers['x-real-ip']);

  if (direct) return direct;

  const forwardedFor = normalizeIp(event.headers['x-forwarded-for']);
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || '';
  }

  return '';
};

const hashIp = (ip: string) => createHash('sha256').update(ip).digest('hex');

const mapGiftcodeError = (message: string) => {
  if (/GIFT_CODE_ALREADY_USED_BY_IP/i.test(message)) {
    return 'Giftcode đã được sử dụng bởi địa chỉ IP này rồi.';
  }
  if (/GIFT_CODE_ALREADY_USED_BY_USER/i.test(message)) {
    return 'Bạn đã nhập mã này rồi.';
  }
  if (/GIFT_CODE_LIMIT_REACHED/i.test(message)) {
    return 'Mã đã hết lượt sử dụng.';
  }
  if (/GIFT_CODE_EXPIRED/i.test(message)) {
    return 'Mã đã hết hạn.';
  }
  if (/GIFT_CODE_INVALID/i.test(message)) {
    return 'Mã không hợp lệ hoặc đã bị vô hiệu hóa.';
  }
  if (/IP_REQUIRED/i.test(message)) {
    return 'Không xác định được địa chỉ IP để kiểm tra giftcode.';
  }
  if (/GIFTCODE_REQUIRED/i.test(message)) {
    return 'Vui lòng nhập giftcode.';
  }
  if (/USER_REQUIRED/i.test(message)) {
    return 'Không xác định được người dùng.';
  }
  return message || 'Không thể sử dụng giftcode.';
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

  try {
    const { user } = await requireAuthenticatedUser(event);
    const body = JSON.parse(event.body || '{}');
    const code = String(body?.code || '').trim().toUpperCase();
    const ipAddress = getClientIp(event);
    const ipHash = ipAddress ? hashIp(ipAddress) : '';

    const admin = getServiceRoleClient();
    const { data, error } = await admin.rpc('redeem_giftcode', {
      p_user_id: user.id,
      p_code: code,
      p_ip_hash: ipHash,
      p_ip_address: ipAddress || null,
    });

    if (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          reward: 0,
          message: mapGiftcodeError(error.message || 'Không thể sử dụng giftcode.'),
        }),
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const success = Boolean(row?.success);
    return {
      statusCode: success ? 200 : 400,
      headers,
      body: JSON.stringify({
        success,
        reward: Number(row?.reward || 0),
        message: success ? 'Success' : mapGiftcodeError(String(row?.message || 'Không thể sử dụng giftcode.')),
      }),
    };
  } catch (error: any) {
    return {
      statusCode: error?.message === 'Unauthorized' ? 401 : 500,
      headers,
      body: JSON.stringify({
        success: false,
        reward: 0,
        message: error?.message === 'Unauthorized' ? 'Unauthorized' : mapGiftcodeError(error?.message || 'Internal Server Error'),
      }),
    };
  }
};
