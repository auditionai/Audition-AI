-- Audition AI
-- Fix trigger that was blocking server-side balance updates / queue submit

begin;

create or replace function public.guard_user_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL editor, service_role, and security-definer server RPCs.
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if public.check_is_admin() then
    return new;
  end if;

  if auth.uid() is distinct from old.id then
    raise exception 'FORBIDDEN';
  end if;

  new.id := old.id;
  new.email := old.email;
  new.vcoin_balance := old.vcoin_balance;
  new.is_admin := old.is_admin;
  new.is_vip := old.is_vip;
  new.created_at := old.created_at;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
