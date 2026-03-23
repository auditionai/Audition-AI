-- Audition AI
-- Update queue limits:
-- User: 1 image processing, 1 video processing, 1 queued
-- System: 4 image processing, 4 video processing, 10 queued

begin;

drop function if exists public.enqueue_generated_job(uuid, text, text, text, text, text, integer, text, jsonb);
drop function if exists public.enqueue_generated_job(uuid, text, text, text, text, text, text, jsonb, integer);

create or replace function public.enqueue_generated_job(
    p_id uuid,
    p_prompt text,
    p_tool_id text,
    p_tool_name text,
    p_engine text,
    p_asset_type text,
    p_cost_vcoin integer,
    p_queue_kind text,
    p_queue_payload jsonb,
    out id uuid,
    out status text,
    out queue_position integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_my_image_processing integer := 0;
    v_my_video_processing integer := 0;
    v_my_queued integer := 0;
    v_system_image_processing integer := 0;
    v_system_video_processing integer := 0;
    v_system_queued integer := 0;
    v_asset_type text := coalesce(nullif(lower(p_asset_type), ''), 'image');
    v_can_dispatch_now boolean := false;
begin
    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    select
        count(*) filter (where gi.user_id = v_user_id and gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'image')::integer,
        count(*) filter (where gi.user_id = v_user_id and gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'video')::integer,
        count(*) filter (where gi.user_id = v_user_id and gi.status = 'queued')::integer,
        count(*) filter (where gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'image')::integer,
        count(*) filter (where gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'video')::integer,
        count(*) filter (where gi.status = 'queued')::integer
    into
        v_my_image_processing,
        v_my_video_processing,
        v_my_queued,
        v_system_image_processing,
        v_system_video_processing,
        v_system_queued
    from public.generated_images gi
    where gi.status in ('queued', 'processing');

    if v_asset_type = 'image' then
        v_can_dispatch_now := v_my_image_processing < 1 and v_system_image_processing < 4;
        if v_my_image_processing >= 1 and v_my_queued >= 1 then
            raise exception 'IMAGE_USER_LIMIT_REACHED';
        end if;
    else
        v_can_dispatch_now := v_my_video_processing < 1 and v_system_video_processing < 4;
        if v_my_video_processing >= 1 and v_my_queued >= 1 then
            raise exception 'VIDEO_USER_LIMIT_REACHED';
        end if;
    end if;

    if not v_can_dispatch_now and v_system_queued >= 10 then
        raise exception 'SYSTEM_QUEUE_FULL';
    end if;

    insert into public.generated_images (
        id,
        user_id,
        image_url,
        prompt,
        model_used,
        created_at,
        is_public,
        tool_id,
        tool_name,
        status,
        progress,
        cost_vcoin,
        asset_type,
        updated_at,
        queue_kind,
        queue_payload,
        provider
    ) values (
        p_id,
        v_user_id,
        '',
        coalesce(p_prompt, ''),
        coalesce(p_engine, p_tool_name, p_queue_kind, 'Queued Job'),
        now(),
        false,
        p_tool_id,
        p_tool_name,
        'queued',
        0,
        p_cost_vcoin,
        v_asset_type,
        now(),
        p_queue_kind,
        coalesce(p_queue_payload, '{}'::jsonb),
        'tst'
    )
    on conflict (id) do update
    set
        prompt = excluded.prompt,
        model_used = excluded.model_used,
        tool_id = excluded.tool_id,
        tool_name = excluded.tool_name,
        status = 'queued',
        progress = 0,
        error_message = null,
        cost_vcoin = excluded.cost_vcoin,
        asset_type = excluded.asset_type,
        updated_at = now(),
        queue_kind = excluded.queue_kind,
        queue_payload = excluded.queue_payload,
        provider = excluded.provider,
        job_id = null,
        lease_token = null,
        lease_expires_at = null,
        next_poll_at = null,
        finished_at = null
    returning generated_images.id
    into id;

    status := 'queued';
    queue_position := case when v_can_dispatch_now then 0 else v_system_queued + 1 end;

    return;
end;
$$;

create or replace function public.claim_dispatchable_generated_jobs(
    p_limit integer default 10,
    p_lease_seconds integer default 120
)
returns table (
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
set search_path = public
as $$
    with processing as (
        select
            count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as system_image_processing,
            count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as system_video_processing
        from public.generated_images
        where status = 'processing'
    ),
    user_processing as (
        select
            user_id,
            count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as image_processing,
            count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as video_processing
        from public.generated_images
        where status = 'processing'
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
            status = 'processing',
            progress = 0,
            processing_started_at = coalesce(gi.processing_started_at, now()),
            lease_token = gen_random_uuid(),
            lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
            updated_at = now(),
            error_message = null
        where gi.id in (select picked.id from picked)
          and gi.status = 'queued'
          and gi.queue_payload is not null
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

commit;
