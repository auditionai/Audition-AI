begin;

-- Serialize the capacity calculation by provider/media lane. Queue deliveries
-- may run concurrently, so a row lock on only the selected job is insufficient.
create or replace function public.claim_cloudflare_generated_job_by_id(
  p_job_id uuid,
  p_lease_seconds integer default 900
) returns table(
  id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb,
  prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer,
  provider text, job_id text
) language plpgsql security definer set search_path = public as $$
declare
  v_job public.generated_images%rowtype;
  v_provider text;
  v_media_type text;
  v_system_limit integer;
  v_active integer;
  v_user_active integer;
begin
  select * into v_job
  from public.generated_images
  where id = p_job_id and status = 'queued'
    and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and (lease_expires_at is null or lease_expires_at < now())
  for update skip locked;
  if not found then return; end if;

  v_provider := lower(coalesce(nullif(v_job.provider, ''), v_job.queue_payload ->> '__targetProvider', 'tst'));
  v_media_type := coalesce(v_job.asset_type, 'image');
  if v_provider not in ('gpti2', 'tst') then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_provider || ':' || v_media_type, 0));
  v_system_limit := case when v_provider = 'gpti2' and v_media_type = 'image' then 20 else 4 end;

  select count(*) into v_active from public.generated_images gi
  where gi.status = 'processing'
    and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) = v_provider
    and coalesce(gi.asset_type, 'image') = v_media_type;
  select count(*) into v_user_active from public.generated_images gi
  where gi.status = 'processing' and gi.user_id = v_job.user_id
    and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) = v_provider
    and coalesce(gi.asset_type, 'image') = v_media_type;
  if v_active >= v_system_limit or v_user_active >= 3 then return; end if;

  return query
  update public.generated_images gi
  set status = 'processing', progress = greatest(coalesce(gi.progress, 0), 10),
      processing_started_at = coalesce(gi.processing_started_at, now()),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 900), 60)),
      updated_at = now(), error_message = null
  where gi.id = v_job.id
  returning gi.id, gi.user_id, coalesce(gi.asset_type, 'image'), gi.queue_kind, gi.queue_payload,
    gi.prompt, gi.tool_id, gi.tool_name, gi.model_used, gi.cost_vcoin,
    lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')), gi.job_id;
end; $$;

revoke all on function public.claim_cloudflare_generated_job_by_id(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_generated_job_by_id(uuid, integer) to service_role;
notify pgrst, 'reload schema';
commit;
