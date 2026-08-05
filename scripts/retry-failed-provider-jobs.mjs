import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { retryFailedQueueJob } from '../netlify/functions/admin-retry-queue-job.ts';

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const providerArg = process.argv.find((arg) => arg.startsWith('--provider='))?.split('=')[1] || 'tst';
const sinceArg = process.argv.find((arg) => arg.startsWith('--since='))?.slice('--since='.length) || '';
const provider = providerArg === 'gommo' ? 'gommo' : 'tst';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase service-role environment variables.');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let query = admin
  .from('generated_images')
  .select('id, status, queue_kind, asset_type, cost_vcoin, provider, error_message, created_at, queue_payload')
  .eq('status', 'failed')
  .in('queue_kind', ['image_generate', 'video_generate', 'motion_generate'])
  .order('created_at', { ascending: true });

if (sinceArg) query = query.gte('created_at', new Date(sinceArg).toISOString());
const { data, error } = await query;
if (error) throw error;

const isRetryableProviderServiceFailure = (row) => {
  const message = String(row.error_message || '').toLowerCase();
  const payload = row.queue_payload && typeof row.queue_payload === 'object' ? row.queue_payload : {};
  const sourceProvider = String(row.provider || payload.__targetProvider || '').toLowerCase();
  const serviceFailure =
    message.includes('#hig01') ||
    message.includes('gói dịch vụ không khả dụng') ||
    message.includes('goi dich vu khong kha dung');
  const unsafeOrPermanent = /(policy|chính sách|nsfw|invalid|required|thiếu|không hợp lệ|manual|manually|ambiguous|duplicate protection)/i.test(message);
  return sourceProvider === 'gommo' && serviceFailure && !unsafeOrPermanent;
};

const candidates = (data || []).filter(isRetryableProviderServiceFailure);
const result = {
  mode: execute ? 'execute' : 'dry-run',
  provider,
  since: sinceArg || null,
  scanned: data?.length || 0,
  eligible: candidates.length,
  succeeded: [],
  failed: [],
};

if (execute) {
  for (const row of candidates) {
    try {
      const retried = await retryFailedQueueJob({
        jobId: row.id,
        provider,
        requestedBy: 'system:bulk-provider-retry',
      });
      result.succeeded.push(retried);
    } catch (retryError) {
      result.failed.push({
        sourceJobId: row.id,
        error: retryError instanceof Error
          ? retryError.message
          : retryError && typeof retryError === 'object'
            ? JSON.stringify(retryError)
            : String(retryError),
      });
    }
  }
}

console.log(JSON.stringify(result, null, 2));
