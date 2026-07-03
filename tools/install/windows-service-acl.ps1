# BellField Windows service ACL CLI wrapper.
#
# Standalone entry point for applying the BellField Windows service ACLs
# (used by update-bellfield.mjs and the install smokes via
# `windows-service-acl.ps1 -Apply -ReleaseRoot ... -InstallRoot ...`).
#
# Do NOT dot-source this file: its param() block rebinds $ReleaseRoot,
# $InstallRoot, $ServiceManifestRoot, $EnvPath, and $ServiceLogRoot in the
# caller's scope (Gate Day rerun-24 failure). Scripts that need the ACL
# functions must dot-source windows-service-acl-functions.ps1 instead.
param(
  [switch]$Apply,
  [string]$ReleaseRoot,
  [string]$InstallRoot,
  [string]$ServiceManifestRoot,
  [string]$EnvPath,
  [string]$ServiceLogRoot,
  [string]$PostgresServiceId = "bellfield-postgres"
)

$aclFunctions = Join-Path $PSScriptRoot "windows-service-acl-functions.ps1"
if (-not (Test-Path -LiteralPath $aclFunctions)) {
  throw "BellField Windows service ACL function library not found at $aclFunctions."
}
. $aclFunctions

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
