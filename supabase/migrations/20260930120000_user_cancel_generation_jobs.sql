begin;

alter table public.dance_video_jobs drop constraint if exists dance_video_jobs_status_check;
alter table public.dance_video_jobs add constraint dance_video_jobs_status_check
  check (status in ('pending', 'accepted', 'processing', 'completed', 'cancelled'));

create or replace function public.cancel_user_generated_job(
  p_user_id uuid,
  p_generated_image_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generated_images%rowtype;
  v_dance_status text;
  v_is_dance_order boolean := false;
  v_refund_eligible boolean := false;
  v_refunded boolean := false;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.generated_images
  where id = p_generated_image_id and user_id = p_user_id
  for update;

  if not found then raise exception 'GENERATION_JOB_NOT_FOUND'; end if;
  if v_job.status not in ('queued', 'processing') then raise exception 'GENERATION_JOB_NOT_CANCELLABLE'; end if;

  select status into v_dance_status
  from public.dance_video_jobs
  where id = p_generated_image_id and user_id = p_user_id
  for update;
  v_is_dance_order := found;

  -- A Dance AI order remains queued in generated_images while staff accepts it,
  -- so its own order status decides whether it is still refundable.
  v_refund_eligible := v_job.status = 'queued' and (not v_is_dance_order or v_dance_status = 'pending');

  update public.generated_images
  set status = 'failed',
      error_message = 'Cancelled by user.',
      queue_payload = coalesce(queue_payload, '{}'::jsonb) || jsonb_build_object(
        '__manuallyStopped', true,
        '__cancelledByUser', true,
        '__cancelledAt', v_now,
        '__stage', 'failed'
      ),
      progress = 0,
      finished_at = v_now,
      next_poll_at = null,
      lease_token = null,
      lease_expires_at = null,
      last_error_at = v_now,
      updated_at = v_now
  where id = p_generated_image_id;

  if v_is_dance_order then
    update public.dance_video_jobs
    set status = 'cancelled', updated_at = v_now
    where id = p_generated_image_id;
  end if;

  if v_refund_eligible and coalesce(v_job.cost_vcoin, 0) > 0 then
    v_refunded := public.refund_generated_job(
      p_generated_image_id,
      'Refund: user cancelled queued generation job'
    );
  end if;

  update public.generated_images
  set error_message = case
    when v_refunded then 'Cancelled by user. VCoin refunded.'
    when v_refund_eligible then 'Cancelled by user. No VCoin charge applied.'
    else 'Cancelled by user. No VCoin refund after processing.'
  end,
  updated_at = now()
  where id = p_generated_image_id;

  return jsonb_build_object(
    'refunded', v_refunded,
    'refund_eligible', v_refund_eligible,
    'provider_job_id', v_job.job_id,
    'was_processing', v_job.status = 'processing'
  );
end;
$$;

revoke all on function public.cancel_user_generated_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_user_generated_job(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
