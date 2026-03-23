begin;

create extension if not exists pgcrypto;

drop function if exists public.server_enqueue_generated_job(uuid, uuid, text, text, text, text, text, integer, text, jsonb);

create or replace function public.server_enqueue_generated_job(
    p_id uuid,
    p_user_id uuid,
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
    v_existing public.generated_images%rowtype;
    v_user_balance numeric := 0;
    v_my_image_processing integer := 0;
    v_my_video_processing integer := 0;
    v_my_queued integer := 0;
    v_system_image_processing integer := 0;
    v_system_video_processing integer := 0;
    v_system_queued integer := 0;
    v_asset_type text := coalesce(nullif(lower(p_asset_type), ''), 'image');
    v_can_dispatch_now boolean := false;
    v_charge_applied boolean := false;
    v_cost integer := greatest(coalesce(p_cost_vcoin, 0), 0);
begin
    if p_id is null then
        raise exception 'JOB_ID_REQUIRED';
    end if;

    if p_user_id is null then
        raise exception 'USER_REQUIRED';
    end if;

    if p_queue_kind is null or btrim(p_queue_kind) = '' then
        raise exception 'QUEUE_KIND_REQUIRED';
    end if;

    if p_queue_payload is null then
        raise exception 'QUEUE_PAYLOAD_REQUIRED';
    end if;

    perform pg_advisory_xact_lock(hashtext('generated_queue_global'));
    perform pg_advisory_xact_lock(hashtext(p_user_id::text));

    select *
    into v_existing
    from public.generated_images gi
    where gi.id = p_id
    for update;

    if found then
        if v_existing.user_id <> p_user_id then
            raise exception 'JOB_ID_ALREADY_EXISTS';
        end if;

        return query
        select
            v_existing.id,
            coalesce(v_existing.status, 'queued')::text,
            case when coalesce(v_existing.status, 'queued') = 'queued' then 1 else 0 end::integer;
        return;
    end if;

    select coalesce(u.vcoin_balance, 0)
    into v_user_balance
    from public.users u
    where u.id = p_user_id
    for update;

    if not found then
        raise exception 'USER_NOT_FOUND';
    end if;

    if v_cost > 0 and v_user_balance < v_cost then
        raise exception 'INSUFFICIENT_VCOIN';
    end if;

    select
        count(*) filter (where gi.user_id = p_user_id and gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'image')::integer,
        count(*) filter (where gi.user_id = p_user_id and gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'video')::integer,
        count(*) filter (where gi.user_id = p_user_id and gi.status = 'queued')::integer,
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
    else
        v_can_dispatch_now := v_my_video_processing < 1 and v_system_video_processing < 4;
    end if;

    if not v_can_dispatch_now and v_my_queued >= 1 then
        raise exception 'USER_QUEUE_LIMIT_REACHED';
    end if;

    if not v_can_dispatch_now and v_system_queued >= 10 then
        raise exception 'SYSTEM_QUEUE_FULL';
    end if;

    if v_cost > 0 then
        v_charge_applied := public.apply_balance_transaction(
            p_user_id,
            -v_cost,
            coalesce(p_tool_name, p_queue_kind, 'Generated Job'),
            'usage',
            'generated_image_charge',
            p_id::text,
            jsonb_build_object(
                'generated_image_id', p_id,
                'tool_id', p_tool_id,
                'queue_kind', p_queue_kind,
                'asset_type', v_asset_type,
                'cost_vcoin', v_cost
            )
        );

        if not v_charge_applied then
            raise exception 'CHARGE_ALREADY_APPLIED';
        end if;
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
        provider,
        job_id,
        lease_token,
        lease_expires_at,
        next_poll_at,
        finished_at,
        processing_started_at,
        attempt_count,
        last_error_at,
        error_message
    ) values (
        p_id,
        p_user_id,
        '',
        coalesce(p_prompt, ''),
        coalesce(p_engine, p_tool_name, p_queue_kind, 'Queued Job'),
        now(),
        false,
        p_tool_id,
        p_tool_name,
        'queued',
        0,
        v_cost,
        v_asset_type,
        now(),
        p_queue_kind,
        coalesce(p_queue_payload, '{}'::jsonb),
        'tst',
        null,
        null,
        null,
        null,
        null,
        null,
        0,
        null,
        null
    );

    return query
    select
        p_id,
        'queued'::text,
        case when v_can_dispatch_now then 0 else v_system_queued + 1 end::integer;
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
            lease_token = gen_random_uuid(),
            lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
            updated_at = now()
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
