begin;

-- TST remains at 4 system / 1 per user for each media type.
-- Gommo uses an independent lane with three times that processing capacity:
-- 12 concurrent system jobs and 3 concurrent jobs per user.
do $$
declare
  v_enqueue_definition text;
  v_claim_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.server_enqueue_generated_job(uuid,uuid,text,text,text,text,text,integer,text,jsonb)'::regprocedure
  ) into v_enqueue_definition;

  if v_enqueue_definition is null
     or position('v_system_image_limit := 8;' in v_enqueue_definition) = 0
     or position('v_system_video_limit := 8;' in v_enqueue_definition) = 0
     or position('v_user_image_limit := 2;' in v_enqueue_definition) = 0
     or position('v_user_video_limit := 2;' in v_enqueue_definition) = 0 then
    raise exception 'Unexpected server_enqueue_generated_job definition; refusing an unsafe capacity rewrite';
  end if;

  v_updated_definition := replace(v_enqueue_definition, 'v_system_image_limit := 8;', 'v_system_image_limit := 12;');
  v_updated_definition := replace(v_updated_definition, 'v_system_video_limit := 8;', 'v_system_video_limit := 12;');
  v_updated_definition := replace(v_updated_definition, 'v_user_image_limit := 2;', 'v_user_image_limit := 3;');
  v_updated_definition := replace(v_updated_definition, 'v_user_video_limit := 2;', 'v_user_video_limit := 3;');
  execute v_updated_definition;

  select pg_get_functiondef(
    'public.claim_dispatchable_generated_jobs(integer,integer)'::regprocedure
  ) into v_claim_definition;

  if v_claim_definition is null
     or position('then 8 else 4 end' in v_claim_definition) = 0
     or position('then 2 else 1 end' in v_claim_definition) = 0 then
    raise exception 'Unexpected claim_dispatchable_generated_jobs definition; refusing an unsafe capacity rewrite';
  end if;

  v_updated_definition := replace(v_claim_definition, 'then 8 else 4 end', 'then 12 else 4 end');
  v_updated_definition := replace(v_updated_definition, 'then 2 else 1 end', 'then 3 else 1 end');
  execute v_updated_definition;
end;
$$;

revoke execute on function public.server_enqueue_generated_job(uuid, uuid, text, text, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.server_enqueue_generated_job(uuid, uuid, text, text, text, text, text, integer, text, jsonb)
  to service_role;

revoke execute on function public.claim_dispatchable_generated_jobs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_dispatchable_generated_jobs(integer, integer)
  to service_role;

commit;
