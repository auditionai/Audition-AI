import { schedule, type Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';
import { extractSePayPaidAmount, normalizeSePayOrderStatus, retrieveSePayOrder } from './_sepay';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const reconcilePendingSePay: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const cronSecret = process.env.SEPAY_RECONCILE_SECRET || process.env.CRON_SECRET || '';
  const providedSecret = event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'] || '';
  const isScheduled = event.headers['x-nf-event'] === 'schedule';

  if (!isScheduled && (!cronSecret || providedSecret !== cronSecret)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const admin = getServiceRoleClient();
    const staleBefore = new Date(Date.now() - 60_000).toISOString();

    const { data: transactions, error: listError } = await admin
      .from('payment_transactions')
      .select('id, user_id, amount_vnd, order_code, provider_order_code, status, payment_method, provider_payment_link_id, created_at')
      .eq('status', 'pending')
      .or('payment_method.eq.sepay,provider_payment_link_id.like.sepay:%')
      .lte('created_at', staleBefore)
      .order('created_at', { ascending: true })
      .limit(50);

    if (listError) throw listError;

    const results = [];
    for (const tx of transactions || []) {
      const orderCode = String(tx.provider_order_code || tx.order_code || '').trim();
      if (!orderCode) {
        results.push({ id: tx.id, success: false, reason: 'missing_order_code' });
        continue;
      }

      const lookup = await retrieveSePayOrder(orderCode);
      if (!lookup.ok) {
        results.push({ id: tx.id, orderCode, success: false, reason: 'lookup_failed', status: lookup.status });
        continue;
      }

      const providerStatus = normalizeSePayOrderStatus(lookup.payload);
      const paidAmount = extractSePayPaidAmount(lookup.payload);
      if (providerStatus === 'PAID' && paidAmount != null && paidAmount !== Number(tx.amount_vnd)) {
        results.push({
          id: tx.id,
          orderCode,
          success: false,
          reason: 'amount_mismatch',
          expected: Number(tx.amount_vnd),
          received: paidAmount,
        });
        continue;
      }

      if (providerStatus !== 'PAID') {
        const { data: newerTransaction, error: newerError } = await admin
          .from('payment_transactions')
          .select('id, status, created_at')
          .eq('user_id', tx.user_id)
          .gt('created_at', tx.created_at)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (newerError) {
          results.push({ id: tx.id, orderCode, success: false, reason: newerError.message });
          continue;
        }

        if (newerTransaction) {
          const { error: cancelError } = await admin
            .from('payment_transactions')
            .update({
              status: 'cancelled',
              provider_status: 'SUPERSEDED_BY_NEW_CHECKOUT',
              provider_payload: {
                gateway: 'sepay',
                reconciled: true,
                superseded_by_transaction_id: newerTransaction.id,
                cancelled_at: new Date().toISOString(),
                ...lookup.payload,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', tx.id)
            .eq('status', 'pending');

          if (cancelError) {
            results.push({ id: tx.id, orderCode, success: false, reason: cancelError.message });
            continue;
          }

          results.push({ id: tx.id, orderCode, success: true, providerStatus: 'SUPERSEDED_BY_NEW_CHECKOUT' });
          continue;
        }
      }

      const { data, error } = await admin.rpc('settle_payment_transaction_by_id', {
        p_transaction_id: tx.id,
        p_provider_status: providerStatus,
        p_provider_payload: {
          gateway: 'sepay',
          reconciled: true,
          reconciled_at: new Date().toISOString(),
          ...lookup.payload,
        },
      });

      if (error) {
        results.push({ id: tx.id, orderCode, success: false, reason: error.message });
        continue;
      }

      results.push({ id: tx.id, orderCode, success: true, providerStatus, data });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checked: transactions?.length || 0,
        settled: results.filter((item) => item.success && item.providerStatus === 'PAID').length,
        results,
      }),
    };
  } catch (error: any) {
    console.error('[sepay-reconcile-pending] Failed to reconcile pending SePay transactions:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};

export const handler = schedule('*/5 * * * *', reconcilePendingSePay);
