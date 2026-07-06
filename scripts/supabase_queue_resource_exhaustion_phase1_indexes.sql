-- Phase 1: run these one statement at a time in Supabase SQL Editor.
-- These use CONCURRENTLY so they do not take a heavy write-blocking lock.
-- If Supabase says "CREATE INDEX CONCURRENTLY cannot run inside a transaction block",
-- run each CREATE INDEX statement separately.

create index concurrently if not exists idx_generated_images_queue_dispatch_ready
on public.generated_images (
  status,
  asset_type,
  created_at,
  id
)
where queue_payload is not null
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index concurrently if not exists idx_generated_images_queue_poll_ready
on public.generated_images (
  status,
  next_poll_at,
  processing_started_at,
  created_at,
  id
)
where job_id is not null
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index concurrently if not exists idx_generated_images_queue_stale_predispatch
on public.generated_images (
  updated_at,
  id
)
where job_id is null
  and status in ('queued', 'processing')
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index concurrently if not exists idx_generated_images_queue_stale_polling
on public.generated_images (
  updated_at,
  id
)
where status = 'processing'
  and job_id is not null
  and queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index concurrently if not exists idx_payment_transactions_package_id
on public.payment_transactions (package_id);

-- Optional: run only if public.user_browser_keys exists in this Supabase project.
-- create index concurrently if not exists idx_user_browser_keys_user_id
-- on public.user_browser_keys (user_id);
