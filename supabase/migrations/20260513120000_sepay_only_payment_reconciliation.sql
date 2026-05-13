alter table public.payment_transactions
  alter column payment_method set default 'sepay';

update public.system_settings
set value = jsonb_build_object(
  'gateway', 'sepay',
  'updatedAt', now()
)
where key = 'payment_gateway';

insert into public.system_settings (key, value)
values (
  'payment_gateway',
  jsonb_build_object('gateway', 'sepay', 'updatedAt', now())
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
