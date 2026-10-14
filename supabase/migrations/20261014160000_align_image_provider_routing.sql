begin;

-- Image routes start on GPTi2 and can fall back to TST. Admin may reverse
-- that order per route. Gommo survives only in historical job metadata.
update public.system_settings
set value = (coalesce(value, '{}'::jsonb) - 'providerByModel' - 'providerPriorityByModel') || jsonb_build_object(
  'provider', 'gpti2',
  'providerByFeature', jsonb_build_object(
    'image_single', 'gpti2', 'image_couple', 'gpti2', 'image_group_3', 'gpti2',
    'image_group_4', 'gpti2', 'image_group_5', 'gpti2', 'image_group_6', 'gpti2',
    'image_group_7', 'gpti2', 'image_group_8', 'gpti2', 'image_prompt', 'gpti2',
    'video_generation', 'tst', 'motion_control', 'tst'
  ),
  'providerPriorityByFeature', jsonb_build_object(
    'image_single', jsonb_build_array('gpti2', 'tst'), 'image_couple', jsonb_build_array('gpti2', 'tst'),
    'image_group_3', jsonb_build_array('gpti2', 'tst'), 'image_group_4', jsonb_build_array('gpti2', 'tst'),
    'image_group_5', jsonb_build_array('gpti2', 'tst'), 'image_group_6', jsonb_build_array('gpti2', 'tst'),
    'image_group_7', jsonb_build_array('gpti2', 'tst'), 'image_group_8', jsonb_build_array('gpti2', 'tst'),
    'image_prompt', jsonb_build_array('gpti2', 'tst'), 'video_generation', jsonb_build_array('tst'),
    'motion_control', jsonb_build_array('tst')
  ),
  'updatedAt', now()::text
)
where key = 'generation_provider_mode';

notify pgrst, 'reload schema';
commit;
