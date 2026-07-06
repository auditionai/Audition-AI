begin;

create table if not exists public.prompt_library_sample_stats (
  sample_source text not null default 'caulenhau',
  sample_id text not null,
  sample_category text,
  sample_prompt text,
  sample_image_url text,
  use_count integer not null default 0,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sample_source, sample_id)
);

create table if not exists public.prompt_library_sample_uses (
  id uuid primary key default gen_random_uuid(),
  sample_source text not null default 'caulenhau',
  sample_id text not null,
  sample_category text,
  user_id uuid references public.users(id) on delete set null,
  used_at timestamptz not null default now()
);

create index if not exists idx_prompt_library_sample_stats_use_count
  on public.prompt_library_sample_stats(use_count desc, last_used_at desc);

create index if not exists idx_prompt_library_sample_uses_sample
  on public.prompt_library_sample_uses(sample_source, sample_id, used_at desc);

create index if not exists idx_prompt_library_sample_uses_user
  on public.prompt_library_sample_uses(user_id, used_at desc)
  where user_id is not null;

alter table public.prompt_library_sample_stats enable row level security;
alter table public.prompt_library_sample_uses enable row level security;

drop policy if exists "Public read prompt sample stats" on public.prompt_library_sample_stats;
create policy "Public read prompt sample stats"
on public.prompt_library_sample_stats
for select
to anon, authenticated
using (true);

drop policy if exists "Admins read prompt sample uses" on public.prompt_library_sample_uses;
create policy "Admins read prompt sample uses"
on public.prompt_library_sample_uses
for select
to authenticated
using (public.check_is_admin());

drop policy if exists "Users read own prompt sample uses" on public.prompt_library_sample_uses;
create policy "Users read own prompt sample uses"
on public.prompt_library_sample_uses
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.track_prompt_library_sample_use(
  p_sample_source text,
  p_sample_id text,
  p_sample_category text default null,
  p_sample_prompt text default null,
  p_sample_image_url text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sample_source text := coalesce(nullif(btrim(p_sample_source), ''), 'caulenhau');
  v_sample_id text := nullif(btrim(p_sample_id), '');
  v_use_count integer := 0;
begin
  if v_sample_id is null then
    raise exception 'sample_id is required';
  end if;

  insert into public.prompt_library_sample_uses (
    sample_source,
    sample_id,
    sample_category,
    user_id
  )
  values (
    v_sample_source,
    v_sample_id,
    nullif(btrim(p_sample_category), ''),
    auth.uid()
  );

  insert into public.prompt_library_sample_stats (
    sample_source,
    sample_id,
    sample_category,
    sample_prompt,
    sample_image_url,
    use_count,
    first_used_at,
    last_used_at,
    updated_at
  )
  values (
    v_sample_source,
    v_sample_id,
    nullif(btrim(p_sample_category), ''),
    nullif(p_sample_prompt, ''),
    nullif(p_sample_image_url, ''),
    1,
    now(),
    now(),
    now()
  )
  on conflict (sample_source, sample_id)
  do update set
    sample_category = coalesce(excluded.sample_category, prompt_library_sample_stats.sample_category),
    sample_prompt = coalesce(excluded.sample_prompt, prompt_library_sample_stats.sample_prompt),
    sample_image_url = coalesce(excluded.sample_image_url, prompt_library_sample_stats.sample_image_url),
    use_count = prompt_library_sample_stats.use_count + 1,
    last_used_at = now(),
    updated_at = now()
  returning use_count into v_use_count;

  return coalesce(v_use_count, 0);
end;
$$;

grant select on table public.prompt_library_sample_stats to anon, authenticated;
grant execute on function public.track_prompt_library_sample_use(text, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
