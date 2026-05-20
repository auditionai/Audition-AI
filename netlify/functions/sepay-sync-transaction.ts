import type { Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';
import {
  extractSePayPaidAmount,
  extractSePayProviderOrderId,
  extractSePayOrderDescription,
  findSePayBankTransactionForOrder,
  normalizeSePayOrderStatus,
  retrieveSePayOrder,
} from './_sepay';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const settleFromBankTransaction = async (admin: any, tx: any, bankTransaction: any) => {
  const { data, error } = await admin.rpc('settle_payment_transaction_by_id', {
    p_transaction_id: tx.id,
    p_provider_status: 'PAID',
    p_provider_payload: {
      gateway: 'sepay',
      source: 'transaction_api',
      matched_at: new Date().toISOString(),
      bank_transaction: bankTransaction,
    },
  });

  if (error) throw error;
  return data;
};

const isSettledPaid = (payload: any) => {
  const status = String(payload?.status || payload?.transaction?.status || payload?.payment_status || '').toLowerCase();
  return payload?.settled === true || ['paid', 'success', 'succeeded'].includes(status);
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
    const { data: existingTransaction, error: existingTransactionError } = await admin
      .from('payment_transactions')
      .select('id, payment_method, provider_payment_link_id, provider_payload, amount_vnd, created_at')
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

    const orderLookup = await retrieveSePayOrder(orderCodeText);
    const providerOrderId = orderLookup.ok ? extractSePayProviderOrderId(orderLookup.payload) : '';
    const orderDescription = orderLookup.ok ? extractSePayOrderDescription(orderLookup.payload) : '';
    const storedPayload =
      existingTransaction.provider_payload && typeof existingTransaction.provider_payload === 'object'
        ? existingTransaction.provider_payload as Record<string, unknown>
        : {};
    if (orderLookup.ok) {
      const providerStatus = normalizeSePayOrderStatus(orderLookup.payload);
      const paidAmount = extractSePayPaidAmount(orderLookup.payload);
      if (providerStatus === 'PAID' && paidAmount != null && paidAmount !== Number(existingTransaction.amount_vnd)) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'Amount mismatch',
            orderCode: orderCodeText,
            expected: Number(existingTransaction.amount_vnd),
            received: paidAmount,
          }),
        };
      }

      if (providerStatus === 'PAID') {
        const { data, error } = Number.isFinite(orderCode)
          ? await admin.rpc('settle_payment_transaction_by_order_code', {
              p_provider_order_code: orderCode,
              p_provider_status: providerStatus,
              p_provider_payload: {
                gateway: 'sepay',
                source: 'order_detail_api',
                sepay_order_id: providerOrderId || null,
                ...orderLookup.payload,
              },
            })
          : await admin.rpc('settle_payment_transaction_by_id', {
              p_transaction_id: existingTransaction.id,
              p_provider_status: providerStatus,
              p_provider_payload: {
                gateway: 'sepay',
                source: 'order_detail_api',
                sepay_order_id: providerOrderId || null,
                ...orderLookup.payload,
              },
            });

        if (error) throw error;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            gateway: 'sepay',
            settled: isSettledPaid(data),
            source: 'order_detail_api',
            transaction: data,
          }),
        };
      }
    }

    const bankLookup = await findSePayBankTransactionForOrder({
      orderCode: orderCodeText,
      amount: Number(existingTransaction.amount_vnd),
      createdAt: existingTransaction.created_at,
      references: [
        orderCodeText,
        providerOrderId,
        orderDescription,
        String(storedPayload.sepay_order_description || ''),
        String(existingTransaction.provider_payment_link_id || '').replace(/^sepay:/i, ''),
      ],
      allowUniqueAmountFallback: true,
    });

    if (!bankLookup.ok) {
      return {
        statusCode: bankLookup.status || 400,
        headers,
        body: JSON.stringify(bankLookup.payload || { error: 'Failed to retrieve SePay transactions' }),
      };
    }

    if (!bankLookup.transaction) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          gateway: 'sepay',
          settled: false,
          orderStatus: orderLookup.ok ? normalizeSePayOrderStatus(orderLookup.payload) : 'UNKNOWN',
          reason: 'No matching bank transaction yet',
        }),
      };
    }

    const data = await settleFromBankTransaction(admin, existingTransaction, bankLookup.transaction);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        gateway: 'sepay',
        settled: isSettledPaid(data),
        source: 'transaction_api',
        transaction: data,
      }),
    };
  } catch (error: any) {
    console.error('[sepay-sync-transaction] Failed to sync transaction:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
