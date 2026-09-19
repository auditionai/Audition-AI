import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

const apply = process.argv.includes('--apply');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing Supabase configuration');

const supabase = createClient(url, key);
const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
const normalize = (value) => String(value || '').trim().toLowerCase();
const isGptImage = (model) => /^(image-gpt-2|gpt-image-2(?:\.5-(?:flare|sunburst))?)$/.test(normalize(model));
const discounted = (original, discountPercent) => discountPercent > 0
  ? Math.max(1, Math.ceil(original * (100 - discountPercent) / 100))
  : original;

const getAll = async (table, columns, query) => {
  const { data, error } = await query(supabase.from(table).select(columns));
  if (error) throw error;
  return data || [];
};

const transactions = await getAll(
  'vcoin_transactions',
  'id,user_id,amount,description,reference_id,metadata,created_at',
  (q) => q.eq('type', 'usage').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
);
const jobIds = transactions.map((row) => row.reference_id).filter(Boolean);
const jobs = [];
for (let index = 0; index < jobIds.length; index += 100) {
  jobs.push(...await getAll(
    'generated_images',
    'id,queue_payload,cost_vcoin,status',
    (q) => q.in('id', jobIds.slice(index, index + 100)),
  ));
}
const pricing = await getAll('model_pricing', 'model_id,option_id,audition_price_vcoin', (q) => q);
const existingCorrections = await getAll(
  'vcoin_transactions',
  'reference_id',
  (q) => q.eq('reference_type', 'billing_correction_refund').gte('created_at', since).limit(1000),
);
const jobsById = new Map(jobs.map((job) => [job.id, job]));
const pricingByKey = new Map(pricing.map((row) => [`${normalize(row.model_id)}:${normalize(row.option_id)}`, Number(row.audition_price_vcoin)]));
const correctedTransactionIds = new Set(existingCorrections
  .map((row) => String(row.reference_id || '').replace(/^billing-correction:/, ''))
  .filter(Boolean));

const corrections = [];
const unresolved = [];
for (const transaction of transactions) {
  if (correctedTransactionIds.has(transaction.id)) continue;
  const charged = Math.abs(Number(transaction.amount || 0));
  const billing = transaction.metadata?.pricing;
  if (!billing?.model_id || normalize(billing.config_key) !== 'default' || !isGptImage(billing.model_id)) continue;

  const job = jobsById.get(transaction.reference_id);
  const payload = job?.queue_payload?.__recipePayload || job?.queue_payload || {};
  // Two historical rows were deleted from generated_images after enqueue. The
  // affected UI's default was 1K, so preserve that explicit reconstruction in
  // the correction ledger instead of silently excluding a known overcharge.
  const reconstructedResolution = !payload.resolution;
  const resolution = normalize(payload.resolution || '1k');
  const multiplier = Math.max(1, Math.floor(Number(billing.multiplier || 1)));
  const discountPercent = Math.max(0, Math.floor(Number(billing.discount_percent || 0)));
  const optionId = `${resolution}-low-fast`;
  const base = pricingByKey.get(`${normalize(billing.model_id)}:${optionId}`);
  if (!base || base <= 0) {
    unresolved.push({ transactionId: transaction.id, jobId: transaction.reference_id, reason: `No price row for ${billing.model_id}/${optionId}` });
    continue;
  }

  const correctCost = discounted(Math.ceil(base * multiplier), discountPercent);
  if (charged <= correctCost) continue;
  corrections.push({ transaction, job, charged, correctCost, refund: charged - correctCost, optionId, base, multiplier, discountPercent, reconstructedResolution });
}

const summary = corrections.reduce((result, item) => {
  result.count += 1;
  result.refund += item.refund;
  result.byTool[item.transaction.description] = (result.byTool[item.transaction.description] || 0) + item.refund;
  return result;
}, { count: 0, refund: 0, byTool: {} });
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', since, summary, unresolved, corrections: corrections.map((item) => ({
  transactionId: item.transaction.id, jobId: item.transaction.reference_id, userId: item.transaction.user_id,
  charged: item.charged, correctCost: item.correctCost, refund: item.refund, optionId: item.optionId,
  reconstructedResolution: item.reconstructedResolution,
})) }, null, 2));

if (!apply) process.exit(0);

for (const item of corrections) {
  const referenceId = `billing-correction:${item.transaction.id}`;
  const { data: applied, error: refundError } = await supabase.rpc('apply_balance_transaction', {
    p_target_user_id: item.transaction.user_id,
    p_amount: item.refund,
    p_reason: `Billing correction: ${item.transaction.description}`,
    p_log_type: 'refund',
    p_reference_type: 'billing_correction_refund',
    p_reference_id: referenceId,
    p_metadata: {
      original_transaction_id: item.transaction.id,
      generated_image_id: item.transaction.reference_id,
      charged_vcoin: item.charged,
      corrected_vcoin: item.correctCost,
      refunded_vcoin: item.refund,
      corrected_config_key: item.optionId,
      reconstructed_resolution: item.reconstructedResolution || false,
      reason: 'Corrected GPT Image pricing fallback to default',
    },
  });
  if (refundError) throw refundError;
  if (applied && item.job) {
    const { error: jobError } = await supabase.from('generated_images')
      .update({ cost_vcoin: item.correctCost, updated_at: new Date().toISOString() })
      .eq('id', item.job.id);
    if (jobError) throw jobError;
  }
}
