begin;

-- Harden money-moving RPCs and top-up giftcode reservation flow.
-- These functions are SECURITY DEFINER, so each one must enforce its own
-- caller policy instead of relying only on grants/RLS.

drop policy if exists "Public read giftcodes" on public.gift_codes;
create policy "Public read giftcodes"
on public.gift_codes
for select
to anon, authenticated
using (
  code_type = 'topup_discount'
  and is_active = true
  and assigned_user_id is null
);

create or replace function public.reserve_topup_giftcode(
  p_user_id uuid,
  p_code text,
  p_payment_transaction_id uuid,
  p_original_amount_vnd numeric
)
returns table (
  success boolean,
  gift_code_id uuid,
  code text,
  discount_percent numeric,
  discount_amount_vnd numeric,
  final_amount_vnd numeric,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.gift_codes%rowtype;
  v_code_normalized text := upper(btrim(coalesce(p_code, '')));
  v_campaign_key text;
  v_total_used integer := 0;
  v_user_used integer := 0;
  v_paid_topups integer := 0;
  v_pending_reservation_id uuid;
  v_discount numeric := 0;
  v_final numeric := 0;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_payment_transaction_id is null then
    raise exception 'PAYMENT_TRANSACTION_REQUIRED';
  end if;

  if v_code_normalized = '' then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric, p_original_amount_vnd, 'GIFTCODE_REQUIRED'::text;
    return;
  end if;

  update public.topup_gift_code_usages tgu
  set
    status = 'cancelled',
    cancelled_at = coalesce(tgu.cancelled_at, now())
  from public.payment_transactions pt
  where tgu.payment_transaction_id = pt.id
    and tgu.user_id = p_user_id
    and tgu.status = 'reserved'
    and pt.status in ('cancelled', 'failed');

  select gc.*
  into v_code
  from public.gift_codes gc
  where upper(gc.code) = v_code_normalized
    and gc.code_type = 'topup_discount'
  for update;

  if not found then
    return query select false, null::uuid, v_code_normalized, 0::numeric, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_INVALID'::text;
    return;
  end if;

  if v_code.assigned_user_id is null
    and (
      v_code.auto_generate_per_user is true
      or v_code.code !~ '-[A-Z0-9]{5}$'
    ) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_INVALID'::text;
    return;
  end if;

  v_campaign_key := upper(btrim(coalesce(
    v_code.campaign_key,
    regexp_replace(v_code.code, '-[A-Z0-9]{5}$', ''),
    v_code.code
  )));

  perform pg_advisory_xact_lock(hashtext('topup-giftcode|' || p_user_id::text || '|' || v_campaign_key));

  if v_code.is_active is not true
    or (v_code.expires_at is not null and v_code.expires_at < now()) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT'::text;
    return;
  end if;

  select tgu.id
  into v_pending_reservation_id
  from public.topup_gift_code_usages tgu
  join public.gift_codes gc on gc.id = tgu.gift_code_id
  join public.payment_transactions pt on pt.id = tgu.payment_transaction_id
  where tgu.user_id = p_user_id
    and tgu.status = 'reserved'
    and pt.status = 'pending'
    and tgu.payment_transaction_id is distinct from p_payment_transaction_id
    and upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5}$', ''), gc.code))) = v_campaign_key
  limit 1;

  if v_pending_reservation_id is not null then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_PENDING_PAYMENT_EXISTS'::text;
    return;
  end if;

  select count(*) into v_total_used
  from public.topup_gift_code_usages tgu
  join public.gift_codes gc on gc.id = tgu.gift_code_id
  where tgu.status = 'applied'
    and upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5}$', ''), gc.code))) = v_campaign_key;

  if v_total_used >= coalesce(v_code.total_limit, 0) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT'::text;
    return;
  end if;

  select count(*) into v_user_used
  from public.topup_gift_code_usages tgu
  join public.gift_codes gc on gc.id = tgu.gift_code_id
  where tgu.user_id = p_user_id
    and tgu.status = 'applied'
    and upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5}$', ''), gc.code))) = v_campaign_key;

  if v_user_used >= coalesce(v_code.max_per_user, 1) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_ALREADY_USED_BY_USER'::text;
    return;
  end if;

  if v_code.audience = 'specific_user' and v_code.assigned_user_id is distinct from p_user_id then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_INVALID'::text;
    return;
  end if;

  if v_code.assigned_user_id is not null and v_code.assigned_user_id is distinct from p_user_id then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_INVALID'::text;
    return;
  end if;

  if v_code.audience = 'new_user_first_topup' then
    select count(*) into v_paid_topups
    from public.payment_transactions pt
    where pt.user_id = p_user_id
      and pt.status = 'paid';

    if v_paid_topups > 0 then
      return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_FIRST_TOPUP_ONLY'::text;
      return;
    end if;
  end if;

  v_discount := floor(greatest(p_original_amount_vnd, 0) * least(greatest(v_code.discount_percent, 0), 100) / 100);
  v_final := greatest(greatest(p_original_amount_vnd, 0) - v_discount, 0);

  insert into public.topup_gift_code_usages (
    user_id,
    gift_code_id,
    payment_transaction_id,
    original_amount_vnd,
    discount_amount_vnd,
    final_amount_vnd
  )
  values (
    p_user_id,
    v_code.id,
    p_payment_transaction_id,
    p_original_amount_vnd,
    v_discount,
    v_final
  );

  return query select true, v_code.id, v_code.code, v_code.discount_percent, v_discount, v_final, 'SUCCESS'::text;
end;
$$;

create or replace function public.mark_topup_giftcode_applied(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.check_is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  with updated_usage as (
    update public.topup_gift_code_usages
    set status = 'applied',
        applied_at = coalesce(applied_at, now())
    where payment_transaction_id = p_transaction_id
      and status = 'reserved'
    returning gift_code_id
  ),
  applied_codes as (
    select gc.id, upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5}$', ''), gc.code))) as campaign_key
    from public.gift_codes gc
    join updated_usage uu on uu.gift_code_id = gc.id
  ),
  updated_concrete as (
    update public.gift_codes gc
    set used_count = used_count + 1,
        updated_at = now()
    where gc.id in (select id from applied_codes)
    returning gc.id
  )
  update public.gift_codes template
  set used_count = used_count + 1,
      updated_at = now()
  from applied_codes ac
  where template.code_type = 'topup_discount'
    and template.assigned_user_id is null
    and template.auto_generate_per_user is true
    and upper(btrim(coalesce(template.campaign_key, template.code))) = ac.campaign_key
    and template.id <> ac.id;
end;
$$;

create or replace function public.cancel_topup_giftcode_reservation(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.check_is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  update public.topup_gift_code_usages
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now())
  where payment_transaction_id = p_transaction_id
    and status = 'reserved';
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
  if auth.role() <> 'service_role' and not public.check_is_admin() then
    raise exception 'FORBIDDEN';
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
    perform public.mark_topup_giftcode_applied(v_tx.id);
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
        'provider_status', p_provider_status
      )
    );

    perform public.mark_topup_giftcode_applied(v_tx.id);

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
    provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
    updated_at = now()
  where id = v_tx.id;

  if v_status in ('cancelled', 'canceled', 'failed', 'expired') then
    perform public.cancel_topup_giftcode_reservation(v_tx.id);
  end if;

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
  if auth.role() <> 'service_role' and not public.check_is_admin() then
    raise exception 'FORBIDDEN';
  end if;

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
  set provider_order_code = coalesce(provider_order_code, p_provider_order_code),
      updated_at = now()
  where id = v_tx_id;

  return public.settle_payment_transaction_by_id(v_tx_id, p_provider_status, p_provider_payload);
end;
$$;

create or replace function public.admin_adjust_user_balance(
  p_target_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.check_is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return public.apply_balance_transaction(
    p_target_user_id,
    p_amount,
    nullif(btrim(coalesce(p_reason, '')), ''),
    'admin_adjustment',
    'admin_adjustment',
    p_target_user_id::text || ':' || extract(epoch from now())::text,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- Direct ledger mutation RPCs must never be callable by client roles.
revoke execute on function public.apply_balance_transaction(uuid, numeric, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_balance_transaction(uuid, numeric, text, text, text, text, jsonb) to service_role;

revoke execute on function public.secure_update_balance(numeric, text, text) from public, anon, authenticated;
grant execute on function public.secure_update_balance(numeric, text, text) to service_role;

revoke execute on function public.increment_giftcode_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_giftcode_usage(uuid) to service_role;

revoke execute on function public.reserve_topup_giftcode(uuid, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.reserve_topup_giftcode(uuid, text, uuid, numeric) to service_role;

revoke execute on function public.mark_topup_giftcode_applied(uuid) from public, anon, authenticated;
grant execute on function public.mark_topup_giftcode_applied(uuid) to authenticated, service_role;

revoke execute on function public.cancel_topup_giftcode_reservation(uuid) from public, anon, authenticated;
grant execute on function public.cancel_topup_giftcode_reservation(uuid) to authenticated, service_role;

revoke execute on function public.settle_payment_transaction_by_id(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.settle_payment_transaction_by_id(uuid, text, jsonb) to authenticated, service_role;

revoke execute on function public.settle_payment_transaction_by_order_code(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.settle_payment_transaction_by_order_code(bigint, text, jsonb) to authenticated, service_role;

revoke execute on function public.admin_adjust_user_balance(uuid, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_adjust_user_balance(uuid, numeric, text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
