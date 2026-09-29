begin;

create table if not exists public.dance_video_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'Dance AI',
  preview_video_url text not null,
  thumbnail_url text,
  price_vcoin integer not null check (price_vcoin > 0),
  required_image_count integer not null default 1 check (required_image_count between 1 and 8),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dance_video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  template_id uuid not null references public.dance_video_templates(id),
  status text not null default 'pending' check (status in ('pending','accepted','processing','completed')),
  character_image_urls jsonb not null default '[]'::jsonb,
  customer_name text,
  contact_zalo text,
  note text,
  result_video_url text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_dance_video_jobs_admin on public.dance_video_jobs(status, created_at desc);
create index if not exists idx_dance_video_jobs_user on public.dance_video_jobs(user_id, created_at desc);

alter table public.dance_video_templates enable row level security;
alter table public.dance_video_jobs enable row level security;
drop policy if exists "Public read active dance templates" on public.dance_video_templates;
create policy "Public read active dance templates" on public.dance_video_templates for select to authenticated using (is_active or public.check_is_admin());
drop policy if exists "Admin manage dance templates" on public.dance_video_templates;
create policy "Admin manage dance templates" on public.dance_video_templates for all to authenticated using (public.check_is_admin()) with check (public.check_is_admin());
drop policy if exists "Users read own dance jobs" on public.dance_video_jobs;
create policy "Users read own dance jobs" on public.dance_video_jobs for select to authenticated using (user_id = auth.uid() or public.check_is_admin());
drop policy if exists "Admin manage dance jobs" on public.dance_video_jobs;
create policy "Admin manage dance jobs" on public.dance_video_jobs for all to authenticated using (public.check_is_admin()) with check (public.check_is_admin());

create or replace function public.create_dance_video_order(
  p_user_id uuid, p_template_id uuid, p_character_image_urls jsonb, p_customer_name text default null,
  p_contact_zalo text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_template public.dance_video_templates%rowtype; v_job_id uuid := gen_random_uuid(); v_balance numeric;
begin
  select * into v_template from public.dance_video_templates where id = p_template_id and is_active = true for update;
  if not found then raise exception 'DANCE_TEMPLATE_UNAVAILABLE'; end if;
  if jsonb_typeof(p_character_image_urls) <> 'array' or jsonb_array_length(p_character_image_urls) <> v_template.required_image_count then
    raise exception 'INVALID_CHARACTER_IMAGE_COUNT';
  end if;
  select coalesce(vcoin_balance, 0) into v_balance from public.users where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_balance < v_template.price_vcoin then raise exception 'INSUFFICIENT_VCOIN'; end if;
  update public.users set vcoin_balance = v_balance - v_template.price_vcoin, updated_at = now() where id = p_user_id;
  insert into public.vcoin_transactions(user_id,amount,description,type,reference_type,reference_id,metadata,balance_before,balance_after)
  values(p_user_id,-v_template.price_vcoin,'Đặt làm video AI: ' || v_template.title,'usage','generated_image_charge',v_job_id::text,jsonb_build_object('template_id',p_template_id,'order_type','dance_video'),v_balance,v_balance-v_template.price_vcoin);
  insert into public.dance_video_jobs(id,user_id,template_id,character_image_urls,customer_name,contact_zalo,note) values(v_job_id,p_user_id,p_template_id,p_character_image_urls,p_customer_name,p_contact_zalo,p_note);
  insert into public.generated_images(id,user_id,image_url,prompt,model_used,created_at,updated_at,is_public,tool_id,tool_name,status,progress,asset_type,queue_kind,cost_vcoin,queue_payload)
  values(v_job_id,p_user_id,'','Đặt làm video AI: ' || v_template.title,'Admin Motion Control',now(),now(),false,'dance_video_order','Đặt Làm Video AI','queued',0,'video','dance_video_order',v_template.price_vcoin,jsonb_build_object('__showInGenerationHistory',true,'danceJobStatus','pending','danceTemplateTitle',v_template.title));
  return v_job_id;
end; $$;
revoke all on function public.create_dance_video_order(uuid,uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.create_dance_video_order(uuid,uuid,jsonb,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
