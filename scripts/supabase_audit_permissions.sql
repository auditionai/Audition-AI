-- Audition AI
-- Audit RLS, policies, grants, and function execute permissions

-- 1. Table list in public schema
select
  t.tablename as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_tables t
join pg_class c
  on c.relname = t.tablename
join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = t.schemaname
where t.schemaname = 'public'
order by t.tablename;

-- 2. Policies by table
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Table grants for app roles
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- 4. Column grants, useful when some table works but one column errors
select
  table_schema,
  table_name,
  column_name,
  grantee,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, column_name, grantee, privilege_type;

-- 5. Functions / RPC in public schema
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, args;

-- 6. EXECUTE grants on app-critical functions
select
  r.routine_schema,
  r.routine_name,
  r.specific_name,
  p.grantee,
  p.privilege_type
from information_schema.routines r
left join information_schema.role_routine_grants p
  on p.specific_schema = r.specific_schema
 and p.specific_name = r.specific_name
where r.specific_schema = 'public'
  and r.routine_name in (
    'check_is_admin',
    'increment_giftcode_usage',
    'redeem_giftcode',
    'apply_balance_transaction',
    'secure_update_balance',
    'refund_generated_job',
    'settle_payment_transaction_by_id',
    'settle_payment_transaction_by_order_code',
    'enqueue_generated_job',
    'server_enqueue_generated_job',
    'claim_dispatchable_generated_jobs',
    'claim_pollable_generated_jobs',
    'get_generation_queue_stats',
    'try_acquire_queue_worker_lock',
    'release_queue_worker_lock'
  )
order by r.routine_name, p.grantee;

-- 7. Quick matrix for the tables the app uses most
select
  table_name,
  max(case when grantee = 'anon' and privilege_type = 'SELECT' then 1 else 0 end) as anon_select,
  max(case when grantee = 'authenticated' and privilege_type = 'SELECT' then 1 else 0 end) as auth_select,
  max(case when grantee = 'authenticated' and privilege_type = 'INSERT' then 1 else 0 end) as auth_insert,
  max(case when grantee = 'authenticated' and privilege_type = 'UPDATE' then 1 else 0 end) as auth_update,
  max(case when grantee = 'authenticated' and privilege_type = 'DELETE' then 1 else 0 end) as auth_delete,
  max(case when grantee = 'service_role' and privilege_type = 'SELECT' then 1 else 0 end) as service_select
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
  and table_name in (
    'users',
    'generated_images',
    'vcoin_transactions',
    'payment_transactions',
    'system_settings',
    'gift_codes',
    'gift_code_usages',
    'credit_packages',
    'promotions',
    'api_keys',
    'style_presets',
    'daily_check_ins',
    'milestone_claims',
    'model_pricing',
    'app_visits'
  )
group by table_name
order by table_name;
