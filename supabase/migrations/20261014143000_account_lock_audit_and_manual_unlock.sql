-- Make account restrictions explainable and reviewable by administrators.
create table if not exists public.account_lock_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('locked', 'unlocked')),
  reason_code text not null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_lock_events_user_created
  on public.account_lock_events(user_id, created_at desc);

alter table public.account_lock_events enable row level security;

-- Preserve the only historical explanation available for locks created before
-- this audit trail was introduced.
insert into public.account_lock_events (user_id, event_type, reason_code, reason, created_at)
select
  u.id,
  'locked',
  case when lower(coalesce(u.lock_reason, '')) like '%3 account%' or lower(coalesce(u.lock_reason, '')) like '%3 tài khoản%' then 'browser_account_limit' else 'legacy_lock_state' end,
  coalesce(nullif(btrim(u.lock_reason), ''), 'Tài khoản bị khóa trước khi hệ thống nhật ký được áp dụng.'),
  coalesce(u.locked_at, u.updated_at, now())
from public.users u
where coalesce(u.account_status, 'active') = 'locked'
  and not exists (
    select 1 from public.account_lock_events e where e.user_id = u.id and e.event_type = 'locked'
  );

create or replace function public.lock_user_account(
  p_user_id uuid,
  p_reason text default 'Giftcode abuse'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Khóa tài khoản bởi quản trị viên');
  v_was_locked boolean := false;
begin
  select coalesce(account_status, 'active') = 'locked' into v_was_locked
  from public.users where id = p_user_id for update;

  update public.users
  set account_status = 'locked', locked_at = now(), lock_reason = v_reason, updated_at = now()
  where id = p_user_id;

  if found and not v_was_locked then
    insert into public.account_lock_events (user_id, event_type, reason_code, reason)
    values (p_user_id, 'locked', 'admin_or_giftcode_lock', v_reason);
  end if;
  return found;
end;
$$;

create or replace function public.bind_user_browser_key(
  p_user_id uuid,
  p_browser_key_hash text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := nullif(btrim(coalesce(p_browser_key_hash, '')), '');
  v_existing_index integer;
  v_next_index integer;
  v_is_admin boolean := false;
  v_already_locked boolean := false;
  v_related_ids jsonb := '[]'::jsonb;
begin
  if p_user_id is null or v_hash is null then return null; end if;

  select coalesce(is_admin, false), coalesce(account_status, 'active') = 'locked'
    into v_is_admin, v_already_locked
  from public.users where id = p_user_id;

  perform pg_advisory_xact_lock(hashtext('browser-key|' || v_hash));

  select account_index into v_existing_index
  from public.user_browser_keys
  where browser_key_hash = v_hash and user_id = p_user_id
  limit 1;

  if v_existing_index is not null then
    update public.user_browser_keys set last_seen_at = now()
    where browser_key_hash = v_hash and user_id = p_user_id;
    return v_existing_index;
  end if;

  if v_is_admin then
    v_next_index := 0;
  else
    select coalesce(max(ubk.account_index), 0) + 1 into v_next_index
    from public.user_browser_keys ubk
    join public.users u on u.id = ubk.user_id
    where ubk.browser_key_hash = v_hash and coalesce(u.is_admin, false) = false;
  end if;

  insert into public.user_browser_keys (browser_key_hash, user_id, account_index, is_checkin_allowed)
  values (v_hash, p_user_id, v_next_index, v_is_admin or v_next_index <= 3);

  if not v_is_admin and v_next_index > 3 then
    select coalesce(jsonb_agg(ubk.user_id order by ubk.account_index), '[]'::jsonb)
      into v_related_ids
    from public.user_browser_keys ubk
    where ubk.browser_key_hash = v_hash;

    update public.users set
      account_status = 'locked', locked_at = now(),
      lock_reason = 'Vượt quá giới hạn 3 tài khoản trên cùng thiết bị', updated_at = now()
    where id = p_user_id;

    if not v_already_locked then
      insert into public.account_lock_events (user_id, event_type, reason_code, reason, evidence)
      values (
        p_user_id, 'locked', 'browser_account_limit',
        'Tài khoản thứ ' || v_next_index || ' trên cùng thiết bị; giới hạn là 3.',
        jsonb_build_object(
          'browser_key_hash', v_hash,
          'account_index', v_next_index,
          'account_limit', 3,
          'related_account_ids', v_related_ids
        )
      );
    end if;
  end if;

  return v_next_index;
end;
$$;

create or replace function public.admin_unlock_user_account(
  p_user_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  if v_reason is null then raise exception 'UNLOCK_REASON_REQUIRED'; end if;

  update public.users
  set account_status = 'active', locked_at = null, lock_reason = null, updated_at = now()
  where id = p_user_id;

  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.account_lock_events (user_id, event_type, reason_code, reason, actor_user_id)
  values (p_user_id, 'unlocked', 'manual_admin_unlock', v_reason, p_actor_user_id);
  return true;
end;
$$;

revoke all on table public.account_lock_events from public, anon, authenticated;
revoke all on function public.admin_unlock_user_account(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_unlock_user_account(uuid, text, uuid) to service_role;
