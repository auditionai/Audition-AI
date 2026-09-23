$ErrorActionPreference = 'Stop'
$source = Get-Content (Join-Path $PSScriptRoot '..\backup-old-public-schema.sql') -Raw
$outPath = Join-Path $PSScriptRoot '..\supabase\migrations\20260924093000_restore_missing_remote_functions.sql'

function Get-FunctionBlock([string]$name) {
  $pattern = '(?ms)^CREATE OR REPLACE FUNCTION "public"\."' + [regex]::Escape($name) + '"\(.*?^ALTER FUNCTION "public"\."' + [regex]::Escape($name) + '".*?;\r?\n'
  $match = [regex]::Match($source, $pattern)
  if (!$match.Success) { throw "Function not found: $name" }
  return $match.Value
}

$functions = @(
  'claim_cloudflare_generated_job_by_id',
  'repair_stale_generated_queue_jobs',
  'redeem_giftcode',
  'revoke_giftcode_abuse_duplicates',
  'revoke_giftcode_usage'
)
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('-- Restore function signatures and bodies captured from the source project.')
$lines.Add('BEGIN;')
$lines.Add('DROP FUNCTION IF EXISTS public.redeem_giftcode(uuid, text, text, text);')
$lines.Add('DROP FUNCTION IF EXISTS public.redeem_giftcode(uuid, text, text, text, text);')
foreach ($name in $functions) { $lines.Add((Get-FunctionBlock $name)) }
$lines.Add('REVOKE ALL ON FUNCTION public.claim_cloudflare_generated_job_by_id(uuid, integer) FROM PUBLIC;')
$lines.Add('GRANT ALL ON FUNCTION public.claim_cloudflare_generated_job_by_id(uuid, integer) TO service_role;')
$lines.Add('GRANT ALL ON FUNCTION public.repair_stale_generated_queue_jobs(integer, integer, integer, integer) TO anon, authenticated, service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.redeem_giftcode(uuid, text, text, text, text, text) FROM PUBLIC;')
$lines.Add('GRANT ALL ON FUNCTION public.redeem_giftcode(uuid, text, text, text, text, text) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.revoke_giftcode_abuse_duplicates(text, boolean) FROM PUBLIC;')
$lines.Add('GRANT ALL ON FUNCTION public.revoke_giftcode_abuse_duplicates(text, boolean) TO service_role;')
$lines.Add('REVOKE ALL ON FUNCTION public.revoke_giftcode_usage(uuid, text) FROM PUBLIC;')
$lines.Add('GRANT ALL ON FUNCTION public.revoke_giftcode_usage(uuid, text) TO service_role;')
$lines.Add('COMMIT;')
[IO.File]::WriteAllText($outPath, ($lines -join "`r`n"), [Text.UTF8Encoding]::new($false))
Write-Output "Generated $outPath"
