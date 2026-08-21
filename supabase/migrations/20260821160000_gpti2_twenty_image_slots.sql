begin;

-- GPTi2 has a provider-wide limit of twenty active image jobs. It intentionally
-- has no per-user image-processing cap; each user still retains three queued jobs.
create or replace function public.claim_dispatchable_generated_jobs(
  p_limit integer default 10, p_lease_seconds integer default 120
)
returns table(
  id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb,
  prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer
)
language sql security definer set search_path to 'public'
as $$
  with normalized as (
    select gi.*, case lower(coalesce(nullif(gi.provider, ''), gi.queue_payload->>'__targetProvider', 'tst'))
      when 'gommo' then 'gommo' when 'gpti2' then 'gpti2' else 'tst' end as provider_key
    from public.generated_images gi
    where coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  ), processing as (
    select provider_key, coalesce(asset_type, 'image') as media_type, count(*)::integer as active_count
    from normalized where status = 'processing'
    group by provider_key, coalesce(asset_type, 'image')
  ), user_processing as (
    select user_id, provider_key, coalesce(asset_type, 'image') as media_type, count(*)::integer as active_count
    from normalized where status = 'processing'
    group by user_id, provider_key, coalesce(asset_type, 'image')
  ), eligible as (
    select n.id, n.user_id, n.asset_type, n.created_at, n.provider_key,
      case when n.provider_key = 'gpti2' and coalesce(n.asset_type, 'image') = 'image'
        then 2147483647 else 3 - coalesce(up.active_count, 0) end as user_slots,
      case when n.provider_key = 'gpti2' and coalesce(n.asset_type, 'image') = 'image'
        then 20 - coalesce(p.active_count, 0) else 2147483647 end as system_slots
    from normalized n
    left join processing p on p.provider_key = n.provider_key and p.media_type = coalesce(n.asset_type, 'image')
    left join user_processing up on up.user_id = n.user_id and up.provider_key = n.provider_key
      and up.media_type = coalesce(n.asset_type, 'image')
    where n.status = 'queued' and n.queue_payload is not null
      and (n.lease_expires_at is null or n.lease_expires_at < now())
      and (case when n.provider_key = 'gpti2' and coalesce(n.asset_type, 'image') = 'image'
        then 2147483647 else 3 - coalesce(up.active_count, 0) end) > 0
      and (case when n.provider_key = 'gpti2' and coalesce(n.asset_type, 'image') = 'image'
        then 20 - coalesce(p.active_count, 0) else 2147483647 end) > 0
  ), ranked_user as (
    select e.*, row_number() over (
      partition by e.user_id, e.provider_key, coalesce(e.asset_type, 'image') order by e.created_at, e.id
    ) as rn_user from eligible e
  ), ranked_system as (
    select r.*, row_number() over (
      partition by r.provider_key, coalesce(r.asset_type, 'image') order by r.created_at, r.id
    ) as rn_system from ranked_user r where r.rn_user <= r.user_slots
  ), picked as (
    select gi.id from public.generated_images gi join ranked_system r on r.id = gi.id
    where r.rn_system <= r.system_slots order by r.created_at, r.id
    limit greatest(coalesce(p_limit, 1), 1) for update of gi skip locked
  ), updated as (
    update public.generated_images gi set lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
      updated_at = now(), error_message = null
    where gi.id in (select id from picked) and gi.status = 'queued' and gi.queue_payload is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    returning gi.*
  )
  select u.id, u.user_id, coalesce(u.asset_type, 'image'), u.queue_kind, u.queue_payload,
    u.prompt, u.tool_id, u.tool_name, u.model_used, u.cost_vcoin from updated u;
$$;

drop function if exists public.get_generation_queue_stats();
create function public.get_generation_queue_stats()
returns table(
  my_image_processing integer, my_video_processing integer, my_queued integer,
  system_image_processing integer, system_video_processing integer, system_queued integer,
  my_tst_image_processing integer, my_tst_video_processing integer, my_tst_queued integer,
  system_tst_image_processing integer, system_tst_video_processing integer, system_tst_queued integer,
  my_gommo_image_processing integer, my_gommo_video_processing integer, my_gommo_queued integer,
  system_gommo_image_processing integer, system_gommo_video_processing integer, system_gommo_queued integer,
  my_gpti2_image_processing integer, my_gpti2_video_processing integer, my_gpti2_queued integer,
  system_gpti2_image_processing integer, system_gpti2_video_processing integer, system_gpti2_queued integer
)
language sql security definer set search_path to 'public'
as $$
  with scoped as (
    select user_id, status, coalesce(asset_type, 'image') as media_type,
      case lower(coalesce(nullif(provider, ''), queue_payload->>'__targetProvider', 'tst'))
        when 'gommo' then 'gommo' when 'gpti2' then 'gpti2' else 'tst' end as provider_key
    from public.generated_images
    where status in ('queued', 'processing')
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  )
  select
    count(*) filter (where user_id = auth.uid() and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where user_id = auth.uid() and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where user_id = auth.uid() and status = 'queued')::integer,
    count(*) filter (where status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where status = 'queued')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'tst' and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'tst' and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'tst' and status = 'queued')::integer,
    count(*) filter (where provider_key = 'tst' and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where provider_key = 'tst' and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where provider_key = 'tst' and status = 'queued')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'gommo' and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'gommo' and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'gommo' and status = 'queued')::integer,
    count(*) filter (where provider_key = 'gommo' and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where provider_key = 'gommo' and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where provider_key = 'gommo' and status = 'queued')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'gpti2' and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'gpti2' and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where user_id = auth.uid() and provider_key = 'gpti2' and status = 'queued')::integer,
    count(*) filter (where provider_key = 'gpti2' and status = 'processing' and media_type = 'image')::integer,
    count(*) filter (where provider_key = 'gpti2' and status = 'processing' and media_type = 'video')::integer,
    count(*) filter (where provider_key = 'gpti2' and status = 'queued')::integer
  from scoped;
$$;

revoke execute on function public.claim_dispatchable_generated_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_dispatchable_generated_jobs(integer, integer) to service_role;
revoke execute on function public.get_generation_queue_stats() from public, anon;
grant execute on function public.get_generation_queue_stats() to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
