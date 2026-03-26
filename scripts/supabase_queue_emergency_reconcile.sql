-- Emergency queue recovery for stuck jobs.
-- Run this once after deploying the worker improvements if production still has stale rows.

begin;

-- Re-open queued jobs so the worker can claim them immediately.
update public.generated_images
set
  lease_token = null,
  lease_expires_at = null,
  next_poll_at = now(),
  updated_at = now(),
  error_message = null
where status = 'queued'
  and queue_payload is not null;

-- Re-arm provider jobs whose poll deadline is already overdue.
update public.generated_images
set
  lease_token = null,
  lease_expires_at = null,
  next_poll_at = now(),
  updated_at = now(),
  error_message = null
where status = 'processing'
  and job_id is not null;

-- Push abandoned pre-dispatch jobs back to queued so they can be rebuilt cleanly.
update public.generated_images
set
  status = 'queued',
  lease_token = null,
  lease_expires_at = null,
  next_poll_at = now(),
  processing_started_at = null,
  updated_at = now(),
  error_message = null
where status = 'processing'
  and job_id is null
  and updated_at < now() - interval '5 minutes';

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
