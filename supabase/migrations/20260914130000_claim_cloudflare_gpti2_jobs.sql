-- Cloudflare owns only the GPTi2 image lane until the TST/video/motion
-- processors are ported. A dedicated claim RPC prevents it from leasing a
-- job whose Node-only preparation or provider polling contract it cannot run.
create or replace function public.claim_cloudflare_gpti2_jobs(
  p_limit integer default 4,
  p_lease_seconds integer default 900
)
returns table(
  id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb,
  prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer
)
language sql security definer set search_path = public as $$
  with capacity as (
    select count(*)::integer as active_count
    from public.generated_images gi
    where gi.status = 'processing'
      and coalesce(gi.asset_type, 'image') = 'image'
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', '')) = 'gpti2'
  ), ranked as (
    select gi.id, row_number() over (order by gi.created_at, gi.id) as rn
    from public.generated_images gi cross join capacity c
    where gi.status = 'queued'
      and coalesce(gi.asset_type, 'image') = 'image'
      and coalesce(gi.queue_kind, '') = 'image_generate'
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', '')) = 'gpti2'
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      and c.active_count < 20
  ), picked as (
    select gi.id
    from public.generated_images gi
    join ranked r on r.id = gi.id
    cross join capacity c
    where r.rn <= least(greatest(coalesce(p_limit, 1), 1), greatest(20 - c.active_count, 0))
    for update of gi skip locked
  ), updated as (
    update public.generated_images gi
    set lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 900), 60)),
      updated_at = now(), error_message = null
    where gi.id in (select id from picked)
    returning gi.*
  )
  select u.id, u.user_id, coalesce(u.asset_type, 'image'), u.queue_kind,
    u.queue_payload, u.prompt, u.tool_id, u.tool_name, u.model_used, u.cost_vcoin
  from updated u;
$$;

revoke all on function public.claim_cloudflare_gpti2_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_gpti2_jobs(integer, integer) to service_role;
notify pgrst, 'reload schema';
