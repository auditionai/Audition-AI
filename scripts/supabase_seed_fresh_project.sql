-- Audition AI
-- Seed defaults for a fresh Supabase project
-- Run this AFTER scripts/supabase_bootstrap_fresh_project.sql

begin;

-- ---------------------------------------------------------------------------
-- Default settings
-- ---------------------------------------------------------------------------

insert into public.system_settings (key, value)
values
  ('maintenance_mode', jsonb_build_object('isActive', false, 'message', 'Hệ thống đang bảo trì, vui lòng quay lại sau.')),
  ('tutorial_video', jsonb_build_object('url', 'https://www.youtube.com/watch?v=ba2WR8txe_c', 'isActive', true)),
  ('giftcode_promo', jsonb_build_object('text', 'Nhập CODE "HELLO2026" để nhận 20 Vcoin miễn phí !!!', 'isActive', true)),
  ('tst_server_availability', jsonb_build_object('disabledByModel', jsonb_build_object(), 'updatedAt', now()))
on conflict (key) do update
set
  value = excluded.value,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Top-up packages
-- ---------------------------------------------------------------------------

insert into public.credit_packages (
  name,
  credits_amount,
  price_vnd,
  tag,
  bonus_credits,
  is_featured,
  is_active,
  display_order,
  transfer_syntax
)
select
  seed.name,
  seed.credits_amount,
  seed.price_vnd,
  seed.tag,
  seed.bonus_credits,
  seed.is_featured,
  seed.is_active,
  seed.display_order,
  seed.transfer_syntax
from (
  values
    ('Gói 50K', 50::numeric, 50000::numeric, 'Khởi đầu', 0::numeric, false, true, 0, 'NAP 50K'),
    ('Gói 100K', 100::numeric, 100000::numeric, 'Phổ biến', 5::numeric, false, true, 1, 'NAP 100K'),
    ('Gói 200K', 200::numeric, 200000::numeric, 'HOT', 15::numeric, true, true, 2, 'NAP 200K'),
    ('Gói 500K', 500::numeric, 500000::numeric, 'Tiết kiệm', 50::numeric, false, true, 3, 'NAP 500K')
) as seed(name, credits_amount, price_vnd, tag, bonus_credits, is_featured, is_active, display_order, transfer_syntax)
where not exists (
  select 1
  from public.credit_packages cp
  where cp.name = seed.name
);

-- ---------------------------------------------------------------------------
-- Style presets (optional starter data)
-- ---------------------------------------------------------------------------

insert into public.style_presets (
  name,
  image_url,
  trigger_prompt,
  is_active,
  is_default
)
select
  seed.name,
  seed.image_url,
  seed.trigger_prompt,
  seed.is_active,
  seed.is_default
from (
  values
    (
      'Audition 3D',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
      '3d render, stylized character, clean lighting, high detail',
      true,
      true
    ),
    (
      'Cinematic Portrait',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
      'cinematic portrait, soft rim light, rich skin detail, premium composition',
      true,
      false
    )
) as seed(name, image_url, trigger_prompt, is_active, is_default)
where not exists (
  select 1
  from public.style_presets sp
  where sp.name = seed.name
);

-- ---------------------------------------------------------------------------
-- API key placeholders
-- Replace key_value with real values later in Admin UI or SQL.
-- Keep them inactive until you paste the real key / service account JSON.
-- ---------------------------------------------------------------------------

insert into public.api_keys (name, key_value, tier, status)
select *
from (
  values
    ('[VERTEX] Placeholder 1', 'REPLACE_WITH_VERTEX_SERVICE_ACCOUNT_JSON_1', 'flash', 'inactive'),
    ('[VERTEX] Placeholder 2', 'REPLACE_WITH_VERTEX_SERVICE_ACCOUNT_JSON_2', 'flash', 'inactive'),
    ('[VERTEX] Placeholder 3', 'REPLACE_WITH_VERTEX_SERVICE_ACCOUNT_JSON_3', 'pro', 'inactive'),
    ('[VERTEX] Placeholder 4', 'REPLACE_WITH_VERTEX_SERVICE_ACCOUNT_JSON_4', 'pro', 'inactive')
) as seed(name, key_value, tier, status)
where not exists (
  select 1
  from public.api_keys ak
  where ak.key_value = seed.key_value
);

commit;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
