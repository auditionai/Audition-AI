begin;

alter table public.prompt_library_sample_stats
  add column if not exists audition_use_count integer not null default 0,
  add column if not exists caulenhau_use_count integer not null default 0;

update public.prompt_library_sample_stats
set audition_use_count = greatest(audition_use_count, use_count)
where audition_use_count = 0
  and use_count > 0;

create table if not exists public.prompt_library_search_sample_stats (
  search_query text not null,
  sample_source text not null default 'caulenhau',
  sample_id text not null,
  sample_category text,
  sample_prompt text,
  sample_image_url text,
  selected_count integer not null default 0,
  first_selected_at timestamptz not null default now(),
  last_selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (search_query, sample_source, sample_id)
);

create index if not exists idx_prompt_library_search_sample_stats_query
  on public.prompt_library_search_sample_stats(search_query, selected_count desc, last_selected_at desc);

alter table public.prompt_library_search_sample_stats enable row level security;

drop policy if exists "Public read prompt search learning stats" on public.prompt_library_search_sample_stats;
create policy "Public read prompt search learning stats"
on public.prompt_library_search_sample_stats
for select
to anon, authenticated
using (true);

create or replace function public.track_prompt_library_sample_use_v2(
  p_sample_source text,
  p_sample_id text,
  p_sample_category text default null,
  p_sample_prompt text default null,
  p_sample_image_url text default null,
  p_search_query text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sample_source text := coalesce(nullif(btrim(p_sample_source), ''), 'caulenhau');
  v_sample_id text := nullif(btrim(p_sample_id), '');
  v_search_query text := lower(regexp_replace(coalesce(p_search_query, ''), '\s+', ' ', 'g'));
  v_use_count integer := 0;
begin
  v_search_query := nullif(btrim(v_search_query), '');

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
    audition_use_count,
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
    audition_use_count = prompt_library_sample_stats.audition_use_count + 1,
    use_count = prompt_library_sample_stats.audition_use_count + 1 + prompt_library_sample_stats.caulenhau_use_count,
    last_used_at = now(),
    updated_at = now()
  returning use_count into v_use_count;

  if v_search_query is not null then
    insert into public.prompt_library_search_sample_stats (
      search_query,
      sample_source,
      sample_id,
      sample_category,
      sample_prompt,
      sample_image_url,
      selected_count,
      first_selected_at,
      last_selected_at,
      updated_at
    )
    values (
      v_search_query,
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
    on conflict (search_query, sample_source, sample_id)
    do update set
      sample_category = coalesce(excluded.sample_category, prompt_library_search_sample_stats.sample_category),
      sample_prompt = coalesce(excluded.sample_prompt, prompt_library_search_sample_stats.sample_prompt),
      sample_image_url = coalesce(excluded.sample_image_url, prompt_library_search_sample_stats.sample_image_url),
      selected_count = prompt_library_search_sample_stats.selected_count + 1,
      last_selected_at = now(),
      updated_at = now();
  end if;

  return coalesce(v_use_count, 0);
end;
$$;

create or replace function public.sync_caulenhau_prompt_sample_use(
  p_sample_id text,
  p_click_count integer default 1,
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
  v_sample_id text := nullif(btrim(p_sample_id), '');
  v_click_count integer := greatest(coalesce(p_click_count, 1), 1);
  v_use_count integer := 0;
begin
  if v_sample_id is null then
    raise exception 'sample_id is required';
  end if;

  insert into public.prompt_library_sample_stats (
    sample_source,
    sample_id,
    sample_category,
    sample_prompt,
    sample_image_url,
    use_count,
    caulenhau_use_count,
    first_used_at,
    last_used_at,
    updated_at
  )
  values (
    'caulenhau',
    v_sample_id,
    nullif(btrim(p_sample_category), ''),
    nullif(p_sample_prompt, ''),
    nullif(p_sample_image_url, ''),
    v_click_count,
    v_click_count,
    now(),
    now(),
    now()
  )
  on conflict (sample_source, sample_id)
  do update set
    sample_category = coalesce(excluded.sample_category, prompt_library_sample_stats.sample_category),
    sample_prompt = coalesce(excluded.sample_prompt, prompt_library_sample_stats.sample_prompt),
    sample_image_url = coalesce(excluded.sample_image_url, prompt_library_sample_stats.sample_image_url),
    caulenhau_use_count = prompt_library_sample_stats.caulenhau_use_count + v_click_count,
    use_count = prompt_library_sample_stats.audition_use_count + prompt_library_sample_stats.caulenhau_use_count + v_click_count,
    last_used_at = now(),
    updated_at = now()
  returning use_count into v_use_count;

  return coalesce(v_use_count, 0);
end;
$$;

grant select on table public.prompt_library_search_sample_stats to anon, authenticated;
grant execute on function public.track_prompt_library_sample_use_v2(text, text, text, text, text, text) to anon, authenticated, service_role;
revoke execute on function public.sync_caulenhau_prompt_sample_use(text, integer, text, text, text) from public;
revoke execute on function public.sync_caulenhau_prompt_sample_use(text, integer, text, text, text) from anon, authenticated;
grant execute on function public.sync_caulenhau_prompt_sample_use(text, integer, text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
