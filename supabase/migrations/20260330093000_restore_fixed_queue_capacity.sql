CREATE OR REPLACE FUNCTION public.claim_dispatchable_generated_jobs(p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 120)
RETURNS TABLE(id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb, prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with processing as (
    select
      count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as system_image_processing,
      count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as system_video_processing
    from public.generated_images
    where status = 'processing'
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  ),
  user_processing as (
    select
      user_id,
      count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as image_processing,
      count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as video_processing
    from public.generated_images
    where status = 'processing'
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    group by user_id
  ),
  base_candidates as (
    select
      gi.*,
      coalesce(up.image_processing, 0) as user_image_processing,
      coalesce(up.video_processing, 0) as user_video_processing,
      greatest(0, 4 - p.system_image_processing) as image_slots,
      greatest(0, 4 - p.system_video_processing) as video_slots
    from public.generated_images gi
    cross join processing p
    left join user_processing up on up.user_id = gi.user_id
    where gi.status = 'queued'
      and gi.queue_payload is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      and (
        (coalesce(gi.asset_type, 'image') = 'image' and coalesce(up.image_processing, 0) = 0 and greatest(0, 4 - p.system_image_processing) > 0)
        or
        (coalesce(gi.asset_type, 'image') = 'video' and coalesce(up.video_processing, 0) = 0 and greatest(0, 4 - p.system_video_processing) > 0)
      )
  ),
  ranked_user as (
    select
      bc.*,
      row_number() over (partition by bc.user_id, coalesce(bc.asset_type, 'image') order by bc.created_at, bc.id) as rn_user
    from base_candidates bc
  ),
  ranked_system as (
    select
      ru.*,
      row_number() over (partition by coalesce(ru.asset_type, 'image') order by ru.created_at, ru.id) as rn_system
    from ranked_user ru
    where ru.rn_user = 1
  ),
  picked as (
    select rs.id
    from ranked_system rs
    where (
      coalesce(rs.asset_type, 'image') = 'image'
      and rs.rn_system <= rs.image_slots
    ) or (
      coalesce(rs.asset_type, 'image') = 'video'
      and rs.rn_system <= rs.video_slots
    )
    order by rs.created_at, rs.id
    limit greatest(coalesce(p_limit, 1), 1)
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
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
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
