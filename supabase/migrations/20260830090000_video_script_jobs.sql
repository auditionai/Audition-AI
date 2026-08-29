begin;

create table if not exists public.video_script_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  request_payload jsonb not null,
  script text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists video_script_jobs_user_created_idx
  on public.video_script_jobs (user_id, created_at desc);

alter table public.video_script_jobs enable row level security;

drop policy if exists video_script_jobs_select_own on public.video_script_jobs;
create policy video_script_jobs_select_own on public.video_script_jobs
  for select using (auth.uid() = user_id);

drop policy if exists video_script_jobs_insert_own on public.video_script_jobs;
create policy video_script_jobs_insert_own on public.video_script_jobs
  for insert with check (auth.uid() = user_id);

commit;
