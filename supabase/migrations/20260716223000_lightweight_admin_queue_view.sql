begin;

-- The admin queue list only needs operational metadata. Keep large recipe,
-- reference-image, and provider payloads behind the on-demand detail endpoint.
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
  jsonb_strip_nulls(jsonb_build_object(
    '__stage', gi.queue_payload -> '__stage',
    '__clientPlatform', gi.queue_payload -> '__clientPlatform',
    '__tstTouched', gi.queue_payload -> '__tstTouched',
    '__dispatchConfirmationPending', gi.queue_payload -> '__dispatchConfirmationPending',
    '__watchdogRecoveries', gi.queue_payload -> '__watchdogRecoveries',
    '__failedRescueAttemptCount', gi.queue_payload -> '__failedRescueAttemptCount',
    '__failedRescueFinalized', gi.queue_payload -> '__failedRescueFinalized',
    '__manuallyStopped', gi.queue_payload -> '__manuallyStopped',
    '__nextFailedRescueAt', gi.queue_payload -> '__nextFailedRescueAt',
    '__logs', case
      when jsonb_typeof(gi.queue_payload -> '__logs') = 'array' then (
        select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
        from (
          select value, ordinality
          from jsonb_array_elements(gi.queue_payload -> '__logs') with ordinality
          order by ordinality desc
          limit 20
        ) entry
      )
      else null
    end,
    '__vertexDiagnostics', case
      when jsonb_typeof(gi.queue_payload -> '__vertexDiagnostics') = 'array' then (
        select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
        from (
          select value, ordinality
          from jsonb_array_elements(gi.queue_payload -> '__vertexDiagnostics') with ordinality
          order by ordinality desc
          limit 12
        ) entry
      )
      else null
    end
  )) as queue_payload,
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
