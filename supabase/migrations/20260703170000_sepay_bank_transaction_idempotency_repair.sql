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
  v_payload jsonb := coalesce(p_provider_payload, '{}'::jsonb);
  v_bank_references text[] := array_remove(array[
    nullif(btrim(v_payload #>> '{bank_transaction,code}'), ''),
    nullif(btrim(v_payload #>> '{bank_transaction,reference_number}'), ''),
    nullif(btrim(v_payload #>> '{bank_transaction,id}'), ''),
    nullif(btrim(v_payload #>> '{data,order_id}'), ''),
    nullif(btrim(v_payload ->> 'sepay_order_id'), '')
  ], null);
  v_bank_reference text := null;
  v_duplicate_tx_id uuid;
begin
  if array_length(v_bank_references, 1) > 0 then
    v_bank_reference := v_bank_references[1];
  end if;

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

  if v_status in ('paid', 'success', 'succeeded') and array_length(v_bank_references, 1) > 0 then
    select pt.id
    into v_duplicate_tx_id
    from public.payment_transactions pt
    where pt.id <> v_tx.id
      and lower(coalesce(pt.status, '')) = 'paid'
      and (
        nullif(btrim(pt.provider_payload #>> '{bank_transaction,id}'), '') = any(v_bank_references)
        or nullif(btrim(pt.provider_payload #>> '{bank_transaction,code}'), '') = any(v_bank_references)
        or nullif(btrim(pt.provider_payload #>> '{bank_transaction,reference_number}'), '') = any(v_bank_references)
        or nullif(btrim(pt.provider_payload #>> '{data,order_id}'), '') = any(v_bank_references)
        or nullif(btrim(pt.provider_payload ->> 'sepay_order_id'), '') = any(v_bank_references)
      )
    order by pt.paid_at nulls last, pt.created_at
    limit 1;

    if v_duplicate_tx_id is not null then
      update public.payment_transactions
      set
        status = 'failed',
        provider_status = 'DUPLICATE_BANK_TRANSACTION',
        provider_payload = coalesce(provider_payload, '{}'::jsonb)
          || v_payload
          || jsonb_build_object(
            'duplicate_bank_transaction_reference', v_bank_reference,
            'duplicate_of_transaction_id', v_duplicate_tx_id,
            'duplicate_detected_at', now()
          ),
        updated_at = now()
      where id = v_tx.id;

      return jsonb_build_object(
        'success', false,
        'applied', false,
        'transaction_id', v_tx.id,
        'status', 'failed',
        'reason', 'duplicate_bank_transaction',
        'duplicate_of_transaction_id', v_duplicate_tx_id
      );
    end if;
  end if;

  if v_status in ('paid', 'success', 'succeeded') then
    update public.payment_transactions
    set
      status = 'paid',
      provider_status = p_provider_status,
      provider_payload = coalesce(provider_payload, '{}'::jsonb) || v_payload,
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
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
        'provider_status', p_provider_status,
        'bank_transaction_reference', v_bank_reference
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
    provider_payload = coalesce(provider_payload, '{}'::jsonb) || v_payload,
    updated_at = now()
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

grant execute on function public.settle_payment_transaction_by_id(uuid, text, jsonb) to anon, authenticated, service_role;

do $$
declare
  v_bad_tx public.payment_transactions%rowtype;
  v_good_tx public.payment_transactions%rowtype;
  v_reversed boolean := false;
begin
  select *
  into v_bad_tx
  from public.payment_transactions
  where order_code = '1783079338958'
     or provider_order_code = 1783079338958
  for update;

  select *
  into v_good_tx
  from public.payment_transactions
  where order_code = '1783079380721'
     or provider_order_code = 1783079380721
  for update;

  if v_bad_tx.id is not null
     and v_good_tx.id is not null
     and lower(coalesce(v_bad_tx.status, '')) = 'paid'
     and lower(coalesce(v_good_tx.status, '')) = 'paid'
     and coalesce(v_bad_tx.provider_payload #>> '{bank_transaction,code}', '') = 'PAY24906A47A1D649490'
     and coalesce(v_good_tx.provider_payload ->> 'sepay_order_id', v_good_tx.provider_payload #>> '{data,order_id}', '') = 'PAY24906A47A1D649490'
  then
    v_reversed := public.apply_balance_transaction(
      v_bad_tx.user_id,
      -v_bad_tx.vcoin_received,
      'Reversal: duplicate SePay bank transaction PAY24906A47A1D649490',
      'adjustment',
      'payment_transaction_reversal',
      v_bad_tx.id::text,
      jsonb_build_object(
        'transaction_id', v_bad_tx.id,
        'duplicate_of_transaction_id', v_good_tx.id,
        'order_code', v_bad_tx.order_code,
        'duplicate_bank_transaction_reference', 'PAY24906A47A1D649490',
        'reason', 'duplicate_sepay_bank_transaction'
      )
    );

    update public.payment_transactions
    set
      status = 'failed',
      provider_status = 'DUPLICATE_BANK_TRANSACTION',
      paid_at = null,
      provider_payload = coalesce(provider_payload, '{}'::jsonb)
        || jsonb_build_object(
          'remediated_at', now(),
          'remediation', 'duplicate_bank_transaction_reversed',
          'reversal_applied', v_reversed,
          'duplicate_of_transaction_id', v_good_tx.id,
          'duplicate_bank_transaction_reference', 'PAY24906A47A1D649490'
        ),
      updated_at = now()
    where id = v_bad_tx.id;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
