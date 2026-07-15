begin;

-- Generated per-user top-up codes are inserted with total_limit = 1 so each
-- concrete code can only be applied once. Campaign availability, however, must
-- be checked against the auto-generate template limit. Otherwise every new
-- generated code fails as soon as the campaign has one prior applied usage.

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
  v_effective_total_limit numeric := 0;
  v_total_used integer := 0;
  v_user_used integer := 0;
  v_user_created_at timestamptz;
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
      or v_code.code !~ '-[A-Z0-9]{5,8}$'
    ) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_INVALID'::text;
    return;
  end if;

  v_campaign_key := upper(btrim(coalesce(
    v_code.campaign_key,
    regexp_replace(v_code.code, '-[A-Z0-9]{5,8}$', ''),
    v_code.code
  )));

  perform pg_advisory_xact_lock(hashtext('topup-giftcode|' || p_user_id::text || '|' || v_campaign_key));

  if v_code.is_active is not true
    or (v_code.expires_at is not null and v_code.expires_at < now()) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT'::text;
    return;
  end if;

  select coalesce(max(template.total_limit), v_code.total_limit, 0)
  into v_effective_total_limit
  from public.gift_codes template
  where template.code_type = 'topup_discount'
    and template.assigned_user_id is null
    and template.auto_generate_per_user is true
    and upper(btrim(coalesce(template.campaign_key, template.code))) = v_campaign_key;

  select tgu.id
  into v_pending_reservation_id
  from public.topup_gift_code_usages tgu
  join public.gift_codes gc on gc.id = tgu.gift_code_id
  join public.payment_transactions pt on pt.id = tgu.payment_transaction_id
  where tgu.user_id = p_user_id
    and tgu.status = 'reserved'
    and pt.status = 'pending'
    and tgu.payment_transaction_id is distinct from p_payment_transaction_id
    and upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5,8}$', ''), gc.code))) = v_campaign_key
  limit 1;

  if v_pending_reservation_id is not null then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_PENDING_PAYMENT_EXISTS'::text;
    return;
  end if;

  select count(*) into v_total_used
  from public.topup_gift_code_usages tgu
  join public.gift_codes gc on gc.id = tgu.gift_code_id
  where tgu.status = 'applied'
    and upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5,8}$', ''), gc.code))) = v_campaign_key;

  if v_total_used >= v_effective_total_limit then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT'::text;
    return;
  end if;

  select count(*) into v_user_used
  from public.topup_gift_code_usages tgu
  join public.gift_codes gc on gc.id = tgu.gift_code_id
  where tgu.user_id = p_user_id
    and tgu.status = 'applied'
    and upper(btrim(coalesce(gc.campaign_key, regexp_replace(gc.code, '-[A-Z0-9]{5,8}$', ''), gc.code))) = v_campaign_key;

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
    select u.created_at
    into v_user_created_at
    from public.users u
    where u.id = p_user_id;

    if coalesce(v_user_created_at, to_timestamp(0)) < timestamptz '2026-06-01 00:00:00+07' then
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

revoke execute on function public.reserve_topup_giftcode(uuid, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.reserve_topup_giftcode(uuid, text, uuid, numeric) to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
