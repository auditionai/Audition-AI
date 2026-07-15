begin;

-- Gallery history must stay quick even when generation prompts or queue payloads
-- are very large. The client list view only needs compact metadata, the latest
-- progress logs, and a short prompt preview.
create or replace function public.get_user_gallery_images_lightweight(
  p_user_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  image_url text,
  prompt text,
  created_at timestamptz,
  updated_at timestamptz,
  asset_type text,
  queue_kind text,
  tool_id text,
  tool_name text,
  model_used text,
  user_id uuid,
  user_name text,
  is_public boolean,
  status text,
  job_id text,
  progress integer,
  error_message text,
  cost_vcoin integer,
  queue_payload jsonb
)
language sql
security definer
set search_path = public
as $$
  with recent_refs as (
    select
      vt.reference_id::uuid as generated_image_id,
      max(vt.created_at) as charged_at
    from public.vcoin_transactions vt
    where vt.user_id = p_user_id
      and vt.reference_type = 'generated_image_charge'
      and vt.created_at >= now() - interval '30 days'
      and vt.reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    group by vt.reference_id
    order by max(vt.created_at) desc
    limit greatest(1, least(coalesce(p_limit, 24), 24))
  ),
  rows as (
    select gi.*, recent_refs.charged_at
    from recent_refs
    join public.generated_images gi on gi.id = recent_refs.generated_image_id
    where gi.user_id = p_user_id
  )
  select
    rows.id,
    rows.image_url,
    left(coalesce(rows.prompt, ''), 4000) as prompt,
    rows.created_at,
    rows.updated_at,
    rows.asset_type,
    rows.queue_kind,
    rows.tool_id,
    rows.tool_name,
    rows.model_used,
    rows.user_id,
    rows.user_name,
    rows.is_public,
    rows.status,
    rows.job_id,
    rows.progress,
    left(coalesce(rows.error_message, ''), 2000) as error_message,
    rows.cost_vcoin,
    jsonb_strip_nulls(jsonb_build_object(
      '__stage', rows.queue_payload -> '__stage',
      '__showInGenerationHistory', rows.queue_payload -> '__showInGenerationHistory',
      '__clientPlatform', rows.queue_payload -> '__clientPlatform',
      '__recipePayload', case
        when rows.queue_payload ? '__recipePayload' then jsonb_strip_nulls(jsonb_build_object(
          'recipeType', rows.queue_payload #> '{__recipePayload,recipeType}',
          'userPromptInput', to_jsonb(left(coalesce(rows.queue_payload #>> '{__recipePayload,userPromptInput}', ''), 2000))
        ))
        else null
      end,
      '__logs', case
        when jsonb_typeof(rows.queue_payload -> '__logs') = 'array' then (
          select coalesce(jsonb_agg(log_entry.value order by log_entry.ordinality), '[]'::jsonb)
          from (
            select value, ordinality
            from jsonb_array_elements(rows.queue_payload -> '__logs') with ordinality
            order by ordinality desc
            limit 20
          ) log_entry
        )
        else null
      end
    )) as queue_payload
  from rows
  order by rows.charged_at desc, rows.created_at desc;
$$;

revoke execute on function public.get_user_gallery_images_lightweight(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_user_gallery_images_lightweight(uuid, integer) to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
