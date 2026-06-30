-- Audition AI
-- Enforce giftcode redemption by IP hash on existing Supabase projects.

begin;

drop function if exists public.approve_pending_giftcode_usage(uuid);
drop function if exists public.reject_pending_giftcode_usage(uuid, text);

alter table public.gift_codes
  add column if not exists campaign_key text;

alter table public.users
  add column if not exists account_status text not null default 'active',
  add column if not exists account_warning text,
  add column if not exists account_warning_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_reason text;

create table if not exists public.user_browser_keys (
  id uuid primary key default gen_random_uuid(),
  browser_key_hash text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  account_index integer not null,
  is_checkin_allowed boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists uq_user_browser_keys_hash_user
  on public.user_browser_keys(browser_key_hash, user_id);

create index if not exists idx_user_browser_keys_hash_index
  on public.user_browser_keys(browser_key_hash, account_index);

create or replace function public.bind_user_browser_key(
  p_user_id uuid,
  p_browser_key_hash text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := nullif(btrim(coalesce(p_browser_key_hash, '')), '');
  v_existing_index integer;
  v_next_index integer;
  v_is_admin boolean := false;
begin
  if p_user_id is null or v_hash is null then
    return null;
  end if;

  select coalesce(is_admin, false)
  into v_is_admin
  from public.users
  where id = p_user_id;

  perform pg_advisory_xact_lock(hashtext('browser-key|' || v_hash));

  select account_index
  into v_existing_index
  from public.user_browser_keys
  where browser_key_hash = v_hash
    and user_id = p_user_id
  limit 1;

  if v_existing_index is not null then
    update public.user_browser_keys
    set last_seen_at = now()
    where browser_key_hash = v_hash
      and user_id = p_user_id;
    return v_existing_index;
  end if;

  if v_is_admin then
    v_next_index := 0;
  else
    select coalesce(max(ubk.account_index), 0) + 1
    into v_next_index
    from public.user_browser_keys ubk
    join public.users u on u.id = ubk.user_id
    where ubk.browser_key_hash = v_hash
      and coalesce(u.is_admin, false) = false;
  end if;

  insert into public.user_browser_keys (
    browser_key_hash,
    user_id,
    account_index,
    is_checkin_allowed
  )
  values (
    v_hash,
    p_user_id,
    v_next_index,
    v_is_admin or v_next_index <= 3
  );

  if not v_is_admin and v_next_index > 3 then
    update public.users
    set
      account_status = 'locked',
      locked_at = now(),
      lock_reason = coalesce(lock_reason, 'Vượt quá 3 tài khoản trên cùng browser key'),
      updated_at = now()
    where id = p_user_id;
  end if;

  return v_next_index;
end;
$$;

grant execute on function public.bind_user_browser_key(uuid, text) to service_role;
revoke execute on function public.bind_user_browser_key(uuid, text) from public, anon, authenticated;

update public.gift_codes
set campaign_key = upper(btrim(code))
where campaign_key is null or btrim(campaign_key) = '';

create index if not exists idx_gift_codes_campaign_key
  on public.gift_codes(campaign_key);

alter table public.gift_code_usages
  add column if not exists ip_address text,
  add column if not exists ip_hash text,
  add column if not exists campaign_key text,
  add column if not exists email_fingerprint text,
  add column if not exists browser_key_hash text,
  add column if not exists user_agent_hash text,
  add column if not exists risk_score integer not null default 0,
  add column if not exists risk_flags text[] not null default '{}'::text[],
  add column if not exists reward_status text not null default 'granted',
  add column if not exists abuse_status text not null default 'ok',
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text;

alter table public.gift_code_usages
  drop constraint if exists uq_gift_code_usages_campaign_user_ok,
  drop constraint if exists uq_gift_code_usages_campaign_email_ok,
  drop constraint if exists uq_gift_code_usages_campaign_ip_ok,
  drop constraint if exists uq_gift_code_usages_campaign_browser_ok;

drop index if exists public.uq_gift_code_usages_code_ip_hash;
drop index if exists public.uq_gift_code_usages_ip_hash;
drop index if exists public.uq_gift_code_usages_campaign_user_ok;
drop index if exists public.uq_gift_code_usages_campaign_email_ok;
drop index if exists public.uq_gift_code_usages_campaign_ip_ok;
drop index if exists public.uq_gift_code_usages_campaign_browser_ok;

update public.gift_code_usages gcu
set campaign_key = upper(btrim(coalesce(gc.campaign_key, gc.code)))
from public.gift_codes gc
where gc.id = gcu.gift_code_id
  and (gcu.campaign_key is null or btrim(gcu.campaign_key) = '');

update public.gift_code_usages
set campaign_key = upper(btrim(campaign_key))
where campaign_key is not null;

with source as (
  select
    gcu.id,
    lower(btrim(coalesce(u.email, ''))) as email
  from public.gift_code_usages gcu
  join public.users u on u.id = gcu.user_id
  where gcu.email_fingerprint is null
    and u.email is not null
    and position('@' in u.email) > 1
),
normalized as (
  select
    id,
    case
      when split_part(email, '@', 2) in ('gmail.com', 'googlemail.com') then 'gmail.com'
      else split_part(email, '@', 2)
    end as domain,
    case
      when split_part(email, '@', 2) in ('gmail.com', 'googlemail.com') then replace(split_part(split_part(email, '@', 1), '+', 1), '.', '')
      else split_part(split_part(email, '@', 1), '+', 1)
    end as local_part
  from source
),
fingerprinted as (
  select
    id,
    domain || ':' || case
      when length(regexp_replace(local_part, '[0-9]+$', '')) >= 6 then regexp_replace(local_part, '[0-9]+$', '')
      else local_part
    end as email_fingerprint
  from normalized
  where domain <> ''
    and local_part <> ''
)
update public.gift_code_usages gcu
set email_fingerprint = f.email_fingerprint
from fingerprinted f
where f.id = gcu.id;

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, user_id
      order by created_at, id
    ) as rn
  from public.gift_code_usages
  where abuse_status = 'ok'
    and campaign_key is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_user',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by user in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, email_fingerprint
      order by created_at, id
    ) as rn
  from public.gift_code_usages
  where abuse_status = 'ok'
    and campaign_key is not null
    and email_fingerprint is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_email_cluster',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by normalized email cluster in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, ip_hash
      order by created_at, id
    ) as rn
  from public.gift_code_usages
  where abuse_status = 'ok'
    and campaign_key is not null
    and ip_hash is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_ip',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by IP/network in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

drop index if exists public.uq_gift_code_usages_code_ip_hash;
drop index if exists public.uq_gift_code_usages_ip_hash;
drop index if exists public.uq_gift_code_usages_campaign_user_ok;
drop index if exists public.uq_gift_code_usages_campaign_email_ok;
drop index if exists public.uq_gift_code_usages_campaign_ip_ok;
drop index if exists public.uq_gift_code_usages_campaign_browser_ok;

update public.gift_code_usages
set
  campaign_key = nullif(upper(btrim(campaign_key)), ''),
  email_fingerprint = nullif(lower(btrim(email_fingerprint)), ''),
  browser_key_hash = nullif(btrim(browser_key_hash), ''),
  ip_hash = nullif(btrim(ip_hash), ''),
  abuse_status = coalesce(nullif(btrim(abuse_status), ''), 'ok');

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, user_id
      order by created_at nulls last, id
    ) as rn
  from public.gift_code_usages
  where coalesce(abuse_status, 'ok') = 'ok'
    and campaign_key is not null
    and user_id is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_user',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by user in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, email_fingerprint
      order by created_at nulls last, id
    ) as rn
  from public.gift_code_usages
  where coalesce(abuse_status, 'ok') = 'ok'
    and campaign_key is not null
    and email_fingerprint is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_email_cluster',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by normalized email cluster in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, ip_hash
      order by created_at nulls last, id
    ) as rn
  from public.gift_code_usages
  where coalesce(abuse_status, 'ok') = 'ok'
    and campaign_key is not null
    and ip_hash is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_ip',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by IP/network in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by campaign_key, browser_key_hash
      order by created_at nulls last, id
    ) as rn
  from public.gift_code_usages
  where coalesce(abuse_status, 'ok') = 'ok'
    and campaign_key is not null
    and browser_key_hash is not null
)
update public.gift_code_usages gcu
set
  abuse_status = 'duplicate_browser_key',
  revoked_at = coalesce(gcu.revoked_at, now()),
  revocation_reason = coalesce(gcu.revocation_reason, 'Duplicate giftcode redemption by browser key in the same campaign')
from ranked r
where r.id = gcu.id
  and r.rn > 1;

create index if not exists idx_gift_code_usages_ip_hash_created
  on public.gift_code_usages(ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists idx_gift_code_usages_campaign_status
  on public.gift_code_usages(campaign_key, abuse_status, created_at desc);

create index if not exists idx_gift_code_usages_email_fingerprint
  on public.gift_code_usages(email_fingerprint, created_at desc)
  where email_fingerprint is not null;

create index if not exists idx_gift_code_usages_browser_key_hash
  on public.gift_code_usages(browser_key_hash, created_at desc)
  where browser_key_hash is not null;

create index if not exists idx_gift_code_usages_user_agent_hash
  on public.gift_code_usages(user_agent_hash, created_at desc)
  where user_agent_hash is not null;

create unique index uq_gift_code_usages_campaign_user_ok
  on public.gift_code_usages(campaign_key, user_id)
  where campaign_key is not null
    and abuse_status = 'ok';

create unique index uq_gift_code_usages_campaign_ip_ok
  on public.gift_code_usages(campaign_key, ip_hash)
  where campaign_key is not null
    and ip_hash is not null
    and abuse_status = 'ok';

create unique index uq_gift_code_usages_campaign_email_ok
  on public.gift_code_usages(campaign_key, email_fingerprint)
  where campaign_key is not null
    and email_fingerprint is not null
    and abuse_status = 'ok';

create unique index uq_gift_code_usages_campaign_browser_ok
  on public.gift_code_usages(campaign_key, browser_key_hash)
  where campaign_key is not null
    and browser_key_hash is not null
    and abuse_status = 'ok';

drop policy if exists "User insert own giftcode usages" on public.gift_code_usages;
revoke insert, update, delete on table public.gift_code_usages from authenticated;

drop function if exists public.redeem_giftcode(uuid, text, text, text);
drop function if exists public.redeem_giftcode(uuid, text, text, text, text);

create or replace function public.redeem_giftcode(
  p_user_id uuid,
  p_code text,
  p_ip_hash text,
  p_ip_address text default null,
  p_user_agent_hash text default null,
  p_browser_key_hash text default null
)
returns table (
  success boolean,
  reward numeric,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.gift_codes%rowtype;
  v_campaign_key text;
  v_usage_count integer := 0;
  v_ip_used boolean := false;
  v_usage_id uuid;
  v_code_normalized text := upper(btrim(coalesce(p_code, '')));
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_user_email text;
  v_email_domain text;
  v_email_local text;
  v_email_root text;
  v_email_fingerprint text;
  v_email_used boolean := false;
  v_user_agent_hash text := nullif(btrim(coalesce(p_user_agent_hash, '')), '');
  v_browser_key_hash text := nullif(btrim(coalesce(p_browser_key_hash, '')), '');
  v_browser_used boolean := false;
  v_user_created_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_account_age_minutes integer := null;
  v_recent_user_agent_count integer := 0;
  v_risk_score integer := 0;
  v_risk_flags text[] := '{}'::text[];
  v_charge_applied boolean := false;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if v_code_normalized = '' then
    raise exception 'GIFTCODE_REQUIRED';
  end if;

  if v_ip_hash is null then
    raise exception 'IP_REQUIRED';
  end if;

  if exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and coalesce(u.account_status, 'active') = 'locked'
  ) then
    raise exception 'ACCOUNT_LOCKED';
  end if;

  select
    lower(btrim(coalesce(u.email, ''))),
    u.created_at,
    au.email_confirmed_at
  into
    v_user_email,
    v_user_created_at,
    v_email_confirmed_at
  from public.users u
  left join auth.users au on au.id = u.id
  where u.id = p_user_id;

  if position('@' in coalesce(v_user_email, '')) > 1 then
    v_email_domain := split_part(v_user_email, '@', 2);
    v_email_local := split_part(split_part(v_user_email, '@', 1), '+', 1);

    if v_email_domain in ('gmail.com', 'googlemail.com') then
      v_email_domain := 'gmail.com';
      v_email_local := replace(v_email_local, '.', '');
    end if;

    v_email_root := regexp_replace(v_email_local, '[0-9]+$', '');
    if length(v_email_root) < 6 then
      v_email_root := v_email_local;
    end if;

    if coalesce(v_email_domain, '') <> '' and coalesce(v_email_root, '') <> '' then
      v_email_fingerprint := v_email_domain || ':' || v_email_root;
    end if;
  end if;

  select *
  into v_code
  from public.gift_codes gc
  where upper(gc.code) = v_code_normalized
  for update;

  if not found or coalesce(v_code.is_active, false) = false then
    raise exception 'GIFT_CODE_INVALID';
  end if;

  v_campaign_key := upper(btrim(coalesce(v_code.campaign_key, v_code.code, v_code_normalized)));

  perform pg_advisory_xact_lock(hashtext(v_ip_hash || '|' || v_campaign_key));

  if v_user_created_at is not null then
    v_account_age_minutes := floor(extract(epoch from (now() - v_user_created_at)) / 60)::integer;
    if v_account_age_minutes < 10 then
      v_risk_score := v_risk_score + 45;
      v_risk_flags := array_append(v_risk_flags, 'new_account');
    elsif v_account_age_minutes < 1440 then
      v_risk_score := v_risk_score + 15;
      v_risk_flags := array_append(v_risk_flags, 'young_account');
    end if;
  else
    v_risk_score := v_risk_score + 30;
    v_risk_flags := array_append(v_risk_flags, 'missing_account_age');
  end if;

  if v_email_confirmed_at is null then
    v_risk_score := v_risk_score + 15;
    v_risk_flags := array_append(v_risk_flags, 'email_unverified');
  end if;

  if v_user_agent_hash is not null then
    select count(*)::integer
    into v_recent_user_agent_count
    from public.gift_code_usages gcu
    where gcu.campaign_key = v_campaign_key
      and gcu.user_agent_hash = v_user_agent_hash
      and gcu.abuse_status = 'ok'
      and gcu.created_at >= now() - interval '24 hours';

    if v_recent_user_agent_count >= 5 then
      v_risk_score := v_risk_score + 45;
      v_risk_flags := array_append(v_risk_flags, 'user_agent_campaign_burst');
    elsif v_recent_user_agent_count >= 2 then
      v_risk_score := v_risk_score + 20;
      v_risk_flags := array_append(v_risk_flags, 'user_agent_reuse');
    end if;
  else
    v_risk_score := v_risk_score + 10;
    v_risk_flags := array_append(v_risk_flags, 'missing_user_agent');
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'GIFT_CODE_EXPIRED';
  end if;

  if coalesce(v_code.used_count, 0) >= coalesce(v_code.total_limit, 0) then
    raise exception 'GIFT_CODE_LIMIT_REACHED';
  end if;

  select count(*)::integer
  into v_usage_count
  from public.gift_code_usages gcu
  where gcu.campaign_key = v_campaign_key
    and gcu.user_id = p_user_id;

  if v_usage_count >= 1 then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  end if;

  if v_email_fingerprint is not null then
    select exists(
      select 1
      from public.gift_code_usages gcu
      where gcu.email_fingerprint = v_email_fingerprint
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    )
    into v_email_used;

    if v_email_used then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_EMAIL_CLUSTER';
    end if;
  end if;

  if v_browser_key_hash is not null then
    select exists(
      select 1
      from public.gift_code_usages gcu
      where gcu.browser_key_hash = v_browser_key_hash
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    )
    into v_browser_used;

    if v_browser_used then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_BROWSER';
    end if;
  end if;

  select exists(
    select 1
    from public.gift_code_usages gcu
    where gcu.ip_hash = v_ip_hash
      and gcu.campaign_key = v_campaign_key
      and gcu.abuse_status = 'ok'
  )
  into v_ip_used;

  if v_ip_used then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
  end if;

  insert into public.gift_code_usages (
    user_id,
    gift_code_id,
    campaign_key,
    email_fingerprint,
    browser_key_hash,
    user_agent_hash,
    risk_score,
    risk_flags,
    reward_status,
    ip_address,
    ip_hash,
    abuse_status
  )
  values (
    p_user_id,
    v_code.id,
    v_campaign_key,
    v_email_fingerprint,
    v_browser_key_hash,
    v_user_agent_hash,
    v_risk_score,
    v_risk_flags,
    'granted',
    nullif(btrim(coalesce(p_ip_address, '')), ''),
    v_ip_hash,
    'ok'
  )
  returning id into v_usage_id;

  update public.gift_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = v_code.id;

  v_charge_applied := public.apply_balance_transaction(
    p_user_id,
    coalesce(v_code.reward, 0),
    format('Giftcode: %s', v_code_normalized),
    'giftcode',
    'giftcode_redeem',
    v_usage_id::text,
    jsonb_build_object(
      'gift_code_id', v_code.id,
      'gift_code', v_code_normalized,
        'campaign_key', v_campaign_key,
        'email_fingerprint', v_email_fingerprint,
        'browser_key_hash', v_browser_key_hash,
        'ip_hash', v_ip_hash,
      'risk_score', v_risk_score,
      'risk_flags', v_risk_flags
    )
  );

  if not v_charge_applied then
    raise exception 'GIFT_CODE_ALREADY_REDEEMED';
  end if;

  return query
  select true, coalesce(v_code.reward, 0), 'SUCCESS'::text;
exception
  when unique_violation then
    if exists (
      select 1
      from public.gift_code_usages gcu
      where gcu.email_fingerprint = v_email_fingerprint
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_EMAIL_CLUSTER';
    end if;
    if exists (
      select 1
      from public.gift_code_usages gcu
      where gcu.browser_key_hash = v_browser_key_hash
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_BROWSER';
    end if;
    if exists (
      select 1
      from public.gift_code_usages gcu
      where gcu.ip_hash = v_ip_hash
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
    end if;
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  when others then
    raise;
end;
$$;

grant execute on function public.redeem_giftcode(uuid, text, text, text, text, text) to service_role;
revoke execute on function public.redeem_giftcode(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.revoke_giftcode_abuse_duplicates(
  p_campaign_key text default null,
  p_dry_run boolean default true
)
returns table (
  usage_id uuid,
  user_id uuid,
  email text,
  campaign_key text,
  gift_code text,
  reward numeric,
  abuse_status text,
  action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_key text := nullif(upper(btrim(coalesce(p_campaign_key, ''))), '');
  v_row record;
  v_reference_id text;
begin
  for v_row in
    select
      gcu.id as usage_id,
      gcu.user_id,
      u.email,
      gcu.campaign_key,
      gc.code as gift_code,
      coalesce(gc.reward, 0) as reward,
      gcu.abuse_status
    from public.gift_code_usages gcu
    join public.gift_codes gc on gc.id = gcu.gift_code_id
    left join public.users u on u.id = gcu.user_id
    where gcu.abuse_status <> 'ok'
      and (v_campaign_key is null or gcu.campaign_key = v_campaign_key)
    order by gcu.campaign_key, gcu.created_at
  loop
    v_reference_id := v_row.usage_id::text;

    if not p_dry_run and v_row.reward > 0 then
      perform public.apply_balance_transaction(
        v_row.user_id,
        -v_row.reward,
        format('Thu hồi giftcode lạm dụng: %s', v_row.gift_code),
        'giftcode_abuse_reversal',
        'giftcode_abuse_reversal',
        v_reference_id,
        jsonb_build_object(
          'gift_code', v_row.gift_code,
          'campaign_key', v_row.campaign_key,
          'usage_id', v_row.usage_id,
          'abuse_status', v_row.abuse_status
        )
      );
    end if;

    usage_id := v_row.usage_id;
    user_id := v_row.user_id;
    email := v_row.email;
    campaign_key := v_row.campaign_key;
    gift_code := v_row.gift_code;
    reward := v_row.reward;
    abuse_status := v_row.abuse_status;
    action := case when p_dry_run then 'dry_run' else 'reversed' end;
    return next;
  end loop;
end;
$$;

grant execute on function public.revoke_giftcode_abuse_duplicates(text, boolean) to service_role;
revoke execute on function public.revoke_giftcode_abuse_duplicates(text, boolean) from public, anon, authenticated;

create or replace function public.revoke_giftcode_usage(
  p_usage_id uuid,
  p_reason text default 'Revoked giftcode abuse'
)
returns table (
  usage_id uuid,
  user_id uuid,
  gift_code text,
  reward numeric,
  action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.gift_code_usages%rowtype;
  v_code public.gift_codes%rowtype;
begin
  select *
  into v_usage
  from public.gift_code_usages
  where id = p_usage_id
  for update;

  if not found then
    raise exception 'GIFT_CODE_USAGE_NOT_FOUND';
  end if;

  if v_usage.reward_status = 'revoked' then
    raise exception 'GIFT_CODE_USAGE_ALREADY_REVOKED';
  end if;

  select *
  into v_code
  from public.gift_codes
  where id = v_usage.gift_code_id;

  if not found then
    raise exception 'GIFT_CODE_INVALID';
  end if;

  perform public.apply_balance_transaction(
    v_usage.user_id,
    -coalesce(v_code.reward, 0),
    format('Thu hồi giftcode: %s', v_code.code),
    'giftcode_abuse_reversal',
    'giftcode_abuse_reversal',
    v_usage.id::text,
    jsonb_build_object(
      'gift_code', v_code.code,
      'campaign_key', v_usage.campaign_key,
      'usage_id', v_usage.id,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  update public.gift_code_usages
  set
    reward_status = 'revoked',
    abuse_status = 'revoked_abuse',
    revoked_at = now(),
    revocation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_usage.id;

  return query
  select v_usage.id, v_usage.user_id, v_code.code, coalesce(v_code.reward, 0), 'revoked'::text;
end;
$$;

grant execute on function public.revoke_giftcode_usage(uuid, text) to service_role;
revoke execute on function public.revoke_giftcode_usage(uuid, text) from public, anon, authenticated;

create or replace function public.warn_user_account(
  p_user_id uuid,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    account_warning = nullif(btrim(coalesce(p_message, '')), ''),
    account_warning_at = now(),
    updated_at = now()
  where id = p_user_id;

  return found;
end;
$$;

grant execute on function public.warn_user_account(uuid, text) to service_role;
revoke execute on function public.warn_user_account(uuid, text) from public, anon, authenticated;

create or replace function public.lock_user_account(
  p_user_id uuid,
  p_reason text default 'Giftcode abuse'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    account_status = 'locked',
    locked_at = now(),
    lock_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where id = p_user_id;

  return found;
end;
$$;

grant execute on function public.lock_user_account(uuid, text) to service_role;
revoke execute on function public.lock_user_account(uuid, text) from public, anon, authenticated;

create or replace function public.unlock_user_account(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    account_status = 'active',
    locked_at = null,
    lock_reason = null,
    updated_at = now()
  where id = p_user_id;

  return found;
end;
$$;

grant execute on function public.unlock_user_account(uuid) to service_role;
revoke execute on function public.unlock_user_account(uuid) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
