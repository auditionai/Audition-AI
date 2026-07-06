-- Phase 2: run after temporarily pausing queue workers/cron/background triggers.
-- This phase needs brief DDL locks on generated_images/payment/vcoin policy metadata.
-- Keep it separate from index creation to avoid deadlocks on a hot production DB.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.check_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and is_admin = true
  );
$$;

create or replace function public.claim_pollable_generated_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns table(
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
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.next_poll_at is null or gi.next_poll_at <= now())
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by coalesce(gi.next_poll_at, gi.processing_started_at, gi.created_at), gi.created_at, gi.id
    for update of gi skip locked
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
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
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

create or replace function public.claim_dispatchable_generated_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table(
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
      and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
  ),
  user_processing as (
    select
      user_id,
      count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as image_processing,
      count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as video_processing
    from public.generated_images
    where status = 'processing'
      and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
    group by user_id
  ),
  base_candidates as (
    select
      gi.id,
      gi.user_id,
      coalesce(gi.asset_type, 'image') as asset_type,
      gi.created_at,
      coalesce(up.image_processing, 0) as user_image_processing,
      coalesce(up.video_processing, 0) as user_video_processing,
      greatest(0, 4 - p.system_image_processing) as image_slots,
      greatest(0, 4 - p.system_video_processing) as video_slots
    from public.generated_images gi
    cross join processing p
    left join user_processing up on up.user_id = gi.user_id
    where gi.status = 'queued'
      and gi.queue_payload is not null
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
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
      row_number() over (partition by bc.user_id, bc.asset_type order by bc.created_at, bc.id) as rn_user
    from base_candidates bc
  ),
  ranked_system as (
    select
      ru.*,
      row_number() over (partition by ru.asset_type order by ru.created_at, ru.id) as rn_system
    from ranked_user ru
    where ru.rn_user = 1
  ),
  picked_ids as (
    select rs.id
    from ranked_system rs
    where (
      rs.asset_type = 'image'
      and rs.rn_system <= rs.image_slots
    ) or (
      rs.asset_type = 'video'
      and rs.rn_system <= rs.video_slots
    )
    order by rs.created_at, rs.id
    limit greatest(coalesce(p_limit, 1), 1)
  ),
  locked as (
    select gi.id
    from public.generated_images gi
    join picked_ids picked on picked.id = gi.id
    where gi.status = 'queued'
      and gi.queue_payload is not null
      and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by gi.created_at, gi.id
    for update of gi skip locked
  ),
  updated as (
    update public.generated_images gi
    set
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
      updated_at = now(),
      error_message = null
    where gi.id in (select locked.id from locked)
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

drop policy if exists "Admins read all generated images" on public.generated_images;
drop policy if exists "Users read own generated images" on public.generated_images;
drop policy if exists "Public read generated showcase" on public.generated_images;

create policy "Anon read public generated images"
on public.generated_images
as permissive
for select
to anon
using (is_public = true);

create policy "Authenticated read generated images"
on public.generated_images
as permissive
for select
to authenticated
using (
  is_public = true
  or user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "Users insert own generated images"
on public.generated_images
with check (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "Users update own generated images"
on public.generated_images
using (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "Users delete own generated images"
on public.generated_images
using (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "Users read own payment transactions"
on public.payment_transactions
using (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "Users insert own payment transactions"
on public.payment_transactions
with check (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "User read own logs"
on public.vcoin_transactions
using (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

alter policy "User insert own logs"
on public.vcoin_transactions
with check (
  user_id = (select auth.uid())
  or (select public.check_is_admin())
);

grant execute on function public.claim_dispatchable_generated_jobs(integer, integer) to service_role;
grant execute on function public.claim_pollable_generated_jobs(integer, integer) to service_role;

notify pgrst, 'reload schema';
