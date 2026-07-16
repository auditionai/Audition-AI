begin;

-- Queue inputs can contain several megabytes of base64 images. They are needed
-- while a job is active, but retaining them after completion makes gallery
-- reads and autovacuum unnecessarily expensive.
alter table public.generated_images
  add column if not exists payload_compacted_at timestamptz;

create or replace function public.mark_generated_image_payload_compacted()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce((new.queue_payload ->> '__payloadCompacted')::boolean, false) then
    new.payload_compacted_at := case
      when tg_op = 'INSERT' then now()
      else coalesce(old.payload_compacted_at, now())
    end;
  else
    new.payload_compacted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_generated_image_payload_compacted on public.generated_images;
create trigger trg_mark_generated_image_payload_compacted
before insert or update of queue_payload on public.generated_images
for each row execute function public.mark_generated_image_payload_compacted();

create or replace function public.compact_terminal_generated_image_payload(
  p_payload jsonb,
  p_stage text default 'completed'
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with source as (
    select coalesce(p_payload, '{}'::jsonb) as payload
  ),
  recipe as (
    select
      source.payload,
      case
        when jsonb_typeof(source.payload -> '__recipePayload') = 'object'
          then source.payload -> '__recipePayload'
        else source.payload
      end as value
    from source
  ),
  recent_logs as (
    select coalesce(jsonb_agg(log_entry.value order by log_entry.ordinality), '[]'::jsonb) as value
    from source
    cross join lateral (
      select item.value, item.ordinality
      from jsonb_array_elements(
        case
          when jsonb_typeof(source.payload -> '__logs') = 'array' then source.payload -> '__logs'
          else '[]'::jsonb
        end
      ) with ordinality as item(value, ordinality)
      order by item.ordinality desc
      limit 20
    ) log_entry
  )
  select case
    when pg_column_size(p_payload) <= 65536 then
      coalesce(p_payload, '{}'::jsonb) || '{"__payloadCompacted":true}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      '__payloadCompacted', true,
      '__stage', to_jsonb(coalesce(nullif(p_stage, ''), recipe.payload ->> '__stage', 'completed')),
      '__showInGenerationHistory', recipe.payload -> '__showInGenerationHistory',
      '__clientPlatform', recipe.payload -> '__clientPlatform',
      '__recipePayload', jsonb_strip_nulls(jsonb_build_object(
        'recipeType', recipe.value -> 'recipeType',
        'userPromptInput', to_jsonb(nullif(left(coalesce(recipe.value ->> 'userPromptInput', ''), 2000), '')),
        'prompt', to_jsonb(nullif(left(coalesce(recipe.value ->> 'prompt', ''), 4000), '')),
        'modelId', recipe.value -> 'modelId',
        'serverId', recipe.value -> 'serverId',
        'aspectRatio', recipe.value -> 'aspectRatio',
        'resolution', recipe.value -> 'resolution',
        'duration', recipe.value -> 'duration'
      )),
      '__logs', recent_logs.value,
      'prompt', to_jsonb(nullif(left(coalesce(recipe.payload ->> 'prompt', ''), 4000), '')),
      'model', recipe.payload -> 'model',
      'model_id', recipe.payload -> 'model_id',
      'server_id', recipe.payload -> 'server_id',
      'config_key', recipe.payload -> 'config_key'
    ))
  end
  from recipe
  cross join recent_logs;
$$;

create or replace function public.compact_terminal_generated_image_payloads(
  p_limit integer default 50,
  p_failed_min_age_days integer default 7
)
returns table (
  compacted_rows integer,
  before_bytes bigint,
  after_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select
      gi.id,
      pg_column_size(gi.queue_payload)::bigint as original_bytes
    from public.generated_images gi
    where gi.payload_compacted_at is null
      and gi.queue_payload is not null
      and (
        gi.status = 'completed'
        or (
          gi.status = 'failed'
          and coalesce(gi.finished_at, gi.updated_at, gi.created_at)
            < now() - make_interval(days => greatest(coalesce(p_failed_min_age_days, 7), 1))
        )
      )
    order by
      (gi.queue_kind = 'image_edit_direct') desc,
      coalesce(gi.finished_at, gi.updated_at, gi.created_at) desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    for update skip locked
  ),
  updated as (
    update public.generated_images gi
    set queue_payload = public.compact_terminal_generated_image_payload(gi.queue_payload, gi.status)
    from candidates
    where gi.id = candidates.id
    returning candidates.original_bytes, pg_column_size(gi.queue_payload)::bigint as compact_bytes
  )
  select
    count(*)::integer,
    coalesce(sum(updated.original_bytes), 0)::bigint,
    coalesce(sum(updated.compact_bytes), 0)::bigint
  from updated;
end;
$$;

-- This deliberately keeps users, balances, payment records, the VCoin ledger,
-- and published assets. Only disposable operational history expires.
create or replace function public.cleanup_expired_operational_history(
  p_limit integer default 100,
  p_retention_days integer default 30
)
returns table (
  deleted_generated_images integer,
  deleted_check_ins integer,
  deleted_app_visits integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_retention_days integer := greatest(coalesce(p_retention_days, 30), 30);
  v_generated integer := 0;
  v_check_ins integer := 0;
  v_visits integer := 0;
begin
  with candidates as (
    select gi.id
    from public.generated_images gi
    where gi.status in ('completed', 'failed', 'cancelled')
      and gi.is_public is not true
      and coalesce(gi.finished_at, gi.updated_at, gi.created_at)
        < now() - make_interval(days => v_retention_days)
    order by coalesce(gi.finished_at, gi.updated_at, gi.created_at)
    limit v_limit
    for update skip locked
  )
  delete from public.generated_images gi
  using candidates
  where gi.id = candidates.id;
  get diagnostics v_generated = row_count;

  with candidates as (
    select dci.id
    from public.daily_check_ins dci
    where dci.check_in_date < current_date - v_retention_days
    order by dci.check_in_date
    limit v_limit
    for update skip locked
  )
  delete from public.daily_check_ins dci
  using candidates
  where dci.id = candidates.id;
  get diagnostics v_check_ins = row_count;

  with candidates as (
    select av.id
    from public.app_visits av
    where av.created_at < now() - make_interval(days => v_retention_days)
    order by av.created_at
    limit v_limit
    for update skip locked
  )
  delete from public.app_visits av
  using candidates
  where av.id = candidates.id;
  get diagnostics v_visits = row_count;

  return query select v_generated, v_check_ins, v_visits;
end;
$$;

-- Authenticated clients can read only their own compact gallery result without
-- paying a Netlify cold start. The user id is derived from the JWT, never from
-- a client-supplied argument.
create or replace function public.get_my_gallery_images_lightweight(
  p_limit integer default 24
)
returns table (
  id uuid,
  image_url text,
  prompt text,
  created_at timestamptz,
  updated_at timestamptz,
  asset_type text,
  queue_kind text,
  tool_id text,
  tool_name text,
  model_used text,
  user_id uuid,
  user_name text,
  is_public boolean,
  status text,
  job_id text,
  progress integer,
  error_message text,
  cost_vcoin integer,
  queue_payload jsonb
)
language sql
security definer
set search_path = public
as $$
  select gallery.*
  from public.get_user_gallery_images_lightweight(
    auth.uid(),
    least(greatest(coalesce(p_limit, 24), 1), 24)
  ) gallery
  where auth.uid() is not null;
$$;

create index if not exists idx_generated_images_terminal_uncompacted
  on public.generated_images (status, finished_at desc)
  where payload_compacted_at is null
    and status in ('completed', 'failed');

create index if not exists idx_generated_images_dispatch_due
  on public.generated_images (lease_expires_at, created_at)
  where status = 'queued'
    and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
    and queue_payload is not null;

create index if not exists idx_generated_images_poll_due
  on public.generated_images (next_poll_at, lease_expires_at, created_at)
  where status = 'processing'
    and queue_kind in ('image_generate', 'video_generate', 'motion_generate')
    and job_id is not null;

create index if not exists idx_generated_images_direct_edit_watchdog
  on public.generated_images (updated_at, lease_expires_at)
  where status in ('queued', 'processing')
    and queue_kind = 'image_edit_direct';

create index if not exists idx_payment_transactions_pending_reconcile
  on public.payment_transactions (created_at desc)
  where status in ('pending', 'cancelled', 'failed');

alter table public.generated_images set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_threshold = 50,
  toast.autovacuum_vacuum_scale_factor = 0.02,
  toast.autovacuum_vacuum_threshold = 50
);

revoke execute on function public.compact_terminal_generated_image_payload(jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.compact_terminal_generated_image_payloads(integer, integer)
  from public, anon, authenticated;
revoke execute on function public.cleanup_expired_operational_history(integer, integer)
  from public, anon, authenticated;
revoke execute on function public.get_my_gallery_images_lightweight(integer)
  from public, anon;
grant execute on function public.compact_terminal_generated_image_payloads(integer, integer)
  to service_role;
grant execute on function public.cleanup_expired_operational_history(integer, integer)
  to service_role;
grant execute on function public.get_my_gallery_images_lightweight(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
