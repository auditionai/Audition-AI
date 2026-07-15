begin;

-- Keep user-facing history queries bounded to the recent window and make those
-- filters index-friendly. These indexes support gallery, VCoin history,
-- payment history, and check-in status reads without scanning old rows first.
create index if not exists idx_generated_images_user_created_recent
  on public.generated_images (user_id, created_at desc);

create index if not exists idx_vcoin_transactions_user_created_recent
  on public.vcoin_transactions (user_id, created_at desc);

create index if not exists idx_vcoin_transactions_user_reference_created
  on public.vcoin_transactions (user_id, reference_type, created_at desc);

create index if not exists idx_payment_transactions_user_created_recent
  on public.payment_transactions (user_id, created_at desc);

create index if not exists idx_daily_check_ins_user_date_recent
  on public.daily_check_ins (user_id, check_in_date desc);

notify pgrst, 'reload schema';

commit;
