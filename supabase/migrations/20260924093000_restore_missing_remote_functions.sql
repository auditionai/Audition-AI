-- Restore function signatures and bodies captured from the source project.
BEGIN;
DROP FUNCTION IF EXISTS public.redeem_giftcode(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.redeem_giftcode(uuid, text, text, text, text);
CREATE OR REPLACE FUNCTION "public"."claim_cloudflare_generated_job_by_id"("p_job_id" "uuid", "p_lease_seconds" integer DEFAULT 900) RETURNS TABLE("id" "uuid", "user_id" "uuid", "asset_type" "text", "queue_kind" "text", "queue_payload" "jsonb", "prompt" "text", "tool_id" "text", "tool_name" "text", "model_used" "text", "cost_vcoin" integer, "provider" "text", "job_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job public.generated_images%rowtype;
  v_provider text;
  v_media_type text;
  v_system_limit integer;
  v_active integer;
  v_user_active integer;
begin
  select * into v_job
  from public.generated_images gi
  where gi.id = p_job_id and gi.status = 'queued'
    and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and (gi.lease_expires_at is null or gi.lease_expires_at < now())
  for update skip locked;
  if not found then return; end if;

  v_provider := lower(coalesce(nullif(v_job.provider, ''), v_job.queue_payload ->> '__targetProvider', 'tst'));
  v_media_type := coalesce(v_job.asset_type, 'image');
  if v_provider not in ('gpti2', 'tst') then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_provider || ':' || v_media_type, 0));
  v_system_limit := case when v_provider = 'gpti2' and v_media_type = 'image' then 20 else 4 end;

  select count(*) into v_active from public.generated_images gi
  where gi.status = 'processing'
    and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) = v_provider
    and coalesce(gi.asset_type, 'image') = v_media_type;
  select count(*) into v_user_active from public.generated_images gi
  where gi.status = 'processing' and gi.user_id = v_job.user_id
    and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
    and lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')) = v_provider
    and coalesce(gi.asset_type, 'image') = v_media_type;
  if v_active >= v_system_limit or v_user_active >= 3 then return; end if;

  return query
  update public.generated_images gi
  set status = 'processing', progress = greatest(coalesce(gi.progress, 0), 10),
      processing_started_at = coalesce(gi.processing_started_at, now()),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 900), 60)),
      updated_at = now(), error_message = null
  where gi.id = v_job.id
  returning gi.id, gi.user_id, coalesce(gi.asset_type, 'image'), gi.queue_kind, gi.queue_payload,
    gi.prompt, gi.tool_id, gi.tool_name, gi.model_used, gi.cost_vcoin,
    lower(coalesce(nullif(gi.provider, ''), gi.queue_payload ->> '__targetProvider', 'tst')), gi.job_id;
end; $$;


ALTER FUNCTION "public"."claim_cloudflare_generated_job_by_id"("p_job_id" "uuid", "p_lease_seconds" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."repair_stale_generated_queue_jobs"("p_pre_dispatch_grace_seconds" integer DEFAULT 15, "p_max_recoveries" integer DEFAULT 8, "p_max_pre_dispatch_age_minutes" integer DEFAULT 30, "p_overdue_poll_grace_seconds" integer DEFAULT 120) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  v_requeued integer := 0;
  v_failed integer := 0;
  v_nudged integer := 0;
  v_refund_id uuid;
begin
  with candidates as (
    select gi.id, gi.queue_payload,
      coalesce((gi.queue_payload ->> '__watchdogRecoveries')::integer, 0) as recoveries
    from public.generated_images gi
    where gi.status = 'processing' and gi.job_id is null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and (gi.lease_expires_at is null
        or gi.lease_expires_at < v_now - make_interval(secs => greatest(coalesce(p_pre_dispatch_grace_seconds, 15), 0))
        or (coalesce(gi.queue_payload ->> '__stage', '') in ('preparing', 'uploading_refs', 'synthesizing_prompt', 'building_payload') and gi.updated_at < v_now - interval '90 seconds'))
      and coalesce((gi.queue_payload ->> '__tstTouched')::boolean, false) is false
      and coalesce((gi.queue_payload ->> '__dispatchConfirmationPending')::boolean, false) is false
      and coalesce(gi.queue_payload ->> '__stage', '') <> 'dispatching'
      and coalesce((gi.queue_payload ->> '__watchdogRecoveries')::integer, 0) < greatest(coalesce(p_max_recoveries, 8), 1)
      and coalesce(gi.processing_started_at, gi.created_at, v_now) > v_now - make_interval(mins => greatest(coalesce(p_max_pre_dispatch_age_minutes, 30), 1))
    limit 100
  ), updated as (
    update public.generated_images gi set status = 'queued', job_id = null, image_url = null,
      finished_at = null, processing_started_at = null, error_message = null,
      queue_payload = coalesce(gi.queue_payload, '{}'::jsonb) || jsonb_build_object('__stage', 'queued', '__watchdogRecoveries', candidates.recoveries + 1),
      lease_token = null, lease_expires_at = null, next_poll_at = v_now, last_error_at = v_now, updated_at = v_now
    from candidates where gi.id = candidates.id returning gi.id
  ) select count(*)::integer into v_requeued from updated;

  for v_refund_id in
    with candidates as (
      select gi.id from public.generated_images gi
      where gi.status = 'processing' and gi.job_id is null
        and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
        and (coalesce((gi.queue_payload ->> '__tstTouched')::boolean, false) is true
          or coalesce((gi.queue_payload ->> '__dispatchConfirmationPending')::boolean, false) is true
          or coalesce(gi.queue_payload ->> '__stage', '') = 'dispatching'
          or coalesce((gi.queue_payload ->> '__watchdogRecoveries')::integer, 0) >= greatest(coalesce(p_max_recoveries, 8), 1)
          or coalesce(gi.processing_started_at, gi.created_at, v_now) <= v_now - make_interval(mins => greatest(coalesce(p_max_pre_dispatch_age_minutes, 30), 1)))
        and not (lower(coalesce(gi.queue_payload ->> '__targetProvider', gi.provider, '')) = 'gpti2'
          and coalesce(gi.queue_payload ->> '__gpti2SynchronousDispatchStartedAt', '') <> ''
          and gi.updated_at > v_now - interval '20 minutes')
      limit 100
    ), updated as (
      update public.generated_images gi set status = 'failed',
        error_message = 'DB invariant: stale pre-dispatch job failed/refunded to prevent duplicate provider dispatch.',
        queue_payload = coalesce(gi.queue_payload, '{}'::jsonb) || jsonb_build_object('__stage', 'failed'),
        progress = 0, finished_at = v_now, lease_token = null, lease_expires_at = null,
        next_poll_at = null, last_error_at = v_now, updated_at = v_now
      from candidates where gi.id = candidates.id returning gi.id
    ) select id from updated
  loop
    perform public.refund_generated_job(v_refund_id, 'Refund: DB queue invariant failed stale pre-dispatch job');
    v_failed := v_failed + 1;
  end loop;

  with candidates as (
    select gi.id from public.generated_images gi
    where gi.status = 'processing' and gi.job_id is not null
      and coalesce(gi.queue_kind, '') in ('image_generate', 'video_generate', 'motion_generate')
      and gi.next_poll_at is not null
      and gi.next_poll_at < v_now - make_interval(secs => greatest(coalesce(p_overdue_poll_grace_seconds, 120), 0))
    limit 100
  ), updated as (
    update public.generated_images gi set lease_token = null, lease_expires_at = null, next_poll_at = v_now, updated_at = v_now
    from candidates where gi.id = candidates.id returning gi.id
  ) select count(*)::integer into v_nudged from updated;

  return jsonb_build_object('requeuedPreDispatch', v_requeued, 'failedPreDispatch', v_failed, 'nudgedPolls', v_nudged);
end;
$$;


ALTER FUNCTION "public"."repair_stale_generated_queue_jobs"("p_pre_dispatch_grace_seconds" integer, "p_max_recoveries" integer, "p_max_pre_dispatch_age_minutes" integer, "p_overdue_poll_grace_seconds" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text" DEFAULT NULL::"text", "p_user_agent_hash" "text" DEFAULT NULL::"text", "p_browser_key_hash" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "reward" numeric, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_code public.gift_codes%rowtype;
  v_campaign_key text;
  v_usage_count integer := 0;
  v_ip_used boolean := false;
  v_usage_id uuid;
  v_code_normalized text := upper(btrim(coalesce(p_code, '')));
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_user_email text;
  v_email_domain text;
  v_email_local text;
  v_email_root text;
  v_email_fingerprint text;
  v_email_used boolean := false;
  v_user_agent_hash text := nullif(btrim(coalesce(p_user_agent_hash, '')), '');
  v_browser_key_hash text := nullif(btrim(coalesce(p_browser_key_hash, '')), '');
  v_browser_used boolean := false;
  v_user_created_at timestamptz;
  v_email_confirmed_at timestamptz;
  v_account_age_minutes integer := null;
  v_recent_user_agent_count integer := 0;
  v_risk_score integer := 0;
  v_risk_flags text[] := '{}'::text[];
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

  if exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and coalesce(u.account_status, 'active') = 'locked'
  ) then
    raise exception 'ACCOUNT_LOCKED';
  end if;

  select
    lower(btrim(coalesce(u.email, ''))),
    u.created_at,
    au.email_confirmed_at
  into
    v_user_email,
    v_user_created_at,
    v_email_confirmed_at
  from public.users u
  left join auth.users au on au.id = u.id
  where u.id = p_user_id;

  if position('@' in coalesce(v_user_email, '')) > 1 then
    v_email_domain := split_part(v_user_email, '@', 2);
    v_email_local := split_part(split_part(v_user_email, '@', 1), '+', 1);

    if v_email_domain in ('gmail.com', 'googlemail.com') then
      v_email_domain := 'gmail.com';
      v_email_local := replace(v_email_local, '.', '');
    end if;

    v_email_root := regexp_replace(v_email_local, '[0-9]+$', '');
    if length(v_email_root) < 6 then
      v_email_root := v_email_local;
    end if;

    if coalesce(v_email_domain, '') <> '' and coalesce(v_email_root, '') <> '' then
      v_email_fingerprint := v_email_domain || ':' || v_email_root;
    end if;
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

  if v_user_created_at is not null then
    v_account_age_minutes := floor(extract(epoch from (now() - v_user_created_at)) / 60)::integer;
    if v_account_age_minutes < 10 then
      v_risk_score := v_risk_score + 45;
      v_risk_flags := array_append(v_risk_flags, 'new_account');
    elsif v_account_age_minutes < 1440 then
      v_risk_score := v_risk_score + 15;
      v_risk_flags := array_append(v_risk_flags, 'young_account');
    end if;
  else
    v_risk_score := v_risk_score + 30;
    v_risk_flags := array_append(v_risk_flags, 'missing_account_age');
  end if;

  if v_email_confirmed_at is null then
    v_risk_score := v_risk_score + 15;
    v_risk_flags := array_append(v_risk_flags, 'email_unverified');
  end if;

  if v_user_agent_hash is not null then
    select count(*)::integer
    into v_recent_user_agent_count
    from public.gift_code_usages gcu
    where gcu.campaign_key = v_campaign_key
      and gcu.user_agent_hash = v_user_agent_hash
      and gcu.abuse_status = 'ok'
      and gcu.created_at >= now() - interval '24 hours';

    if v_recent_user_agent_count >= 5 then
      v_risk_score := v_risk_score + 45;
      v_risk_flags := array_append(v_risk_flags, 'user_agent_campaign_burst');
    elsif v_recent_user_agent_count >= 2 then
      v_risk_score := v_risk_score + 20;
      v_risk_flags := array_append(v_risk_flags, 'user_agent_reuse');
    end if;
  else
    v_risk_score := v_risk_score + 10;
    v_risk_flags := array_append(v_risk_flags, 'missing_user_agent');
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'GIFT_CODE_EXPIRED';
  end if;

  if coalesce(v_code.used_count, 0) >= coalesce(v_code.total_limit, 0) then
    raise exception 'GIFT_CODE_LIMIT_REACHED';
  end if;

  select count(*)::integer
  into v_usage_count
  from public.gift_code_usages gcu
  where gcu.campaign_key = v_campaign_key
    and gcu.user_id = p_user_id;

  if v_usage_count >= 1 then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  end if;

  if v_email_fingerprint is not null then
    select exists(
      select 1
      from public.gift_code_usages gcu
      where gcu.email_fingerprint = v_email_fingerprint
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    )
    into v_email_used;

    if v_email_used then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_EMAIL_CLUSTER';
    end if;
  end if;

  if v_browser_key_hash is not null then
    select exists(
      select 1
      from public.gift_code_usages gcu
      where gcu.browser_key_hash = v_browser_key_hash
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    )
    into v_browser_used;

    if v_browser_used then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_BROWSER';
    end if;
  end if;

  select exists(
    select 1
    from public.gift_code_usages gcu
    where gcu.ip_hash = v_ip_hash
      and gcu.campaign_key = v_campaign_key
      and gcu.abuse_status = 'ok'
  )
  into v_ip_used;

  if v_ip_used then
    raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
  end if;

  insert into public.gift_code_usages (
    user_id,
    gift_code_id,
    campaign_key,
    email_fingerprint,
    browser_key_hash,
    user_agent_hash,
    risk_score,
    risk_flags,
    reward_status,
    ip_address,
    ip_hash,
    abuse_status
  )
  values (
    p_user_id,
    v_code.id,
    v_campaign_key,
    v_email_fingerprint,
    v_browser_key_hash,
    v_user_agent_hash,
    v_risk_score,
    v_risk_flags,
    'granted',
    nullif(btrim(coalesce(p_ip_address, '')), ''),
    v_ip_hash,
    'ok'
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
      'email_fingerprint', v_email_fingerprint,
      'browser_key_hash', v_browser_key_hash,
      'ip_hash', v_ip_hash,
      'risk_score', v_risk_score,
      'risk_flags', v_risk_flags
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
      where gcu.email_fingerprint = v_email_fingerprint
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_EMAIL_CLUSTER';
    end if;
    if exists (
      select 1
      from public.gift_code_usages gcu
      where gcu.browser_key_hash = v_browser_key_hash
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_BROWSER';
    end if;
    if exists (
      select 1
      from public.gift_code_usages gcu
      where gcu.ip_hash = v_ip_hash
        and gcu.campaign_key = v_campaign_key
        and gcu.abuse_status = 'ok'
    ) then
      raise exception 'GIFT_CODE_ALREADY_USED_BY_IP';
    end if;
    raise exception 'GIFT_CODE_ALREADY_USED_BY_USER';
  when others then
    raise;
end;
$_$;


ALTER FUNCTION "public"."redeem_giftcode"("p_user_id" "uuid", "p_code" "text", "p_ip_hash" "text", "p_ip_address" "text", "p_user_agent_hash" "text", "p_browser_key_hash" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."revoke_giftcode_abuse_duplicates"("p_campaign_key" "text" DEFAULT NULL::"text", "p_dry_run" boolean DEFAULT true) RETURNS TABLE("usage_id" "uuid", "user_id" "uuid", "email" "text", "campaign_key" "text", "gift_code" "text", "reward" numeric, "abuse_status" "text", "action" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_campaign_key text := nullif(upper(btrim(coalesce(p_campaign_key, ''))), '');
  v_row record;
  v_reference_id text;
begin
  for v_row in
    select
      gcu.id as usage_id,
      gcu.user_id,
      u.email,
      gcu.campaign_key,
      gc.code as gift_code,
      coalesce(gc.reward, 0) as reward,
      gcu.abuse_status
    from public.gift_code_usages gcu
    join public.gift_codes gc on gc.id = gcu.gift_code_id
    left join public.users u on u.id = gcu.user_id
    where gcu.abuse_status <> 'ok'
      and (v_campaign_key is null or gcu.campaign_key = v_campaign_key)
    order by gcu.campaign_key, gcu.created_at
  loop
    v_reference_id := v_row.usage_id::text;

    if not p_dry_run and v_row.reward > 0 then
      perform public.apply_balance_transaction(
        v_row.user_id,
        -v_row.reward,
        format('Thu há»“i giftcode láº¡m dá»¥ng: %s', v_row.gift_code),
        'giftcode_abuse_reversal',
        'giftcode_abuse_reversal',
        v_reference_id,
        jsonb_build_object(
          'gift_code', v_row.gift_code,
          'campaign_key', v_row.campaign_key,
          'usage_id', v_row.usage_id,
          'abuse_status', v_row.abuse_status
        )
      );
    end if;

    usage_id := v_row.usage_id;
    user_id := v_row.user_id;
    email := v_row.email;
    campaign_key := v_row.campaign_key;
    gift_code := v_row.gift_code;
    reward := v_row.reward;
    abuse_status := v_row.abuse_status;
    action := case when p_dry_run then 'dry_run' else 'reversed' end;
    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."revoke_giftcode_abuse_duplicates"("p_campaign_key" "text", "p_dry_run" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."revoke_giftcode_usage"("p_usage_id" "uuid", "p_reason" "text" DEFAULT 'Revoked giftcode abuse'::"text") RETURNS TABLE("usage_id" "uuid", "user_id" "uuid", "gift_code" "text", "reward" numeric, "action" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_usage public.gift_code_usages%rowtype;
  v_code public.gift_codes%rowtype;
begin
  select *
  into v_usage
  from public.gift_code_usages
  where id = p_usage_id
  for update;

  if not found then
    raise exception 'GIFT_CODE_USAGE_NOT_FOUND';
  end if;

  if v_usage.reward_status = 'revoked' then
    raise exception 'GIFT_CODE_USAGE_ALREADY_REVOKED';
  end if;

  select *
  into v_code
  from public.gift_codes
  where id = v_usage.gift_code_id;

  if not found then
    raise exception 'GIFT_CODE_INVALID';
  end if;

  perform public.apply_balance_transaction(
    v_usage.user_id,
    -coalesce(v_code.reward, 0),
    format('Thu há»“i giftcode: %s', v_code.code),
    'giftcode_abuse_reversal',
    'giftcode_abuse_reversal',
    v_usage.id::text,
    jsonb_build_object(
      'gift_code', v_code.code,
      'campaign_key', v_usage.campaign_key,
      'usage_id', v_usage.id,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  update public.gift_code_usages
  set
    reward_status = 'revoked',
    abuse_status = 'revoked_abuse',
    revoked_at = now(),
    revocation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_usage.id;

  return query
  select v_usage.id, v_usage.user_id, v_code.code, coalesce(v_code.reward, 0), 'revoked'::text;
end;
$$;


ALTER FUNCTION "public"."revoke_giftcode_usage"("p_usage_id" "uuid", "p_reason" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.claim_cloudflare_generated_job_by_id(uuid, integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_cloudflare_generated_job_by_id(uuid, integer) TO service_role;
GRANT ALL ON FUNCTION public.repair_stale_generated_queue_jobs(integer, integer, integer, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.redeem_giftcode(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_giftcode(uuid, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_giftcode_abuse_duplicates(text, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_giftcode_abuse_duplicates(text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_giftcode_usage(uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_giftcode_usage(uuid, text) TO service_role;
COMMIT;