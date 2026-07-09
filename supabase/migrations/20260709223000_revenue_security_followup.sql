begin;

-- Users must not be publicly enumerable. Public generated showcase rows already
-- carry denormalized user_name, so the users table can stay private.
drop policy if exists "Public read users" on public.users;

create policy "Public read users"
on public.users
for select
to anon, authenticated
using (auth.uid() = id or public.check_is_admin());

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
