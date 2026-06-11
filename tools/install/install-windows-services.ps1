param(
  [string]$ReleaseRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$InstallRoot = "C:\BellField",
  [string]$ServiceManifestRoot = (Join-Path $ReleaseRoot "services"),
  [string]$EnvPath = (Join-Path $InstallRoot "bellfield-server.env"),
  [string]$WinSwExe = (Join-Path $ReleaseRoot "tools\winsw\WinSW-x64.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WinSwExe)) {
  throw "WinSW executable not found at $WinSwExe. Place the approved WinSW x64 binary there before installing services."
}

function Protect-BellFieldPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Container
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Warning "Skipping ACL hardening for missing path: $Path"
    return
  }

  $adminSid = "*S-1-5-32-544"
  $systemSid = "*S-1-5-18"
  $rights = if ($Container) { "(OI)(CI)F" } else { "F" }

  & icacls $Path /inheritance:r /grant:r "${adminSid}:$rights" "${systemSid}:$rights" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to harden ACLs for $Path."
  }
}

$serviceOrder = @(
  "bellfield-postgres",
  "bellfield-api",
  "bellfield-worker",
  "bellfield-office-web"
)

foreach ($serviceId in $serviceOrder) {
  $xmlPath = Join-Path $ServiceManifestRoot "$serviceId.xml"
  if (-not (Test-Path -LiteralPath $xmlPath)) {
    throw "Service manifest missing: $xmlPath"
  }

  $serviceExe = Join-Path $ServiceManifestRoot "$serviceId.exe"
  Copy-Item -LiteralPath $WinSwExe -Destination $serviceExe -Force
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

foreach ($serviceId in $serviceOrder) {
  Start-Service -Name $serviceId
}

Write-Host "BellField services installed and started."
