begin;

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

commit;
