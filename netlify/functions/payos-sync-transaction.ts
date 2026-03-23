import type { Handler } from '@netlify/functions';
import { getPayOSEnv } from './_payos';
import { getServiceRoleClient } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const orderCode = Number(event.queryStringParameters?.orderCode || '');
    if (!Number.isFinite(orderCode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing orderCode query param' }),
      };
    }

    const { clientId, apiKey } = getPayOSEnv();
    const response = await fetch(`https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`, {
      method: 'GET',
      headers: {
        'x-client-id': clientId,
        'x-api-key': apiKey,
      },
      signal: AbortSignal.timeout(30000),
    });

    const payload = await response.json();
    if (!response.ok || payload?.code !== '00') {
      return {
        statusCode: response.ok ? 400 : response.status,
        headers,
        body: JSON.stringify(payload),
      };
    }

    const providerStatus = String(payload?.data?.status || 'PENDING').toUpperCase();
    const normalizedStatus =
      providerStatus === 'PAID' ? 'PAID' : providerStatus === 'CANCELLED' ? 'CANCELLED' : providerStatus;

    const admin = getServiceRoleClient();
    const { data, error } = await admin.rpc('settle_payment_transaction_by_order_code', {
      p_provider_order_code: orderCode,
      p_provider_status: normalizedStatus,
      p_provider_payload: payload,
    });

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, payment: payload?.data, transaction: data }),
    };
  } catch (error: any) {
    console.error('[payos-sync-transaction] Failed to sync transaction:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
