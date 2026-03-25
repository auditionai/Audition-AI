import type { Handler } from '@netlify/functions';
import type { HistoryItem } from '../../types';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const ADMIN_HISTORY_FETCH_LIMIT = 200;

const normalizeHistoryDescription = (entry: any): string => {
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
  vcoinChange: Number(tx.vcoin_received || 0),
  amountVnd: Number(tx.amount_vnd || 0),
  type: tx.status === 'paid' ? 'topup' : 'pending_topup',
  status: tx.status === 'paid' ? 'success' : tx.status === 'pending' ? 'pending' : 'failed',
  code: tx.order_code,
});

const mapVcoinTransactionToHistoryItem = (log: any): HistoryItem => ({
  id: log.id,
  createdAt: log.created_at,
  description: normalizeHistoryDescription(log),
  vcoinChange: Number(log.amount || 0),
  type: normalizeHistoryType(log.type),
  status: 'success',
});

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

    const [txsResult, logsResult] = await Promise.all([
      admin
        .from('payment_transactions')
        .select('id, created_at, order_code, vcoin_received, amount_vnd, status')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(ADMIN_HISTORY_FETCH_LIMIT),
      admin
        .from('vcoin_transactions')
        .select('id, created_at, amount, type, description, metadata, reference_type')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(ADMIN_HISTORY_FETCH_LIMIT),
    ]);

    if (txsResult.error) {
      throw txsResult.error;
    }

    if (logsResult.error) {
      throw logsResult.error;
    }

    const history: HistoryItem[] = [
      ...(txsResult.data || []).map(mapPaymentTransactionToHistoryItem),
      ...(logsResult.data || []).map(mapVcoinTransactionToHistoryItem),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ history }),
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
