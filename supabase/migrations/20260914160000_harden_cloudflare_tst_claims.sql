begin;

-- Cloudflare owns the active TST/GPTi2 queue lanes. Keep legacy provider rows
-- out of these claims so an old provider payload can never be sent to TST.
create or replace function public.claim_cloudflare_generated_jobs(
  p_limit integer default 8,
  p_lease_seconds integer default 900
)
returns table(
  id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb,
  prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer,
  provider text, job_id text
)
language sql security definer set search_path = public as $$
  with normalized as (
    select gi.*,
      lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) as provider_key,
      coalesce(gi.asset_type, 'image') as media_type
    from public.generated_images gi
    where gi.status = 'queued'
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) in ('tst', 'gpti2')
  ), active as (
    select lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) as provider_key,
      coalesce(gi.asset_type, 'image') as media_type,
      count(*)::integer as active_count
    from public.generated_images gi
    where gi.status = 'processing'
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) in ('tst', 'gpti2')
    group by 1, 2
  ), user_active as (
    select gi.user_id,
      lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) as provider_key,
      coalesce(gi.asset_type, 'image') as media_type,
      count(*)::integer as active_count
    from public.generated_images gi
    where gi.status = 'processing'
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) in ('tst', 'gpti2')
    group by 1, 2, 3
  ), eligible as (
    select n.*,
      case when n.provider_key = 'gpti2' and n.media_type = 'image' then 20 else 4 end as system_limit,
      case when n.provider_key = 'gpti2' then 3 else 3 end as user_limit,
      coalesce(a.active_count, 0) as system_active,
      coalesce(ua.active_count, 0) as user_active
    from normalized n
    left join active a on a.provider_key = n.provider_key and a.media_type = n.media_type
    left join user_active ua on ua.user_id = n.user_id and ua.provider_key = n.provider_key and ua.media_type = n.media_type
    where coalesce(a.active_count, 0) < case when n.provider_key = 'gpti2' and n.media_type = 'image' then 20 else 4 end
      and coalesce(ua.active_count, 0) < 3
  ), ranked as (
    select e.*, row_number() over (
      partition by e.user_id, e.provider_key, e.media_type
      order by e.created_at, e.id
    ) as user_rank
    from eligible e
  ), picked as (
    select gi.id
    from public.generated_images gi
    join ranked r on r.id = gi.id
    where r.user_rank <= greatest(r.user_limit - r.user_active, 0)
    order by r.created_at, r.id
    limit greatest(coalesce(p_limit, 1), 1)
    for update of gi skip locked
  ), updated as (
    update public.generated_images gi
    set lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 900), 60)),
      updated_at = now(), error_message = null
    where gi.id in (select id from picked)
      and gi.status = 'queued'
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    returning gi.*
  )
  select u.id, u.user_id, coalesce(u.asset_type, 'image'), u.queue_kind,
    u.queue_payload, u.prompt, u.tool_id, u.tool_name, u.model_used, u.cost_vcoin,
    lower(coalesce(nullif(u.provider, ''), u.queue_payload ->> '__targetProvider', 'tst')),
    u.job_id
  from updated u;
$$;

create or replace function public.claim_cloudflare_pollable_tst_jobs(
  p_limit integer default 8,
  p_lease_seconds integer default 120
)
returns table(
  id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb,
  prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer,
  provider text, job_id text
)
language sql security definer set search_path = public as $$
  with picked as (
    select gi.id
    from public.generated_images gi
    where gi.status = 'processing'
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and nullif(btrim(gi.job_id), '') is not null
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) = 'tst'
      and gi.next_poll_at is not null
      and gi.next_poll_at <= now()
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by gi.next_poll_at, gi.created_at, gi.id
    limit greatest(coalesce(p_limit, 1), 1)
    for update of gi skip locked
  ), updated as (
    update public.generated_images gi
    set lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
      updated_at = now()
    where gi.id in (select id from picked)
      and gi.status = 'processing'
    returning gi.*
  )
  select u.id, u.user_id, coalesce(u.asset_type, 'image'), u.queue_kind,
    u.queue_payload, u.prompt, u.tool_id, u.tool_name, u.model_used, u.cost_vcoin,
    'tst'::text, u.job_id
  from updated u;
$$;

revoke all on function public.claim_cloudflare_generated_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_generated_jobs(integer, integer) to service_role;
revoke all on function public.claim_cloudflare_pollable_tst_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_pollable_tst_jobs(integer, integer) to service_role;
notify pgrst, 'reload schema';

commit;
