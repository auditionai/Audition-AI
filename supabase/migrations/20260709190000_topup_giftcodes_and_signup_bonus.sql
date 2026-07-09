begin;

alter table public.gift_codes
  add column if not exists code_type text not null default 'reward',
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists audience text not null default 'all',
  add column if not exists assigned_user_id uuid references public.users(id) on delete cascade,
  add column if not exists auto_generate_per_user boolean not null default false;

alter table public.payment_transactions
  add column if not exists topup_giftcode text,
  add column if not exists topup_gift_code_id uuid references public.gift_codes(id) on delete set null,
  add column if not exists original_amount_vnd numeric,
  add column if not exists discount_amount_vnd numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gift_codes_code_type_check'
      and conrelid = 'public.gift_codes'::regclass
  ) then
    alter table public.gift_codes
      add constraint gift_codes_code_type_check
      check (code_type in ('reward', 'topup_discount'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'gift_codes_audience_check'
      and conrelid = 'public.gift_codes'::regclass
  ) then
    alter table public.gift_codes
      add constraint gift_codes_audience_check
      check (audience in ('all', 'new_user_first_topup', 'specific_user'));
  end if;
end
$$;

create index if not exists idx_gift_codes_topup_lookup
  on public.gift_codes(code_type, is_active, audience, assigned_user_id);

create table if not exists public.topup_gift_code_usages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  gift_code_id uuid not null references public.gift_codes(id) on delete cascade,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  status text not null default 'reserved',
  original_amount_vnd numeric not null default 0,
  discount_amount_vnd numeric not null default 0,
  final_amount_vnd numeric not null default 0,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  cancelled_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'topup_gift_code_usages_status_check'
      and conrelid = 'public.topup_gift_code_usages'::regclass
  ) then
    alter table public.topup_gift_code_usages
      add constraint topup_gift_code_usages_status_check
      check (status in ('reserved', 'applied', 'cancelled'));
  end if;
end
$$;

create index if not exists idx_topup_gift_code_usages_user_created
  on public.topup_gift_code_usages(user_id, created_at desc);

create unique index if not exists uq_topup_gift_code_usage_user_code_active
  on public.topup_gift_code_usages(user_id, gift_code_id)
  where status in ('reserved', 'applied');

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
  with paid_topups as (
    select count(*)::integer as count
    from public.payment_transactions
    where user_id = p_user_id
      and status = 'paid'
  ),
  usage_counts as (
    select gift_code_id, count(*)::bigint as count
    from public.topup_gift_code_usages
    where status in ('reserved', 'applied')
    group by gift_code_id
  ),
  user_usage as (
    select
      gift_code_id,
      count(*) filter (where status in ('reserved', 'applied'))::bigint as count,
      max(created_at) as last_used_at,
      max(status) filter (where status = 'applied') as applied_status,
      max(status) filter (where status = 'reserved') as reserved_status
    from public.topup_gift_code_usages
    where user_id = p_user_id
    group by gift_code_id
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
      when coalesce(uu.reserved_status, '') = 'reserved' then 'reserved'
      when gc.is_active is not true then 'unavailable'
      when gc.expires_at is not null and gc.expires_at < now() then 'expired'
      when coalesce(uc.count, 0) >= gc.total_limit then 'limit_reached'
      when coalesce(uu.count, 0) >= gc.max_per_user then 'used'
      when gc.audience = 'specific_user' and gc.assigned_user_id is distinct from p_user_id then 'unavailable'
      when gc.audience = 'new_user_first_topup' and (select count from paid_topups) > 0 then 'unavailable'
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
        or gc.code !~ '-[A-Z0-9]{5}$'
      )
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
  v_total_used integer := 0;
  v_user_used integer := 0;
  v_paid_topups integer := 0;
  v_discount numeric := 0;
  v_final numeric := 0;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if v_code_normalized = '' then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric, p_original_amount_vnd, 'GIFTCODE_REQUIRED'::text;
    return;
  end if;

  select *
  into v_code
  from public.gift_codes
  where upper(code) = v_code_normalized
    and code_type = 'topup_discount'
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

  if v_code.is_active is not true
    or (v_code.expires_at is not null and v_code.expires_at < now()) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT'::text;
    return;
  end if;

  select count(*) into v_total_used
  from public.topup_gift_code_usages
  where gift_code_id = v_code.id
    and status in ('reserved', 'applied');

  if v_total_used >= coalesce(v_code.total_limit, 0) then
    return query select false, v_code.id, v_code.code, v_code.discount_percent, 0::numeric, p_original_amount_vnd, 'GIFT_CODE_TOPUP_EXPIRED_OR_LIMIT'::text;
    return;
  end if;

  select count(*) into v_user_used
  from public.topup_gift_code_usages
  where gift_code_id = v_code.id
    and user_id = p_user_id
    and status in ('reserved', 'applied');

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
    from public.payment_transactions
    where user_id = p_user_id
      and status = 'paid';

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

  update public.gift_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = v_code.id;

  return query select true, v_code.id, v_code.code, v_code.discount_percent, v_discount, v_final, 'SUCCESS'::text;
end;
$$;

create or replace function public.mark_topup_giftcode_applied(p_transaction_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.topup_gift_code_usages
  set status = 'applied',
      applied_at = coalesce(applied_at, now())
  where payment_transaction_id = p_transaction_id
    and status = 'reserved';
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    display_name,
    photo_url,
    vcoin_balance,
    is_admin,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    0,
    false,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users.display_name),
    photo_url = coalesce(excluded.photo_url, public.users.photo_url),
    updated_at = now();

  return new;
end;
$$;

commit;
