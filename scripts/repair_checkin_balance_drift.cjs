const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(filePath) {
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getSupabaseAdmin() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing .env.local');
  }

  const env = loadEnv(envPath);
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service-role credentials in .env.local');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = getSupabaseAdmin();

  const [
    { data: users, error: usersError },
    { data: checkins, error: checkinsError },
    { data: milestones, error: milestonesError },
    { data: logs, error: logsError },
  ] = await Promise.all([
    supabase.from('users').select('id,email,display_name,vcoin_balance').order('created_at', { ascending: true }),
    supabase.from('daily_check_ins').select('id,user_id,check_in_date,created_at').order('created_at', { ascending: true }),
    supabase.from('milestone_claims').select('id,user_id,day_milestone,reward_amount,claim_month,created_at').order('created_at', { ascending: true }),
    supabase
      .from('vcoin_transactions')
      .select('id,user_id,amount,type,description,reference_type,reference_id,metadata,created_at')
      .order('created_at', { ascending: true }),
  ]);

  if (usersError || checkinsError || milestonesError || logsError) {
    throw usersError || checkinsError || milestonesError || logsError;
  }

  const usersById = new Map((users || []).map((user) => [user.id, user]));
  const usersWithCheckinHistory = new Set();
  const ledgerByUser = new Map();

  for (const row of checkins || []) usersWithCheckinHistory.add(row.user_id);
  for (const row of milestones || []) usersWithCheckinHistory.add(row.user_id);

  for (const log of logs || []) {
    ledgerByUser.set(
      log.user_id,
      Number(ledgerByUser.get(log.user_id) || 0) + Number(log.amount || 0),
    );
  }

  const repairs = [];
  const balanceAheadOfLedger = [];
  for (const userId of usersWithCheckinHistory) {
    const user = usersById.get(userId);
    if (!user) continue;

    const currentBalance = Number(user.vcoin_balance || 0);
    const ledgerBalance = Number(ledgerByUser.get(userId) || 0);
    const delta = ledgerBalance - currentBalance;

    if (delta > 0.0001) {
      repairs.push({
        userId,
        email: user.email,
        name: user.display_name,
        currentBalance,
        ledgerBalance,
        delta,
      });
    } else if (delta < -0.0001) {
      balanceAheadOfLedger.push({
        userId,
        email: user.email,
        name: user.display_name,
        currentBalance,
        ledgerBalance,
        delta,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        usersWithCheckinHistory: usersWithCheckinHistory.size,
        repairsNeeded: repairs.length,
        totalDelta: repairs.reduce((sum, row) => sum + row.delta, 0),
        balanceAheadOfLedgerCount: balanceAheadOfLedger.length,
        balanceAheadOfLedger,
        repairs,
      },
      null,
      2,
    ),
  );

  if (!apply || repairs.length === 0) {
    return;
  }

  for (const row of repairs) {
    const { error } = await supabase
      .from('users')
      .update({ vcoin_balance: row.ledgerBalance, updated_at: new Date().toISOString() })
      .eq('id', row.userId);

    if (error) {
      throw new Error(`Failed to repair ${row.email || row.userId}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        applied: true,
        repairedUsers: repairs.length,
        totalDelta: repairs.reduce((sum, row) => sum + row.delta, 0),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
