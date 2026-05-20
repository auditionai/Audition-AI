create or replace function public.repair_stale_generated_queue_jobs(
  p_pre_dispatch_grace_seconds integer default 15,
  p_max_recoveries integer default 8,
  p_max_pre_dispatch_age_minutes integer default 30,
  p_overdue_poll_grace_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_requeued integer := 0;
  v_failed integer := 0;
  v_nudged integer := 0;
  v_refund_id uuid;
begin
  with candidates as (
    select
      gi.id,
      gi.queue_payload,
      coalesce((gi.queue_payload ->> '__watchdogRecoveries')::integer, 0) as recoveries
    from public.generated_images gi
    where gi.status = 'processing'
      and gi.job_id is null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (
        gi.lease_expires_at is null
        or gi.lease_expires_at < v_now - make_interval(secs => greatest(coalesce(p_pre_dispatch_grace_seconds, 15), 0))
        or (
          coalesce(gi.queue_payload ->> '__stage', '') in ('preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload')
          and gi.updated_at < v_now - make_interval(secs => 90)
        )
      )
      and coalesce((gi.queue_payload ->> '__tstTouched')::boolean, false) is false
      and coalesce((gi.queue_payload ->> '__dispatchConfirmationPending')::boolean, false) is false
      and coalesce(gi.queue_payload ->> '__stage', '') <> 'dispatching'
      and coalesce((gi.queue_payload ->> '__watchdogRecoveries')::integer, 0) < greatest(coalesce(p_max_recoveries, 8), 1)
      and coalesce(gi.processing_started_at, gi.created_at, v_now) > v_now - make_interval(mins => greatest(coalesce(p_max_pre_dispatch_age_minutes, 30), 1))
    limit 100
  ),
  updated as (
    update public.generated_images gi
    set
      status = 'queued',
      job_id = null,
      image_url = null,
      finished_at = null,
      processing_started_at = null,
      error_message = null,
      queue_payload =
        coalesce(gi.queue_payload, '{}'::jsonb)
        || jsonb_build_object(
          '__stage', 'queued',
          '__watchdogRecoveries', candidates.recoveries + 1,
          '__logs', coalesce(gi.queue_payload -> '__logs', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'at', v_now,
            'stage', 'queued',
            'level', 'warning',
            'message', 'DB invariant: pre-dispatch job im lang qua han. Dua lai hang doi tu dong.'
          ))
        ),
      lease_token = null,
      lease_expires_at = null,
      next_poll_at = v_now,
      last_error_at = v_now,
      updated_at = v_now
    from candidates
    where gi.id = candidates.id
    returning gi.id
  )
  select count(*)::integer into v_requeued from updated;

  for v_refund_id in
    with candidates as (
      select gi.id, gi.queue_payload
      from public.generated_images gi
      where gi.status = 'processing'
        and gi.job_id is null
        and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
        and (
          gi.lease_expires_at is null
          or gi.lease_expires_at < v_now - make_interval(secs => greatest(coalesce(p_pre_dispatch_grace_seconds, 15), 0))
          or (
            coalesce(gi.queue_payload ->> '__stage', '') in ('preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload')
            and gi.updated_at < v_now - make_interval(secs => 90)
          )
        )
        and (
          coalesce((gi.queue_payload ->> '__tstTouched')::boolean, false) is true
          or coalesce((gi.queue_payload ->> '__dispatchConfirmationPending')::boolean, false) is true
          or coalesce(gi.queue_payload ->> '__stage', '') = 'dispatching'
          or coalesce((gi.queue_payload ->> '__watchdogRecoveries')::integer, 0) >= greatest(coalesce(p_max_recoveries, 8), 1)
          or coalesce(gi.processing_started_at, gi.created_at, v_now) <= v_now - make_interval(mins => greatest(coalesce(p_max_pre_dispatch_age_minutes, 30), 1))
        )
      limit 100
    ),
    updated as (
      update public.generated_images gi
      set
        status = 'failed',
        error_message = 'DB invariant: stale pre-dispatch job failed/refunded to prevent duplicate provider dispatch.',
        queue_payload =
          coalesce(gi.queue_payload, '{}'::jsonb)
          || jsonb_build_object(
            '__stage', 'failed',
            '__logs', coalesce(gi.queue_payload -> '__logs', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
              'at', v_now,
              'stage', 'failed',
              'level', 'error',
              'message', 'DB invariant: stale pre-dispatch job failed/refunded to prevent duplicate provider dispatch.'
            ))
          ),
        progress = 0,
        finished_at = v_now,
        lease_token = null,
        lease_expires_at = null,
        next_poll_at = null,
        last_error_at = v_now,
        updated_at = v_now
      from candidates
      where gi.id = candidates.id
      returning gi.id
    )
    select id from updated
  loop
    perform public.refund_generated_job(v_refund_id, 'Refund: DB queue invariant failed stale pre-dispatch job');
    v_failed := v_failed + 1;
  end loop;

  with candidates as (
    select gi.id
    from public.generated_images gi
    where gi.status = 'processing'
      and gi.job_id is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and gi.next_poll_at is not null
      and gi.next_poll_at < v_now - make_interval(secs => greatest(coalesce(p_overdue_poll_grace_seconds, 120), 0))
    limit 100
  ),
  updated as (
    update public.generated_images gi
    set
      lease_token = null,
      lease_expires_at = null,
      next_poll_at = v_now,
      updated_at = v_now
    from candidates
    where gi.id = candidates.id
    returning gi.id
  )
  select count(*)::integer into v_nudged from updated;

  return jsonb_build_object(
    'requeuedPreDispatch', v_requeued,
    'failedPreDispatch', v_failed,
    'nudgedPolls', v_nudged
  );
end;
$$;

grant execute on function public.repair_stale_generated_queue_jobs(integer, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
