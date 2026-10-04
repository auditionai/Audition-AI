-- Read-only snapshot for the daily platform-usage Telegram report. The
-- Supabase Management usage meters (Log Ingestion/Egress) are not exposed
-- through PostgREST, so this reports the database metrics we can verify from
-- inside the project and keeps those provider meters separate.
create or replace function public.get_daily_platform_usage_snapshot(
  p_report_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_date date := coalesce(p_report_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1);
  v_start timestamptz := (v_date::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_end timestamptz := ((v_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
begin
  return jsonb_build_object(
    'report_date', v_date,
    'period_start', v_start,
    'period_end', v_end,
    'database_bytes', pg_database_size(current_database()),
    'generated_images_bytes', pg_total_relation_size('public.generated_images'),
    'rows', jsonb_build_object(
      'app_visits', (select count(*) from public.app_visits where created_at >= v_start and created_at < v_end),
      'vcoin_transactions', (select count(*) from public.vcoin_transactions where created_at >= v_start and created_at < v_end),
      'daily_check_ins', (select count(*) from public.daily_check_ins where created_at >= v_start and created_at < v_end),
      'prompt_library_sample_uses', (select count(*) from public.prompt_library_sample_uses where used_at >= v_start and used_at < v_end),
      'cloudflare_upload_tokens', (select count(*) from public.cloudflare_upload_tokens where created_at >= v_start and created_at < v_end),
      'generated_images', (select count(*) from public.generated_images where created_at >= v_start and created_at < v_end),
      'generation_terminal_events', (select count(*) from public.generation_terminal_events where created_at >= v_start and created_at < v_end),
      'dance_video_orders', (select count(*) from public.dance_video_jobs where created_at >= v_start and created_at < v_end)
    ),
    'queue', jsonb_build_object(
      'active', (select count(*) from public.generated_images where status in ('queued', 'processing')),
      'payload_bytes_created', (select coalesce(sum(pg_column_size(queue_payload)), 0) from public.generated_images where created_at >= v_start and created_at < v_end)
    )
  );
end;
$$;

revoke execute on function public.get_daily_platform_usage_snapshot(date) from public, anon, authenticated;
grant execute on function public.get_daily_platform_usage_snapshot(date) to service_role;

notify pgrst, 'reload schema';
