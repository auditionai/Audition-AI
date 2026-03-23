-- Audition AI
-- Migration: generated_images full-sync + app_visits tracking

begin;

create extension if not exists pgcrypto;

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

alter table public.model_pricing enable row level security;

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

create table if not exists public.app_visits (
    id uuid primary key default gen_random_uuid(),
    user_id uuid null references public.users(id) on delete set null,
    visit_date date not null default current_date,
    route text null,
    user_agent text null,
    created_at timestamptz not null default now()
);

alter table public.app_visits
    add column if not exists user_id uuid null references public.users(id) on delete set null,
    add column if not exists visit_date date not null default current_date,
    add column if not exists route text null,
    add column if not exists user_agent text null,
    add column if not exists created_at timestamptz not null default now();

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'app_visits'
          and column_name = 'uid'
    ) then
        execute 'update public.app_visits set user_id = coalesce(user_id, uid) where uid is not null';
    end if;
exception
    when others then null;
end
$$;

create index if not exists idx_app_visits_created_at on public.app_visits(created_at desc);
create index if not exists idx_app_visits_visit_date on public.app_visits(visit_date desc);
create index if not exists idx_app_visits_user_id on public.app_visits(user_id);

alter table public.app_visits enable row level security;

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

alter table public.generated_images
    add column if not exists tool_id text,
    add column if not exists tool_name text,
    add column if not exists status text,
    add column if not exists job_id text,
    add column if not exists progress integer,
    add column if not exists error_message text,
    add column if not exists cost_vcoin integer,
    add column if not exists asset_type text,
    add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_generated_images_user_created_at on public.generated_images(user_id, created_at desc);
create index if not exists idx_generated_images_status on public.generated_images(status);
create index if not exists idx_generated_images_job_id on public.generated_images(job_id);
create index if not exists idx_generated_images_public_created_at on public.generated_images(is_public, created_at desc);
create index if not exists idx_generated_images_updated_at on public.generated_images(updated_at desc);

update public.generated_images
set
    tool_id = coalesce(
        tool_id,
        case
            when lower(coalesce(model_used, '')) like '%motion%' then 'motion_control_gen'
            when lower(coalesce(model_used, '')) like '%kling%' then 'video_gen'
            else 'gen_tool'
        end
    ),
    tool_name = coalesce(tool_name, model_used, 'AI Gen'),
    status = coalesce(
        status,
        case
            when coalesce(image_url, '') = '' then 'processing'
            else 'completed'
        end
    ),
    progress = coalesce(
        progress,
        case
            when coalesce(image_url, '') = '' then 0
            else 100
        end
    ),
    asset_type = coalesce(
        asset_type,
        case
            when lower(coalesce(model_used, '')) like '%motion%' then 'video'
            when lower(coalesce(model_used, '')) like '%kling%' then 'video'
            when lower(coalesce(image_url, '')) like '%.mp4%' then 'video'
            else 'image'
        end
    ),
    updated_at = coalesce(updated_at, created_at, now());

alter table public.generated_images
    alter column status set default 'completed',
    alter column progress set default 100,
    alter column asset_type set default 'image';

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

create or replace function public.set_generated_images_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_generated_images_set_updated_at on public.generated_images;

create trigger trg_generated_images_set_updated_at
before update on public.generated_images
for each row
execute function public.set_generated_images_updated_at();

alter table public.generated_images enable row level security;

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

drop policy if exists "Public read generated showcase" on public.generated_images;
drop policy if exists "Users read own generated images" on public.generated_images;
drop policy if exists "Users insert own generated images" on public.generated_images;
drop policy if exists "Users update own generated images" on public.generated_images;
drop policy if exists "Users delete own generated images" on public.generated_images;
drop policy if exists "Admins read all generated images" on public.generated_images;

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

commit;
