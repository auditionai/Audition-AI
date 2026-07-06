-- One-time read-only audit RPC for queue/resource hardening verification.
-- Run in Supabase SQL Editor, then Codex can run:
--   node scripts/audit-supabase-resource-hardening.mjs

create or replace function public.audit_queue_resource_hardening()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'checked_at', now(),
    'indexes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'valid', i.indisvalid,
        'ready', i.indisready,
        'definition', pg_get_indexdef(i.indexrelid)
      ) order by c.relname), '[]'::jsonb)
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'idx_generated_images_queue_dispatch_ready',
          'idx_generated_images_queue_poll_ready',
          'idx_generated_images_queue_stale_predispatch',
          'idx_generated_images_queue_stale_polling',
          'idx_payment_transactions_package_id',
          'idx_user_browser_keys_user_id',
          'idx_generated_images_queue_counts_user_status_asset',
          'idx_generated_images_queue_active_created',
          'idx_generated_images_failed_result_rescue'
        )
    ),
    'claim_functions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'has_skip_locked', position('skip locked' in lower(pg_get_functiondef(p.oid))) > 0,
        'filters_system_queue_kind', position('queue_kind in' in lower(pg_get_functiondef(p.oid))) > 0,
        'security_definer', p.prosecdef
      ) order by p.proname), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('claim_dispatchable_generated_jobs', 'claim_pollable_generated_jobs')
    ),
    'generated_images_policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'policyname', policyname,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check,
        'uses_direct_auth_uid', coalesce(qual, '') ~ 'auth\\.uid\\(\\)' or coalesce(with_check, '') ~ 'auth\\.uid\\(\\)',
        'uses_direct_check_is_admin', coalesce(qual, '') ~ 'check_is_admin\\(\\)' or coalesce(with_check, '') ~ 'check_is_admin\\(\\)'
      ) order by cmd, policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'public'
        and tablename = 'generated_images'
    ),
    'remaining_direct_auth_policy_count', (
      select count(*)::integer
      from pg_policies
      where schemaname = 'public'
        and (
          coalesce(qual, '') ~ 'auth\\.uid\\(\\)'
          or coalesce(with_check, '') ~ 'auth\\.uid\\(\\)'
          or coalesce(qual, '') ~ 'auth\\.role\\(\\)'
          or coalesce(with_check, '') ~ 'auth\\.role\\(\\)'
        )
    ),
    'remaining_direct_auth_policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'cmd', cmd,
        'qual', qual,
        'with_check', with_check
      ) order by tablename, policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'public'
        and (
          coalesce(qual, '') ~ 'auth\\.uid\\(\\)'
          or coalesce(with_check, '') ~ 'auth\\.uid\\(\\)'
          or coalesce(qual, '') ~ 'auth\\.role\\(\\)'
          or coalesce(with_check, '') ~ 'auth\\.role\\(\\)'
        )
    ),
    'duplicate_permissive_policy_groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', tablename,
        'cmd', cmd,
        'roles', roles,
        'count', policy_count,
        'policies', policies
      ) order by tablename, cmd), '[]'::jsonb)
      from (
        select
          tablename,
          cmd,
          roles,
          count(*)::integer as policy_count,
          array_agg(policyname order by policyname) as policies
        from pg_policies
        where schemaname = 'public'
          and permissive = 'PERMISSIVE'
        group by tablename, cmd, roles
        having count(*) > 1
      ) grouped
    ),
    'queue_counts', (
      select jsonb_build_object(
        'system_queued', count(*) filter (
          where status = 'queued'
            and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
        ),
        'system_processing', count(*) filter (
          where status = 'processing'
            and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
        ),
        'due_poll', count(*) filter (
          where status = 'processing'
            and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
            and job_id is not null
            and (next_poll_at is null or next_poll_at <= now())
        ),
        'stale_leases', count(*) filter (
          where status in ('queued', 'processing')
            and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
            and lease_expires_at is not null
            and lease_expires_at < now()
        )
      )
      from public.generated_images
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.audit_queue_resource_hardening() from public;
grant execute on function public.audit_queue_resource_hardening() to service_role;

notify pgrst, 'reload schema';
