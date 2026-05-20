create or replace function public.get_generated_queue_health_report()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with active_jobs as (
    select
      gi.id,
      gi.user_id,
      gi.status,
      gi.job_id,
      gi.queue_kind,
      gi.queue_payload,
      gi.created_at,
      gi.updated_at,
      gi.lease_expires_at,
      gi.next_poll_at,
      coalesce(gi.queue_payload ->> '__stage', '') as stage,
      coalesce((gi.queue_payload ->> '__tstTouched')::boolean, false) as tst_touched,
      coalesce((gi.queue_payload ->> '__dispatchConfirmationPending')::boolean, false) as dispatch_confirmation_pending
    from public.generated_images gi
    where gi.status in ('queued', 'processing')
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  ),
  classified as (
    select
      aj.*,
      greatest(0, extract(epoch from (now() - coalesce(aj.updated_at, aj.created_at, now()))))::integer as age_seconds,
      case
        when aj.lease_expires_at is null then 'none'
        when aj.lease_expires_at > now() then 'active'
        else 'expired'
      end as lease_state,
      (
        coalesce(aj.job_id, '') <> ''
        or aj.tst_touched is true
        or aj.dispatch_confirmation_pending is true
        or aj.stage = 'dispatching'
      ) as provider_risk,
      case
        when aj.status = 'queued'
          and coalesce(aj.updated_at, aj.created_at, now()) < now() - interval '5 minutes'
          then 'queued_stale'
        when aj.status = 'queued'
          then 'healthy'
        when aj.status = 'processing'
          and coalesce(aj.job_id, '') = ''
          and (
            coalesce(aj.job_id, '') <> ''
            or aj.tst_touched is true
            or aj.dispatch_confirmation_pending is true
            or aj.stage = 'dispatching'
          )
          and (
            aj.lease_expires_at is null
            or aj.lease_expires_at < now() - interval '15 seconds'
            or (
              aj.stage in ('preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload')
              and coalesce(aj.updated_at, aj.created_at, now()) < now() - interval '90 seconds'
            )
          )
          then 'pre_dispatch_provider_risk'
        when aj.status = 'processing'
          and coalesce(aj.job_id, '') = ''
          and (
            coalesce(aj.job_id, '') <> ''
            or aj.tst_touched is true
            or aj.dispatch_confirmation_pending is true
            or aj.stage = 'dispatching'
          )
          then 'pre_dispatch_waiting_lease'
        when aj.status = 'processing'
          and coalesce(aj.job_id, '') = ''
          and (
            aj.lease_expires_at is null
            or aj.lease_expires_at < now() - interval '15 seconds'
            or (
              aj.stage in ('preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload')
              and coalesce(aj.updated_at, aj.created_at, now()) < now() - interval '90 seconds'
            )
          )
          then 'pre_dispatch_safe_requeue_due'
        when aj.status = 'processing'
          and coalesce(aj.job_id, '') = ''
          then 'pre_dispatch_waiting_lease'
        when aj.status = 'processing'
          and coalesce(aj.job_id, '') <> ''
          and aj.next_poll_at is not null
          and aj.next_poll_at < now() - interval '120 seconds'
          then 'poll_overdue'
        else 'healthy'
      end as code
    from active_jobs aj
  ),
  codes as (
    select unnest(array[
      'healthy',
      'queued_stale',
      'pre_dispatch_waiting_lease',
      'pre_dispatch_safe_requeue_due',
      'pre_dispatch_provider_risk',
      'poll_overdue',
      'unknown'
    ]) as code
  ),
  counts as (
    select
      codes.code,
      count(classified.id)::integer as total
    from codes
    left join classified on classified.code = codes.code
    group by codes.code
  ),
  examples as (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'userId', user_id,
          'status', status,
          'stage', coalesce(nullif(stage, ''), 'unknown'),
          'code', code,
          'ageSeconds', age_seconds,
          'leaseState', lease_state,
          'providerRisk', provider_risk
        )
        order by age_seconds desc
      ) as items
    from (
      select *
      from classified
      where code in ('queued_stale', 'pre_dispatch_safe_requeue_due', 'pre_dispatch_provider_risk', 'poll_overdue')
      order by age_seconds desc
      limit 12
    ) risky
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'scanned', (select count(*)::integer from classified),
    'counts', (select jsonb_object_agg(code, total) from counts),
    'watchdogDue', (
      select coalesce(sum(total), 0)::integer
      from counts
      where code in ('queued_stale', 'pre_dispatch_safe_requeue_due', 'pre_dispatch_provider_risk', 'poll_overdue')
    ),
    'examples', coalesce((select items from examples), '[]'::jsonb)
  );
$$;

grant execute on function public.get_generated_queue_health_report() to service_role;

notify pgrst, 'reload schema';
