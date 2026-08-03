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
    v_account_status text := 'active';
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

    select coalesce(u.vcoin_balance, 0), coalesce(u.account_status, 'active')
    into v_user_balance, v_account_status
    from public.users u
    where u.id = p_user_id
    for update;

    if not found then
        raise exception 'USER_NOT_FOUND';
    end if;

    if lower(v_account_status) = 'locked' then
        raise exception 'ACCOUNT_LOCKED';
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
        case when lower(coalesce(p_queue_payload->>'__targetProvider', 'tst')) = 'gommo' then 'gommo' else 'tst' end,
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

revoke execute on function public.server_enqueue_generated_job(uuid, uuid, text, text, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.server_enqueue_generated_job(uuid, uuid, text, text, text, text, text, integer, text, jsonb)
  to service_role;

insert into public.system_settings (key, value)
values ('generation_provider_mode', jsonb_build_object(
  'provider', 'tst',
  'providerByModel', jsonb_build_object(),
  'smartFallbackEnabled', true,
  'updatedAt', now()
))
on conflict (key) do update
set value = coalesce(public.system_settings.value, '{}'::jsonb) || jsonb_build_object(
  'provider', coalesce(public.system_settings.value->>'provider', 'tst'),
  'providerByModel', coalesce(public.system_settings.value->'providerByModel', '{}'::jsonb),
  'smartFallbackEnabled', case when lower(coalesce(public.system_settings.value->>'smartFallbackEnabled', 'true')) = 'false' then false else true end
);

notify pgrst, 'reload schema';

commit;
