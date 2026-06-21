param(
  [string]$ReleaseRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$InstallRoot = "C:\BellField",
  [string]$ServiceManifestRoot = (Join-Path $ReleaseRoot "services"),
  [string]$EnvPath = (Join-Path $InstallRoot "bellfield-server.env"),
  [string]$ServiceLogRoot = (Join-Path $InstallRoot "data\logs\services"),
  [string]$WinSwExe = (Join-Path $ReleaseRoot "tools\winsw\WinSW-x64.exe")
)

$ErrorActionPreference = "Stop"

$adminSid = "*S-1-5-32-544"
$systemSid = "*S-1-5-18"
$postgresServiceId = "bellfield-postgres"
$postgresServiceIdentity = "NT SERVICE\$postgresServiceId"
$postgresDataRoot = Join-Path $InstallRoot "data\postgres"
$postgresReleaseRoot = Join-Path $ReleaseRoot "postgres"

if (-not (Test-Path -LiteralPath $WinSwExe)) {
  throw "WinSW executable not found at $WinSwExe. Place the approved WinSW x64 binary there before installing services."
}

function Invoke-Icacls {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  & icacls @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

function Protect-BellFieldPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Container,
    [string[]]$ExtraGrants = @()
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Warning "Skipping ACL hardening for missing path: $Path"
    return
  }

  $rights = if ($Container) { "(OI)(CI)F" } else { "F" }

  $arguments = @(
    $Path,
    "/inheritance:r",
    "/grant:r",
    "${adminSid}:$rights",
    "${systemSid}:$rights"
  )

  foreach ($grant in $ExtraGrants) {
    $arguments += "/grant"
    $arguments += $grant
  }

  Invoke-Icacls -Arguments $arguments -FailureMessage "Failed to harden ACLs for $Path."
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

Protect-BellFieldPath -Path $ServiceManifestRoot -Container
Protect-BellFieldPath -Path $EnvPath

foreach ($serviceId in $serviceOrder) {
  $serviceExe = Join-Path $ServiceManifestRoot "$serviceId.exe"
  & $serviceExe install
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install $serviceId."
  }
}

Set-ServiceSidType -ServiceId $postgresServiceId

Protect-BellFieldPath -Path $ServiceManifestRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(RX)")
Protect-BellFieldPath -Path $postgresReleaseRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)RX")
Protect-BellFieldPath -Path $postgresDataRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)F")
Protect-BellFieldPath -Path $ServiceLogRoot -Container
Protect-BellFieldPath -Path (Join-Path $ServiceLogRoot $postgresServiceId) -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)F")
Protect-BellFieldPath -Path (Join-Path $ServiceManifestRoot "$postgresServiceId.exe") -ExtraGrants @("${postgresServiceIdentity}:RX")
Protect-BellFieldPath -Path (Join-Path $ServiceManifestRoot "$postgresServiceId.xml") -ExtraGrants @("${postgresServiceIdentity}:R")

foreach ($serviceId in $serviceOrder) {
  Start-Service -Name $serviceId
}

Write-Host "BellField services installed and started."
