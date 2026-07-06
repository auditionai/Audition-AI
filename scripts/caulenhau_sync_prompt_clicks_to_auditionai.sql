-- Run this script on the CauLenhAU Supabase database, not on AuditionAI.
-- It forwards CauLenhAU prompt-sample clicks to AuditionAI so both platforms
-- share one cumulative usage counter.

begin;

create extension if not exists pg_net;

alter table public.images
  add column if not exists click_count integer not null default 0;

create table if not exists public.auditionai_prompt_click_sync_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  auditionai_rpc_url text,
  auditionai_service_role_key text,
  updated_at timestamptz not null default now(),
  constraint auditionai_prompt_click_sync_settings_singleton check (id = true)
);

insert into public.auditionai_prompt_click_sync_settings (id, enabled)
values (true, false)
on conflict (id) do nothing;

-- Configure once after running this script:
--
-- update public.auditionai_prompt_click_sync_settings
-- set
--   enabled = true,
--   auditionai_rpc_url = 'https://YOUR_AUDITIONAI_PROJECT.supabase.co/rest/v1/rpc/sync_caulenhau_prompt_sample_use',
--   auditionai_service_role_key = 'YOUR_AUDITIONAI_SERVICE_ROLE_KEY',
--   updated_at = now()
-- where id = true;

create or replace function public.forward_prompt_sample_click_to_auditionai(
  p_image_id text,
  p_click_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.auditionai_prompt_click_sync_settings%rowtype;
  v_image public.images%rowtype;
  v_click_count integer := greatest(coalesce(p_click_count, 1), 1);
begin
  select *
  into v_settings
  from public.auditionai_prompt_click_sync_settings
  where id = true;

  if not found
     or not v_settings.enabled
     or nullif(btrim(coalesce(v_settings.auditionai_rpc_url, '')), '') is null
     or nullif(btrim(coalesce(v_settings.auditionai_service_role_key, '')), '') is null
  then
    return;
  end if;

  select *
  into v_image
  from public.images
  where id::text = p_image_id
  limit 1;

  if not found then
    return;
  end if;

  perform net.http_post(
    url := v_settings.auditionai_rpc_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_settings.auditionai_service_role_key,
      'Authorization', 'Bearer ' || v_settings.auditionai_service_role_key
    ),
    body := jsonb_build_object(
      'p_sample_id', v_image.id::text,
      'p_click_count', v_click_count,
      'p_sample_category', null,
      'p_sample_prompt', coalesce(v_image.prompt, ''),
      'p_sample_image_url', coalesce(v_image.image_url, '')
    )
  );
end;
$$;

create or replace function public.track_prompt_sample_click(
  p_image_id text,
  p_click_count integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_click_count integer := greatest(coalesce(p_click_count, 1), 1);
  v_total integer := 0;
begin
  update public.images
  set click_count = coalesce(click_count, 0) + v_click_count
  where id::text = p_image_id
  returning click_count into v_total;

  if not found then
    raise exception 'Image % not found', p_image_id;
  end if;

  return coalesce(v_total, 0);
end;
$$;

create or replace function public.forward_prompt_sample_click_count_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer := coalesce(new.click_count, 0) - coalesce(old.click_count, 0);
begin
  if v_delta > 0 then
    perform public.forward_prompt_sample_click_to_auditionai(new.id::text, v_delta);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_forward_prompt_sample_click_count_update on public.images;
create trigger trg_forward_prompt_sample_click_count_update
after update of click_count on public.images
for each row
when (coalesce(new.click_count, 0) > coalesce(old.click_count, 0))
execute function public.forward_prompt_sample_click_count_update();

grant execute on function public.track_prompt_sample_click(text, integer) to anon, authenticated, service_role;

commit;
