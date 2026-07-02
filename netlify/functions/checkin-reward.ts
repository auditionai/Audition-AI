import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Audition-Device-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RewardRepairWindow = {
  startAt: string;
  endAt?: string;
};

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAILY_REWARD = 5;

const getVietnamDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const [year, month, day] = formatter.format(date).split('-');
  return { year, month, day };
};

const getVietnamTodayStr = () => {
  const { year, month, day } = getVietnamDateParts();
  return `${year}-${month}-${day}`;
};

const getDayBoundaryIso = (dateStr: string, boundary: 'start' | 'end') => {
  const suffix = boundary === 'start' ? 'T00:00:00+07:00' : 'T23:59:59.999+07:00';
  return new Date(`${dateStr}${suffix}`).toISOString();
};

const isDuplicateError = (error: any) =>
  error?.code === '23505' || /duplicate|already exists/i.test(String(error?.message || ''));

const ensureBrowserKeyCheckinAllowed = async (userId: string, browserKeyHash: string) => {
  if (!browserKeyHash) return;

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('user_browser_keys')
    .select('account_index, is_checkin_allowed')
    .eq('browser_key_hash', browserKeyHash)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (/user_browser_keys|schema|relation|table/i.test(error.message || '')) {
      return;
    }
    throw error;
  }

  if (data && (!data.is_checkin_allowed || Number(data.account_index || 0) > 3)) {
    throw new Error('CHECKIN_BROWSER_KEY_LIMIT');
  }
};

const hasRewardLog = async (
  userId: string,
  referenceType: string,
  referenceId: string,
  legacyDescription: string,
  window: RewardRepairWindow,
) => {
  const admin = getServiceRoleClient();

  const { data: byReference, error: refError } = await admin
    .from('vcoin_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reference_type', referenceType)
    .eq('reference_id', referenceId)
    .limit(1);

  if (refError) {
    throw refError;
  }

  if ((byReference || []).length > 0) {
    return true;
  }

  let legacyQuery = admin
    .from('vcoin_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'reward')
    .eq('description', legacyDescription)
    .gte('created_at', window.startAt);

  if (window.endAt) {
    legacyQuery = legacyQuery.lt('created_at', window.endAt);
  }

  const { data: byLegacy, error: legacyError } = await legacyQuery.limit(1);
  if (legacyError) {
    throw legacyError;
  }

  return (byLegacy || []).length > 0;
};

const reconcileBalanceToLedger = async (userId: string) => {
  const admin = getServiceRoleClient();
  const pageSize = 1000;
  let from = 0;
  let ledgerBalance = 0;

  while (true) {
    const { data, error } = await admin
      .from('vcoin_transactions')
      .select('amount')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    ledgerBalance += rows.reduce((sum: number, row: any) => sum + Number(row?.amount || 0), 0);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  const { data: userRow, error: userError } = await admin
    .from('users')
    .select('vcoin_balance')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  const currentBalance = Number(userRow?.vcoin_balance || 0);
  const delta = ledgerBalance - currentBalance;
  const repaired = delta > 0.0001;
  const effectiveBalance = repaired ? ledgerBalance : currentBalance;

  if (repaired) {
    const { error: updateError } = await admin
      .from('users')
      .update({
        vcoin_balance: ledgerBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }
  }

  return {
    balance: effectiveBalance,
    repaired,
  };
};

const applyDailyRewardIfMissing = async ({
  userId,
  today,
  startAt,
  endAt,
}: {
  userId: string;
  today: string;
  startAt: string;
  endAt: string;
}) => {
  const admin = getServiceRoleClient();
  const referenceId = `${userId}:${today}`;
  const reason = 'Daily Checkin';
  const alreadyApplied = await hasRewardLog(
    userId,
    'daily_checkin_reward',
    referenceId,
    reason,
    { startAt, endAt },
  );

  if (alreadyApplied) {
    return false;
  }

  const { data, error } = await admin.rpc('apply_balance_transaction', {
    p_target_user_id: userId,
    p_amount: DAILY_REWARD,
    p_reason: reason,
    p_log_type: 'reward',
    p_reference_type: 'daily_checkin_reward',
    p_reference_id: referenceId,
    p_metadata: {
      reward_type: 'daily_checkin',
      check_in_date: today,
    },
  });

  if (error) {
    throw error;
  }

  return data !== false;
};

const handleDailyCheckin = async (userId: string) => {
  const admin = getServiceRoleClient();
  const today = getVietnamTodayStr();
  const startAt = getDayBoundaryIso(today, 'start');
  const endAt = getDayBoundaryIso(today, 'end');
  let checkinAlreadyExists = false;

  const { error: insertError } = await admin.from('daily_check_ins').insert({
    user_id: userId,
    check_in_date: today,
  });

  if (insertError) {
    if (isDuplicateError(insertError)) {
      checkinAlreadyExists = true;
    } else {
      throw insertError;
    }
  }

  const rewardApplied = await applyDailyRewardIfMissing({
    userId,
    today,
    startAt,
    endAt,
  });
  const reconcileResult = await reconcileBalanceToLedger(userId);

  if (checkinAlreadyExists && !rewardApplied && !reconcileResult.repaired) {
    return {
      success: false,
      reward: 0,
      balance: reconcileResult.balance,
      message: 'Bạn đã điểm danh hôm nay rồi!',
    };
  }

  return {
    success: true,
    reward: rewardApplied || reconcileResult.repaired ? DAILY_REWARD : 0,
    balance: reconcileResult.balance,
    message: checkinAlreadyExists
      ? 'Đã đồng bộ lại phần thưởng điểm danh hôm nay.'
      : undefined,
  };
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
    const { user, browserKeyHash } = await requireAuthenticatedUser(event);
    await ensureBrowserKeyCheckinAllowed(user.id, browserKeyHash);

    const result = await handleDailyCheckin(user.id);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[checkin-reward] failed:', error);
    if (error?.message === 'CHECKIN_BROWSER_KEY_LIMIT') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Tài khoản này đã vượt giới hạn điểm danh trên trình duyệt/thiết bị này.',
        }),
      };
    }

    if (error?.message === 'AccountLocked') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
        }),
      };
    }

    return {
      statusCode: error?.message === 'Unauthorized' ? 401 : 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: error?.message || 'Internal Server Error',
      }),
    };
  }
};
