import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc('audit_queue_resource_hardening');

if (error) {
  console.error('Audit RPC failed:', error.message);
  console.error('Run scripts/supabase_queue_resource_exhaustion_audit_rpc.sql in Supabase SQL Editor first.');
  process.exit(1);
}

const audit = data || {};
const indexes = Array.isArray(audit.indexes) ? audit.indexes : [];
const functions = Array.isArray(audit.claim_functions) ? audit.claim_functions : [];
const generatedPolicies = Array.isArray(audit.generated_images_policies) ? audit.generated_images_policies : [];
const directPolicies = Array.isArray(audit.remaining_direct_auth_policies) ? audit.remaining_direct_auth_policies : [];
const duplicateGroups = Array.isArray(audit.duplicate_permissive_policy_groups) ? audit.duplicate_permissive_policy_groups : [];

const requiredIndexes = [
  'idx_generated_images_queue_dispatch_ready',
  'idx_generated_images_queue_poll_ready',
  'idx_generated_images_queue_stale_predispatch',
  'idx_generated_images_queue_stale_polling',
  'idx_payment_transactions_package_id',
  'idx_generated_images_queue_counts_user_status_asset',
  'idx_generated_images_queue_active_created',
  'idx_generated_images_failed_result_rescue',
];

const indexByName = new Map(indexes.map((index) => [index.name, index]));
const missingIndexes = requiredIndexes.filter((name) => !indexByName.has(name));
const invalidIndexes = indexes.filter((index) => index.valid !== true || index.ready !== true);
const functionIssues = functions.filter(
  (fn) => fn.security_definer !== true || fn.has_skip_locked !== true || fn.filters_system_queue_kind !== true,
);

console.log('Supabase queue hardening audit');
console.log('Checked at:', audit.checked_at || '(unknown)');
console.log('');

console.log('Required indexes:', `${requiredIndexes.length - missingIndexes.length}/${requiredIndexes.length} present`);
if (missingIndexes.length) console.log('Missing indexes:', missingIndexes.join(', '));
if (invalidIndexes.length) console.log('Invalid/not-ready indexes:', invalidIndexes.map((i) => i.name).join(', '));

console.log('');
console.log('Claim RPCs:', functions.map((fn) => `${fn.name} skip_locked=${fn.has_skip_locked} queue_filter=${fn.filters_system_queue_kind}`).join('; ') || '(none)');
if (functionIssues.length) console.log('Function issues:', JSON.stringify(functionIssues, null, 2));

console.log('');
console.log('generated_images policies:', generatedPolicies.length);
console.log('Remaining direct auth policy count:', audit.remaining_direct_auth_policy_count ?? directPolicies.length);
if (directPolicies.length) {
  console.log('Remaining direct auth policies:');
  for (const item of directPolicies) {
    console.log(`- ${item.table}.${item.policy} (${item.cmd})`);
  }
}

console.log('');
console.log('Duplicate permissive policy groups:', duplicateGroups.length);
if (duplicateGroups.length) {
  for (const group of duplicateGroups.slice(0, 20)) {
    console.log(`- ${group.table} ${group.cmd} roles=${JSON.stringify(group.roles)} count=${group.count}: ${group.policies.join(', ')}`);
  }
  if (duplicateGroups.length > 20) console.log(`...and ${duplicateGroups.length - 20} more`);
}

console.log('');
console.log('Queue counts:', JSON.stringify(audit.queue_counts || {}, null, 2));

const ok =
  missingIndexes.length === 0 &&
  invalidIndexes.length === 0 &&
  functionIssues.length === 0 &&
  Number(audit.remaining_direct_auth_policy_count || 0) === 0;

console.log('');
console.log(ok ? 'Audit result: OK for the main resource-exhaustion fixes.' : 'Audit result: follow-up recommended.');
