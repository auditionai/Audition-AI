alter table public.vcoin_transactions
  add column if not exists balance_before numeric,
  add column if not exists balance_after numeric;

create or replace function public.apply_balance_transaction(
  p_target_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_log_type text,
  p_reference_type text default null::text,
  p_reference_id text default null::text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_balance_before numeric := 0;
  v_balance_after numeric := 0;
begin
  if p_reference_type is not null and p_reference_id is not null then
    select id
    into v_existing_id
    from public.vcoin_transactions
    where reference_type = p_reference_type
      and reference_id = p_reference_id
    limit 1;

    if v_existing_id is not null then
      return false;
    end if;
  end if;

  select coalesce(vcoin_balance, 0)
  into v_balance_before
  from public.users
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'User % not found', p_target_user_id;
  end if;

  v_balance_after := v_balance_before + coalesce(p_amount, 0);

  update public.users
  set vcoin_balance = v_balance_after,
      updated_at = now()
  where id = p_target_user_id;

  insert into public.vcoin_transactions (
    user_id,
    amount,
    description,
    type,
    reference_type,
    reference_id,
    metadata,
    balance_before,
    balance_after
  )
  values (
    p_target_user_id,
    p_amount,
    p_reason,
    p_log_type,
    p_reference_type,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb),
    v_balance_before,
    v_balance_after
  );

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

grant execute on function public.apply_balance_transaction(uuid, numeric, text, text, text, text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
