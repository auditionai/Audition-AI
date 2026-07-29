-- Claim queue rows atomically under concurrent workers.
-- Only the service role may execute these SECURITY DEFINER functions.

create or replace function public.claim_dispatchable_generated_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table(
  id uuid,
  user_id uuid,
  asset_type text,
  queue_kind text,
  queue_payload jsonb,
  prompt text,
  tool_id text,
  tool_name text,
  model_used text,
  cost_vcoin integer
)
language sql
security definer
set search_path to 'public'
as $$
  with processing as (
    select
      count(*) filter (where coalesce(gi.asset_type, 'image') = 'image')::integer as system_image_processing,
      count(*) filter (where coalesce(gi.asset_type, 'image') = 'video')::integer as system_video_processing
    from public.generated_images gi
    where gi.status = 'processing'
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
  ),
  user_processing as (
    select
      gi.user_id,
      count(*) filter (where coalesce(gi.asset_type, 'image') = 'image')::integer as image_processing,
      count(*) filter (where coalesce(gi.asset_type, 'image') = 'video')::integer as video_processing
    from public.generated_images gi
    where gi.status = 'processing'
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
    group by gi.user_id
  ),
  eligible as (
    select
      gi.id,
      gi.user_id,
      gi.asset_type,
      gi.created_at,
      coalesce(up.image_processing, 0) as user_image_processing,
      coalesce(up.video_processing, 0) as user_video_processing,
      greatest(0, 4 - p.system_image_processing) as image_slots,
      greatest(0, 4 - p.system_video_processing) as video_slots
    from public.generated_images gi
    cross join processing p
    left join user_processing up on up.user_id = gi.user_id
    where gi.status = 'queued'
      and gi.queue_payload is not null
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      and (
        (
          coalesce(gi.asset_type, 'image') = 'image'
          and coalesce(up.image_processing, 0) = 0
          and greatest(0, 4 - p.system_image_processing) > 0
        )
        or
        (
          coalesce(gi.asset_type, 'image') = 'video'
          and coalesce(up.video_processing, 0) = 0
          and greatest(0, 4 - p.system_video_processing) > 0
        )
      )
  ),
  ranked_user as (
    select
      e.*,
      row_number() over (
        partition by e.user_id, coalesce(e.asset_type, 'image')
        order by e.created_at, e.id
      ) as rn_user
    from eligible e
  ),
  ranked_system as (
    select
      ru.*,
      row_number() over (
        partition by coalesce(ru.asset_type, 'image')
        order by ru.created_at, ru.id
      ) as rn_system
    from ranked_user ru
    where ru.rn_user = 1
  ),
  picked as (
    select gi.id
    from public.generated_images gi
    join ranked_system rs on rs.id = gi.id
    where (
      coalesce(rs.asset_type, 'image') = 'image'
      and rs.rn_system <= rs.image_slots
    ) or (
      coalesce(rs.asset_type, 'image') = 'video'
      and rs.rn_system <= rs.video_slots
    )
    order by rs.created_at, rs.id
    limit greatest(coalesce(p_limit, 1), 1)
    for update of gi skip locked
  ),
  updated as (
    update public.generated_images gi
    set
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
      updated_at = now(),
      error_message = null
    where gi.id in (select picked.id from picked)
      and gi.status = 'queued'
      and gi.queue_payload is not null
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    returning gi.*
  )
  select
    u.id,
    u.user_id,
    coalesce(u.asset_type, 'image') as asset_type,
    u.queue_kind,
    u.queue_payload,
    u.prompt,
    u.tool_id,
    u.tool_name,
    u.model_used,
    u.cost_vcoin
  from updated u;
$$;

create or replace function public.claim_pollable_generated_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns table(
  id uuid,
  user_id uuid,
  asset_type text,
  queue_kind text,
  queue_payload jsonb,
  prompt text,
  tool_id text,
  tool_name text,
  model_used text,
  cost_vcoin integer,
  job_id text
)
language sql
security definer
set search_path to 'public'
as $$
  with picked as (
    select gi.id
    from public.generated_images gi
    where gi.status = 'processing'
      and gi.job_id is not null
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.next_poll_at is null or gi.next_poll_at <= now())
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by coalesce(gi.next_poll_at, gi.processing_started_at, gi.created_at), gi.created_at, gi.id
    limit greatest(coalesce(p_limit, 1), 1)
    for update of gi skip locked
  ),
  updated as (
    update public.generated_images gi
    set
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 15)),
      updated_at = now()
    where gi.id in (select picked.id from picked)
      and gi.status = 'processing'
      and gi.job_id is not null
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.next_poll_at is null or gi.next_poll_at <= now())
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    returning gi.*
  )
  select
    u.id,
    u.user_id,
    coalesce(u.asset_type, 'image') as asset_type,
    u.queue_kind,
    u.queue_payload,
    u.prompt,
    u.tool_id,
    u.tool_name,
    u.model_used,
    u.cost_vcoin,
    u.job_id
  from updated u;
$$;

revoke all on function public.claim_dispatchable_generated_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.claim_pollable_generated_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_dispatchable_generated_jobs(integer, integer) to service_role;
grant execute on function public.claim_pollable_generated_jobs(integer, integer) to service_role;
