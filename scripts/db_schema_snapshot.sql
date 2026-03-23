-- Run each query in Supabase SQL Editor and send back the text results.
-- This is much better than screenshots because it preserves exact names/types.

-- 1. Public tables
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. Public columns
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 3. Constraints and foreign keys
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
left join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
  and tc.table_schema = ccu.table_schema
where tc.table_schema = 'public'
order by tc.table_name, tc.constraint_type, tc.constraint_name;

-- 4. RLS policies
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
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 5. Triggers
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 6. Public functions
select
  routine_name,
  routine_type,
  data_type as return_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

-- 7. Storage buckets
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

-- 8. Core app table counts
select 'users' as table_name, count(*) as total from public.users
union all
select 'credit_packages', count(*) from public.credit_packages
union all
select 'system_settings', count(*) from public.system_settings
union all
select 'generated_images', count(*) from public.generated_images
union all
select 'gift_codes', count(*) from public.gift_codes
union all
select 'gift_code_usages', count(*) from public.gift_code_usages
union all
select 'payment_transactions', count(*) from public.payment_transactions
union all
select 'promotions', count(*) from public.promotions
union all
select 'vcoin_transactions', count(*) from public.vcoin_transactions;
