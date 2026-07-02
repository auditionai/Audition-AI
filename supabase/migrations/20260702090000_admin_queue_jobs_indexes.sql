create index if not exists idx_generated_images_admin_queue_updated
on public.generated_images (updated_at desc)
where queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_admin_queue_status_asset_updated
on public.generated_images (status, asset_type, updated_at desc)
where queue_kind in ('image_generate', 'video_generate', 'motion_generate');

create index if not exists idx_generated_images_admin_queue_created_updated
on public.generated_images (created_at desc, updated_at desc)
where queue_kind in ('image_generate', 'video_generate', 'motion_generate');

notify pgrst, 'reload schema';
