begin;

-- Keep disposable operational history for seven days. Published assets,
-- balances, payments, and the VCoin ledger remain untouched.
create or replace function public.cleanup_expired_operational_history(
  p_limit integer default 100,
  p_retention_days integer default 7
)
returns table (
  deleted_generated_images integer,
  deleted_check_ins integer,
  deleted_app_visits integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_retention_days integer := greatest(coalesce(p_retention_days, 7), 7);
  v_generated integer := 0;
  v_check_ins integer := 0;
  v_visits integer := 0;
begin
  with candidates as (
    select gi.id
    from public.generated_images gi
    where gi.status in ('completed', 'failed', 'cancelled')
      and gi.is_public is not true
      and coalesce(gi.finished_at, gi.updated_at, gi.created_at)
        < now() - make_interval(days => v_retention_days)
    order by coalesce(gi.finished_at, gi.updated_at, gi.created_at)
    limit v_limit
    for update skip locked
  )
  delete from public.generated_images gi
  using candidates
  where gi.id = candidates.id;
  get diagnostics v_generated = row_count;

  with candidates as (
    select dci.id
    from public.daily_check_ins dci
    where dci.check_in_date < current_date - v_retention_days
    order by dci.check_in_date
    limit v_limit
    for update skip locked
  )
  delete from public.daily_check_ins dci
  using candidates
  where dci.id = candidates.id;
  get diagnostics v_check_ins = row_count;

  with candidates as (
    select av.id
    from public.app_visits av
    where av.created_at < now() - make_interval(days => v_retention_days)
    order by av.created_at
    limit v_limit
    for update skip locked
  )
  delete from public.app_visits av
  using candidates
  where av.id = candidates.id;
  get diagnostics v_visits = row_count;

  return query select v_generated, v_check_ins, v_visits;
end;
$$;

revoke execute on function public.cleanup_expired_operational_history(integer, integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_operational_history(integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
