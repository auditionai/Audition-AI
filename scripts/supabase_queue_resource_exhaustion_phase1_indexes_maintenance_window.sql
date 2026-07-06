-- Phase 1 fallback for Supabase SQL Editor when CONCURRENTLY is not usable.
-- Run this only after pausing queue workers with DISABLE_QUEUE_WORKERS=true
-- and waiting 2-3 minutes for active queue functions to finish.
--
-- This version can run as a normal SQL Editor batch, but it may briefly block
-- writes to the indexed tables while each index is created.

set lock_timeout = '10s';
set statement_timeout = '10min';

create index if not exists idx_generated_images_queue_dispatch_ready
on public.generated_images (
  status,
  asset_type,
  created_at,
  id
)
where queue_payload is not null
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_queue_poll_ready
on public.generated_images (
  status,
  next_poll_at,
  processing_started_at,
  created_at,
  id
)
where job_id is not null
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_queue_stale_predispatch
on public.generated_images (
  updated_at,
  id
)
where job_id is null
  and status in ('queued', 'processing')
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_queue_stale_polling
on public.generated_images (
  updated_at,
  id
)
where status = 'processing'
  and job_id is not null
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_payment_transactions_package_id
on public.payment_transactions (package_id);

do $$
begin
  if to_regclass('public.user_browser_keys') is not null then
    execute 'create index if not exists idx_user_browser_keys_user_id on public.user_browser_keys (user_id)';
  end if;
end;
$$;
