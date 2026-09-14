begin;

-- Queue messages are at-least-once. Claiming by ID makes duplicate deliveries
-- harmless while preserving the existing per-provider and per-user limits.
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
  where id = p_job_id
    and status = 'queued'
    and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and (lease_expires_at is null or lease_expires_at < now())
  for update skip locked;
  if not found then return; end if;

  v_provider := lower(coalesce(nullif(v_job.provider, ''), v_job.queue_payload ->> '__targetProvider', 'tst'));
  v_media_type := coalesce(v_job.asset_type, 'image');
  if v_provider not in ('gpti2', 'tst') then return; end if;
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

create or replace function public.claim_cloudflare_tst_poll_job_by_id(
  p_job_id uuid,
  p_lease_seconds integer default 120
) returns table(
  id uuid, user_id uuid, asset_type text, queue_kind text, queue_payload jsonb,
  prompt text, tool_id text, tool_name text, model_used text, cost_vcoin integer,
  provider text, job_id text
) language sql security definer set search_path = public as $$
  with picked as (
    select gi.id from public.generated_images gi
    where gi.id = p_job_id and gi.status = 'processing'
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and nullif(btrim(gi.job_id), '') is not null
      and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) = 'tst'
      and (gi.next_poll_at is null or gi.next_poll_at <= now())
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    for update skip locked
  ), updated as (
    update public.generated_images gi
    set lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
        updated_at = now()
    where gi.id in (select id from picked)
    returning gi.*
  )
  select u.id, u.user_id, coalesce(u.asset_type, 'image'), u.queue_kind, u.queue_payload,
    u.prompt, u.tool_id, u.tool_name, u.model_used, u.cost_vcoin, 'tst'::text, u.job_id
  from updated u;
$$;

create table if not exists public.cloudflare_upload_tokens (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_key text not null unique,
  content_type text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cloudflare_upload_tokens_expiry_idx on public.cloudflare_upload_tokens (expires_at) where consumed_at is null;
alter table public.cloudflare_upload_tokens enable row level security;
revoke all on public.cloudflare_upload_tokens from public, anon, authenticated;

create or replace function public.consume_cloudflare_upload_token(
  p_id uuid, p_user_id uuid, p_object_key text, p_content_type text
) returns boolean language sql security definer set search_path = public as $$
  with consumed as (
    update public.cloudflare_upload_tokens
    set consumed_at = now()
    where id = p_id and user_id = p_user_id and object_key = p_object_key
      and content_type = p_content_type and consumed_at is null and expires_at > now()
    returning id
  ) select exists(select 1 from consumed);
$$;

revoke all on function public.claim_cloudflare_generated_job_by_id(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_generated_job_by_id(uuid, integer) to service_role;
revoke all on function public.claim_cloudflare_tst_poll_job_by_id(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_cloudflare_tst_poll_job_by_id(uuid, integer) to service_role;
revoke all on function public.consume_cloudflare_upload_token(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_cloudflare_upload_token(uuid, uuid, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
