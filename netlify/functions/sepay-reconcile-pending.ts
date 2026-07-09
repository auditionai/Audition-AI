import { schedule, type Handler } from '@netlify/functions';
import { getServiceRoleClient } from './_supabase';
import {
  extractSePayPaidAmount,
  extractSePayProviderOrderId,
  extractSePayOrderDescription,
  findSePayBankTransactionForOrder,
  normalizeSePayOrderStatus,
  retrieveSePayOrder,
} from './_sepay';
import { sendTelegramOperationalAlert } from './_telegram-notify';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type SePayPendingReconcileOptions = {
  limit?: number;
  maxRuntimeMs?: number;
};

const DEFAULT_RECONCILE_LIMIT = 25;
const DEFAULT_RECONCILE_MAX_RUNTIME_MS = 45_000;
const MIN_RECONCILE_RUNTIME_LEFT_MS = 3_000;

export const runSePayPendingReconcile = async (options: SePayPendingReconcileOptions = {}) => {
  const startedAt = Date.now();
  const maxRuntimeMs = Number.isFinite(options.maxRuntimeMs)
    ? Math.max(Number(options.maxRuntimeMs), 5_000)
    : DEFAULT_RECONCILE_MAX_RUNTIME_MS;
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(Number(options.limit), 100))
    : DEFAULT_RECONCILE_LIMIT;
  const hasRuntimeBudget = () => Date.now() - startedAt < maxRuntimeMs - MIN_RECONCILE_RUNTIME_LEFT_MS;
  const admin = getServiceRoleClient();
  const staleBefore = new Date(Date.now() - 60_000).toISOString();

  const { data: transactions, error: listError } = await admin
    .from('payment_transactions')
    .select('id, user_id, amount_vnd, order_code, provider_order_code, status, payment_method, provider_payment_link_id, provider_payload, created_at')
    .in('status', ['pending', 'cancelled', 'failed'])
    .or('payment_method.eq.sepay,provider_payment_link_id.like.sepay:%')
    .lte('created_at', staleBefore)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (listError) throw listError;

  const results = [];
  for (const tx of transactions || []) {
    if (!hasRuntimeBudget()) {
      results.push({ success: false, reason: 'runtime_budget_exhausted' });
      break;
    }

    const orderCode = String(tx.provider_order_code || tx.order_code || '').trim();
    if (!orderCode) {
      results.push({ id: tx.id, success: false, reason: 'missing_order_code' });
      continue;
    }

    const lookup = await retrieveSePayOrder(orderCode);
    const providerStatus = lookup.ok ? normalizeSePayOrderStatus(lookup.payload) : 'UNKNOWN';
    const paidAmount = lookup.ok ? extractSePayPaidAmount(lookup.payload) : null;
    const providerOrderId = lookup.ok ? extractSePayProviderOrderId(lookup.payload) : '';
    const orderDescription = lookup.ok ? extractSePayOrderDescription(lookup.payload) : '';
    const storedPayload = tx.provider_payload && typeof tx.provider_payload === 'object'
      ? tx.provider_payload as Record<string, unknown>
      : {};
    const storedDescription = String(storedPayload.sepay_order_description || '').trim();
    const references = [
      orderCode,
      providerOrderId,
      orderDescription,
      storedDescription,
      String(tx.provider_payment_link_id || '').replace(/^sepay:/i, ''),
    ].filter(Boolean);
    let providerPayload: Record<string, unknown> | null = null;

    if (providerOrderId && tx.provider_payment_link_id !== `sepay:${providerOrderId}`) {
      const { error: metaError } = await admin
        .from('payment_transactions')
        .update({
          provider_payment_link_id: `sepay:${providerOrderId}`,
          provider_payload: {
            ...storedPayload,
            sepay_order_id: providerOrderId,
            sepay_order_description: orderDescription || null,
            sepay_order_seen_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);
      if (metaError) {
        console.warn('[sepay-reconcile-pending] Failed to persist SePay order id:', tx.id, metaError);
      }
    }

    if (providerStatus === 'PAID') {
      if (paidAmount != null && paidAmount !== Number(tx.amount_vnd)) {
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

      providerPayload = {
        gateway: 'sepay',
        source: 'order_detail_api',
        reconciled: true,
        reconciled_at: new Date().toISOString(),
        sepay_order_id: providerOrderId || null,
        ...lookup.payload,
      };
    }

    if (!providerPayload) {
      if (!hasRuntimeBudget()) {
        results.push({ id: tx.id, orderCode, providerOrderId, success: false, reason: 'runtime_budget_exhausted' });
        break;
      }

      const bankLookup = await findSePayBankTransactionForOrder({
        orderCode,
        amount: Number(tx.amount_vnd),
        createdAt: tx.created_at,
        references,
        maxQueries: 3,
        allowUniqueAmountFallback: false,
      });

      if (!bankLookup.ok) {
        results.push({
          id: tx.id,
          orderCode,
          success: false,
          reason: 'bank_transaction_lookup_failed',
          status: bankLookup.status,
        });
        continue;
      }

      if (!bankLookup.transaction) {
        results.push({
          id: tx.id,
          orderCode,
          providerOrderId,
          success: true,
          providerStatus,
          settled: false,
          reason: 'no_matching_bank_transaction_yet',
        });
        continue;
      }

      providerPayload = {
        gateway: 'sepay',
        source: 'transaction_api',
        reconciled: true,
        reconciled_at: new Date().toISOString(),
        sepay_order_id: providerOrderId || null,
        matched_references: references,
        bank_transaction: bankLookup.transaction,
      };
    }

    const { data, error } = await admin.rpc('settle_payment_transaction_by_id', {
      p_transaction_id: tx.id,
      p_provider_status: 'PAID',
      p_provider_payload: providerPayload,
    });

    if (error) {
      results.push({ id: tx.id, orderCode, success: false, reason: error.message });
      continue;
    }

    const giftcodeApplyResult = await admin.rpc('mark_topup_giftcode_applied', {
      p_transaction_id: tx.id,
    });
    if (giftcodeApplyResult.error && !/function|schema|topup_gift_code/i.test(giftcodeApplyResult.error.message || '')) {
      results.push({ id: tx.id, orderCode, success: false, reason: giftcodeApplyResult.error.message });
      continue;
    }

    results.push({ id: tx.id, orderCode, providerOrderId, success: true, providerStatus: 'PAID', data });
  }

  const pendingOlderThanFiveMinutes = (transactions || []).filter((tx: any) => {
    const createdAt = new Date(String(tx.created_at || '')).getTime();
    return String(tx.status || '').toLowerCase() === 'pending' && createdAt > 0 && Date.now() - createdAt > 5 * 60_000;
  }).length;
  const settled = results.filter((item) => item.success && item.providerStatus === 'PAID').length;
  const budgetExhausted = results.some((item) => item.reason === 'runtime_budget_exhausted');
  const failed = results.filter((item) => !item.success && item.reason !== 'runtime_budget_exhausted').length;
  const failedReasonCounts = results
    .filter((item) => !item.success && item.reason !== 'runtime_budget_exhausted')
    .reduce((acc, item: any) => {
      const reason = String(item.reason || 'unknown');
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  const criticalFailureCount = results.filter((item: any) => {
    if (item.success) return false;
    const reason = String(item.reason || '');
    return ![
      'bank_transaction_lookup_failed',
      'runtime_budget_exhausted',
    ].includes(reason);
  }).length;

  if (pendingOlderThanFiveMinutes > 0 || failed > 0 || criticalFailureCount > 0) {
    await sendTelegramOperationalAlert(
      'SePay reconcile can chu y',
      {
        checked: transactions?.length || 0,
        settled,
        failed,
        failedReasonCounts,
        budgetExhausted,
        criticalFailureCount,
        pendingOlderThanFiveMinutes,
      },
      {
        alertKey: 'sepay_reconcile:attention',
        cooldownMs: criticalFailureCount > 0 || pendingOlderThanFiveMinutes > 0 ? 30 * 60 * 1000 : 60 * 60 * 1000,
        severity: criticalFailureCount > 0 || pendingOlderThanFiveMinutes > 0 ? 'error' : 'warning',
      },
    );
  }

  return {
    success: true,
    checked: transactions?.length || 0,
    settled,
    failed,
    failedReasonCounts,
    criticalFailureCount,
    runtimeMs: Date.now() - startedAt,
    budgetExhausted,
    results,
  };
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
    const summary = await runSePayPendingReconcile();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(summary),
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

export const handler = schedule('* * * * *', reconcilePendingSePay);
