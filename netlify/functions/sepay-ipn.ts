import type { Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';
import { extractSePayOrderCode, extractSePayPaidAmount, getSePayEnv, normalizeSePayOrderStatus } from './_sepay';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Key',
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
      body: JSON.stringify({ success: true, message: 'SePay IPN endpoint is ready' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const secretKeyHeader = event.headers['x-secret-key'] || event.headers['X-Secret-Key'] || '';
    const { secretKey } = getSePayEnv();

    if (secretKeyHeader !== secretKey) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const payload = JSON.parse(event.body || '{}');
    const orderCode = extractSePayOrderCode(payload);

    if (!orderCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing order_invoice_number' }),
      };
    }

    const admin = getServiceRoleClient();
    const providerOrderCode = Number(orderCode);
    const { data: existingTransaction, error: existingTransactionError } = await admin
      .from('payment_transactions')
      .select('id, status, amount_vnd')
      .or(Number.isFinite(providerOrderCode)
        ? `provider_order_code.eq.${providerOrderCode},order_code.eq.${orderCode}`
        : `order_code.eq.${orderCode}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTransactionError) {
      throw existingTransactionError;
    }

    if (!existingTransaction) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, ignored: true, reason: 'Unknown orderCode', orderCode }),
      };
    }

    const notificationType = String(payload?.notification_type || '').toUpperCase();
    const orderStatus = normalizeSePayOrderStatus(payload?.order || payload);
    const transactionStatus = normalizeSePayOrderStatus(payload?.transaction || payload);
    const providerStatus =
      notificationType === 'ORDER_PAID'
        ? 'PAID'
        : notificationType === 'TRANSACTION_VOID'
          ? 'CANCELLED'
          : orderStatus === 'PAID' || transactionStatus === 'PAID'
            ? 'PAID'
            : orderStatus;

    const paidAmount = extractSePayPaidAmount(payload);
    if (providerStatus === 'PAID' && paidAmount != null && paidAmount !== Number(existingTransaction.amount_vnd)) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: 'Amount mismatch',
          orderCode,
          expected: Number(existingTransaction.amount_vnd),
          received: paidAmount,
        }),
      };
    }

    const providerPayload = {
      gateway: 'sepay',
      ...payload,
    };
    const rpcArgs = {
      p_provider_status: providerStatus,
      p_provider_payload: providerPayload,
    };
    const { data, error } = Number.isFinite(providerOrderCode)
      ? await admin.rpc('settle_payment_transaction_by_order_code', {
          p_provider_order_code: providerOrderCode,
          ...rpcArgs,
        })
      : await admin.rpc('settle_payment_transaction_by_id', {
          p_transaction_id: existingTransaction.id,
          ...rpcArgs,
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
    console.error('[sepay-ipn] Failed to process IPN:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
