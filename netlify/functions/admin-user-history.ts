import type { Handler } from '@netlify/functions';
import type { HistoryItem } from '../../types';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const ADMIN_LEDGER_FETCH_LIMIT = 5000;

const toNumber = (value: any) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const toObject = (value: any): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const normalizeHistoryDescription = (entry: any, relatedJob?: any): string => {
  const directDescription =
    entry?.description ||
    entry?.reason ||
    entry?.note ||
    entry?.action ||
    entry?.details;

  if (typeof directDescription === 'string' && directDescription.trim()) {
    return directDescription;
  }

  const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  if (relatedJob?.tool_name) {
    return relatedJob.tool_name;
  }

  if (typeof metadata.tool_name === 'string' && metadata.tool_name.trim()) {
    return metadata.tool_name;
  }

  if (typeof metadata.tool_id === 'string' && metadata.tool_id.trim()) {
    return metadata.tool_id;
  }

  if (entry?.reference_type === 'generated_image_charge') {
    return 'Su dung AI';
  }

  if (entry?.reference_type === 'generated_image_refund') {
    return 'Hoan Vcoin';
  }

  return 'Giao dich he thong';
};

const classifyLedgerEntry = (entry: any, relatedJob?: any): HistoryItem['category'] => {
  const type = String(entry?.type || '').toLowerCase();
  const referenceType = String(entry?.reference_type || '').toLowerCase();
  const metadata = toObject(entry?.metadata);
  const queueKind = String(relatedJob?.queue_kind || metadata.queue_kind || '').toLowerCase();
  const assetType = String(relatedJob?.asset_type || metadata.asset_type || '').toLowerCase();
  const toolId = String(relatedJob?.tool_id || metadata.tool_id || '').toLowerCase();
  const description = String(entry?.description || '').toLowerCase();

  if (type === 'topup' || referenceType === 'payment_transaction') return 'topup';
  if (type === 'giftcode' || referenceType.includes('giftcode') || referenceType.includes('gift_code')) return 'giftcode';
  if (referenceType.includes('daily_checkin') || metadata.reward_type === 'daily_checkin' || description.includes('checkin')) return 'checkin';
  if (assetType === 'video' || queueKind.includes('video') || queueKind.includes('motion') || toolId.includes('video') || toolId.includes('motion')) return 'video';
  if (referenceType.includes('generated_image') || assetType === 'image' || queueKind.includes('image')) return 'image';
  return 'other';
};

const normalizeHistoryType = (value: any): HistoryItem['type'] => {
  switch (value) {
    case 'topup':
    case 'usage':
    case 'reward':
    case 'giftcode':
    case 'refund':
    case 'pending_topup':
    case 'admin_adjustment':
      return value;
    default:
      return 'usage';
  }
};

const mapPaymentTransactionToHistoryItem = (tx: any): HistoryItem => ({
  id: tx.id,
  createdAt: tx.created_at,
  description: `Nap Vcoin (${tx.order_code})`,
  vcoinChange: tx.status === 'paid' ? toNumber(tx.vcoin_received) : 0,
  balanceAfter: null,
  amountVnd: toNumber(tx.amount_vnd),
  type: tx.status === 'paid' ? 'topup' : 'pending_topup',
  status: tx.status === 'paid' ? 'success' : tx.status === 'pending' ? 'pending' : 'failed',
  statusLabel: String(tx.status || '').toUpperCase(),
  code: tx.order_code,
  category: 'topup',
  referenceType: 'payment_transaction',
  referenceId: tx.id,
  metadata: tx.provider_payload || null,
});

const mapVcoinTransactionToHistoryItem = (
  log: any,
  balanceAfter: number,
  relatedJob?: any,
  relatedPayment?: any,
): HistoryItem => {
  const metadata = toObject(log.metadata);
  const category = classifyLedgerEntry(log, relatedJob);
  return {
    id: log.id,
    createdAt: log.created_at,
    description: normalizeHistoryDescription(log, relatedJob),
    vcoinChange: toNumber(log.amount),
    balanceAfter,
    amountVnd: relatedPayment ? toNumber(relatedPayment.amount_vnd) : undefined,
    type: normalizeHistoryType(log.type),
    status: 'success',
    statusLabel: 'SUCCESS',
    code: relatedPayment?.order_code || String(metadata.order_code || metadata.gift_code || metadata.check_in_date || '').trim() || undefined,
    category,
    referenceType: log.reference_type || null,
    referenceId: log.reference_id || null,
    toolName: relatedJob?.tool_name || String(metadata.tool_name || '').trim() || null,
    assetType: relatedJob?.asset_type || null,
    queueKind: relatedJob?.queue_kind || null,
    jobStatus: relatedJob?.status || null,
    metadata,
  };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const { user } = await requireAuthenticatedUser(event);
    const targetUserId = event.queryStringParameters?.userId || '';
    if (!targetUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing userId' }),
      };
    }

    const admin = getServiceRoleClient();
    const { data: requester, error: requesterError } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (requesterError) {
      throw requesterError;
    }

    if (!requester?.is_admin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden' }),
      };
    }

    const { data: targetUser, error: targetUserError } = await admin
      .from('users')
      .select('vcoin_balance')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetUserError) {
      throw targetUserError;
    }

    const [txsResult, logsResult, jobsResult] = await Promise.all([
      admin
        .from('payment_transactions')
        .select('id, created_at, updated_at, paid_at, order_code, provider_order_code, provider_payment_link_id, provider_status, provider_payload, payment_method, vcoin_received, amount_vnd, status')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(ADMIN_LEDGER_FETCH_LIMIT),
      admin
        .from('vcoin_transactions')
        .select('id, created_at, amount, type, description, metadata, reference_type, reference_id')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(ADMIN_LEDGER_FETCH_LIMIT),
      admin
        .from('generated_images')
        .select('id, created_at, updated_at, finished_at, status, cost_vcoin, asset_type, queue_kind, tool_id, tool_name, model_used, job_id, error_message')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(ADMIN_LEDGER_FETCH_LIMIT),
    ]);

    if (txsResult.error) {
      throw txsResult.error;
    }

    if (logsResult.error) {
      throw logsResult.error;
    }

    if (jobsResult.error) {
      throw jobsResult.error;
    }

    const paymentById = new Map((txsResult.data || []).map((tx: any) => [String(tx.id), tx]));
    const jobById = new Map((jobsResult.data || []).map((job: any) => [String(job.id), job]));
    const logs = [...(logsResult.data || [])].sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const totalLogAmount = logs.reduce((sum, log: any) => sum + toNumber(log.amount), 0);
    let runningBalance = toNumber(targetUser?.vcoin_balance) - totalLogAmount;

    const ledgerItems = logs.map((log: any) => {
      runningBalance += toNumber(log.amount);
      const relatedJob = log.reference_id ? jobById.get(String(log.reference_id)) : null;
      const relatedPayment = log.reference_id ? paymentById.get(String(log.reference_id)) : null;
      return mapVcoinTransactionToHistoryItem(log, runningBalance, relatedJob, relatedPayment);
    });

    const paidPaymentLogIds = new Set(
      logs
        .filter((log: any) => String(log.reference_type || '') === 'payment_transaction' && log.reference_id)
        .map((log: any) => String(log.reference_id))
    );
    const paymentStatusItems = (txsResult.data || [])
      .filter((tx: any) => String(tx.status || '').toLowerCase() !== 'paid' || !paidPaymentLogIds.has(String(tx.id)))
      .map(mapPaymentTransactionToHistoryItem);

    const history: HistoryItem[] = [
      ...ledgerItems,
      ...paymentStatusItems,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        history,
        summary: {
          currentBalance: toNumber(targetUser?.vcoin_balance),
          ledgerCount: ledgerItems.length,
          paymentCount: txsResult.data?.length || 0,
          generatedAssetCount: jobsResult.data?.length || 0,
        },
      }),
    };
  } catch (error: any) {
    console.error('[admin-user-history] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
    };
  }
};
