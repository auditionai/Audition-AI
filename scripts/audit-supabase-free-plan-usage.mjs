import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const start = process.argv[2] || '2026-09-23';
const end = process.argv[3] || new Date().toISOString().slice(0, 10);
const tables = [
  ['app_visits', 'created_at'],
  ['vcoin_transactions', 'created_at'],
  ['daily_check_ins', 'created_at'],
  ['prompt_library_sample_uses', 'used_at'],
  ['generated_images', 'created_at'],
  ['generated_images_size_log', 'checked_at'],
  ['generation_terminal_events', 'created_at'],
  ['cloudflare_upload_tokens', 'created_at'],
  ['video_script_jobs', 'created_at'],
];

const dayRange = (from, to) => {
  const days = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const last = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= last) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    days.push([cursor.toISOString().slice(0, 10), next.toISOString()]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

const countRows = async (table, timestampColumn, day, next) => {
  const { count, error } = await supabase
    .from(table)
    .select(timestampColumn, { count: 'exact', head: true })
    .gte(timestampColumn, `${day}T00:00:00.000Z`)
    .lt(timestampColumn, next);
  if (error) return { count: null, error: error.message };
  return { count: Number(count || 0), error: null };
};

const payloadBytes = async () => {
  const { data, error } = await supabase
    .from('generated_images')
    .select('id, created_at, updated_at, status, queue_payload')
    .gte('created_at', `${start}T00:00:00.000Z`)
    .lte('created_at', `${end}T23:59:59.999Z`)
    .limit(5000);
  if (error) return { error: error.message };

  const rows = data || [];
  const bytes = rows.reduce((total, row) => total + Buffer.byteLength(JSON.stringify(row.queue_payload || {})), 0);
  return {
    rows: rows.length,
    queuePayloadBytes: bytes,
    averageQueuePayloadBytes: rows.length ? Math.round(bytes / rows.length) : 0,
    terminal: rows.filter((row) => ['completed', 'failed', 'cancelled'].includes(row.status)).length,
  };
};

const results = {};
for (const [day, next] of dayRange(start, end)) {
  results[day] = {};
  const counts = await Promise.all(tables.map(async ([table, timestampColumn]) => [table, await countRows(table, timestampColumn, day, next)]));
  for (const [table, result] of counts) results[day][table] = result;
}

const totals = Object.fromEntries(tables.map(([table]) => [
  table,
  Object.values(results).reduce((sum, day) => sum + Number(day[table]?.count || 0), 0),
]));

console.log(JSON.stringify({
  range: { start, end },
  dailyRows: results,
  totals,
  generatedImagePayload: await payloadBytes(),
  notes: [
    'This is a database-write audit, not Supabase Log Explorer byte accounting.',
    'Use it to identify growth sources and verify that the Realtime/full-payload fix remains effective.',
  ],
}, null, 2));
