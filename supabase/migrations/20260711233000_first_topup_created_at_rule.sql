begin;

-- New first-topup discount rule:
-- accounts created from 2026-06-01 00:00:00 +07 are eligible unless they
-- already used the campaign. We no longer disqualify users merely because they
-- have an older paid top-up.

create or replace function public.get_available_topup_giftcodes(p_user_id uuid)
returns table (
  id uuid,
  code text,
  campaign_key text,
  discount_percent numeric,
  total_limit numeric,
  used_count bigint,
  remaining_count numeric,
  max_per_user numeric,
  user_used_count bigint,
  audience text,
  expires_at timestamptz,
  status text,
  last_used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  return query
  with user_profile as (
    select u.created_at
    from public.users u
    where u.id = p_user_id
  ),
  usage_counts as (
    select tgu.gift_code_id, count(*)::bigint as count
    from public.topup_gift_code_usages tgu
    where tgu.status = 'applied'
    group by tgu.gift_code_id
  ),
  user_usage as (
    select
      tgu.gift_code_id,
      count(*) filter (where tgu.status = 'applied')::bigint as count,
      max(tgu.applied_at) filter (where tgu.status = 'applied') as last_used_at,
      max(tgu.status) filter (where tgu.status = 'applied') as applied_status
    from public.topup_gift_code_usages tgu
    where tgu.user_id = p_user_id
    group by tgu.gift_code_id
  )
  select
    gc.id,
    gc.code,
    gc.campaign_key,
    gc.discount_percent,
    gc.total_limit,
    coalesce(uc.count, 0) as used_count,
    greatest(gc.total_limit - coalesce(uc.count, 0), 0) as remaining_count,
    gc.max_per_user,
    coalesce(uu.count, 0) as user_used_count,
    gc.audience,
    gc.expires_at,
    case
      when coalesce(uu.applied_status, '') = 'applied' then 'used'
      when gc.is_active is not true then 'unavailable'
      when gc.expires_at is not null and gc.expires_at < now() then 'expired'
      when coalesce(uc.count, 0) >= gc.total_limit then 'limit_reached'
      when coalesce(uu.count, 0) >= gc.max_per_user then 'used'
      when gc.audience = 'specific_user' and gc.assigned_user_id is distinct from p_user_id then 'unavailable'
      when gc.audience = 'new_user_first_topup' and coalesce((select created_at from user_profile), to_timestamp(0)) < timestamptz '2026-06-01 00:00:00+07' then 'unavailable'
      else 'available'
    end as status,
    uu.last_used_at
  from public.gift_codes gc
  left join usage_counts uc on uc.gift_code_id = gc.id
  left join user_usage uu on uu.gift_code_id = gc.id
  where gc.code_type = 'topup_discount'
    and not (
      gc.assigned_user_id is null
      and (
        gc.auto_generate_per_user is true
        or gc.code !~ '-[A-Z0-9]{5,8}$'
      )
    )
    and not (
      gc.assigned_user_id = p_user_id
      and gc.code ~ '-[A-Z0-9]{5,8}$'
      and coalesce(uu.count, 0) = 0
    )
    and (gc.assigned_user_id is null or gc.assigned_user_id = p_user_id)
    and (
      gc.audience in ('all', 'new_user_first_topup')
      or (gc.audience = 'specific_user' and gc.assigned_user_id = p_user_id)
    )
  order by
    case
      when gc.audience = 'new_user_first_topup' then 0
      when gc.audience = 'specific_user' then 1
      else 2
    end,
    gc.discount_percent desc,
    gc.created_at desc;
end;
$$;

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

  if v_total_used >= coalesce(v_code.total_limit, 0) then
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

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;