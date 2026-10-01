begin;

-- Keep cancellation, refund, and deletion atomic for paid Dance AI orders.
create or replace function public.cancel_dance_video_order(
  p_user_id uuid,
  p_job_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.dance_video_jobs%rowtype;
  v_refund_amount numeric := 0;
  v_refund_applied boolean := false;
begin
  select * into v_order
  from public.dance_video_jobs
  where id = p_job_id and user_id = p_user_id
  for update;

  if not found then raise exception 'DANCE_ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'DANCE_ORDER_CANCELLATION_UNAVAILABLE'; end if;

  -- The ledger is authoritative, including legacy orders whose history row was
  -- removed through the old delete path before this migration.
  select -amount into v_refund_amount
  from public.vcoin_transactions
  where user_id = p_user_id
    and reference_type = 'generated_image_charge'
    and reference_id = p_job_id::text
  for update;

  if not found or v_refund_amount <= 0 then raise exception 'DANCE_ORDER_CHARGE_NOT_FOUND'; end if;

  v_refund_applied := public.apply_balance_transaction(
    p_user_id, v_refund_amount,
    'Refund: cancelled pending Dance AI video order',
    'refund', 'dance_video_order_refund', p_job_id::text,
    jsonb_build_object('dance_video_job_id', p_job_id, 'template_id', v_order.template_id, 'order_status', v_order.status)
  );
  if not v_refund_applied then raise exception 'DANCE_ORDER_ALREADY_REFUNDED'; end if;

  delete from public.generated_images where id = p_job_id;
  delete from public.dance_video_jobs where id = p_job_id;
  return v_refund_amount;
end;
$$;

revoke all on function public.cancel_dance_video_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_dance_video_order(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
