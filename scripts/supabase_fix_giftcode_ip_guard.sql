-- Audition AI
-- Enforce giftcode redemption by IP hash on existing Supabase projects.

begin;

alter table public.gift_code_usages
  add column if not exists ip_address text,
  add column if not exists ip_hash text;

drop index if exists public.uq_gift_code_usages_code_ip_hash;
drop index if exists public.uq_gift_code_usages_ip_hash;

create index if not exists idx_gift_code_usages_ip_hash_created
  on public.gift_code_usages(ip_hash, created_at desc)
  where ip_hash is not null;

drop policy if exists "User insert own giftcode usages" on public.gift_code_usages;
revoke insert, update, delete on table public.gift_code_usages from authenticated;

create or replace function public.redeem_giftcode(
  p_user_id uuid,
  p_code text,
  p_ip_hash text,
  p_ip_address text default null
)
returns table (
  success boolean,
  reward numeric,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.gift_codes%rowtype;
  v_usage_count integer := 0;
  v_ip_used boolean := false;
  v_usage_id uuid;
  v_code_normalized text := upper(btrim(coalesce(p_code, '')));
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_charge_applied boolean := false;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if v_code_normalized = '' then
    raise exception 'GIFTCODE_REQUIRED';
  end if;

  if v_ip_hash is null then
    raise exception 'IP_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_ip_hash));

  select *
  into v_code
  from public.gift_codes gc
  where upper(gc.code) = v_code_normalized
  for update;

  if not found or coalesce(v_code.is_active, false) = false then
    raise exception 'GIFT_CODE_INVALID';
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'GIFT_CODE_EXPIRED';
  end if;

  if coalesce(v_code.used_count, 0) >= coalesce(v_code.total_limit, 0) then
    raise exception 'GIFT_CODE_LIMIT_REACHED';
  end if;

  select count(*)::integer
  into v_usage_count
  from public.gift_code_usages gcu
  where gcu.gift_code_id = v_code.id
    and gcu.user_id = p_user_id;

  if v_usage_count >= greatest(coalesce(v_code.max_per_user, 1), 1) then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  end if;

  select exists(
    select 1
    from public.gift_code_usages gcu
    where gcu.ip_hash = v_ip_hash
  )
  into v_ip_used;

  if v_ip_used then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
  end if;

  insert into public.gift_code_usages (
    user_id,
    gift_code_id,
    ip_address,
    ip_hash
  )
  values (
    p_user_id,
    v_code.id,
    nullif(btrim(coalesce(p_ip_address, '')), ''),
    v_ip_hash
  )
  returning id into v_usage_id;

  update public.gift_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = v_code.id;

  v_charge_applied := public.apply_balance_transaction(
    p_user_id,
    coalesce(v_code.reward, 0),
    format('Giftcode: %s', v_code_normalized),
    'giftcode',
    'giftcode_redeem',
    v_usage_id::text,
    jsonb_build_object(
      'gift_code_id', v_code.id,
      'gift_code', v_code_normalized,
      'ip_hash', v_ip_hash
    )
  );

  if not v_charge_applied then
    raise exception 'GIFT_CODE_ALREADY_REDEEMED';
  end if;

  return query
  select true, coalesce(v_code.reward, 0), 'SUCCESS'::text;
exception
  when unique_violation then
    if exists (
      select 1
      from public.gift_code_usages gcu
      where gcu.ip_hash = v_ip_hash
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
    end if;
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  when others then
    raise;
end;
$$;

grant execute on function public.redeem_giftcode(uuid, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
