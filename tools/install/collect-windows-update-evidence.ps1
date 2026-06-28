param(
  [string]$InstallRoot = "C:\BellField",
  [string]$OutputPath,
  [string]$HealthUrl
)

$ErrorActionPreference = "Stop"
$serviceNames = @(
  "bellfield-postgres",
  "bellfield-api",
  "bellfield-worker",
  "bellfield-office-web"
)
$terminalUpdateEvents = @(
  "BELLFIELD_UPDATE_RESULT",
  "BELLFIELD_UPDATE_FAILURE",
  "BELLFIELD_UPDATE_LOCKED",
  "BELLFIELD_UPDATE_REJECTED",
  "BELLFIELD_UPDATE_FATAL"
)

function ConvertTo-IsoUtcString {
  param([datetime]$Value)
  return $Value.ToUniversalTime().ToString("o")
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{
      path = $Path
      error = $_.Exception.Message
    }
  }
}

function Read-ServerEnvValue {
  param(
    [string]$Path,
    [string]$Name
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*#") {
      continue
    }
    if ($line -match "^\s*$([regex]::Escape($Name))=(.*)$") {
      return $Matches[1].Trim()
    }
  }
  return $null
}

function Get-DirectorySummaries {
  param(
    [string]$Path,
    [string]$Filter
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }
  return @(
    Get-ChildItem -LiteralPath $Path -Directory -Filter $Filter -ErrorAction SilentlyContinue |
      Sort-Object Name |
      ForEach-Object {
        [pscustomobject]@{
          name = $_.Name
          path = $_.FullName
          lastWriteTimeUtc = ConvertTo-IsoUtcString $_.LastWriteTimeUtc
        }
      }
  )
}

function Get-LatestDirectorySummary {
  param(
    [string]$Path,
    [string]$Filter
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $directory = Get-ChildItem -LiteralPath $Path -Directory -Filter $Filter -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $directory) {
    return $null
  }
  return [pscustomobject]@{
    name = $directory.Name
    path = $directory.FullName
    lastWriteTimeUtc = ConvertTo-IsoUtcString $directory.LastWriteTimeUtc
  }
}

function Get-LatestUpdateLog {
  param([string]$InstallRoot)
  $logRoot = Join-Path $InstallRoot "data\logs\update"
  if (-not (Test-Path -LiteralPath $logRoot)) {
    return [pscustomobject]@{
      path = $null
      exists = $false
      eventCount = 0
      terminalEvent = $null
      error = "Update log directory was not found."
    }
  }

  $latestLog = Get-ChildItem -LiteralPath $logRoot -File -Filter "update-*.jsonl" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $latestLog) {
    return [pscustomobject]@{
      path = $null
      exists = $false
      eventCount = 0
      terminalEvent = $null
      error = "No durable update JSONL log was found."
    }
  }

  $events = New-Object System.Collections.Generic.List[object]
  $parseErrors = New-Object System.Collections.Generic.List[object]
  $lineNumber = 0
  foreach ($line in [System.IO.File]::ReadLines($latestLog.FullName)) {
    $lineNumber += 1
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    try {
      $events.Add(($line | ConvertFrom-Json))
    } catch {
      $parseErrors.Add([pscustomobject]@{
        lineNumber = $lineNumber
        error = $_.Exception.Message
      })
    }
  }

  $terminalEvent = $null
  for ($index = $events.Count - 1; $index -ge 0; $index -= 1) {
    $candidate = $events[$index]
    if ($terminalUpdateEvents -contains [string]$candidate.event) {
      $terminalEvent = $candidate
      break
    }
  }

  return [pscustomobject]@{
    path = $latestLog.FullName
    exists = $true
    lastWriteTimeUtc = ConvertTo-IsoUtcString $latestLog.LastWriteTimeUtc
    eventCount = $events.Count
    terminalEvent = $terminalEvent
    parseErrors = @($parseErrors)
  }
}

function Get-ServiceStates {
  $states = @()
  foreach ($serviceName in $serviceNames) {
    try {
      $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction Stop
      if ($service) {
        $states += [pscustomobject]@{
          name = $service.Name
          state = $service.State
          status = $service.Status
          startMode = $service.StartMode
          startName = $service.StartName
          processId = $service.ProcessId
        }
      } else {
        $states += [pscustomobject]@{
          name = $serviceName
          state = "missing"
          status = "missing"
          error = "Service was not found."
        }
      }
    } catch {
      $states += [pscustomobject]@{
        name = $serviceName
        state = "unknown"
        status = "unknown"
        error = $_.Exception.Message
      }
    }
  }
  return @($states)
}

function Invoke-HealthProbe {
  param([string]$Url)
  try {
    $response = Invoke-RestMethod -Uri $Url -TimeoutSec 5
    return [pscustomobject]@{
      url = $Url
      ok = $true
      response = $response
    }
  } catch {
    return [pscustomobject]@{
      url = $Url
      ok = $false
      error = $_.Exception.Message
    }
  }
}

$resolvedInstallRoot = (Resolve-Path -LiteralPath $InstallRoot -ErrorAction SilentlyContinue)
if ($resolvedInstallRoot) {
  $InstallRoot = $resolvedInstallRoot.Path
}

$releaseRoot = Join-Path $InstallRoot "release"
$envPath = Join-Path $InstallRoot "bellfield-server.env"
$apiPort = Read-ServerEnvValue -Path $envPath -Name "BELLFIELD_API_PORT"
if (-not $apiPort) {
  $apiPort = Read-ServerEnvValue -Path $envPath -Name "PORT"
}
if (-not $apiPort) {
  $apiPort = "3001"
}
if (-not $HealthUrl) {
  $HealthUrl = "http://127.0.0.1:$apiPort/health"
}

$evidence = [pscustomobject]@{
  collectedAt = ConvertTo-IsoUtcString (Get-Date)
  installRoot = $InstallRoot
  readOnly = $true
  updateLog = Get-LatestUpdateLog -InstallRoot $InstallRoot
  currentReleaseManifest = Read-JsonFile -Path (Join-Path $releaseRoot "bellfield-build-manifest.json")
  releaseState = [pscustomobject]@{
    releaseRoot = $releaseRoot
    releaseRootExists = Test-Path -LiteralPath $releaseRoot
    stagedReleaseDirs = Get-DirectorySummaries -Path $InstallRoot -Filter "release.restore-stage-*"
    rollbackReleaseDirs = Get-DirectorySummaries -Path $InstallRoot -Filter "release.restore-rollback-*"
  }
  backups = [pscustomobject]@{
    backupRoot = Join-Path $InstallRoot "data\backups"
    latestBackupDirectory = Get-LatestDirectorySummary -Path (Join-Path $InstallRoot "data\backups") -Filter "bellfield-backup-*"
  }
  services = Get-ServiceStates
  health = Invoke-HealthProbe -Url $HealthUrl
}

$json = $evidence | ConvertTo-Json -Depth 12
if ($OutputPath) {
  $outputDirectory = Split-Path -Parent $OutputPath
  if ($outputDirectory) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  }
  Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
}

$json
