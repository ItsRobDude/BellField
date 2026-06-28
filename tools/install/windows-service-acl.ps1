param(
  [switch]$Apply,
  [string]$ReleaseRoot,
  [string]$InstallRoot,
  [string]$ServiceManifestRoot,
  [string]$EnvPath,
  [string]$ServiceLogRoot,
  [string]$PostgresServiceId = "bellfield-postgres"
)

$BellFieldAdminSid = "*S-1-5-32-544"
$BellFieldSystemSid = "*S-1-5-18"

function Invoke-BellFieldIcacls {
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
    "${BellFieldAdminSid}:$rights",
    "${BellFieldSystemSid}:$rights"
  )

  foreach ($grant in $ExtraGrants) {
    $arguments += "/grant"
    $arguments += $grant
  }

  Invoke-BellFieldIcacls -Arguments $arguments -FailureMessage "Failed to harden ACLs for $Path."
}

function Set-BellFieldWindowsServiceAcls {
  param(
    [Parameter(Mandatory = $true)][string]$ReleaseRoot,
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [string]$ServiceManifestRoot = (Join-Path $ReleaseRoot "services"),
    [string]$EnvPath = (Join-Path $InstallRoot "bellfield-server.env"),
    [string]$ServiceLogRoot = (Join-Path $InstallRoot "data\logs\services"),
    [string]$PostgresServiceId = "bellfield-postgres"
  )

  $postgresServiceIdentity = "NT SERVICE\$PostgresServiceId"
  $postgresDataRoot = Join-Path $InstallRoot "data\postgres"
  $postgresReleaseRoot = Join-Path $ReleaseRoot "postgres"
  $postgresLogRoot = Join-Path $ServiceLogRoot $PostgresServiceId

  if (-not (Test-Path -LiteralPath $ServiceLogRoot)) {
    New-Item -ItemType Directory -Force -Path $ServiceLogRoot | Out-Null
  }
  if (-not (Test-Path -LiteralPath $postgresLogRoot)) {
    New-Item -ItemType Directory -Force -Path $postgresLogRoot | Out-Null
  }

  Protect-BellFieldPath -Path $ServiceManifestRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(RX)")
  Protect-BellFieldPath -Path $EnvPath
  Protect-BellFieldPath -Path $postgresReleaseRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)RX")
  Protect-BellFieldPath -Path $postgresDataRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)F")
  Protect-BellFieldPath -Path $ServiceLogRoot -Container
  Protect-BellFieldPath -Path $postgresLogRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)F")
  Protect-BellFieldPath -Path (Join-Path $ServiceManifestRoot "$PostgresServiceId.exe") -ExtraGrants @("${postgresServiceIdentity}:RX")
  Protect-BellFieldPath -Path (Join-Path $ServiceManifestRoot "$PostgresServiceId.xml") -ExtraGrants @("${postgresServiceIdentity}:R")
}

if ($Apply) {
  if (-not $ReleaseRoot) {
    throw "ReleaseRoot is required when applying BellField Windows service ACLs."
  }
  if (-not $InstallRoot) {
    throw "InstallRoot is required when applying BellField Windows service ACLs."
  }

  $arguments = @{
    ReleaseRoot = $ReleaseRoot
    InstallRoot = $InstallRoot
    PostgresServiceId = $PostgresServiceId
  }
  if ($ServiceManifestRoot) {
    $arguments.ServiceManifestRoot = $ServiceManifestRoot
  }
  if ($EnvPath) {
    $arguments.EnvPath = $EnvPath
  }
  if ($ServiceLogRoot) {
    $arguments.ServiceLogRoot = $ServiceLogRoot
  }

  Set-BellFieldWindowsServiceAcls @arguments
}
