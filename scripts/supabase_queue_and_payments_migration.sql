-- Audition AI
-- Migration: server-side queue manager + automatic PayOS settlement

begin;

create extension if not exists pgcrypto;

alter table public.vcoin_transactions
    add column if not exists reference_type text,
    add column if not exists reference_id text,
    add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists uq_vcoin_transactions_reference
    on public.vcoin_transactions(reference_type, reference_id)
    where reference_type is not null and reference_id is not null;

alter table public.payment_transactions
    add column if not exists provider_order_code bigint,
    add column if not exists provider_payment_link_id text,
    add column if not exists checkout_url text,
    add column if not exists provider_status text,
    add column if not exists provider_payload jsonb not null default '{}'::jsonb,
    add column if not exists paid_at timestamptz;

create unique index if not exists uq_payment_transactions_provider_order_code
    on public.payment_transactions(provider_order_code)
    where provider_order_code is not null;

alter table public.generated_images
    add column if not exists queue_kind text,
    add column if not exists queue_payload jsonb,
    add column if not exists provider text not null default 'tst',
    add column if not exists processing_started_at timestamptz,
    add column if not exists finished_at timestamptz,
    add column if not exists next_poll_at timestamptz,
    add column if not exists lease_token uuid,
    add column if not exists lease_expires_at timestamptz,
    add column if not exists attempt_count integer not null default 0,
    add column if not exists last_error_at timestamptz;

create index if not exists idx_generated_images_dispatch_queue
    on public.generated_images(status, asset_type, created_at);

create index if not exists idx_generated_images_poll_queue
    on public.generated_images(status, next_poll_at);

create index if not exists idx_generated_images_queue_lease
    on public.generated_images(lease_expires_at);

create or replace function public.apply_balance_transaction(
    p_target_user_id uuid,
    p_amount numeric,
    p_reason text,
    p_log_type text,
    p_reference_type text default null,
    p_reference_id text default null,
    p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_existing_id uuid;
begin
    if p_reference_type is not null and p_reference_id is not null then
        select id
        into v_existing_id
        from public.vcoin_transactions
        where reference_type = p_reference_type
          and reference_id = p_reference_id
        limit 1;

        if v_existing_id is not null then
            return false;
        end if;
    end if;

    update public.users
    set vcoin_balance = coalesce(vcoin_balance, 0) + p_amount
    where id = p_target_user_id;

    if not found then
        raise exception 'User % not found', p_target_user_id;
    end if;

    insert into public.vcoin_transactions (
        user_id,
        amount,
        description,
        type,
        reference_type,
        reference_id,
        metadata
    ) values (
        p_target_user_id,
        p_amount,
        p_reason,
        p_log_type,
        p_reference_type,
        p_reference_id,
        coalesce(p_metadata, '{}'::jsonb)
    );

    return true;
exception
    when unique_violation then
        return false;
end;
$$;

create or replace function public.refund_generated_job(
    p_generated_image_id uuid,
    p_reason text default 'Refund: Generated job failed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.generated_images%rowtype;
begin
    select *
    into v_job
    from public.generated_images
    where id = p_generated_image_id
    for update;

    if not found then
        raise exception 'Generated job % not found', p_generated_image_id;
    end if;

    if coalesce(v_job.cost_vcoin, 0) <= 0 then
        return false;
    end if;

    return public.apply_balance_transaction(
        v_job.user_id,
        v_job.cost_vcoin,
        p_reason,
        'refund',
        'generated_image_refund',
        p_generated_image_id::text,
        jsonb_build_object(
            'generated_image_id', p_generated_image_id,
            'tool_id', v_job.tool_id,
            'queue_kind', v_job.queue_kind
        )
    );
end;
$$;

create or replace function public.settle_payment_transaction_by_id(
    p_transaction_id uuid,
    p_provider_status text default 'PAID',
    p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tx public.payment_transactions%rowtype;
    v_applied boolean := false;
    v_status text := lower(coalesce(p_provider_status, ''));
begin
    select *
    into v_tx
    from public.payment_transactions
    where id = p_transaction_id
    for update;

    if not found then
        raise exception 'Transaction % not found', p_transaction_id;
    end if;

    if lower(coalesce(v_tx.status, '')) = 'paid' then
        return jsonb_build_object(
            'success', true,
            'applied', false,
            'transaction_id', v_tx.id,
            'status', v_tx.status
        );
    end if;

    if v_status in ('paid', 'success', 'succeeded') then
        update public.payment_transactions
        set
            status = 'paid',
            provider_status = p_provider_status,
            provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
            paid_at = coalesce(paid_at, now())
        where id = v_tx.id;

        v_applied := public.apply_balance_transaction(
            v_tx.user_id,
            v_tx.vcoin_received,
            'Topup: ' || coalesce(v_tx.order_code::text, v_tx.provider_order_code::text, v_tx.id::text),
            'topup',
            'payment_transaction',
            v_tx.id::text,
            jsonb_build_object(
                'transaction_id', v_tx.id,
                'provider_order_code', v_tx.provider_order_code,
                'provider_status', p_provider_status
            )
        );

        return jsonb_build_object(
            'success', true,
            'applied', v_applied,
            'transaction_id', v_tx.id,
            'status', 'paid'
        );
    end if;

    update public.payment_transactions
    set
        status = case
            when v_status in ('cancelled', 'canceled') then 'cancelled'
            when v_status in ('failed', 'expired') then 'failed'
            else status
        end,
        provider_status = p_provider_status,
        provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb)
    where id = v_tx.id;

    return jsonb_build_object(
        'success', true,
        'applied', false,
        'transaction_id', v_tx.id,
        'status', case
            when v_status in ('cancelled', 'canceled') then 'cancelled'
            when v_status in ('failed', 'expired') then 'failed'
            else v_tx.status
        end
    );
end;
$$;

create or replace function public.settle_payment_transaction_by_order_code(
    p_provider_order_code bigint,
    p_provider_status text default 'PAID',
    p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tx_id uuid;
begin
    select id
    into v_tx_id
    from public.payment_transactions
    where coalesce(provider_order_code::text, '') = p_provider_order_code::text
       or coalesce(order_code::text, '') = p_provider_order_code::text
    order by created_at desc
    limit 1;

    if v_tx_id is null then
        raise exception 'Transaction with order code % not found', p_provider_order_code;
    end if;

    update public.payment_transactions
    set provider_order_code = coalesce(provider_order_code, p_provider_order_code)
    where id = v_tx_id;

    return public.settle_payment_transaction_by_id(v_tx_id, p_provider_status, p_provider_payload);
end;
$$;

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

create or replace function public.claim_pollable_generated_jobs(
    p_limit integer default 10,
    p_lease_seconds integer default 60
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
    cost_vcoin integer,
    job_id text
)
language sql
security definer
set search_path = public
as $$
    with candidates as (
        select gi.id
        from public.generated_images gi
        where gi.status = 'processing'
          and gi.job_id is not null
          and (gi.next_poll_at is null or gi.next_poll_at <= now())
          and (gi.lease_expires_at is null or gi.lease_expires_at < now())
        order by coalesce(gi.next_poll_at, gi.processing_started_at, gi.created_at), gi.created_at, gi.id
        limit greatest(coalesce(p_limit, 1), 1)
    ),
    updated as (
        update public.generated_images gi
        set
            lease_token = gen_random_uuid(),
            lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 15)),
            updated_at = now()
        where gi.id in (select candidates.id from candidates)
          and gi.status = 'processing'
          and gi.job_id is not null
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

commit;
