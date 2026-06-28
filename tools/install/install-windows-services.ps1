param(
  [string]$ReleaseRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$InstallRoot = "C:\BellField",
  [string]$ServiceManifestRoot = (Join-Path $ReleaseRoot "services"),
  [string]$EnvPath = (Join-Path $InstallRoot "bellfield-server.env"),
  [string]$ServiceLogRoot = (Join-Path $InstallRoot "data\logs\services"),
  [string]$WinSwExe = (Join-Path $ReleaseRoot "tools\winsw\WinSW-x64.exe")
)

$ErrorActionPreference = "Stop"

$redactionHelper = Join-Path $PSScriptRoot "evidence-redaction.ps1"
if (-not (Test-Path -LiteralPath $redactionHelper)) {
  throw "BellField evidence redaction helper not found at $redactionHelper."
}
. $redactionHelper

$aclHelper = Join-Path $PSScriptRoot "windows-service-acl.ps1"
if (-not (Test-Path -LiteralPath $aclHelper)) {
  throw "BellField Windows service ACL helper not found at $aclHelper."
}
. $aclHelper

$postgresServiceId = "bellfield-postgres"
$postgresServiceIdentity = "NT SERVICE\$postgresServiceId"
$postgresServiceStartName = $postgresServiceIdentity
$nodeExe = Join-Path $ReleaseRoot "runtime\node\node.exe"
$runtimeConfigValidator = Join-Path $ReleaseRoot "tools\install\validate-server-runtime-config.mjs"

if (-not (Test-Path -LiteralPath $WinSwExe)) {
  throw "WinSW executable not found at $WinSwExe. Place the approved WinSW x64 binary there before installing services."
}

function Ensure-Directory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Stop-BellFieldServiceIfPresent {
  param([Parameter(Mandatory = $true)][string]$ServiceId)

  $service = Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
  if (-not $service) {
    return
  }

  if ($service.Status -ne "Stopped") {
    Stop-Service -Name $ServiceId -Force -ErrorAction Stop
    $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
  }
}

function Wait-ForServiceRemoval {
  param([Parameter(Mandatory = $true)][string]$ServiceId)

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if (-not (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue)) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Timed out waiting for $ServiceId to be removed."
}

function Uninstall-BellFieldServiceIfPresent {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceId,
    [Parameter(Mandatory = $true)][string]$ServiceExe
  )

  if (-not (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue)) {
    return
  }

  & $ServiceExe uninstall | Out-Null
  if ($LASTEXITCODE -ne 0) {
    & sc.exe delete $ServiceId | Out-Null
    if ($LASTEXITCODE -ne 0 -and (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue)) {
      throw "Failed to uninstall existing $ServiceId."
    }
  }

  Wait-ForServiceRemoval -ServiceId $ServiceId
}

function Set-ServiceSidType {
  param([Parameter(Mandatory = $true)][string]$ServiceId)

  & sc.exe sidtype $ServiceId unrestricted | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to enable service SID for $ServiceId."
  }
}

function Get-ServiceStartName {
  param([Parameter(Mandatory = $true)][string]$ServiceId)

  $service = Get-CimInstance Win32_Service -Filter "Name = '$ServiceId'" -ErrorAction Stop
  if (-not $service) {
    throw "Windows service was not found after install: $ServiceId."
  }

  return [string]$service.StartName
}

function Test-ServiceStartNameMatches {
  param(
    [Parameter(Mandatory = $true)][string]$Actual,
    [Parameter(Mandatory = $true)][string]$Expected
  )

  return [string]::Equals($Actual, $Expected, [System.StringComparison]::OrdinalIgnoreCase)
}

function Set-ServiceStartAccount {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceId,
    [Parameter(Mandatory = $true)][string]$AccountName
  )

  $arguments = @("config", $ServiceId, "obj=", $AccountName)
  & sc.exe @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure $ServiceId to run as $AccountName."
  }

  $actualStartName = Get-ServiceStartName -ServiceId $ServiceId
  if (-not (Test-ServiceStartNameMatches -Actual $actualStartName -Expected $AccountName)) {
    $serviceConfig = ConvertTo-BellFieldRedactedText ((& sc.exe qc $ServiceId 2>&1 | Out-String).Trim())
    throw "Configured $ServiceId to run as $AccountName, but SCM read back StartName '$actualStartName'. sc.exe qc output: $serviceConfig"
  }

  Write-Host "$ServiceId SCM StartName confirmed as $actualStartName."
}

function Get-BellFieldServiceSnapshot {
  param([Parameter(Mandatory = $true)][string[]]$ServiceIds)

  $snapshots = @()
  foreach ($serviceId in $ServiceIds) {
    $service = Get-CimInstance Win32_Service -Filter "Name = '$serviceId'" -ErrorAction SilentlyContinue
    if ($service) {
      $snapshots += [PSCustomObject]@{
        Name = $service.Name
        State = $service.State
        StartMode = $service.StartMode
        StartName = $service.StartName
        ExitCode = $service.ExitCode
        ProcessId = $service.ProcessId
        PathName = $service.PathName
      }
    } else {
      $snapshots += [PSCustomObject]@{
        Name = $serviceId
        State = "Missing"
        StartMode = $null
        StartName = $null
        ExitCode = $null
        ProcessId = $null
        PathName = $null
      }
    }
  }

  return $snapshots
}

function Format-ServiceSnapshot {
  param([Parameter(Mandatory = $true)]$Snapshots)

  return ($Snapshots | Format-Table -AutoSize | Out-String).Trim()
}

function Get-ServiceLogTail {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceId,
    [int]$TailLines = 80
  )

  $serviceLogDirectory = Join-Path $ServiceLogRoot $ServiceId
  if (-not (Test-Path -LiteralPath $serviceLogDirectory)) {
    return "[$ServiceId] log directory not found: $serviceLogDirectory"
  }

  try {
    $files = Get-ChildItem -LiteralPath $serviceLogDirectory -File -Filter "*.log" -ErrorAction Stop |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 4
    if (-not $files) {
      return "[$ServiceId] no .log files found under $serviceLogDirectory"
    }

    $sections = @()
    foreach ($file in $files) {
      $sections += "----- $($file.FullName) -----"
      $sections += ConvertTo-BellFieldRedactedText ((Get-Content -LiteralPath $file.FullName -Tail $TailLines -ErrorAction Stop | Out-String).Trim())
    }
    return ConvertTo-BellFieldRedactedText ($sections -join [Environment]::NewLine)
  } catch {
    return ConvertTo-BellFieldRedactedText "[$ServiceId] failed to read log tail: $($_.Exception.Message)"
  }
}

function Get-InstallFailureContext {
  $snapshots = Get-BellFieldServiceSnapshot -ServiceIds $serviceOrder
  $collector = Join-Path $ReleaseRoot "tools\install\collect-windows-service-evidence.ps1"
  $collectorOutput = Join-Path $InstallRoot "bellfield-service-evidence.json"
  $sections = @(
    "BellField service state:",
    (Format-ServiceSnapshot -Snapshots $snapshots),
    "BellField service log tails:"
  )

  foreach ($serviceId in $serviceOrder) {
    $sections += Get-ServiceLogTail -ServiceId $serviceId
  }

  $sections += @(
    "For full packaged evidence, run from elevated PowerShell:",
    "powershell -ExecutionPolicy Bypass -File `"$collector`" -InstallRoot `"$InstallRoot`" -OutputPath `"$collectorOutput`""
  )

  return ConvertTo-BellFieldRedactedText ($sections -join ([Environment]::NewLine + [Environment]::NewLine))
}

function Invoke-RuntimeConfigValidation {
  if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw "Bundled Node runtime not found at $nodeExe."
  }
  if (-not (Test-Path -LiteralPath $runtimeConfigValidator)) {
    throw "Runtime config validator not found at $runtimeConfigValidator."
  }

  & $nodeExe $runtimeConfigValidator "--release-root=$ReleaseRoot" "--install-root=$InstallRoot" "--env=$EnvPath"
  if ($LASTEXITCODE -ne 0) {
    throw "BellField runtime configuration validation failed. Fix the reported configuration or license problem before starting services."
  }
}

function Start-BellFieldServiceAndConfirm {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceId,
    [int]$TimeoutSeconds = 30
  )

  Start-Service -Name $ServiceId -ErrorAction Stop
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $snapshot = $null

  do {
    Start-Sleep -Seconds 1
    $snapshot = Get-CimInstance Win32_Service -Filter "Name = '$ServiceId'" -ErrorAction Stop
    if ($snapshot.State -eq "Running") {
      Write-Host "$ServiceId state confirmed as Running."
      return
    }
  } while ((Get-Date) -lt $deadline)

  if ($snapshot.State -ne "Running") {
    throw "$ServiceId did not reach Running after Start-Service within $TimeoutSeconds seconds. State=$($snapshot.State), ExitCode=$($snapshot.ExitCode)."
  }
}

function Assert-BellFieldServicesStable {
  param([int]$SettleSeconds = 30)

  $before = Get-BellFieldServiceSnapshot -ServiceIds $serviceOrder
  Start-Sleep -Seconds $SettleSeconds
  $after = Get-BellFieldServiceSnapshot -ServiceIds $serviceOrder
  $beforeByName = @{}
  foreach ($snapshot in $before) {
    $beforeByName[$snapshot.Name] = $snapshot
  }

  $notRunning = @($after | Where-Object { $_.State -ne "Running" })
  $unstable = @()
  foreach ($snapshot in $after) {
    $previous = $beforeByName[$snapshot.Name]
    $beforePid = if ($previous) { [int]$previous.ProcessId } else { 0 }
    $afterPid = [int]$snapshot.ProcessId
    if ($snapshot.State -ne "Running") {
      continue
    }
    if ($afterPid -le 0) {
      $unstable += "$($snapshot.Name) has no running process id after settle."
      continue
    }
    if (-not $previous -or $previous.State -ne "Running" -or $beforePid -le 0) {
      $unstable += "$($snapshot.Name) was not Running with a process id before settle."
      continue
    }
    if ($beforePid -ne $afterPid) {
      $unstable += "$($snapshot.Name) restarted during settle window. BeforePid=$beforePid AfterPid=$afterPid."
    }
  }

  if ($notRunning.Count -gt 0) {
    throw "BellField services did not remain Running after $SettleSeconds seconds.`nBefore:`n$(Format-ServiceSnapshot -Snapshots $before)`nAfter:`n$(Format-ServiceSnapshot -Snapshots $after)"
  }
  if ($unstable.Count -gt 0) {
    throw "BellField services did not keep stable process ids after $SettleSeconds seconds: $($unstable -join ' ')`nBefore:`n$(Format-ServiceSnapshot -Snapshots $before)`nAfter:`n$(Format-ServiceSnapshot -Snapshots $after)"
  }
}

function Read-ServerEnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Test-Path -LiteralPath $EnvPath)) {
    return $null
  }

  foreach ($line in Get-Content -LiteralPath $EnvPath) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=(.*)$") {
      return $matches[1].Trim()
    }
  }

  return $null
}

function Wait-BellFieldApiHealth {
  param([int]$TimeoutSeconds = 60)

  $apiPort = Read-ServerEnvValue -Name "BELLFIELD_API_PORT"
  if (-not $apiPort) {
    $apiPort = "3001"
  }
  $url = "http://127.0.0.1:$apiPort/health"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $url -TimeoutSec 5 -ErrorAction Stop
      if ($response.status -eq "ok") {
        Write-Host "BellField API health reached ok at $url."
        return
      }
      $lastError = "API status '$($response.status)'"
    } catch {
      $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 1
  }

  throw "BellField API health did not reach ok at $url within $TimeoutSeconds seconds. Last error: $lastError"
}

$serviceOrder = @(
  "bellfield-postgres",
  "bellfield-api",
  "bellfield-worker",
  "bellfield-office-web"
)
$serviceStopOrder = @(
  "bellfield-office-web",
  "bellfield-worker",
  "bellfield-api",
  "bellfield-postgres"
)

foreach ($serviceId in $serviceOrder) {
  $xmlPath = Join-Path $ServiceManifestRoot "$serviceId.xml"
  if (-not (Test-Path -LiteralPath $xmlPath)) {
    throw "Service manifest missing: $xmlPath"
  }

  $serviceExe = Join-Path $ServiceManifestRoot "$serviceId.exe"
  Copy-Item -LiteralPath $WinSwExe -Destination $serviceExe -Force
}

foreach ($serviceId in $serviceStopOrder) {
  Stop-BellFieldServiceIfPresent -ServiceId $serviceId
}

foreach ($serviceId in $serviceStopOrder) {
  $serviceExe = Join-Path $ServiceManifestRoot "$serviceId.exe"
  Uninstall-BellFieldServiceIfPresent -ServiceId $serviceId -ServiceExe $serviceExe
}

Ensure-Directory -Path $ServiceLogRoot
foreach ($serviceId in $serviceOrder) {
  Ensure-Directory -Path (Join-Path $ServiceLogRoot $serviceId)
}

foreach ($serviceId in $serviceOrder) {
  $serviceExe = Join-Path $ServiceManifestRoot "$serviceId.exe"
  & $serviceExe install
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install $serviceId."
  }
}

Set-ServiceStartAccount -ServiceId $postgresServiceId -AccountName $postgresServiceStartName
Set-ServiceSidType -ServiceId $postgresServiceId

Set-BellFieldWindowsServiceAcls `
  -ReleaseRoot $ReleaseRoot `
  -InstallRoot $InstallRoot `
  -ServiceManifestRoot $ServiceManifestRoot `
  -EnvPath $EnvPath `
  -ServiceLogRoot $ServiceLogRoot `
  -PostgresServiceId $postgresServiceId

Invoke-RuntimeConfigValidation

try {
  foreach ($serviceId in $serviceOrder) {
    Start-BellFieldServiceAndConfirm -ServiceId $serviceId
  }

  Assert-BellFieldServicesStable -SettleSeconds 30
  Wait-BellFieldApiHealth -TimeoutSeconds 60
} catch {
  Write-Host (Get-InstallFailureContext)
  throw
}

Write-Host "BellField services installed, started, stable, and healthy."
