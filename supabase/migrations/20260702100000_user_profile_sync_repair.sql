create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    display_name,
    photo_url,
    vcoin_balance,
    is_admin,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    ),
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', ''),
      ''
    ),
    0,
    false,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.users.email),
    display_name = coalesce(nullif(public.users.display_name, ''), excluded.display_name),
    photo_url = coalesce(nullif(public.users.photo_url, ''), excluded.photo_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.users (
  id,
  email,
  display_name,
  photo_url,
  vcoin_balance,
  is_admin,
  created_at,
  updated_at
)
select
  au.id,
  au.email,
  coalesce(
    nullif(au.raw_user_meta_data->>'display_name', ''),
    nullif(au.raw_user_meta_data->>'full_name', ''),
    nullif(au.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
    'User'
  ),
  coalesce(
    nullif(au.raw_user_meta_data->>'avatar_url', ''),
    nullif(au.raw_user_meta_data->>'picture', ''),
    ''
  ),
  0,
  false,
  coalesce(au.created_at, now()),
  now()
from auth.users au
where not exists (
  select 1
  from public.users u
  where u.id = au.id
)
on conflict (id) do update
set
  email = coalesce(excluded.email, public.users.email),
  display_name = coalesce(nullif(public.users.display_name, ''), excluded.display_name),
  photo_url = coalesce(nullif(public.users.photo_url, ''), excluded.photo_url),
  vcoin_balance = public.users.vcoin_balance,
  is_admin = public.users.is_admin,
  updated_at = now();

update public.users u
set
  email = coalesce(u.email, au.email),
  display_name = coalesce(
    nullif(u.display_name, ''),
    nullif(au.raw_user_meta_data->>'display_name', ''),
    nullif(au.raw_user_meta_data->>'full_name', ''),
    nullif(au.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
    'User'
  ),
  photo_url = coalesce(
    nullif(u.photo_url, ''),
    nullif(au.raw_user_meta_data->>'avatar_url', ''),
    nullif(au.raw_user_meta_data->>'picture', ''),
    ''
  ),
  updated_at = now()
from auth.users au
where u.id = au.id
  and (
    u.email is null
    or nullif(u.display_name, '') is null
    or nullif(u.photo_url, '') is null
  );

notify pgrst, 'reload schema';
