-- Audition AI
-- Fix duplicate enqueue_generated_job overloads causing ambiguous RPC resolution
-- Target limits:
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
    p_queue_payload jsonb
)
returns table (
    id uuid,
    status text,
    queue_position integer
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
    returning generated_images.id, generated_images.status
    into id, status;

    queue_position := case when v_can_dispatch_now then 0 else v_system_queued + 1 end;

    return next;
end;
$$;

commit;
