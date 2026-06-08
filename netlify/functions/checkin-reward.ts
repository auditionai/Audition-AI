import type { Handler } from '@netlify/functions';
import { getServiceRoleClient, requireAuthenticatedUser } from './_supabase';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REWARD_BY_MILESTONE: Record<number, number> = {
  7: 20,
  14: 30,
  30: 50,
};

type RewardRepairWindow = {
  startAt: string;
  endAt?: string;
};

type CheckinBody = {
  action?: 'daily' | 'milestone';
  day?: number;
};

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

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

const shiftDateStr = (dateStr: string, days: number) => {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const calculateConsecutiveStreak = (dates: string[], today: string) => {
  const dateSet = new Set(dates);
  let cursor = dateSet.has(today) ? today : shiftDateStr(today, -1);
  let streak = 0;

  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = shiftDateStr(cursor, -1);
  }

  return {
    streak,
    streakStartedOn: streak > 0 ? shiftDateStr(cursor, 1) : null,
  };
};

const isDuplicateError = (error: any) =>
  error?.code === '23505' || /duplicate|already exists/i.test(String(error?.message || ''));

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

  // Only repair upward when the transaction ledger is ahead of the stored balance.
  // Never overwrite a higher current balance, because admins may have adjusted it
  // directly before a matching ledger entry exists.
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
    delta,
    ledgerBalance,
    currentBalance,
  };
};

const applyRewardIfMissing = async ({
  userId,
  amount,
  reason,
  referenceType,
  referenceId,
  metadata,
  repairWindow,
}: {
  userId: string;
  amount: number;
  reason: string;
  referenceType: string;
  referenceId: string;
  metadata?: Record<string, unknown>;
  repairWindow: RewardRepairWindow;
}) => {
  const admin = getServiceRoleClient();
  const alreadyApplied = await hasRewardLog(userId, referenceType, referenceId, reason, repairWindow);
  if (alreadyApplied) {
    return false;
  }

  const { data, error } = await admin.rpc('apply_balance_transaction', {
    p_target_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_log_type: 'reward',
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_metadata: metadata ?? {},
  });

  if (error) {
    throw error;
  }

  return data !== false;
};

const getCurrentStreak = async (userId: string, today: string) => {
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from('daily_check_ins')
    .select('check_in_date')
    .eq('user_id', userId)
    .lte('check_in_date', today)
    .order('check_in_date', { ascending: false });

  if (error) {
    throw error;
  }

  return calculateConsecutiveStreak(
    (data || []).map((row: any) => String(row.check_in_date)),
    today,
  );
};

const handleDailyCheckin = async (userId: string) => {
  const admin = getServiceRoleClient();
  const today = getVietnamTodayStr();
  const reward = 5;
  const referenceId = `${userId}:${today}`;
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

  const rewardApplied = await applyRewardIfMissing({
    userId,
    amount: reward,
    reason: 'Daily Checkin',
    referenceType: 'daily_checkin_reward',
    referenceId,
    metadata: {
      reward_type: 'daily_checkin',
      check_in_date: today,
    },
    repairWindow: { startAt, endAt },
  });

  const { streak } = await getCurrentStreak(userId, today);
  const reconcileResult = await reconcileBalanceToLedger(userId);

  if (checkinAlreadyExists && !rewardApplied && !reconcileResult.repaired) {
    return {
      success: false,
      reward: 0,
      newStreak: streak,
      balance: reconcileResult.balance,
      message: 'Bạn đã điểm danh hôm nay rồi!',
    };
  }

  return {
    success: true,
    reward: rewardApplied || reconcileResult.repaired ? reward : 0,
    newStreak: streak,
    balance: reconcileResult.balance,
    message: checkinAlreadyExists
      ? 'Đã đồng bộ lại phần thưởng điểm danh hôm nay.'
      : undefined,
  };
};

const handleMilestoneClaim = async (userId: string, day: number) => {
  const admin = getServiceRoleClient();
  const amount = REWARD_BY_MILESTONE[day] || 0;
  const today = getVietnamTodayStr();

  if (amount <= 0) {
    return {
      success: false,
      message: 'Mốc thưởng không hợp lệ.',
    };
  }

  const { streak, streakStartedOn } = await getCurrentStreak(userId, today);
  if (streak < day || !streakStartedOn) {
    return {
      success: false,
      message: `Bạn chưa đủ ${day} ngày điểm danh liên tiếp.`,
    };
  }

  const referenceId = `${userId}:${streakStartedOn}:${day}`;
  let alreadyClaimed = false;

  const { error: insertError } = await admin.from('milestone_claims').insert({
    user_id: userId,
    day_milestone: day,
    reward_amount: amount,
    claim_month: streakStartedOn,
    streak_started_on: streakStartedOn,
  });

  if (insertError) {
    if (isDuplicateError(insertError)) {
      alreadyClaimed = true;
    } else {
      throw insertError;
    }
  }

  const rewardApplied = await applyRewardIfMissing({
    userId,
    amount,
    reason: `Milestone ${day} Days`,
    referenceType: 'milestone_reward',
    referenceId,
    metadata: {
      reward_type: 'milestone',
      streak_started_on: streakStartedOn,
      milestone_day: day,
    },
    repairWindow: {
      startAt: getDayBoundaryIso(streakStartedOn, 'start'),
    },
  });

  const reconcileResult = await reconcileBalanceToLedger(userId);
  if (alreadyClaimed && !rewardApplied && !reconcileResult.repaired) {
    return {
      success: false,
      message: `Bạn đã nhận mốc ${day} ngày của chuỗi hiện tại rồi!`,
      balance: reconcileResult.balance,
    };
  }

  return {
    success: true,
    message: alreadyClaimed
      ? `Đã đồng bộ lại thưởng mốc ${day} ngày cho bạn.`
      : `Nhận thưởng mốc ${day} ngày thành công!`,
    balance: reconcileResult.balance,
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
    const { user } = await requireAuthenticatedUser(event);
    const body = JSON.parse(event.body || '{}') as CheckinBody;

    if (body.action === 'milestone') {
      const day = Number(body.day || 0);
      const result = await handleMilestoneClaim(user.id, day);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result),
      };
    }

    const result = await handleDailyCheckin(user.id);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[checkin-reward] failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: error?.message || 'Internal Server Error',
      }),
    };
  }
};
