-- Cloudflare queue worker owns all generated media lanes. Provider-specific
-- preparation and polling remain in the Worker; the claim itself is atomic.
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
  with picked as (
    select gi.id
    from public.generated_images gi
    where gi.status = 'queued'
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by gi.created_at, gi.id
    limit greatest(coalesce(p_limit, 1), 1)
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
    u.queue_payload, u.prompt, u.tool_id, u.tool_name, u.model_used, u.cost_vcoin,
    u.provider, u.job_id
  from updated u;
$$;

revoke all on function public.claim_cloudflare_generated_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_generated_jobs(integer, integer) to service_role;
notify pgrst, 'reload schema';
