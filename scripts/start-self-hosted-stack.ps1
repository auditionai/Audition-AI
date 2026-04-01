param(
  [string]$RepoRoot = "c:\Users\cuong\OneDrive\Documents\GitHub\Audition-AI",
  [string]$DockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe",
  [int]$DockerWaitSeconds = 180
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$timestamp] $Message"
}

function Ensure-DockerDesktopStarted {
  if (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue) {
    Write-Step "Docker Desktop is already running."
    return
  }

  if (-not (Test-Path -LiteralPath $DockerDesktopPath)) {
    throw "Docker Desktop not found at '$DockerDesktopPath'. Update the path in scripts/start-self-hosted-stack.ps1."
  }

  Write-Step "Starting Docker Desktop..."
  Start-Process -FilePath $DockerDesktopPath | Out-Null
}

function Wait-ForDocker {
  $deadline = (Get-Date).AddSeconds($DockerWaitSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      docker info | Out-Null
      Write-Step "Docker engine is ready."
      return
    } catch {
      Start-Sleep -Seconds 5
    }
  }

  throw "Docker did not become ready within $DockerWaitSeconds seconds."
}

function Ensure-CloudflaredService {
  $service = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
  if (-not $service) {
    Write-Step "Cloudflared service not found. Skip service check."
    return
  }

  if ($service.Status -ne "Running") {
    Write-Step "Starting Cloudflared service..."
    Start-Service -Name "Cloudflared"
    $service.WaitForStatus("Running", "00:00:20")
  }

  Write-Step "Cloudflared service is running."
}

Write-Step "Bootstrapping self-hosted stack..."

Ensure-DockerDesktopStarted
Wait-ForDocker

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  throw "Repo root not found at '$RepoRoot'."
}

Push-Location $RepoRoot
try {
  Write-Step "Running 'npx supabase start'..."
  npx supabase start
  if ($LASTEXITCODE -ne 0) {
    throw "'npx supabase start' failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Ensure-CloudflaredService

Write-Step "Self-hosted stack startup completed."
