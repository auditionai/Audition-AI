$ErrorActionPreference = 'Stop'
$source = Get-Content (Join-Path $PSScriptRoot '..\backup-old-auth-data.sql') -Raw
$outPath = Join-Path $PSScriptRoot '..\restore-auth-users-identities.sql'

$blocks = foreach ($name in @('users', 'identities')) {
  $pattern = '(?ms)^INSERT INTO "auth"\."' + $name + '" .*?;\r?\n'
  $match = [regex]::Match($source, $pattern)
  if (!$match.Success) { throw "Auth data block not found: $name" }
  $match.Value
}

$sql = @(
  '-- Extracted from the old project. Sessions and refresh tokens are intentionally excluded.'
  'BEGIN;'
  'SET LOCAL session_replication_role = replica;'
  $blocks
  'COMMIT;'
) -join "`r`n"
[System.IO.File]::WriteAllText($outPath, $sql, [System.Text.UTF8Encoding]::new($false))
Write-Output "Generated $outPath"
