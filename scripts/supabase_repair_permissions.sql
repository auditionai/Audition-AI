-- Audition AI
-- Repair baseline grants for Supabase roles
-- Run this if a fresh project is missing grants after manual schema creation

begin;

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

grant select on table public.users to anon, authenticated;
grant insert, update on table public.users to authenticated;

grant select on table public.credit_packages to anon, authenticated;
grant select on table public.promotions to anon, authenticated;
grant select on table public.system_settings to anon, authenticated;
grant select on table public.gift_codes to anon, authenticated;
grant select on table public.style_presets to anon, authenticated;
grant insert on table public.app_visits to anon, authenticated;

grant select on table public.generated_images to anon, authenticated;
grant insert, update, delete on table public.generated_images to authenticated;

grant select on table public.vcoin_transactions to authenticated;
grant insert on table public.vcoin_transactions to authenticated;

grant select on table public.payment_transactions to authenticated;
grant insert on table public.payment_transactions to authenticated;

grant select on table public.gift_code_usages to authenticated;
revoke insert, update, delete on table public.gift_code_usages from authenticated;

grant select on table public.daily_check_ins to authenticated;
grant insert on table public.daily_check_ins to authenticated;

grant select on table public.milestone_claims to authenticated;
grant insert on table public.milestone_claims to authenticated;

grant select on table public.model_pricing to authenticated;

grant execute on function public.check_is_admin() to anon, authenticated, service_role;
grant execute on function public.bind_user_browser_key(uuid, text) to service_role;
revoke execute on function public.bind_user_browser_key(uuid, text) from public, anon, authenticated;
grant execute on function public.increment_giftcode_usage(uuid) to authenticated, service_role;
grant execute on function public.redeem_giftcode(uuid, text, text, text, text, text) to service_role;
revoke execute on function public.redeem_giftcode(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_balance_transaction(uuid, numeric, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.secure_update_balance(numeric, text, text) to authenticated, service_role;
grant execute on function public.refund_generated_job(uuid, text) to service_role;
grant execute on function public.settle_payment_transaction_by_id(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.settle_payment_transaction_by_order_code(bigint, text, jsonb) to service_role;
grant execute on function public.enqueue_generated_job(uuid, text, text, text, text, text, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.server_enqueue_generated_job(uuid, uuid, text, text, text, text, text, integer, text, jsonb) to service_role;
grant execute on function public.claim_dispatchable_generated_jobs(integer, integer) to service_role;
grant execute on function public.claim_pollable_generated_jobs(integer, integer) to service_role;
grant execute on function public.get_generation_queue_stats() to authenticated, service_role;
grant execute on function public.try_acquire_queue_worker_lock(text, integer) to service_role;
grant execute on function public.release_queue_worker_lock(text) to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
