begin;

-- TST exposes Flare/Sunburst as separate model ids, while AUDITION AI's
-- existing Vcoin matrix is maintained under image-gpt-2. Keep the same
-- option ids and Vcoin prices for the two GPT Image 2.5 routes. Existing
-- model-specific rows always win and are never overwritten.
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
cross join (values ('image-gpt-2.5-flare'), ('image-gpt-2.5-sunburst')) as target(model_id)
where source.model_id = 'image-gpt-2'
  and source.audition_price_vcoin > 0
  and not exists (
    select 1
    from public.model_pricing existing
    where existing.model_id = target.model_id
      and existing.option_id = source.option_id
  );

notify pgrst, 'reload schema';
commit;
