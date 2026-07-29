begin;

-- Generated per-user codes were historically created with max_per_user = 1,
-- even when their campaign template allowed multiple uses. The reservation
-- function counts applied usages across the whole campaign, so comparing that
-- count with the child value made the campaign appear exhausted after its
-- first successful payment.
with template_limits as (
  select
    upper(btrim(coalesce(gc.campaign_key, gc.code))) as normalized_campaign_key,
    max(greatest(coalesce(gc.max_per_user, 1), 1)) as max_per_user
  from public.gift_codes gc
  where gc.code_type = 'topup_discount'
    and gc.assigned_user_id is null
    and gc.auto_generate_per_user is true
  group by 1
)
update public.gift_codes child
set
  max_per_user = template_limits.max_per_user,
  updated_at = now()
from template_limits
where child.code_type = 'topup_discount'
  and child.assigned_user_id is not null
  and child.code ~ '-[A-Z0-9]{5,8}$'
  and upper(btrim(coalesce(
    child.campaign_key,
    regexp_replace(child.code, '-[A-Z0-9]{5,8}$', ''),
    child.code
  ))) = template_limits.normalized_campaign_key
  and child.max_per_user is distinct from template_limits.max_per_user;

notify pgrst, 'reload schema';

commit;
