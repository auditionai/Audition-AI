param(
  [Parameter(Mandatory = $true)]
  [string]$RemoteDbUrl,

  [string]$LocalDbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres",

  [string]$DumpDir = "supabase\cloud-sync",

  [switch]$SkipDump,

  [switch]$SkipRestore
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command '$Name'. $InstallHint"
  }
}

function Test-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  $resolvedPath = $null

  if ($command -and $command.Source) {
    $resolvedPath = $command.Source
  } elseif ($command -and $command.Path) {
    $resolvedPath = $command.Path
  }

  # On Windows, prefer the .cmd shim for npx instead of npx.ps1 because
  # the PowerShell wrapper can re-parse arguments incorrectly when invoked
  # from another script launched with -File.
  if ($resolvedPath -and $Name -eq "npx" -and $resolvedPath.ToLower().EndsWith(".ps1")) {
    $cmdShim = [System.IO.Path]::ChangeExtension($resolvedPath, ".cmd")
    if (Test-Path $cmdShim) {
      return $cmdShim
    }
  }

  if ($resolvedPath) {
    return $resolvedPath
  }

  return $Name
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

function Remove-CopyBlockFromSqlFile {
  param(
    [string]$FilePath,
    [string]$SchemaName,
    [string]$TableName
  )

  if (-not (Test-Path $FilePath)) {
    return
  }

  $lines = Get-Content $FilePath
  $pattern = '^COPY "' + [regex]::Escape($SchemaName) + '"\."' + [regex]::Escape($TableName) + '" '
  $result = New-Object System.Collections.Generic.List[string]
  $skip = $false

  foreach ($line in $lines) {
    if (-not $skip -and $line -match $pattern) {
      $skip = $true
      continue
    }

    if ($skip) {
      if ($line -eq '\.') {
        $skip = $false
      }
      continue
    }

    $result.Add($line)
  }

  Set-Content -Path $FilePath -Value $result
}

function Get-SupabaseDbContainerName {
  $names = & $script:dockerCommand ps --format "{{.Names}}"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect Docker containers."
  }

  $dbContainer = $names | Where-Object { $_ -match '^supabase_db_' } | Select-Object -First 1
  if (-not $dbContainer) {
    throw "Could not find a running local Supabase DB container. Make sure 'npx supabase start' is still running."
  }

  return $dbContainer
}

function Restore-IntoLocalSupabaseViaDocker {
  param(
    [string]$ContainerName,
    [string]$RolesPath,
    [string]$SchemaPath,
    [string]$DataPath
  )

  Write-Step "Copying SQL dump files into Docker container $ContainerName"
  Invoke-Checked -FilePath $script:dockerCommand -Arguments @("cp", $RolesPath, "${ContainerName}:/tmp/roles.sql") -FailureMessage "Failed to copy roles.sql into Docker container."
  Invoke-Checked -FilePath $script:dockerCommand -Arguments @("cp", $SchemaPath, "${ContainerName}:/tmp/schema.sql") -FailureMessage "Failed to copy schema.sql into Docker container."
  Invoke-Checked -FilePath $script:dockerCommand -Arguments @("cp", $DataPath, "${ContainerName}:/tmp/data.sql") -FailureMessage "Failed to copy data.sql into Docker container."

  Write-Step "Restoring dump into local Supabase Postgres via Docker"
  Invoke-Checked -FilePath $script:dockerCommand -Arguments @(
    "exec",
    "-u", "postgres",
    $ContainerName,
    "psql",
    "--single-transaction",
    "--variable", "ON_ERROR_STOP=1",
    "--dbname", "postgres",
    "--file", "/tmp/roles.sql",
    "--file", "/tmp/schema.sql",
    "--command", "SET session_replication_role = replica",
    "--file", "/tmp/data.sql"
  ) -FailureMessage "Failed to restore dump into local Supabase via Docker."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resolvedDumpDir = Join-Path $repoRoot $DumpDir
$rolesPath = Join-Path $resolvedDumpDir "roles.sql"
$schemaPath = Join-Path $resolvedDumpDir "schema.sql"
$dataPath = Join-Path $resolvedDumpDir "data.sql"

Write-Step "Checking required tools"
Assert-Command -Name "npx" -InstallHint "Install Node.js and npm first."
$hasLocalPsql = Test-Command -Name "psql"
$hasDocker = Test-Command -Name "docker"
if (-not $hasLocalPsql -and -not $hasDocker) {
  throw "Missing both 'psql' and 'docker'. Install PostgreSQL client tools or ensure Docker Desktop is available."
}

$npxCommand = Resolve-CommandPath -Name "npx"
$dockerCommand = if ($hasDocker) { Resolve-CommandPath -Name "docker" } else { $null }
$psqlCommand = if ($hasLocalPsql) { Resolve-CommandPath -Name "psql" } else { $null }
$script:dockerCommand = $dockerCommand

Write-Step "Using repository root: $repoRoot"
Write-Host "Remote DB URL: [provided]" -ForegroundColor DarkGray
Write-Host "Local DB URL : $LocalDbUrl" -ForegroundColor DarkGray
Write-Host "Dump folder   : $resolvedDumpDir" -ForegroundColor DarkGray

if (-not (Test-Path $resolvedDumpDir)) {
  New-Item -ItemType Directory -Path $resolvedDumpDir | Out-Null
}

if (-not $SkipDump) {
  Write-Step "Dumping roles from Supabase cloud"
  Invoke-Checked -FilePath $npxCommand -Arguments @(
    "--yes",
    "supabase@latest", "db", "dump",
    "--db-url", $RemoteDbUrl,
    "--file", $rolesPath,
    "--role-only"
  ) -FailureMessage "Failed to dump roles.sql from remote Supabase."

  Write-Step "Dumping schema from Supabase cloud"
  Invoke-Checked -FilePath $npxCommand -Arguments @(
    "--yes",
    "supabase@latest", "db", "dump",
    "--db-url", $RemoteDbUrl,
    "--file", $schemaPath
  ) -FailureMessage "Failed to dump schema.sql from remote Supabase."

  Write-Step "Dumping data from Supabase cloud"
  Invoke-Checked -FilePath $npxCommand -Arguments @(
    "--yes",
    "supabase@latest", "db", "dump",
    "--db-url", $RemoteDbUrl,
    "--file", $dataPath,
    "--use-copy",
    "--data-only"
  ) -FailureMessage "Failed to dump data.sql from remote Supabase."

  Write-Step "Sanitizing known incompatible storage tables from data dump"
  Remove-CopyBlockFromSqlFile -FilePath $dataPath -SchemaName "storage" -TableName "buckets_vectors"
  Remove-CopyBlockFromSqlFile -FilePath $dataPath -SchemaName "storage" -TableName "vector_indexes"
}

if ($SkipRestore) {
  Write-Step "Skipping restore as requested"
  Write-Host "Dump files are ready in $resolvedDumpDir" -ForegroundColor Yellow
  exit 0
}

foreach ($requiredFile in @($rolesPath, $schemaPath, $dataPath)) {
  if (-not (Test-Path $requiredFile)) {
    throw "Missing dump file: $requiredFile"
  }
}

if ($hasLocalPsql) {
  Write-Step "Restoring dump into local Supabase Postgres"
  Invoke-Checked -FilePath $psqlCommand -Arguments @(
    "--single-transaction",
    "--variable", "ON_ERROR_STOP=1",
    "--file", $rolesPath,
    "--file", $schemaPath,
    "--command", "SET session_replication_role = replica",
    "--file", $dataPath,
    "--dbname", $LocalDbUrl
  ) -FailureMessage "Failed to restore dump into local Supabase."
} else {
  $dbContainerName = Get-SupabaseDbContainerName
  Restore-IntoLocalSupabaseViaDocker -ContainerName $dbContainerName -RolesPath $rolesPath -SchemaPath $schemaPath -DataPath $dataPath
}

Write-Step "Done"
Write-Host "Cloud data has been restored into local Supabase." -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. Run 'npx supabase status' to copy the local anon/service_role keys." -ForegroundColor Green
Write-Host "2. Update .env.local using .env.local.local-supabase.example." -ForegroundColor Green
Write-Host "3. Restart your dev servers." -ForegroundColor Green
