$ErrorActionPreference = 'Stop'

$old = Get-Content (Join-Path $PSScriptRoot '..\backup-old-public-schema.sql') -Raw
$outPath = Join-Path $PSScriptRoot '..\restore-old-schema-delta.sql'

function Get-FunctionBlock([string]$name) {
  $pattern = '(?ms)^CREATE OR REPLACE FUNCTION "public"\."' + [regex]::Escape($name) + '"\(.*?^ALTER FUNCTION "public"\."' + [regex]::Escape($name) + '".*?;\r?\n'
  $match = [regex]::Match($old, $pattern)
  if (!$match.Success) { throw "Function not found in old schema: $name" }
  return $match.Value
}

function Get-PolicyBlock([string]$name) {
  $pattern = '(?ms)^CREATE POLICY "' + [regex]::Escape($name) + '" .*?;\r?\n'
  $match = [regex]::Match($old, $pattern)
  if (!$match.Success) { throw "Policy not found in old schema: $name" }
  return $match.Value
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('-- Generated from the old project schema dump. Do not run against the old project.')
$lines.Add('BEGIN;')

$lines.Add('ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS campaign_key text;')
$lines.Add('ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS email_fingerprint text;')
$lines.Add('ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS browser_key_hash text;')
$lines.Add('ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS user_agent_hash text;')
$lines.Add("ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0;")
$lines.Add("ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}'::text[];")
$lines.Add("ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS reward_status text NOT NULL DEFAULT 'granted';")
$lines.Add("ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS abuse_status text NOT NULL DEFAULT 'ok';")
$lines.Add('ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS revoked_at timestamptz;')
$lines.Add('ALTER TABLE public.gift_code_usages ADD COLUMN IF NOT EXISTS revocation_reason text;')

$lines.Add("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';")
$lines.Add('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_warning text;')
$lines.Add('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_warning_at timestamptz;')
$lines.Add('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_at timestamptz;')
$lines.Add('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lock_reason text;')

$lines.Add(@'
CREATE TABLE IF NOT EXISTS public.generated_images_size_log (
  checked_at timestamptz DEFAULT now() NOT NULL,
  database_bytes bigint NOT NULL,
  generated_images_bytes bigint NOT NULL,
  total_rows bigint NOT NULL,
  active_rows bigint NOT NULL,
  expired_rows bigint NOT NULL,
  uncompacted_terminal_rows bigint NOT NULL,
  CONSTRAINT generated_images_size_log_pkey PRIMARY KEY (checked_at)
);
CREATE TABLE IF NOT EXISTS public.user_browser_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  browser_key_hash text NOT NULL,
  user_id uuid NOT NULL,
  account_index integer NOT NULL,
  is_checkin_allowed boolean DEFAULT true NOT NULL,
  first_seen_at timestamptz DEFAULT now() NOT NULL,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT user_browser_keys_pkey PRIMARY KEY (id),
  CONSTRAINT user_browser_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
ALTER TABLE public.generated_images_size_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_browser_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_browser_keys_hash_index ON public.user_browser_keys (browser_key_hash, account_index);
CREATE INDEX IF NOT EXISTS idx_user_browser_keys_user_id ON public.user_browser_keys (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_browser_keys_hash_user ON public.user_browser_keys (browser_key_hash, user_id);
GRANT ALL ON TABLE public.generated_images_size_log TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_browser_keys TO anon, authenticated, service_role;
'@)

$functions = @(
  'audit_queue_resource_hardening',
  'bind_user_browser_key',
  'capture_generated_images_size',
  'cleanup_generated_images_14d',
  'compact_generated_image_terminal_payload_on_write',
  'lock_user_account',
  'revoke_giftcode_abuse_duplicates',
  'revoke_giftcode_usage',
  'unlock_user_account',
  'warn_user_account'
)
foreach ($name in $functions) { $lines.Add((Get-FunctionBlock $name)) }

$lines.Add('REVOKE ALL ON FUNCTION public.audit_queue_resource_hardening() FROM PUBLIC; GRANT ALL ON FUNCTION public.audit_queue_resource_hardening() TO anon, authenticated, service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.bind_user_browser_key(uuid, text) FROM PUBLIC; GRANT ALL ON FUNCTION public.bind_user_browser_key(uuid, text) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.capture_generated_images_size() FROM PUBLIC; GRANT ALL ON FUNCTION public.capture_generated_images_size() TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.cleanup_generated_images_14d(integer) FROM PUBLIC; GRANT ALL ON FUNCTION public.cleanup_generated_images_14d(integer) TO service_role;')
$lines.Add('GRANT ALL ON FUNCTION public.compact_generated_image_terminal_payload_on_write() TO anon, authenticated, service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.lock_user_account(uuid, text) FROM PUBLIC; GRANT ALL ON FUNCTION public.lock_user_account(uuid, text) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.revoke_giftcode_abuse_duplicates(text, boolean) FROM PUBLIC; GRANT ALL ON FUNCTION public.revoke_giftcode_abuse_duplicates(text, boolean) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.revoke_giftcode_usage(uuid, text) FROM PUBLIC; GRANT ALL ON FUNCTION public.revoke_giftcode_usage(uuid, text) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.unlock_user_account(uuid) FROM PUBLIC; GRANT ALL ON FUNCTION public.unlock_user_account(uuid) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.warn_user_account(uuid, text) FROM PUBLIC; GRANT ALL ON FUNCTION public.warn_user_account(uuid, text) TO service_role;')

$policies = @(
  'Admins delete giftcode usages','Admins delete giftcodes','Admins delete model pricing','Admins delete packages','Admins delete payment transactions','Admins delete promotions','Admins delete settings','Admins delete styles','Admins delete users','Admins delete vcoin logs',
  'Admins insert giftcode usages','Admins insert giftcodes','Admins insert model pricing','Admins insert packages','Admins insert promotions','Admins insert settings','Admins insert styles',
  'Admins read all generated images','Admins update giftcode usages','Admins update giftcodes','Admins update model pricing','Admins update packages','Admins update payment transactions','Admins update promotions','Admins update settings','Admins update styles','Admins update vcoin logs',
  'Anon read public generated images','Authenticated read generated images',
  'Admin manage topup giftcode usages','Users read own topup giftcode usages'
)
foreach ($name in $policies) {
  $block = Get-PolicyBlock $name
  $table = [regex]::Match($block, 'ON "public"\."([^"]+)"').Groups[1].Value
  $lines.Add(('DROP POLICY IF EXISTS "' + $name + '" ON public."' + $table + '";'))
  $lines.Add($block)
}

$lines.Add('DROP TRIGGER IF EXISTS trg_00_compact_generated_image_terminal_payload ON public.generated_images;')
$lines.Add('CREATE TRIGGER trg_00_compact_generated_image_terminal_payload BEFORE INSERT OR UPDATE OF status, queue_payload ON public.generated_images FOR EACH ROW EXECUTE FUNCTION public.compact_generated_image_terminal_payload_on_write();')
$lines.Add('COMMIT;')

[System.IO.File]::WriteAllText($outPath, ($lines -join "`r`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $outPath"
