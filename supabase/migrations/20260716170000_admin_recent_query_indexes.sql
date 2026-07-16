begin;

-- Admin screens read recent windows and small pages. These indexes prevent
-- those requests from walking old operational and ledger rows first.
create index if not exists idx_vcoin_transactions_recent_usage
  on public.vcoin_transactions (created_at desc)
  include (user_id, amount, type, reference_type)
  where type = 'usage' or amount < 0;

create index if not exists idx_payment_transactions_created_recent
  on public.payment_transactions (created_at desc);

create index if not exists idx_payment_transactions_sepay_reconcile_recent
  on public.payment_transactions (created_at desc)
  where status in ('pending', 'cancelled', 'failed')
    and (
      payment_method = 'sepay'
      or provider_payment_link_id like 'sepay:%'
    );

create index if not exists idx_app_visits_created_recent
  on public.app_visits (created_at desc);

create index if not exists idx_users_created_recent
  on public.users (created_at desc);

notify pgrst, 'reload schema';

commit;
