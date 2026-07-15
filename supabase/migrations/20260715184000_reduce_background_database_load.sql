begin;

-- Render uses this cheap probe before running the full queue worker. An idle
-- worker therefore costs one indexed query instead of repeatedly running all
-- claim, recovery, backlog, and watchdog queries.
create or replace function public.get_queue_worker_due_state(p_lane text default 'all')
returns table (
  has_dispatch_work boolean,
  has_poll_work boolean
)
language sql
security definer
set search_path = public
as $$
  select
    case when p_lane = 'poll' then false else exists (
      select 1
      from public.generated_images gi
      where gi.status = 'queued'
        and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
        and gi.queue_payload is not null
        and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      limit 1
    ) end as has_dispatch_work,
    case when p_lane = 'dispatch' then false else exists (
      select 1
      from public.generated_images gi
      where gi.status = 'processing'
        and gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate')
        and gi.job_id is not null
        and (gi.next_poll_at is null or gi.next_poll_at <= now())
        and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      limit 1
    ) end as has_poll_work;
$$;

revoke execute on function public.get_queue_worker_due_state(text) from public, anon, authenticated;
grant execute on function public.get_queue_worker_due_state(text) to service_role;

-- Build all top-up template counters in one aggregate query. The previous
-- function performed two COUNT requests plus collision probes per template.
create or replace function public.get_topup_giftcode_template_availability(p_user_id uuid)
returns table (
  id uuid,
  code text,
  campaign_key text,
  reward numeric,
  discount_percent numeric,
  audience text,
  total_limit numeric,
  max_per_user numeric,
  expires_at timestamptz,
  is_active boolean,
  created_at timestamptz,
  auto_generate_per_user boolean,
  total_used bigint,
  user_used bigint
)
language sql
security definer
set search_path = public
as $$
  with templates as (
    select
      gc.*,
      upper(btrim(coalesce(gc.campaign_key, gc.code))) as normalized_campaign_key
    from public.gift_codes gc
    where gc.code_type = 'topup_discount'
      and gc.assigned_user_id is null
      and gc.is_active is true
  ),
  usage_counts as (
    select
      upper(btrim(coalesce(
        gc.campaign_key,
        regexp_replace(gc.code, '-[A-Z0-9]{5,8}$', ''),
        gc.code
      ))) as normalized_campaign_key,
      count(*) filter (where tgu.status = 'applied') as total_used,
      count(*) filter (where tgu.status = 'applied' and tgu.user_id = p_user_id) as user_used
    from public.topup_gift_code_usages tgu
    join public.gift_codes gc on gc.id = tgu.gift_code_id
    where tgu.status = 'applied'
    group by 1
  )
  select
    template.id,
    template.code,
    template.campaign_key,
    template.reward,
    template.discount_percent,
    template.audience,
    template.total_limit,
    template.max_per_user,
    template.expires_at,
    template.is_active,
    template.created_at,
    template.auto_generate_per_user,
    coalesce(usage_counts.total_used, 0),
    coalesce(usage_counts.user_used, 0)
  from templates template
  left join usage_counts using (normalized_campaign_key)
  order by template.created_at desc;
$$;

revoke execute on function public.get_topup_giftcode_template_availability(uuid) from public, anon, authenticated;
grant execute on function public.get_topup_giftcode_template_availability(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
