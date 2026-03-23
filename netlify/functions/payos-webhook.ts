import type { Handler } from '@netlify/functions';
import { getPayOSEnv, verifyPayOSWebhook } from './_payos';
import { getServiceRoleClient } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'PayOS webhook endpoint is ready' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const rawBody = typeof event.body === 'string' ? event.body.trim() : '';
    let payload: any = {};

    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        // PayOS dashboard can probe webhook URLs with non-JSON payloads.
        // Treat those as health checks instead of failing the validation.
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: 'PayOS webhook endpoint is ready' }),
        };
      }
    }

    const hasWebhookData =
      payload &&
      typeof payload === 'object' &&
      payload.data &&
      typeof payload.data === 'object' &&
      Object.keys(payload.data).length > 0;
    const hasOrderCode = Number.isFinite(Number(payload?.data?.orderCode));
    const hasSignature = typeof payload?.signature === 'string' && payload.signature.trim().length > 0;

    // PayOS dashboard may send lightweight POST probes when validating the webhook URL.
    // We should acknowledge the endpoint is alive without trying to settle a payment.
    if (!hasWebhookData && !hasOrderCode && !hasSignature) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'PayOS webhook endpoint is ready' }),
      };
    }

    const { checksumKey } = getPayOSEnv();

    if (!verifyPayOSWebhook(payload, checksumKey)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid webhook signature' }),
      };
    }

    const orderCode = Number(payload?.data?.orderCode);
    if (!Number.isFinite(orderCode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing orderCode in webhook payload' }),
      };
    }

    const isPaid = payload?.success === true && String(payload?.data?.code || payload?.code || '').toUpperCase() === '00';
    const providerStatus = isPaid
      ? 'PAID'
      : String(payload?.data?.desc || payload?.desc || payload?.data?.status || 'FAILED').toUpperCase();

    const admin = getServiceRoleClient();
    const { data, error } = await admin.rpc('settle_payment_transaction_by_order_code', {
      p_provider_order_code: orderCode,
      p_provider_status: providerStatus,
      p_provider_payload: payload,
    });

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data }),
    };
  } catch (error: any) {
    console.error('[payos-webhook] Failed to process webhook:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
