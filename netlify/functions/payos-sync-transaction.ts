import type { Handler } from '@netlify/functions';
import { getPayOSEnv } from './_payos';
import { getServiceRoleClient } from './_supabase';
import { extractSePayPaidAmount, normalizeSePayOrderStatus, retrieveSePayOrder } from './_sepay';

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
    const orderCodeText = String(event.queryStringParameters?.orderCode || '').trim();
    const orderCode = Number(orderCodeText);
    if (!orderCodeText) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing orderCode query param' }),
      };
    }

    const admin = getServiceRoleClient();
    const requestedGateway = String(event.queryStringParameters?.gateway || '').trim().toLowerCase();
    const { data: existingTransaction, error: existingTransactionError } = await admin
      .from('payment_transactions')
      .select('id, payment_method, provider_payment_link_id, amount_vnd')
      .or(Number.isFinite(orderCode)
        ? `provider_order_code.eq.${orderCode},order_code.eq.${orderCodeText}`
        : `order_code.eq.${orderCodeText}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTransactionError) {
      throw existingTransactionError;
    }

    if (!existingTransaction) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Transaction not found', orderCode: orderCodeText }),
      };
    }

    const paymentMethod = String(existingTransaction?.payment_method || '').toLowerCase();
    const providerPaymentLinkId = String(existingTransaction?.provider_payment_link_id || '').toLowerCase();
    const shouldUseSePay =
      requestedGateway === 'sepay' ||
      paymentMethod === 'sepay' ||
      providerPaymentLinkId.startsWith('sepay:');

    if (shouldUseSePay) {
      const result = await retrieveSePayOrder(orderCodeText);
      if (!result.ok) {
        return {
          statusCode: result.status || 400,
          headers,
          body: JSON.stringify(result.payload || { error: 'Failed to retrieve SePay order' }),
        };
      }

      const providerStatus = normalizeSePayOrderStatus(result.payload);
      const paidAmount = extractSePayPaidAmount(result.payload);
      if (providerStatus === 'PAID' && paidAmount != null && paidAmount !== Number(existingTransaction?.amount_vnd)) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'Amount mismatch',
            orderCode: orderCodeText,
            expected: Number(existingTransaction?.amount_vnd),
            received: paidAmount,
          }),
        };
      }

      const providerPayload = {
        gateway: 'sepay',
        ...result.payload,
      };
      const rpcArgs = {
        p_provider_status: providerStatus,
        p_provider_payload: providerPayload,
      };
      const { data, error } = Number.isFinite(orderCode)
        ? await admin.rpc('settle_payment_transaction_by_order_code', {
            p_provider_order_code: orderCode,
            ...rpcArgs,
          })
        : await admin.rpc('settle_payment_transaction_by_id', {
            p_transaction_id: existingTransaction?.id,
            ...rpcArgs,
          });

      if (error) {
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, gateway: 'sepay', payment: result.payload?.data || result.payload, transaction: data }),
      };
    }

    if (!Number.isFinite(orderCode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid PayOS orderCode', orderCode: orderCodeText }),
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
