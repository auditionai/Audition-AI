begin;

-- Gommo is retired. Existing queued jobs keep their stored provider for audit,
-- while all future routing choices are constrained to GPTi2 and TST.
update public.system_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(value, '{}'::jsonb) - 'providerByModel' - 'providerPriorityByModel',
        '{provider}', '"tst"'::jsonb, true),
      '{providerByFeature}',
      coalesce((select jsonb_object_agg(key, case when val = '"gommo"'::jsonb then '"tst"'::jsonb else val end)
        from jsonb_each(coalesce(value->'providerByFeature', '{}'::jsonb)) as entries(key, val)), '{}'::jsonb), true),
    '{providerPriorityByFeature}',
    coalesce((select jsonb_object_agg(key, (select jsonb_agg(item) from jsonb_array_elements(val) item where item <> '"gommo"'::jsonb))
      from jsonb_each(coalesce(value->'providerPriorityByFeature', '{}'::jsonb)) as entries(key, val)), '{}'::jsonb), true),
  '{providerByModel}', '{}'::jsonb, true)
where key = 'generation_provider_mode';

notify pgrst, 'reload schema';
commit;
