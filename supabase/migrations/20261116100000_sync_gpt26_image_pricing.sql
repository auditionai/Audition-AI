begin;

-- GPT Image 2.6 has its own provider pricing matrix. Seed independent Admin
-- rows from the corresponding 2.5 model so both new models appear in the
-- pricing screen immediately; administrators can then set their own Vcoin
-- values without affecting GPT Image 2.5.
insert into public.model_pricing (
  model_id,
  option_id,
  tst_price_credits,
  audition_price_vcoin,
  updated_at
)
select
  target.model_id,
  source.option_id,
  source.tst_price_credits,
  source.audition_price_vcoin,
  now()
from public.model_pricing source
cross join (values
  ('image-gpt-2.5-flare', 'image-gpt-2.6-flare'),
  ('image-gpt-2.5-sunburst', 'image-gpt-2.6-sunburst')
) as target(source_model_id, model_id)
where source.model_id = target.source_model_id
  and source.audition_price_vcoin > 0
  and not exists (
    select 1
    from public.model_pricing existing
    where existing.model_id = target.model_id
      and existing.option_id = source.option_id
  );

notify pgrst, 'reload schema';
commit;
