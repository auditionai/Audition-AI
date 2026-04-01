


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."apply_balance_transaction"("p_target_user_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_log_type" "text", "p_reference_type" "text" DEFAULT NULL::"text", "p_reference_id" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_existing_id uuid;
begin
  if p_reference_type is not null and p_reference_id is not null then
    select id
    into v_existing_id
    from public.vcoin_transactions
    where reference_type = p_reference_type
      and reference_id = p_reference_id
    limit 1;

    if v_existing_id is not null then
      return false;
    end if;
  end if;

  update public.users
  set vcoin_balance = coalesce(vcoin_balance, 0) + p_amount,
      updated_at = now()
  where id = p_target_user_id;

  if not found then
    raise exception 'User % not found', p_target_user_id;
  end if;

  insert into public.vcoin_transactions (
    user_id,
    amount,
    description,
    type,
    reference_type,
    reference_id,
    metadata
  )
  values (
    p_target_user_id,
    p_amount,
    p_reason,
    p_log_type,
    p_reference_type,
    p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
exception
  when unique_violation then
    return false;
end;
$$;


ALTER FUNCTION "public"."apply_balance_transaction"("p_target_user_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_log_type" "text", "p_reference_type" "text", "p_reference_id" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  );
$$;


ALTER FUNCTION "public"."check_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_dispatchable_generated_jobs"("p_limit" integer DEFAULT 10, "p_lease_seconds" integer DEFAULT 120) RETURNS TABLE("id" "uuid", "user_id" "uuid", "asset_type" "text", "queue_kind" "text", "queue_payload" "jsonb", "prompt" "text", "tool_id" "text", "tool_name" "text", "model_used" "text", "cost_vcoin" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with processing as (
    select
      count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as system_image_processing,
      count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as system_video_processing
    from public.generated_images
    where status = 'processing'
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  ),
  queue_depth as (
    select
      count(*) filter (where status = 'queued' and coalesce(asset_type, 'image') = 'image')::integer as queued_images,
      count(*) filter (where status = 'queued' and coalesce(asset_type, 'image') = 'video')::integer as queued_videos
    from public.generated_images
    where status in ('queued', 'processing')
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  ),
  capacity as (
    select
      least(
        8,
        4 + case
          when q.queued_images >= 24 then 4
          when q.queued_images >= 16 then 3
          when q.queued_images >= 8 then 2
          when q.queued_images >= 4 then 1
          else 0
        end
      )::integer as image_capacity,
      least(
        6,
        4 + case
          when q.queued_videos >= 10 then 2
          when q.queued_videos >= 4 then 1
          else 0
        end
      )::integer as video_capacity
    from queue_depth q
  ),
  user_processing as (
    select
      user_id,
      count(*) filter (where coalesce(asset_type, 'image') = 'image')::integer as image_processing,
      count(*) filter (where coalesce(asset_type, 'image') = 'video')::integer as video_processing
    from public.generated_images
    where status = 'processing'
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    group by user_id
  ),
  base_candidates as (
    select
      gi.*,
      coalesce(up.image_processing, 0) as user_image_processing,
      coalesce(up.video_processing, 0) as user_video_processing,
      greatest(0, c.image_capacity - p.system_image_processing) as image_slots,
      greatest(0, c.video_capacity - p.system_video_processing) as video_slots
    from public.generated_images gi
    cross join processing p
    cross join capacity c
    left join user_processing up on up.user_id = gi.user_id
    where gi.status = 'queued'
      and gi.queue_payload is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
      and (
        (coalesce(gi.asset_type, 'image') = 'image' and coalesce(up.image_processing, 0) = 0 and greatest(0, c.image_capacity - p.system_image_processing) > 0)
        or
        (coalesce(gi.asset_type, 'image') = 'video' and coalesce(up.video_processing, 0) = 0 and greatest(0, c.video_capacity - p.system_video_processing) > 0)
      )
  ),
  ranked_user as (
    select
      bc.*,
      row_number() over (partition by bc.user_id, coalesce(bc.asset_type, 'image') order by bc.created_at, bc.id) as rn_user
    from base_candidates bc
  ),
  ranked_system as (
    select
      ru.*,
      row_number() over (partition by coalesce(ru.asset_type, 'image') order by ru.created_at, ru.id) as rn_system
    from ranked_user ru
    where ru.rn_user = 1
  ),
  picked as (
    select rs.id
    from ranked_system rs
    where (
      coalesce(rs.asset_type, 'image') = 'image'
      and rs.rn_system <= rs.image_slots
    ) or (
      coalesce(rs.asset_type, 'image') = 'video'
      and rs.rn_system <= rs.video_slots
    )
    order by rs.created_at, rs.id
    limit greatest(coalesce(p_limit, 1), 1)
  ),
  updated as (
    update public.generated_images gi
    set
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
      updated_at = now(),
      error_message = null
    where gi.id in (select picked.id from picked)
      and gi.status = 'queued'
      and gi.queue_payload is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    returning gi.*
  )
  select
    u.id,
    u.user_id,
    coalesce(u.asset_type, 'image') as asset_type,
    u.queue_kind,
    u.queue_payload,
    u.prompt,
    u.tool_id,
    u.tool_name,
    u.model_used,
    u.cost_vcoin
  from updated u;
$$;


ALTER FUNCTION "public"."claim_dispatchable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_pollable_generated_jobs"("p_limit" integer DEFAULT 10, "p_lease_seconds" integer DEFAULT 60) RETURNS TABLE("id" "uuid", "user_id" "uuid", "asset_type" "text", "queue_kind" "text", "queue_payload" "jsonb", "prompt" "text", "tool_id" "text", "tool_name" "text", "model_used" "text", "cost_vcoin" integer, "job_id" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with candidates as (
    select gi.id
    from public.generated_images gi
    where gi.status = 'processing'
      and gi.job_id is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.next_poll_at is null or gi.next_poll_at <= now())
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    order by coalesce(gi.next_poll_at, gi.processing_started_at, gi.created_at), gi.created_at, gi.id
    limit greatest(coalesce(p_limit, 1), 1)
  ),
  updated as (
    update public.generated_images gi
    set
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 15)),
      updated_at = now()
    where gi.id in (select candidates.id from candidates)
      and gi.status = 'processing'
      and gi.job_id is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.next_poll_at is null or gi.next_poll_at <= now())
      and (gi.lease_expires_at is null or gi.lease_expires_at < now())
    returning gi.*
  )
  select
    u.id,
    u.user_id,
    coalesce(u.asset_type, 'image') as asset_type,
    u.queue_kind,
    u.queue_payload,
    u.prompt,
    u.tool_id,
    u.tool_name,
    u.model_used,
    u.cost_vcoin,
    u.job_id
  from updated u;
$$;


ALTER FUNCTION "public"."claim_pollable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_generated_job"("p_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") RETURNS TABLE("id" "uuid", "status" "text", "queue_position" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select *
  from public.server_enqueue_generated_job(
    p_id,
    auth.uid(),
    p_prompt,
    p_tool_id,
    p_tool_name,
    p_engine,
    p_asset_type,
    p_cost_vcoin,
    p_queue_kind,
    p_queue_payload
  );
end;
$$;


ALTER FUNCTION "public"."enqueue_generated_job"("p_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fill_generated_image_user_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(new.user_name, '') = '' and new.user_id is not null then
    select u.display_name
    into new.user_name
    from public.users u
    where u.id = new.user_id
    limit 1;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."fill_generated_image_user_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_generation_queue_stats"() RETURNS TABLE("my_image_processing" integer, "my_video_processing" integer, "my_queued" integer, "system_image_processing" integer, "system_video_processing" integer, "system_queued" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with scoped as (
    select
      user_id,
      status,
      asset_type,
      queue_kind
    from public.generated_images
    where status in ('queued', 'processing')
      and coalesce(queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
  )
  select
    count(*) filter (
      where user_id = auth.uid()
        and status = 'processing'
        and coalesce(asset_type, 'image') = 'image'
    )::integer as my_image_processing,
    count(*) filter (
      where user_id = auth.uid()
        and status = 'processing'
        and coalesce(asset_type, 'image') = 'video'
    )::integer as my_video_processing,
    count(*) filter (
      where user_id = auth.uid()
        and status = 'queued'
    )::integer as my_queued,
    count(*) filter (
      where status = 'processing'
        and coalesce(asset_type, 'image') = 'image'
    )::integer as system_image_processing,
    count(*) filter (
      where status = 'processing'
        and coalesce(asset_type, 'image') = 'video'
    )::integer as system_video_processing,
    count(*) filter (
      where status = 'queued'
    )::integer as system_queued
  from scoped;
$$;


ALTER FUNCTION "public"."get_generation_queue_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_user_profile_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
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


ALTER FUNCTION "public"."guard_user_profile_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
      ''
    ),
    0,
    false,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users.display_name),
    photo_url = coalesce(excluded.photo_url, public.users.photo_url),
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_giftcode_usage"("code_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.gift_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = code_id;
$$;


ALTER FUNCTION "public"."increment_giftcode_usage"("code_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "reward" numeric, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_code public.gift_codes%rowtype;
  v_campaign_key text;
  v_usage_count integer := 0;
  v_ip_used boolean := false;
  v_usage_id uuid;
  v_code_normalized text := upper(btrim(coalesce(p_code, '')));
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_charge_applied boolean := false;
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if v_code_normalized = '' then
    raise exception 'GIFTCODE_REQUIRED';
  end if;

  if v_ip_hash is null then
    raise exception 'IP_REQUIRED';
  end if;

  select *
  into v_code
  from public.gift_codes gc
  where upper(gc.code) = v_code_normalized
  for update;

  if not found or coalesce(v_code.is_active, false) = false then
    raise exception 'GIFT_CODE_INVALID';
  end if;

  v_campaign_key := upper(btrim(coalesce(v_code.campaign_key, v_code.code, v_code_normalized)));

  perform pg_advisory_xact_lock(hashtext(v_ip_hash || '|' || v_campaign_key));

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'GIFT_CODE_EXPIRED';
  end if;

  if coalesce(v_code.used_count, 0) >= coalesce(v_code.total_limit, 0) then
    raise exception 'GIFT_CODE_LIMIT_REACHED';
  end if;

  select count(*)::integer
  into v_usage_count
  from public.gift_code_usages gcu
  where gcu.gift_code_id = v_code.id
    and gcu.user_id = p_user_id;

  if v_usage_count >= greatest(coalesce(v_code.max_per_user, 1), 1) then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  end if;

  select exists(
    select 1
    from public.gift_code_usages gcu
    join public.gift_codes gc on gc.id = gcu.gift_code_id
    where gcu.ip_hash = v_ip_hash
      and upper(btrim(coalesce(gc.campaign_key, gc.code))) = v_campaign_key
  )
  into v_ip_used;

  if v_ip_used then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
  end if;

  insert into public.gift_code_usages (
    user_id,
    gift_code_id,
    ip_address,
    ip_hash
  )
  values (
    p_user_id,
    v_code.id,
    nullif(btrim(coalesce(p_ip_address, '')), ''),
    v_ip_hash
  )
  returning id into v_usage_id;

  update public.gift_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = v_code.id;

  v_charge_applied := public.apply_balance_transaction(
    p_user_id,
    coalesce(v_code.reward, 0),
    format('Giftcode: %s', v_code_normalized),
    'giftcode',
    'giftcode_redeem',
    v_usage_id::text,
    jsonb_build_object(
      'gift_code_id', v_code.id,
      'gift_code', v_code_normalized,
      'campaign_key', v_campaign_key,
      'ip_hash', v_ip_hash
    )
  );

  if not v_charge_applied then
    raise exception 'GIFT_CODE_ALREADY_REDEEMED';
  end if;

  return query
  select true, coalesce(v_code.reward, 0), 'SUCCESS'::text;
exception
  when unique_violation then
    if exists (
      select 1
      from public.gift_code_usages gcu
      join public.gift_codes gc on gc.id = gcu.gift_code_id
      where gcu.ip_hash = v_ip_hash
        and upper(btrim(coalesce(gc.campaign_key, gc.code))) = v_campaign_key
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
    end if;
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  when others then
    raise;
end;
$$;


ALTER FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refund_generated_job"("p_generated_image_id" "uuid", "p_reason" "text" DEFAULT 'Refund: Generated job failed'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job public.generated_images%rowtype;
begin
  select *
  into v_job
  from public.generated_images
  where id = p_generated_image_id
  for update;

  if not found then
    raise exception 'Generated job % not found', p_generated_image_id;
  end if;

  if coalesce(v_job.cost_vcoin, 0) <= 0 then
    return false;
  end if;

  return public.apply_balance_transaction(
    v_job.user_id,
    v_job.cost_vcoin,
    p_reason,
    'refund',
    'generated_image_refund',
    p_generated_image_id::text,
    jsonb_build_object(
      'generated_image_id', p_generated_image_id,
      'tool_id', v_job.tool_id,
      'queue_kind', v_job.queue_kind
    )
  );
end;
$$;


ALTER FUNCTION "public"."refund_generated_job"("p_generated_image_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text" DEFAULT 'queue_worker_lock'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_lock_name text := nullif(btrim(coalesce(p_lock_name, '')), '');
  v_released boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  if v_lock_name is null then
    raise exception 'LOCK_NAME_REQUIRED';
  end if;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', null,
      'expiresAt', to_timestamp(0),
      'heartbeatAt', now()
    ),
    updated_at = now()
  where key = v_lock_name
    and coalesce((value ->> 'owner')::text, '') = v_owner
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;


ALTER FUNCTION "public"."release_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_queue_worker_lock"("p_owner" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_released boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', null,
      'expiresAt', to_timestamp(0),
      'heartbeatAt', now()
    ),
    updated_at = now()
  where key = 'queue_worker_lock'
    and coalesce((value ->> 'owner')::text, '') = v_owner
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;


ALTER FUNCTION "public"."release_queue_worker_lock"("p_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."secure_update_balance"("amount" numeric, "reason" "text", "log_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform public.apply_balance_transaction(
    auth.uid(),
    amount,
    reason,
    log_type,
    null,
    null,
    '{}'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."secure_update_balance"("amount" numeric, "reason" "text", "log_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."server_enqueue_generated_job"("p_id" "uuid", "p_user_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") RETURNS TABLE("id" "uuid", "status" "text", "queue_position" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_existing public.generated_images%rowtype;
  v_user_balance numeric := 0;
  v_my_image_processing integer := 0;
  v_my_video_processing integer := 0;
  v_my_queued integer := 0;
  v_system_image_processing integer := 0;
  v_system_video_processing integer := 0;
  v_system_queued integer := 0;
  v_asset_type text := coalesce(nullif(lower(p_asset_type), ''), 'image');
  v_can_dispatch_now boolean := false;
  v_charge_applied boolean := false;
  v_cost integer := greatest(coalesce(p_cost_vcoin, 0), 0);
begin
  if p_id is null then
    raise exception 'JOB_ID_REQUIRED';
  end if;

  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if p_queue_kind is null or btrim(p_queue_kind) = '' then
    raise exception 'QUEUE_KIND_REQUIRED';
  end if;

  if p_queue_payload is null then
    raise exception 'QUEUE_PAYLOAD_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext('generated_queue_global'));
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select *
  into v_existing
  from public.generated_images gi
  where gi.id = p_id
  for update;

  if found then
    if v_existing.user_id <> p_user_id then
      raise exception 'JOB_ID_ALREADY_EXISTS';
    end if;

    return query
    select
      v_existing.id,
      coalesce(v_existing.status, 'queued')::text,
      case when coalesce(v_existing.status, 'queued') = 'queued' then 1 else 0 end::integer;
    return;
  end if;

  select coalesce(u.vcoin_balance, 0)
  into v_user_balance
  from public.users u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_cost > 0 and v_user_balance < v_cost then
    raise exception 'INSUFFICIENT_VCOIN';
  end if;

  select
    count(*) filter (where gi.user_id = p_user_id and gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'image')::integer,
    count(*) filter (where gi.user_id = p_user_id and gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'video')::integer,
    count(*) filter (where gi.user_id = p_user_id and gi.status = 'queued')::integer,
    count(*) filter (where gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'image')::integer,
    count(*) filter (where gi.status = 'processing' and coalesce(gi.asset_type, 'image') = 'video')::integer,
    count(*) filter (where gi.status = 'queued')::integer
  into
    v_my_image_processing,
    v_my_video_processing,
    v_my_queued,
    v_system_image_processing,
    v_system_video_processing,
    v_system_queued
  from public.generated_images gi
  where gi.status in ('queued', 'processing');

  if v_asset_type = 'image' then
    v_can_dispatch_now := v_my_image_processing < 1 and v_system_image_processing < 4;
  else
    v_can_dispatch_now := v_my_video_processing < 1 and v_system_video_processing < 4;
  end if;

  if not v_can_dispatch_now and v_my_queued >= 1 then
    raise exception 'USER_QUEUE_LIMIT_REACHED';
  end if;

  if not v_can_dispatch_now and v_system_queued >= 10 then
    raise exception 'SYSTEM_QUEUE_FULL';
  end if;

  if v_cost > 0 then
    v_charge_applied := public.apply_balance_transaction(
      p_user_id,
      -v_cost,
      coalesce(p_tool_name, p_queue_kind, 'Generated Job'),
      'usage',
      'generated_image_charge',
      p_id::text,
      jsonb_build_object(
        'generated_image_id', p_id,
        'tool_id', p_tool_id,
        'queue_kind', p_queue_kind,
        'asset_type', v_asset_type,
        'cost_vcoin', v_cost
      )
    );

    if not v_charge_applied then
      raise exception 'CHARGE_ALREADY_APPLIED';
    end if;
  end if;

  insert into public.generated_images (
    id, user_id, image_url, prompt, model_used, created_at, is_public, tool_id, tool_name,
    status, progress, cost_vcoin, asset_type, updated_at, queue_kind, queue_payload, provider,
    job_id, lease_token, lease_expires_at, next_poll_at, finished_at, processing_started_at,
    attempt_count, last_error_at, error_message
  ) values (
    p_id, p_user_id, '', coalesce(p_prompt, ''), coalesce(p_engine, p_tool_name, p_queue_kind, 'Queued Job'),
    now(), false, p_tool_id, p_tool_name, 'queued', 0, v_cost, v_asset_type, now(), p_queue_kind,
    coalesce(p_queue_payload, '{}'::jsonb), 'tst', null, null, null, null, null, null, 0, null, null
  );

  return query
  select
    p_id,
    'queued'::text,
    case when v_can_dispatch_now then 0 else v_system_queued + 1 end::integer;
exception
  when others then
    if v_charge_applied and v_cost > 0 then
      perform public.apply_balance_transaction(
        p_user_id,
        v_cost,
        'Refund: enqueue failed',
        'refund',
        'generated_image_refund',
        p_id::text,
        jsonb_build_object(
          'generated_image_id', p_id,
          'tool_id', p_tool_id,
          'queue_kind', p_queue_kind,
          'asset_type', v_asset_type,
          'cost_vcoin', v_cost
        )
      );
    end if;
    raise;
end;
$$;


ALTER FUNCTION "public"."server_enqueue_generated_job"("p_id" "uuid", "p_user_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_payment_transaction_by_id"("p_transaction_id" "uuid", "p_provider_status" "text" DEFAULT 'PAID'::"text", "p_provider_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tx public.payment_transactions%rowtype;
  v_applied boolean := false;
  v_status text := lower(coalesce(p_provider_status, ''));
begin
  select *
  into v_tx
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction % not found', p_transaction_id;
  end if;

  if lower(coalesce(v_tx.status, '')) = 'paid' then
    return jsonb_build_object(
      'success', true,
      'applied', false,
      'transaction_id', v_tx.id,
      'status', v_tx.status
    );
  end if;

  if v_status in ('paid', 'success', 'succeeded') then
    update public.payment_transactions
    set
      status = 'paid',
      provider_status = p_provider_status,
      provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
    where id = v_tx.id;

    v_applied := public.apply_balance_transaction(
      v_tx.user_id,
      v_tx.vcoin_received,
      'Topup: ' || coalesce(v_tx.order_code::text, v_tx.provider_order_code::text, v_tx.id::text),
      'topup',
      'payment_transaction',
      v_tx.id::text,
      jsonb_build_object(
        'transaction_id', v_tx.id,
        'provider_order_code', v_tx.provider_order_code,
        'provider_status', p_provider_status
      )
    );

    return jsonb_build_object(
      'success', true,
      'applied', v_applied,
      'transaction_id', v_tx.id,
      'status', 'paid'
    );
  end if;

  update public.payment_transactions
  set
    status = case
      when v_status in ('cancelled', 'canceled') then 'cancelled'
      when v_status in ('failed', 'expired') then 'failed'
      else status
    end,
    provider_status = p_provider_status,
    provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
    updated_at = now()
  where id = v_tx.id;

  return jsonb_build_object(
    'success', true,
    'applied', false,
    'transaction_id', v_tx.id,
    'status', case
      when v_status in ('cancelled', 'canceled') then 'cancelled'
      when v_status in ('failed', 'expired') then 'failed'
      else v_tx.status
    end
  );
end;
$$;


ALTER FUNCTION "public"."settle_payment_transaction_by_id"("p_transaction_id" "uuid", "p_provider_status" "text", "p_provider_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_payment_transaction_by_order_code"("p_provider_order_code" bigint, "p_provider_status" "text" DEFAULT 'PAID'::"text", "p_provider_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tx_id uuid;
begin
  select id
  into v_tx_id
  from public.payment_transactions
  where coalesce(provider_order_code::text, '') = p_provider_order_code::text
     or coalesce(order_code::text, '') = p_provider_order_code::text
  order by created_at desc
  limit 1;

  if v_tx_id is null then
    raise exception 'Transaction with order code % not found', p_provider_order_code;
  end if;

  update public.payment_transactions
  set provider_order_code = coalesce(provider_order_code, p_provider_order_code),
      updated_at = now()
  where id = v_tx_id;

  return public.settle_payment_transaction_by_id(v_tx_id, p_provider_status, p_provider_payload);
end;
$$;


ALTER FUNCTION "public"."settle_payment_transaction_by_order_code"("p_provider_order_code" bigint, "p_provider_status" "text", "p_provider_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_acquire_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text" DEFAULT 'queue_worker_lock'::"text", "p_lease_seconds" integer DEFAULT 90) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_lock_name text := nullif(btrim(coalesce(p_lock_name, '')), '');
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 90), 15);
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => v_lease_seconds);
  v_acquired boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  if v_lock_name is null then
    raise exception 'LOCK_NAME_REQUIRED';
  end if;

  insert into public.system_settings (key, value)
  values (
    v_lock_name,
    jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    )
  )
  on conflict (key) do nothing;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    ),
    updated_at = v_now
  where key = v_lock_name
    and (
      coalesce((value ->> 'owner')::text, '') = v_owner
      or coalesce((value ->> 'expiresAt')::timestamptz, to_timestamp(0)) <= v_now
    )
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;


ALTER FUNCTION "public"."try_acquire_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text", "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_acquire_queue_worker_lock"("p_owner" "text", "p_lease_seconds" integer DEFAULT 90) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner text := nullif(btrim(coalesce(p_owner, '')), '');
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 90), 15);
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => v_lease_seconds);
  v_acquired boolean := false;
begin
  if v_owner is null then
    raise exception 'LOCK_OWNER_REQUIRED';
  end if;

  insert into public.system_settings (key, value)
  values (
    'queue_worker_lock',
    jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    )
  )
  on conflict (key) do nothing;

  update public.system_settings
  set
    value = jsonb_build_object(
      'owner', v_owner,
      'expiresAt', v_expires_at,
      'heartbeatAt', v_now
    ),
    updated_at = v_now
  where key = 'queue_worker_lock'
    and (
      coalesce((value ->> 'owner')::text, '') = v_owner
      or coalesce((value ->> 'expiresAt')::timestamptz, to_timestamp(0)) <= v_now
    )
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;


ALTER FUNCTION "public"."try_acquire_queue_worker_lock"("p_owner" "text", "p_lease_seconds" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "key_value" "text" NOT NULL,
    "tier" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_keys_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "visit_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "route" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "credits_amount" numeric DEFAULT 0 NOT NULL,
    "price_vnd" numeric DEFAULT 0 NOT NULL,
    "tag" "text",
    "bonus_credits" numeric DEFAULT 0 NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "transfer_syntax" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."credit_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_check_ins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "check_in_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_check_ins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_name" "text",
    "image_url" "text" DEFAULT ''::"text" NOT NULL,
    "prompt" "text" DEFAULT ''::"text" NOT NULL,
    "model_used" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "tool_id" "text",
    "tool_name" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "job_id" "text",
    "progress" integer DEFAULT 100 NOT NULL,
    "error_message" "text",
    "cost_vcoin" integer,
    "asset_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "queue_kind" "text",
    "queue_payload" "jsonb",
    "provider" "text" DEFAULT 'tst'::"text" NOT NULL,
    "processing_started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "next_poll_at" timestamp with time zone,
    "lease_token" "uuid",
    "lease_expires_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error_at" timestamp with time zone,
    CONSTRAINT "generated_images_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['image'::"text", 'video'::"text"]))),
    CONSTRAINT "generated_images_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."generated_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_code_usages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gift_code_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "ip_hash" "text"
);


ALTER TABLE "public"."gift_code_usages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "reward" numeric DEFAULT 0 NOT NULL,
    "total_limit" numeric DEFAULT 100 NOT NULL,
    "used_count" numeric DEFAULT 0 NOT NULL,
    "max_per_user" numeric DEFAULT 1 NOT NULL,
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_key" "text"
);


ALTER TABLE "public"."gift_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."milestone_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day_milestone" numeric NOT NULL,
    "reward_amount" numeric NOT NULL,
    "claim_month" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."milestone_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."model_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "text" NOT NULL,
    "option_id" "text" NOT NULL,
    "tst_price_credits" numeric DEFAULT 0 NOT NULL,
    "audition_price_vcoin" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."model_pricing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "package_id" "uuid",
    "amount_vnd" numeric DEFAULT 0 NOT NULL,
    "vcoin_received" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text" DEFAULT 'payos'::"text" NOT NULL,
    "order_code" "text",
    "provider_order_code" bigint,
    "provider_payment_link_id" "text",
    "checkout_url" "text",
    "provider_status" "text",
    "provider_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "bonus_percent" numeric DEFAULT 0 NOT NULL,
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."style_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "trigger_prompt" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."style_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "display_name" "text",
    "photo_url" "text",
    "vcoin_balance" numeric DEFAULT 0 NOT NULL,
    "last_active" timestamp with time zone,
    "is_vip" boolean DEFAULT false NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vcoin_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "description" "text",
    "type" "text",
    "reference_type" "text",
    "reference_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vcoin_transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_visits"
    ADD CONSTRAINT "app_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_packages"
    ADD CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_check_ins"
    ADD CONSTRAINT "daily_check_ins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_images"
    ADD CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_code_usages"
    ADD CONSTRAINT "gift_code_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_codes"
    ADD CONSTRAINT "gift_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milestone_claims"
    ADD CONSTRAINT "milestone_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_pricing"
    ADD CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."style_presets"
    ADD CONSTRAINT "style_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vcoin_transactions"
    ADD CONSTRAINT "vcoin_transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_app_visits_created_at" ON "public"."app_visits" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_app_visits_user_id" ON "public"."app_visits" USING "btree" ("user_id");



CREATE INDEX "idx_app_visits_visit_date" ON "public"."app_visits" USING "btree" ("visit_date" DESC);



CREATE INDEX "idx_credit_packages_active_order" ON "public"."credit_packages" USING "btree" ("is_active", "display_order");



CREATE INDEX "idx_generated_images_dispatch_queue" ON "public"."generated_images" USING "btree" ("status", "asset_type", "created_at");



CREATE INDEX "idx_generated_images_job_id" ON "public"."generated_images" USING "btree" ("job_id");



CREATE INDEX "idx_generated_images_poll_queue" ON "public"."generated_images" USING "btree" ("status", "next_poll_at");



CREATE INDEX "idx_generated_images_public_created_at" ON "public"."generated_images" USING "btree" ("is_public", "created_at" DESC);



CREATE INDEX "idx_generated_images_queue_lease" ON "public"."generated_images" USING "btree" ("lease_expires_at");



CREATE INDEX "idx_generated_images_status" ON "public"."generated_images" USING "btree" ("status");



CREATE INDEX "idx_generated_images_updated_at" ON "public"."generated_images" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_generated_images_user_created_at" ON "public"."generated_images" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_gift_code_usages_code_created" ON "public"."gift_code_usages" USING "btree" ("gift_code_id", "created_at" DESC);



CREATE INDEX "idx_gift_code_usages_ip_hash_created" ON "public"."gift_code_usages" USING "btree" ("ip_hash", "created_at" DESC) WHERE ("ip_hash" IS NOT NULL);



CREATE INDEX "idx_gift_codes_campaign_key" ON "public"."gift_codes" USING "btree" ("campaign_key");



CREATE INDEX "idx_payment_transactions_user_created_at" ON "public"."payment_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_promotions_active_window" ON "public"."promotions" USING "btree" ("is_active", "start_time", "end_time");



CREATE INDEX "idx_style_presets_active" ON "public"."style_presets" USING "btree" ("is_active", "created_at" DESC);



CREATE INDEX "idx_users_is_admin" ON "public"."users" USING "btree" ("is_admin");



CREATE INDEX "idx_users_last_active" ON "public"."users" USING "btree" ("last_active" DESC);



CREATE INDEX "idx_vcoin_transactions_user_created_at" ON "public"."vcoin_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "uq_api_keys_key_value" ON "public"."api_keys" USING "btree" ("key_value");



CREATE UNIQUE INDEX "uq_daily_checkins_user_date" ON "public"."daily_check_ins" USING "btree" ("user_id", "check_in_date");



CREATE UNIQUE INDEX "uq_gift_code_usages_user_code" ON "public"."gift_code_usages" USING "btree" ("user_id", "gift_code_id");



CREATE UNIQUE INDEX "uq_gift_codes_code" ON "public"."gift_codes" USING "btree" ("upper"("code"));



CREATE UNIQUE INDEX "uq_milestone_claims_user_month_day" ON "public"."milestone_claims" USING "btree" ("user_id", COALESCE("claim_month", ''::"text"), "day_milestone");



CREATE UNIQUE INDEX "uq_model_pricing_model_option" ON "public"."model_pricing" USING "btree" ("model_id", "option_id");



CREATE UNIQUE INDEX "uq_payment_transactions_order_code" ON "public"."payment_transactions" USING "btree" ("order_code") WHERE ("order_code" IS NOT NULL);



CREATE UNIQUE INDEX "uq_payment_transactions_provider_order_code" ON "public"."payment_transactions" USING "btree" ("provider_order_code") WHERE ("provider_order_code" IS NOT NULL);



CREATE UNIQUE INDEX "uq_users_email" ON "public"."users" USING "btree" ("email") WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "uq_vcoin_transactions_reference" ON "public"."vcoin_transactions" USING "btree" ("reference_type", "reference_id") WHERE (("reference_type" IS NOT NULL) AND ("reference_id" IS NOT NULL));



CREATE OR REPLACE TRIGGER "trg_api_keys_touch_updated_at" BEFORE UPDATE ON "public"."api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_credit_packages_touch_updated_at" BEFORE UPDATE ON "public"."credit_packages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_generated_images_fill_user_name" BEFORE INSERT OR UPDATE ON "public"."generated_images" FOR EACH ROW EXECUTE FUNCTION "public"."fill_generated_image_user_name"();



CREATE OR REPLACE TRIGGER "trg_generated_images_touch_updated_at" BEFORE UPDATE ON "public"."generated_images" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_promotions_touch_updated_at" BEFORE UPDATE ON "public"."promotions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_style_presets_touch_updated_at" BEFORE UPDATE ON "public"."style_presets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_system_settings_touch_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_users_guard_profile_update" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_user_profile_update"();



CREATE OR REPLACE TRIGGER "trg_users_touch_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."app_visits"
    ADD CONSTRAINT "app_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_check_ins"
    ADD CONSTRAINT "daily_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_images"
    ADD CONSTRAINT "generated_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gift_code_usages"
    ADD CONSTRAINT "gift_code_usages_gift_code_id_fkey" FOREIGN KEY ("gift_code_id") REFERENCES "public"."gift_codes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gift_code_usages"
    ADD CONSTRAINT "gift_code_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."milestone_claims"
    ADD CONSTRAINT "milestone_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."credit_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vcoin_transactions"
    ADD CONSTRAINT "vcoin_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin full access users" ON "public"."users" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage api keys" ON "public"."api_keys" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage giftcode usages" ON "public"."gift_code_usages" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage giftcodes" ON "public"."gift_codes" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage model pricing" ON "public"."model_pricing" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage packages" ON "public"."credit_packages" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage payment transactions" ON "public"."payment_transactions" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage promotions" ON "public"."promotions" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage settings" ON "public"."system_settings" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage styles" ON "public"."style_presets" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin manage vcoin logs" ON "public"."vcoin_transactions" TO "authenticated" USING ("public"."check_is_admin"()) WITH CHECK ("public"."check_is_admin"());



CREATE POLICY "Admin read checkins" ON "public"."daily_check_ins" FOR SELECT TO "authenticated" USING ("public"."check_is_admin"());



CREATE POLICY "Admin read milestones" ON "public"."milestone_claims" FOR SELECT TO "authenticated" USING ("public"."check_is_admin"());



CREATE POLICY "Admin read visits" ON "public"."app_visits" FOR SELECT TO "authenticated" USING ("public"."check_is_admin"());



CREATE POLICY "Admins read all generated images" ON "public"."generated_images" FOR SELECT TO "authenticated" USING ("public"."check_is_admin"());



CREATE POLICY "Authenticated read model pricing" ON "public"."model_pricing" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public insert visits" ON "public"."app_visits" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Public read generated showcase" ON "public"."generated_images" FOR SELECT TO "authenticated", "anon" USING (("is_public" = true));



CREATE POLICY "Public read giftcodes" ON "public"."gift_codes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read packages" ON "public"."credit_packages" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read promotions" ON "public"."promotions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read settings" ON "public"."system_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read styles" ON "public"."style_presets" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read users" ON "public"."users" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "User insert own checkins" ON "public"."daily_check_ins" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "User insert own logs" ON "public"."vcoin_transactions" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "User insert own milestones" ON "public"."milestone_claims" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "User read own checkins" ON "public"."daily_check_ins" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "User read own giftcode usages" ON "public"."gift_code_usages" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "User read own logs" ON "public"."vcoin_transactions" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "User read own milestones" ON "public"."milestone_claims" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "id") OR "public"."check_is_admin"()));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") OR "public"."check_is_admin"())) WITH CHECK ((("auth"."uid"() = "id") OR "public"."check_is_admin"()));



CREATE POLICY "Users delete own generated images" ON "public"."generated_images" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "Users insert own generated images" ON "public"."generated_images" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "Users insert own payment transactions" ON "public"."payment_transactions" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "Users read own generated images" ON "public"."generated_images" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own payment transactions" ON "public"."payment_transactions" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



CREATE POLICY "Users update own generated images" ON "public"."generated_images" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"())) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."check_is_admin"()));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_check_ins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_code_usages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gift_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."milestone_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_pricing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."style_presets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vcoin_transactions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."generated_images";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."apply_balance_transaction"("p_target_user_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_log_type" "text", "p_reference_type" "text", "p_reference_id" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_balance_transaction"("p_target_user_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_log_type" "text", "p_reference_type" "text", "p_reference_id" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_balance_transaction"("p_target_user_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_log_type" "text", "p_reference_type" "text", "p_reference_id" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_dispatchable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_dispatchable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_dispatchable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_pollable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pollable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pollable_generated_jobs"("p_limit" integer, "p_lease_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_generated_job"("p_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_generated_job"("p_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_generated_job"("p_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."fill_generated_image_user_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."fill_generated_image_user_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fill_generated_image_user_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_generation_queue_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_generation_queue_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_generation_queue_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_user_profile_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_user_profile_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_user_profile_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_giftcode_usage"("code_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_giftcode_usage"("code_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_giftcode_usage"("code_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refund_generated_job"("p_generated_image_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."refund_generated_job"("p_generated_image_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_generated_job"("p_generated_image_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_queue_worker_lock"("p_owner" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_queue_worker_lock"("p_owner" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_queue_worker_lock"("p_owner" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."secure_update_balance"("amount" numeric, "reason" "text", "log_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."secure_update_balance"("amount" numeric, "reason" "text", "log_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."secure_update_balance"("amount" numeric, "reason" "text", "log_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."server_enqueue_generated_job"("p_id" "uuid", "p_user_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."server_enqueue_generated_job"("p_id" "uuid", "p_user_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."server_enqueue_generated_job"("p_id" "uuid", "p_user_id" "uuid", "p_prompt" "text", "p_tool_id" "text", "p_tool_name" "text", "p_engine" "text", "p_asset_type" "text", "p_cost_vcoin" integer, "p_queue_kind" "text", "p_queue_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_payment_transaction_by_id"("p_transaction_id" "uuid", "p_provider_status" "text", "p_provider_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_payment_transaction_by_id"("p_transaction_id" "uuid", "p_provider_status" "text", "p_provider_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_payment_transaction_by_id"("p_transaction_id" "uuid", "p_provider_status" "text", "p_provider_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_payment_transaction_by_order_code"("p_provider_order_code" bigint, "p_provider_status" "text", "p_provider_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_payment_transaction_by_order_code"("p_provider_order_code" bigint, "p_provider_status" "text", "p_provider_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_payment_transaction_by_order_code"("p_provider_order_code" bigint, "p_provider_status" "text", "p_provider_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."try_acquire_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text", "p_lease_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."try_acquire_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text", "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_acquire_named_queue_worker_lock"("p_owner" "text", "p_lock_name" "text", "p_lease_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."try_acquire_queue_worker_lock"("p_owner" "text", "p_lease_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."try_acquire_queue_worker_lock"("p_owner" "text", "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_acquire_queue_worker_lock"("p_owner" "text", "p_lease_seconds" integer) TO "service_role";


















GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."app_visits" TO "anon";
GRANT ALL ON TABLE "public"."app_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."app_visits" TO "service_role";



GRANT ALL ON TABLE "public"."credit_packages" TO "anon";
GRANT ALL ON TABLE "public"."credit_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_packages" TO "service_role";



GRANT ALL ON TABLE "public"."daily_check_ins" TO "anon";
GRANT ALL ON TABLE "public"."daily_check_ins" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_check_ins" TO "service_role";



GRANT ALL ON TABLE "public"."generated_images" TO "anon";
GRANT ALL ON TABLE "public"."generated_images" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_images" TO "service_role";



GRANT ALL ON TABLE "public"."gift_code_usages" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."gift_code_usages" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_code_usages" TO "service_role";



GRANT ALL ON TABLE "public"."gift_codes" TO "anon";
GRANT ALL ON TABLE "public"."gift_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_codes" TO "service_role";



GRANT ALL ON TABLE "public"."milestone_claims" TO "anon";
GRANT ALL ON TABLE "public"."milestone_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."milestone_claims" TO "service_role";



GRANT ALL ON TABLE "public"."model_pricing" TO "anon";
GRANT ALL ON TABLE "public"."model_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."model_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON TABLE "public"."style_presets" TO "anon";
GRANT ALL ON TABLE "public"."style_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."style_presets" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vcoin_transactions" TO "anon";
GRANT ALL ON TABLE "public"."vcoin_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."vcoin_transactions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































