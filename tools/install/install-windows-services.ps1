param(
  [string]$ReleaseRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$ServiceManifestRoot = (Join-Path $ReleaseRoot "services"),
  [string]$WinSwExe = (Join-Path $ReleaseRoot "tools\winsw\WinSW-x64.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WinSwExe)) {
  throw "WinSW executable not found at $WinSwExe. Place the approved WinSW x64 binary there before installing services."
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

  & $serviceExe install
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install $serviceId."
  }
}

foreach ($serviceId in $serviceOrder) {
  Start-Service -Name $serviceId
}

Write-Host "BellField services installed and started."
