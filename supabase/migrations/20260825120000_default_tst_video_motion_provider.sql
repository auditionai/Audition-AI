begin;

-- Video and Motion Control default to TST. Gommo remains available only as
-- an explicit fallback/provider choice and is no longer the primary route.
update public.system_settings
set value = jsonb_set(
  jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{providerByFeature,video_generation}',
    '"tst"'::jsonb,
    true
  ),
  '{providerByFeature,motion_control}',
  '"tst"'::jsonb,
  true
)
where key = 'generation_provider_mode';

update public.system_settings
set value = jsonb_set(
  jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{providerPriorityByFeature,video_generation}',
    '["tst","gommo"]'::jsonb,
    true
  ),
  '{providerPriorityByFeature,motion_control}',
  '["tst","gommo"]'::jsonb,
  true
)
where key = 'generation_provider_mode';

notify pgrst, 'reload schema';
commit;
