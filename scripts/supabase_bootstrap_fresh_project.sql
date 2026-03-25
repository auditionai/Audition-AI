-- Audition AI
-- Fresh Supabase bootstrap for a brand-new project
-- Safe to run on an empty project and generally safe to re-run.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  photo_url text,
  vcoin_balance numeric not null default 0,
  last_active timestamptz,
  is_vip boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists photo_url text,
  add column if not exists vcoin_balance numeric not null default 0,
  add column if not exists last_active timestamptz,
  add column if not exists is_vip boolean not null default false,
  add column if not exists is_admin boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_users_email
  on public.users(email)
  where email is not null;

create index if not exists idx_users_is_admin on public.users(is_admin);
create index if not exists idx_users_last_active on public.users(last_active desc);

create or replace function public.check_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  );
$$;

create or replace function public.guard_user_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if public.check_is_admin() then
    return new;
  end if;

  if auth.uid() is distinct from old.id then
    raise exception 'FORBIDDEN';
  end if;

  new.id := old.id;
  new.email := old.email;
  new.vcoin_balance := old.vcoin_balance;
  new.is_admin := old.is_admin;
  new.is_vip := old.is_vip;
  new.created_at := old.created_at;

  return new;
end;
$$;

create or replace function public.fill_generated_image_user_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.user_name, '') = '' and new.user_id is not null then
    select u.display_name
    into new.user_name
    from public.users u
    where u.id = new.user_id
    limit 1;
  end if;

  return new;
end;
$$;

create table if not exists public.credit_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credits_amount numeric not null default 0,
  price_vnd numeric not null default 0,
  tag text,
  bonus_credits numeric not null default 0,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  transfer_syntax text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_credit_packages_active_order
  on public.credit_packages(is_active, display_order);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  bonus_percent numeric not null default 0,
  start_time timestamptz not null default now(),
  end_time timestamptz not null default now(),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_promotions_active_window
  on public.promotions(is_active, start_time, end_time);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_value text not null,
  tier text,
  status text not null default 'active',
  last_used_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_api_keys_key_value
  on public.api_keys(key_value);

alter table public.api_keys
  drop constraint if exists api_keys_status_check;

alter table public.api_keys
  add constraint api_keys_status_check
  check (status in ('active', 'inactive', 'error'));

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.try_acquire_queue_worker_lock(
  p_owner text,
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 90), 15);
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => v_lease_seconds);
  v_acquired boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  insert into public.system_settings (key, value)
  values (
    'queue_worker_lock',
    jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    )
  )
  on conflict (key) do nothing;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    ),
    updated_at = v_now
  where key = 'queue_worker_lock'
    and (
      coalesce((value ->> 'owner')::text, '') = v_owner
      or coalesce((value ->> 'expiresAt')::timestamptz, to_timestamp(0)) <= v_now
    )
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_queue_worker_lock(
  p_owner text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_released boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', null,
      'expiresAt', to_timestamp(0),
      'heartbeatAt', now()
    ),
    updated_at = now()
  where key = 'queue_worker_lock'
    and coalesce((value ->> 'owner')::text, '') = v_owner
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

create table if not exists public.gift_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  reward numeric not null default 0,
  total_limit numeric not null default 100,
  used_count numeric not null default 0,
  max_per_user numeric not null default 1,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_gift_codes_code
  on public.gift_codes(upper(code));

create table if not exists public.gift_code_usages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  gift_code_id uuid not null references public.gift_codes(id) on delete cascade,
  ip_address text,
  ip_hash text,
  created_at timestamptz not null default now()
);

alter table public.gift_code_usages
  add column if not exists ip_address text,
  add column if not exists ip_hash text;

create unique index if not exists uq_gift_code_usages_user_code
  on public.gift_code_usages(user_id, gift_code_id);

create index if not exists idx_gift_code_usages_code_created
  on public.gift_code_usages(gift_code_id, created_at desc);

create index if not exists idx_gift_code_usages_ip_hash_created
  on public.gift_code_usages(ip_hash, created_at desc)
  where ip_hash is not null;

create table if not exists public.vcoin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null,
  description text,
  type text,
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vcoin_transactions_user_created_at
  on public.vcoin_transactions(user_id, created_at desc);

create unique index if not exists uq_vcoin_transactions_reference
  on public.vcoin_transactions(reference_type, reference_id)
  where reference_type is not null and reference_id is not null;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid references public.credit_packages(id) on delete set null,
  amount_vnd numeric not null default 0,
  vcoin_received numeric not null default 0,
  status text not null default 'pending',
  payment_method text not null default 'payos',
  order_code text,
  provider_order_code bigint,
  provider_payment_link_id text,
  checkout_url text,
  provider_status text,
  provider_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_transactions
  drop constraint if exists payment_transactions_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_status_check
  check (status in ('pending', 'paid', 'cancelled', 'failed'));

create unique index if not exists uq_payment_transactions_provider_order_code
  on public.payment_transactions(provider_order_code)
  where provider_order_code is not null;

create unique index if not exists uq_payment_transactions_order_code
  on public.payment_transactions(order_code)
  where order_code is not null;

create index if not exists idx_payment_transactions_user_created_at
  on public.payment_transactions(user_id, created_at desc);

create table if not exists public.style_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  trigger_prompt text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_style_presets_active on public.style_presets(is_active, created_at desc);

create table if not exists public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  check_in_date date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_daily_checkins_user_date
  on public.daily_check_ins(user_id, check_in_date);

create table if not exists public.milestone_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day_milestone numeric not null,
  reward_amount numeric not null,
  claim_month text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_milestone_claims_user_month_day
  on public.milestone_claims(user_id, coalesce(claim_month, ''), day_milestone);

create table if not exists public.model_pricing (
  id uuid primary key default gen_random_uuid(),
  model_id text not null,
  option_id text not null,
  tst_price_credits numeric not null default 0,
  audition_price_vcoin numeric not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_model_pricing_model_option
  on public.model_pricing(model_id, option_id);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  user_name text,
  image_url text not null default '',
  prompt text not null default '',
  model_used text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_public boolean not null default false,
  tool_id text,
  tool_name text,
  status text not null default 'completed',
  job_id text,
  progress integer not null default 100,
  error_message text,
  cost_vcoin integer,
  asset_type text not null default 'image',
  queue_kind text,
  queue_payload jsonb,
  provider text not null default 'tst',
  processing_started_at timestamptz,
  finished_at timestamptz,
  next_poll_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_error_at timestamptz
);

alter table public.generated_images
  drop constraint if exists generated_images_status_check;

alter table public.generated_images
  add constraint generated_images_status_check
  check (status in ('queued', 'processing', 'completed', 'failed'));

alter table public.generated_images
  drop constraint if exists generated_images_asset_type_check;

alter table public.generated_images
  add constraint generated_images_asset_type_check
  check (asset_type in ('image', 'video'));

create index if not exists idx_generated_images_user_created_at
  on public.generated_images(user_id, created_at desc);

create index if not exists idx_generated_images_status
  on public.generated_images(status);

create index if not exists idx_generated_images_job_id
  on public.generated_images(job_id);

create index if not exists idx_generated_images_public_created_at
  on public.generated_images(is_public, created_at desc);

create index if not exists idx_generated_images_updated_at
  on public.generated_images(updated_at desc);

create index if not exists idx_generated_images_dispatch_queue
  on public.generated_images(status, asset_type, created_at);

create index if not exists idx_generated_images_poll_queue
  on public.generated_images(status, next_poll_at);

create index if not exists idx_generated_images_queue_lease
  on public.generated_images(lease_expires_at);

create table if not exists public.app_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  visit_date date not null default current_date,
  route text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_visits_created_at on public.app_visits(created_at desc);
create index if not exists idx_app_visits_visit_date on public.app_visits(visit_date desc);
create index if not exists idx_app_visits_user_id on public.app_visits(user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists trg_users_touch_updated_at on public.users;
create trigger trg_users_touch_updated_at
before update on public.users
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_users_guard_profile_update on public.users;
create trigger trg_users_guard_profile_update
before update on public.users
for each row
execute function public.guard_user_profile_update();

drop trigger if exists trg_generated_images_touch_updated_at on public.generated_images;
create trigger trg_generated_images_touch_updated_at
before update on public.generated_images
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_generated_images_fill_user_name on public.generated_images;
create trigger trg_generated_images_fill_user_name
before insert or update on public.generated_images
for each row
execute function public.fill_generated_image_user_name();

drop trigger if exists trg_credit_packages_touch_updated_at on public.credit_packages;
create trigger trg_credit_packages_touch_updated_at
before update on public.credit_packages
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_promotions_touch_updated_at on public.promotions;
create trigger trg_promotions_touch_updated_at
before update on public.promotions
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_api_keys_touch_updated_at on public.api_keys;
create trigger trg_api_keys_touch_updated_at
before update on public.api_keys
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_style_presets_touch_updated_at on public.style_presets;
create trigger trg_style_presets_touch_updated_at
before update on public.style_presets
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_system_settings_touch_updated_at on public.system_settings;
create trigger trg_system_settings_touch_updated_at
before update on public.system_settings
for each row
execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auth sync
-- ---------------------------------------------------------------------------

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
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
      ''
    ),
    0,
    false,
    coalesce(new.created_at, now()),
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.users (
  id,
  email,
  display_name,
  photo_url,
  created_at,
  updated_at
)
select
  au.id,
  au.email,
  coalesce(
    au.raw_user_meta_data->>'display_name',
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    split_part(au.email, '@', 1)
  ),
  coalesce(
    au.raw_user_meta_data->>'avatar_url',
    au.raw_user_meta_data->>'picture',
    ''
  ),
  coalesce(au.created_at, now()),
  now()
from auth.users au
on conflict (id) do update
set
  email = excluded.email,
  display_name = coalesce(public.users.display_name, excluded.display_name),
  photo_url = coalesce(public.users.photo_url, excluded.photo_url),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.credit_packages enable row level security;
alter table public.promotions enable row level security;
alter table public.api_keys enable row level security;
alter table public.system_settings enable row level security;
alter table public.gift_codes enable row level security;
alter table public.gift_code_usages enable row level security;
alter table public.vcoin_transactions enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.style_presets enable row level security;
alter table public.daily_check_ins enable row level security;
alter table public.milestone_claims enable row level security;
alter table public.model_pricing enable row level security;
alter table public.generated_images enable row level security;
alter table public.app_visits enable row level security;

drop policy if exists "Public read users" on public.users;
drop policy if exists "Users can insert own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Admin full access users" on public.users;

create policy "Public read users"
on public.users
for select
to anon, authenticated
using (true);

create policy "Users can insert own profile"
on public.users
for insert
to authenticated
with check (auth.uid() = id or public.check_is_admin());

create policy "Users can update own profile"
on public.users
for update
to authenticated
using (auth.uid() = id or public.check_is_admin())
with check (auth.uid() = id or public.check_is_admin());

create policy "Admin full access users"
on public.users
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Public read packages" on public.credit_packages;
drop policy if exists "Admin manage packages" on public.credit_packages;

create policy "Public read packages"
on public.credit_packages
for select
to anon, authenticated
using (true);

create policy "Admin manage packages"
on public.credit_packages
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Public read promotions" on public.promotions;
drop policy if exists "Admin manage promotions" on public.promotions;

create policy "Public read promotions"
on public.promotions
for select
to anon, authenticated
using (true);

create policy "Admin manage promotions"
on public.promotions
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Admin manage api keys" on public.api_keys;

create policy "Admin manage api keys"
on public.api_keys
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Public read settings" on public.system_settings;
drop policy if exists "Admin manage settings" on public.system_settings;

create policy "Public read settings"
on public.system_settings
for select
to anon, authenticated
using (true);

create policy "Admin manage settings"
on public.system_settings
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Public read giftcodes" on public.gift_codes;
drop policy if exists "Admin manage giftcodes" on public.gift_codes;

create policy "Public read giftcodes"
on public.gift_codes
for select
to anon, authenticated
using (true);

create policy "Admin manage giftcodes"
on public.gift_codes
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "User read own giftcode usages" on public.gift_code_usages;
drop policy if exists "User insert own giftcode usages" on public.gift_code_usages;
drop policy if exists "Admin manage giftcode usages" on public.gift_code_usages;

create policy "User read own giftcode usages"
on public.gift_code_usages
for select
to authenticated
using (auth.uid() = user_id or public.check_is_admin());

create policy "Admin manage giftcode usages"
on public.gift_code_usages
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "User read own logs" on public.vcoin_transactions;
drop policy if exists "User insert own logs" on public.vcoin_transactions;
drop policy if exists "Admin manage vcoin logs" on public.vcoin_transactions;

create policy "User read own logs"
on public.vcoin_transactions
for select
to authenticated
using (auth.uid() = user_id or public.check_is_admin());

create policy "User insert own logs"
on public.vcoin_transactions
for insert
to authenticated
with check (auth.uid() = user_id or public.check_is_admin());

create policy "Admin manage vcoin logs"
on public.vcoin_transactions
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Users read own payment transactions" on public.payment_transactions;
drop policy if exists "Users insert own payment transactions" on public.payment_transactions;
drop policy if exists "Admin manage payment transactions" on public.payment_transactions;

create policy "Users read own payment transactions"
on public.payment_transactions
for select
to authenticated
using (auth.uid() = user_id or public.check_is_admin());

create policy "Users insert own payment transactions"
on public.payment_transactions
for insert
to authenticated
with check (auth.uid() = user_id or public.check_is_admin());

create policy "Admin manage payment transactions"
on public.payment_transactions
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Public read styles" on public.style_presets;
drop policy if exists "Admin manage styles" on public.style_presets;

create policy "Public read styles"
on public.style_presets
for select
to anon, authenticated
using (true);

create policy "Admin manage styles"
on public.style_presets
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "User read own checkins" on public.daily_check_ins;
drop policy if exists "User insert own checkins" on public.daily_check_ins;
drop policy if exists "Admin read checkins" on public.daily_check_ins;

create policy "User read own checkins"
on public.daily_check_ins
for select
to authenticated
using (auth.uid() = user_id or public.check_is_admin());

create policy "User insert own checkins"
on public.daily_check_ins
for insert
to authenticated
with check (auth.uid() = user_id or public.check_is_admin());

create policy "Admin read checkins"
on public.daily_check_ins
for select
to authenticated
using (public.check_is_admin());

drop policy if exists "User read own milestones" on public.milestone_claims;
drop policy if exists "User insert own milestones" on public.milestone_claims;
drop policy if exists "Admin read milestones" on public.milestone_claims;

create policy "User read own milestones"
on public.milestone_claims
for select
to authenticated
using (auth.uid() = user_id or public.check_is_admin());

create policy "User insert own milestones"
on public.milestone_claims
for insert
to authenticated
with check (auth.uid() = user_id or public.check_is_admin());

create policy "Admin read milestones"
on public.milestone_claims
for select
to authenticated
using (public.check_is_admin());

drop policy if exists "Authenticated read model pricing" on public.model_pricing;
drop policy if exists "Admin manage model pricing" on public.model_pricing;

create policy "Authenticated read model pricing"
on public.model_pricing
for select
to authenticated
using (true);

create policy "Admin manage model pricing"
on public.model_pricing
for all
to authenticated
using (public.check_is_admin())
with check (public.check_is_admin());

drop policy if exists "Public read generated showcase" on public.generated_images;
drop policy if exists "Users read own generated images" on public.generated_images;
drop policy if exists "Admins read all generated images" on public.generated_images;
drop policy if exists "Users insert own generated images" on public.generated_images;
drop policy if exists "Users update own generated images" on public.generated_images;
drop policy if exists "Users delete own generated images" on public.generated_images;

create policy "Public read generated showcase"
on public.generated_images
for select
to anon, authenticated
using (is_public = true);

create policy "Users read own generated images"
on public.generated_images
for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins read all generated images"
on public.generated_images
for select
to authenticated
using (public.check_is_admin());

create policy "Users insert own generated images"
on public.generated_images
for insert
to authenticated
with check (auth.uid() = user_id or public.check_is_admin());

create policy "Users update own generated images"
on public.generated_images
for update
to authenticated
using (auth.uid() = user_id or public.check_is_admin())
with check (auth.uid() = user_id or public.check_is_admin());

create policy "Users delete own generated images"
on public.generated_images
for delete
to authenticated
using (auth.uid() = user_id or public.check_is_admin());

drop policy if exists "Public insert visits" on public.app_visits;
drop policy if exists "Admin read visits" on public.app_visits;

create policy "Public insert visits"
on public.app_visits
for insert
to anon, authenticated
with check (true);

create policy "Admin read visits"
on public.app_visits
for select
to authenticated
using (public.check_is_admin());

-- ---------------------------------------------------------------------------
-- RPC / business functions
-- ---------------------------------------------------------------------------

create or replace function public.increment_giftcode_usage(code_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.gift_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = code_id;
$$;

create or replace function public.redeem_giftcode(
  p_user_id uuid,
  p_code text,
  p_ip_hash text,
  p_ip_address text default null
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
  v_usage_count integer := 0;
  v_ip_used boolean := false;
  v_usage_id uuid;
  v_code_normalized text := upper(btrim(coalesce(p_code, '')));
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
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

  perform pg_advisory_xact_lock(hashtext(v_ip_hash));

  select *
  into v_code
  from public.gift_codes gc
  where upper(gc.code) = v_code_normalized
  for update;

  if not found or coalesce(v_code.is_active, false) = false then
    raise exception 'GIFT_CODE_INVALID';
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
  where gcu.gift_code_id = v_code.id
    and gcu.user_id = p_user_id;

  if v_usage_count >= greatest(coalesce(v_code.max_per_user, 1), 1) then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  end if;

  select exists(
    select 1
    from public.gift_code_usages gcu
    where gcu.ip_hash = v_ip_hash
  )
  into v_ip_used;

  if v_ip_used then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
  end if;

  insert into public.gift_code_usages (
    user_id,
    gift_code_id,
    ip_address,
    ip_hash
  )
  values (
    p_user_id,
    v_code.id,
    nullif(btrim(coalesce(p_ip_address, '')), ''),
    v_ip_hash
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
      'ip_hash', v_ip_hash
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
      where gcu.ip_hash = v_ip_hash
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
    end if;
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  when others then
    raise;
end;
$$;

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
  set vcoin_balance = coalesce(vcoin_balance, 0) + p_amount,
      updated_at = now()
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
  )
  values (
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

create or replace function public.secure_update_balance(
  amount numeric,
  reason text,
  log_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform public.apply_balance_transaction(
    auth.uid(),
    amount,
    reason,
    log_type,
    null,
    null,
    '{}'::jsonb
  );
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
  set provider_order_code = coalesce(provider_order_code, p_provider_order_code),
      updated_at = now()
  where id = v_tx_id;

  return public.settle_payment_transaction_by_id(v_tx_id, p_provider_status, p_provider_payload);
end;
$$;

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
    id, user_id, image_url, prompt, model_used, created_at, is_public, tool_id, tool_name,
    status, progress, cost_vcoin, asset_type, updated_at, queue_kind, queue_payload, provider,
    job_id, lease_token, lease_expires_at, next_poll_at, finished_at, processing_started_at,
    attempt_count, last_error_at, error_message
  ) values (
    p_id, p_user_id, '', coalesce(p_prompt, ''), coalesce(p_engine, p_tool_name, p_queue_kind, 'Queued Job'),
    now(), false, p_tool_id, p_tool_name, 'queued', 0, v_cost, v_asset_type, now(), p_queue_kind,
    coalesce(p_queue_payload, '{}'::jsonb), 'tst', null, null, null, null, null, null, 0, null, null
  );

  return query
  select
    p_id,
    'queued'::text,
    case when v_can_dispatch_now then 0 else v_system_queued + 1 end::integer;
exception
  when others then
    if v_charge_applied and v_cost > 0 then
      perform public.apply_balance_transaction(
        p_user_id,
        v_cost,
        'Refund: enqueue failed',
        'refund',
        'generated_image_refund',
        p_id::text,
        jsonb_build_object(
          'generated_image_id', p_id,
          'tool_id', p_tool_id,
          'queue_kind', p_queue_kind,
          'asset_type', v_asset_type,
          'cost_vcoin', v_cost
        )
      );
    end if;
    raise;
end;
$$;

drop function if exists public.enqueue_generated_job(uuid, text, text, text, text, text, integer, text, jsonb);
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select *
  from public.server_enqueue_generated_job(
    p_id,
    auth.uid(),
    p_prompt,
    p_tool_id,
    p_tool_name,
    p_engine,
    p_asset_type,
    p_cost_vcoin,
    p_queue_kind,
    p_queue_payload
  );
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

create or replace function public.get_generation_queue_stats()
returns table (
  my_image_processing integer,
  my_video_processing integer,
  my_queued integer,
  system_image_processing integer,
  system_video_processing integer,
  system_queued integer
)
language sql
security definer
set search_path = public
as $$
  with scoped as (
    select
      user_id,
      status,
      asset_type
    from public.generated_images
    where status in ('queued', 'processing')
  )
  select
    count(*) filter (
      where user_id = auth.uid()
        and status = 'processing'
        and coalesce(asset_type, 'image') = 'image'
    )::integer as my_image_processing,
    count(*) filter (
      where user_id = auth.uid()
        and status = 'processing'
        and coalesce(asset_type, 'image') = 'video'
    )::integer as my_video_processing,
    count(*) filter (
      where user_id = auth.uid()
        and status = 'queued'
    )::integer as my_queued,
    count(*) filter (
      where status = 'processing'
        and coalesce(asset_type, 'image') = 'image'
    )::integer as system_image_processing,
    count(*) filter (
      where status = 'processing'
        and coalesce(asset_type, 'image') = 'video'
    )::integer as system_video_processing,
    count(*) filter (
      where status = 'queued'
    )::integer as system_queued
  from scoped;
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.generated_images;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- Default settings
-- ---------------------------------------------------------------------------

insert into public.system_settings (key, value)
values
  ('maintenance_mode', jsonb_build_object('isActive', false, 'message', 'He thong dang bao tri, vui long quay lai sau.')),
  ('tutorial_video', jsonb_build_object('url', 'https://www.youtube.com/watch?v=ba2WR8txe_c', 'isActive', true)),
  ('giftcode_promo', jsonb_build_object('text', 'Nhap CODE "HELLO2026" de nhan 20 Vcoin mien phi !!!', 'isActive', true)),
  ('tst_server_availability', jsonb_build_object('disabledByModel', jsonb_build_object(), 'updatedAt', now()))
on conflict (key) do nothing;

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------------
-- Manual post-setup notes
-- ---------------------------------------------------------------------------
-- 1. Set your first admin account manually after that user signs up:
--    update public.users set is_admin = true where email = 'your-email@example.com';
--
-- 2. Add API keys in public.api_keys from Admin UI or SQL.
--
-- 3. Add top-up packages in public.credit_packages from Admin UI or SQL.
