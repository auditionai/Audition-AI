create or replace function public.try_acquire_named_queue_worker_lock(
  p_owner text,
  p_lock_name text default 'queue_worker_lock',
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_lock_name text := nullif(btrim(coalesce(p_lock_name, '')), '');
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 90), 15);
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => v_lease_seconds);
  v_acquired boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  if v_lock_name is null then
    raise exception 'LOCK_NAME_REQUIRED';
  end if;

  insert into public.system_settings (key, value)
  values (
    v_lock_name,
    jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    )
  )
  on conflict (key) do nothing;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    ),
    updated_at = v_now
  where key = v_lock_name
    and (
      coalesce((value ->> 'owner')::text, '') = v_owner
      or coalesce((value ->> 'expiresAt')::timestamptz, to_timestamp(0)) <= v_now
    )
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_named_queue_worker_lock(
  p_owner text,
  p_lock_name text default 'queue_worker_lock'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_lock_name text := nullif(btrim(coalesce(p_lock_name, '')), '');
  v_released boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  if v_lock_name is null then
    raise exception 'LOCK_NAME_REQUIRED';
  end if;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', null,
      'expiresAt', to_timestamp(0),
      'heartbeatAt', now()
    ),
    updated_at = now()
  where key = v_lock_name
    and coalesce((value ->> 'owner')::text, '') = v_owner
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

grant execute on function public.try_acquire_named_queue_worker_lock(text, text, integer) to service_role;
grant execute on function public.release_named_queue_worker_lock(text, text) to service_role;
