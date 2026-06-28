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
  param($Value)
  if ($null -eq $Value) {
    return $null
  }
  return ([datetime]$Value).ToUniversalTime().ToString("o")
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
        $lastWriteTimeUtc = ConvertTo-IsoUtcString -Value ($_.LastWriteTimeUtc)
        [pscustomobject]@{
          name = $_.Name
          path = $_.FullName
          lastWriteTimeUtc = $lastWriteTimeUtc
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
  $lastWriteTimeUtc = ConvertTo-IsoUtcString -Value ($directory.LastWriteTimeUtc)
  return [pscustomobject]@{
    name = $directory.Name
    path = $directory.FullName
    lastWriteTimeUtc = $lastWriteTimeUtc
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

  $events = @()
  $parseErrors = @()
  $lineNumber = 0
  foreach ($line in [System.IO.File]::ReadLines($latestLog.FullName)) {
    $lineNumber += 1
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    try {
      $events += ($line | ConvertFrom-Json)
    } catch {
      $parseErrors += [pscustomobject]@{
        lineNumber = $lineNumber
        error = $_.Exception.Message
      }
    }
  }

  $terminalEvent = $null
  $eventArray = @($events)
  for ($index = $eventArray.Count - 1; $index -ge 0; $index -= 1) {
    $candidate = $eventArray[$index]
    if ($terminalUpdateEvents -contains [string]$candidate.event) {
      $terminalEvent = $candidate
      break
    }
  }

  $lastWriteTimeUtc = ConvertTo-IsoUtcString -Value ($latestLog.LastWriteTimeUtc)
  $parseErrorArray = @($parseErrors)
  return [pscustomobject]@{
    path = $latestLog.FullName
    exists = $true
    lastWriteTimeUtc = $lastWriteTimeUtc
    eventCount = $eventArray.Count
    terminalEvent = $terminalEvent
    parseErrors = $parseErrorArray
  }
}

function Invoke-CaptureText {
  param([scriptblock]$Script)
  try {
    return ((& $Script 2>&1 | Out-String).Trim())
  } catch {
    return $_.Exception.Message
  }
}

function Get-PathEvidence {
  param(
    [string]$Name,
    [string]$Path
  )
  $exists = Test-Path -LiteralPath $Path
  return [pscustomobject]@{
    name = $Name
    path = $Path
    exists = $exists
    acl = if ($exists) { Invoke-CaptureText { icacls $Path } } else { $null }
  }
}

function Get-PostgresStartEvidence {
  param(
    [string]$InstallRoot,
    [string]$ReleaseRoot
  )

  $serviceName = "bellfield-postgres"
  $logRoot = Join-Path $InstallRoot "data\logs\services\bellfield-postgres"
  $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
  $events = @(
    Get-WinEvent -FilterHashtable @{
      LogName = "System"
      ProviderName = "Service Control Manager"
      Id = @(7000, 7009, 7023, 7031, 7034)
      StartTime = (Get-Date).AddHours(-2)
    } -ErrorAction SilentlyContinue |
      Where-Object { [string]$_.Message -match "BellField|bellfield" } |
      Select-Object -First 20 TimeCreated, Id, LevelDisplayName, Message
  )
  $logs = foreach ($fileName in @("bellfield-postgres.wrapper.log", "bellfield-postgres.err.log", "bellfield-postgres.out.log")) {
    $path = Join-Path $logRoot $fileName
    [pscustomobject]@{
      path = $path
      exists = Test-Path -LiteralPath $path
      tail = if (Test-Path -LiteralPath $path) { (Get-Content -LiteralPath $path -Tail 80 -ErrorAction SilentlyContinue) -join [Environment]::NewLine } else { $null }
    }
  }

  return [pscustomobject]@{
    service = if ($service) {
      [pscustomobject]@{
        name = $service.Name
        state = $service.State
        status = $service.Status
        startName = $service.StartName
        processId = $service.ProcessId
        exitCode = $service.ExitCode
        pathName = $service.PathName
      }
    } else { $null }
    scQc = Invoke-CaptureText { sc.exe qc $serviceName }
    paths = @(
      Get-PathEvidence -Name "serviceExe" -Path (Join-Path (Join-Path $ReleaseRoot "services") "bellfield-postgres.exe")
      Get-PathEvidence -Name "serviceXml" -Path (Join-Path (Join-Path $ReleaseRoot "services") "bellfield-postgres.xml")
      Get-PathEvidence -Name "postgresExe" -Path (Join-Path (Join-Path (Join-Path $ReleaseRoot "postgres") "bin") "postgres.exe")
      Get-PathEvidence -Name "postgresReleaseRoot" -Path (Join-Path $ReleaseRoot "postgres")
      Get-PathEvidence -Name "postgresLogRoot" -Path $logRoot
    )
    scmEvents = @($events)
    logs = @($logs)
  }
}

function Get-PostgresStartEvidenceSafe {
  param(
    [string]$InstallRoot,
    [string]$ReleaseRoot
  )

  # A failure-path collector must be fail-soft: never let evidence gathering
  # abort the whole collection. Degrade to a recorded error instead.
  try {
    return Get-PostgresStartEvidence -InstallRoot $InstallRoot -ReleaseRoot $ReleaseRoot
  } catch {
    return [pscustomobject]@{
      error = $_.Exception.Message
    }
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
  collectedAt = ConvertTo-IsoUtcString -Value (Get-Date)
  installRoot = $InstallRoot
  readOnly = $true
  updateLog = Get-LatestUpdateLog -InstallRoot $InstallRoot
  currentReleaseManifest = Read-JsonFile -Path (Join-Path $releaseRoot "bellfield-build-manifest.json")
  postgresStartEvidence = Get-PostgresStartEvidenceSafe -InstallRoot $InstallRoot -ReleaseRoot $releaseRoot
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
