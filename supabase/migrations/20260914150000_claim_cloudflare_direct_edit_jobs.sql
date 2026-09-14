create or replace function public.claim_cloudflare_direct_edit_jobs(
  p_limit integer default 4,
  p_lease_seconds integer default 900
)
returns table(id uuid, user_id uuid, queue_payload jsonb, tool_id text, tool_name text, cost_vcoin integer)
language sql security definer set search_path = public as $$
  with picked as (
    select gi.id
    from public.generated_images gi
    where gi.status = 'queued'
      and gi.queue_kind = 'image_edit_direct'
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by gi.created_at, gi.id
    limit greatest(coalesce(p_limit, 1), 1)
    for update of gi skip locked
  ), updated as (
    update public.generated_images gi
    set status = 'processing', progress = 10, lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 900), 60)),
      processing_started_at = coalesce(gi.processing_started_at, now()), updated_at = now(), error_message = null
    where gi.id in (select id from picked)
    returning gi.*
  )
  select u.id, u.user_id, u.queue_payload, u.tool_id, u.tool_name, u.cost_vcoin
  from updated u;
$$;
revoke all on function public.claim_cloudflare_direct_edit_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_direct_edit_jobs(integer, integer) to service_role;
notify pgrst, 'reload schema';
