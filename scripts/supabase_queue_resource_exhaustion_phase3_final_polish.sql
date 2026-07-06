-- Phase 3: final RLS and secondary queue-query cleanup.
-- Run after Phase 1 and Phase 2, preferably while DISABLE_QUEUE_WORKERS=true.
-- This preserves access intent while reducing duplicate permissive policy checks.

set lock_timeout = '10s';
set statement_timeout = '2min';

-- Secondary hot paths:
-- - queue-submit count checks by user/status/asset.
-- - admin/health active queue scans ordered by created_at.
-- - failed-result rescue scans ordered by updated_at.
create index if not exists idx_generated_images_queue_counts_user_status_asset
on public.generated_images (
  user_id,
  status,
  asset_type
)
where queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_queue_active_created
on public.generated_images (
  status,
  created_at,
  id
)
where queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_failed_result_rescue
on public.generated_images (
  updated_at,
  id
)
where status = 'failed'
  and job_id is not null;

drop policy if exists "Admins delete users" on public.users;
drop policy if exists "Admins update payment transactions" on public.payment_transactions;
drop policy if exists "Admins delete payment transactions" on public.payment_transactions;
drop policy if exists "Admins update vcoin logs" on public.vcoin_transactions;
drop policy if exists "Admins delete vcoin logs" on public.vcoin_transactions;
drop policy if exists "Admins insert giftcode usages" on public.gift_code_usages;
drop policy if exists "Admins update giftcode usages" on public.gift_code_usages;
drop policy if exists "Admins delete giftcode usages" on public.gift_code_usages;
drop policy if exists "Admins insert packages" on public.credit_packages;
drop policy if exists "Admins update packages" on public.credit_packages;
drop policy if exists "Admins delete packages" on public.credit_packages;
drop policy if exists "Admins insert promotions" on public.promotions;
drop policy if exists "Admins update promotions" on public.promotions;
drop policy if exists "Admins delete promotions" on public.promotions;
drop policy if exists "Admins insert styles" on public.style_presets;
drop policy if exists "Admins update styles" on public.style_presets;
drop policy if exists "Admins delete styles" on public.style_presets;
drop policy if exists "Admins insert settings" on public.system_settings;
drop policy if exists "Admins update settings" on public.system_settings;
drop policy if exists "Admins delete settings" on public.system_settings;
drop policy if exists "Admins insert giftcodes" on public.gift_codes;
drop policy if exists "Admins update giftcodes" on public.gift_codes;
drop policy if exists "Admins delete giftcodes" on public.gift_codes;
drop policy if exists "Admins insert model pricing" on public.model_pricing;
drop policy if exists "Admins update model pricing" on public.model_pricing;
drop policy if exists "Admins delete model pricing" on public.model_pricing;

-- Convert direct auth.uid/check_is_admin calls on remaining user-owned policies.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_check_ins' and policyname = 'User insert own checkins'
  ) then
    alter policy "User insert own checkins"
    on public.daily_check_ins
    with check (
      user_id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_check_ins' and policyname = 'User read own checkins'
  ) then
    alter policy "User read own checkins"
    on public.daily_check_ins
    using (
      user_id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'milestone_claims' and policyname = 'User insert own milestones'
  ) then
    alter policy "User insert own milestones"
    on public.milestone_claims
    with check (
      user_id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'milestone_claims' and policyname = 'User read own milestones'
  ) then
    alter policy "User read own milestones"
    on public.milestone_claims
    using (
      user_id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_code_usages' and policyname = 'User read own giftcode usages'
  ) then
    alter policy "User read own giftcode usages"
    on public.gift_code_usages
    using (
      user_id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'Users can insert own profile'
  ) then
    alter policy "Users can insert own profile"
    on public.users
    with check (
      id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'Users can update own profile'
  ) then
    alter policy "Users can update own profile"
    on public.users
    using (
      id = (select auth.uid())
      or (select public.check_is_admin())
    )
    with check (
      id = (select auth.uid())
      or (select public.check_is_admin())
    );
  end if;
end;
$$;

-- Drop broad admin ALL policies that duplicate SELECT/INSERT policy checks.
-- Recreate only the missing admin write permissions where needed.
drop policy if exists "Admin full access users" on public.users;
create policy "Admins delete users"
on public.users
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage payment transactions" on public.payment_transactions;
create policy "Admins update payment transactions"
on public.payment_transactions
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete payment transactions"
on public.payment_transactions
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage vcoin logs" on public.vcoin_transactions;
create policy "Admins update vcoin logs"
on public.vcoin_transactions
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete vcoin logs"
on public.vcoin_transactions
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage giftcode usages" on public.gift_code_usages;
create policy "Admins insert giftcode usages"
on public.gift_code_usages
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update giftcode usages"
on public.gift_code_usages
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete giftcode usages"
on public.gift_code_usages
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin read checkins" on public.daily_check_ins;
drop policy if exists "Admin read milestones" on public.milestone_claims;

-- Public catalog tables already allow SELECT to anon/authenticated.
-- Replace broad admin ALL policies with write-only admin policies to remove
-- duplicate authenticated SELECT checks.
drop policy if exists "Admin manage packages" on public.credit_packages;
create policy "Admins insert packages"
on public.credit_packages
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update packages"
on public.credit_packages
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete packages"
on public.credit_packages
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage promotions" on public.promotions;
create policy "Admins insert promotions"
on public.promotions
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update promotions"
on public.promotions
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete promotions"
on public.promotions
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage styles" on public.style_presets;
create policy "Admins insert styles"
on public.style_presets
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update styles"
on public.style_presets
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete styles"
on public.style_presets
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage settings" on public.system_settings;
create policy "Admins insert settings"
on public.system_settings
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update settings"
on public.system_settings
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete settings"
on public.system_settings
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage giftcodes" on public.gift_codes;
create policy "Admins insert giftcodes"
on public.gift_codes
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update giftcodes"
on public.gift_codes
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete giftcodes"
on public.gift_codes
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

drop policy if exists "Admin manage model pricing" on public.model_pricing;
create policy "Admins insert model pricing"
on public.model_pricing
as permissive
for insert
to authenticated
with check ((select public.check_is_admin()));
create policy "Admins update model pricing"
on public.model_pricing
as permissive
for update
to authenticated
using ((select public.check_is_admin()))
with check ((select public.check_is_admin()));
create policy "Admins delete model pricing"
on public.model_pricing
as permissive
for delete
to authenticated
using ((select public.check_is_admin()));

-- Admin-only tables without public/user policies keep explicit admin policies,
-- but use initplan-friendly admin checks.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'api_keys' and policyname = 'Admin manage api keys'
  ) then
    alter policy "Admin manage api keys"
    on public.api_keys
    using ((select public.check_is_admin()))
    with check ((select public.check_is_admin()));
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_visits' and policyname = 'Admin read visits'
  ) then
    alter policy "Admin read visits"
    on public.app_visits
    using ((select public.check_is_admin()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.prompt_library_sample_uses') is not null then
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'prompt_library_sample_uses' and policyname = 'Admins read prompt sample uses'
    ) then
      alter policy "Admins read prompt sample uses"
      on public.prompt_library_sample_uses
      using ((select public.check_is_admin()));
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'prompt_library_sample_uses' and policyname = 'Users read own prompt sample uses'
    ) then
      alter policy "Users read own prompt sample uses"
      on public.prompt_library_sample_uses
      using (user_id = (select auth.uid()));
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
