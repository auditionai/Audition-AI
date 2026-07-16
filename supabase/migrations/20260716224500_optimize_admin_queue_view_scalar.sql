begin;

-- Keep the queue overview metadata-only. Completed jobs make up most of the
-- list and must not detoast large generation payloads just to render a row.
-- Full logs, diagnostics, and recipe payloads remain available through the
-- existing on-demand admin queue job detail endpoint.
create or replace view public.admin_generated_images_queue_lightweight
with (security_invoker = true)
as
select
  gi.id,
  gi.user_id,
  gi.tool_name,
  gi.queue_kind,
  gi.asset_type,
  gi.status,
  gi.job_id,
  gi.progress,
  case when gi.status in ('queued', 'processing', 'failed')
    then gi.queue_payload ->> '__stage'
    else null
  end as queue_stage,
  case when gi.status in ('queued', 'processing', 'failed')
    then gi.queue_payload ->> '__clientPlatform'
    else null
  end as client_platform,
  case when gi.status in ('queued', 'processing', 'failed')
    then lower(coalesce(gi.queue_payload ->> '__tstTouched', 'false')) = 'true'
    else false
  end as tst_touched,
  case when gi.status in ('queued', 'processing', 'failed')
    then lower(coalesce(gi.queue_payload ->> '__dispatchConfirmationPending', 'false')) = 'true'
    else false
  end as dispatch_confirmation_pending,
  case when gi.status in ('queued', 'processing', 'failed')
    then case
      when coalesce(gi.queue_payload ->> '__watchdogRecoveries', '') ~ '^[0-9]{1,9}$'
        then (gi.queue_payload ->> '__watchdogRecoveries')::integer
      else 0
    end
    else 0
  end as watchdog_recoveries,
  case when gi.status = 'failed'
    then case
      when coalesce(gi.queue_payload ->> '__failedRescueAttemptCount', '') ~ '^[0-9]{1,9}$'
        then (gi.queue_payload ->> '__failedRescueAttemptCount')::integer
      else 0
    end
    else 0
  end as failed_rescue_attempt_count,
  case when gi.status = 'failed'
    then lower(coalesce(gi.queue_payload ->> '__failedRescueFinalized', 'false')) = 'true'
    else false
  end as failed_rescue_finalized,
  case when gi.status = 'failed'
    then lower(coalesce(gi.queue_payload ->> '__manuallyStopped', 'false')) = 'true'
    else false
  end as manually_stopped,
  case when gi.status = 'failed'
    then gi.queue_payload ->> '__nextFailedRescueAt'
    else null
  end as next_failed_rescue_at,
  left(coalesce(gi.error_message, ''), 2000) as error_message,
  gi.created_at,
  gi.updated_at,
  gi.next_poll_at,
  gi.processing_started_at,
  gi.lease_expires_at
from public.generated_images gi
where gi.queue_kind in ('image_generate', 'video_generate', 'motion_generate');

revoke all on public.admin_generated_images_queue_lightweight from public, anon, authenticated;
grant select on public.admin_generated_images_queue_lightweight to service_role;

notify pgrst, 'reload schema';

commit;
