param(
  [string]$InstallRoot = "C:\BellField",
  [string]$UsbRoot = "",
  [string]$OutputPath = (Join-Path (Get-Location) "bellfield-install-baseline.json")
)

$ErrorActionPreference = "Continue"

$redactionHelper = Join-Path $PSScriptRoot "evidence-redaction.ps1"
if (-not (Test-Path -LiteralPath $redactionHelper)) {
  throw "BellField evidence redaction helper not found at $redactionHelper."
}
. $redactionHelper

function Test-IsElevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-OptionalPath {
  param([string]$Path)

  if (-not $Path) {
    return $null
  }

  try {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  } catch {
    return $Path
  }
}

function Get-DriveRootInfo {
  param([string]$Path)

  if (-not $Path) {
    return @{
      ok = $false
      pathType = "missing"
      driveRoot = $null
      error = "path not provided"
    }
  }

  if ($Path -match "^[\\/]{2}") {
    return @{
      ok = $false
      pathType = "unc"
      driveRoot = $null
      error = "UNC paths do not have local drive free-space information"
    }
  }

  try {
    $qualifier = Split-Path -Qualifier $Path -ErrorAction Stop
  } catch {
    return @{
      ok = $false
      pathType = "unknown"
      driveRoot = $null
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
  if ($qualifier) {
    return @{
      ok = $true
      pathType = "drive"
      driveRoot = "$qualifier\"
      error = $null
    }
  }

  return @{
    ok = $false
    pathType = "relative-or-provider"
    driveRoot = $null
    error = "could not determine drive root"
  }
}

function Get-DriveSummary {
  param([string]$Path)

  $resolvedPath = Resolve-OptionalPath -Path $Path
  $driveRootInfo = Get-DriveRootInfo -Path $resolvedPath
  if (-not $driveRootInfo.ok) {
    return @{
      path = $Path
      resolvedPath = $resolvedPath
      pathType = $driveRootInfo.pathType
      driveRoot = $driveRootInfo.driveRoot
      ok = $false
      error = $driveRootInfo.error
    }
  }

  try {
    $driveRoot = $driveRootInfo.driveRoot
    $driveId = $driveRoot.TrimEnd("\")
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID = '$driveId'" -ErrorAction Stop
    return @{
      path = $Path
      resolvedPath = $resolvedPath
      pathType = $driveRootInfo.pathType
      driveRoot = $driveRoot
      volumeName = $drive.VolumeName
      driveType = $drive.DriveType
      fileSystem = $drive.FileSystem
      sizeBytes = [int64]$drive.Size
      freeBytes = [int64]$drive.FreeSpace
    }
  } catch {
    return @{
      path = $Path
      resolvedPath = $resolvedPath
      driveRoot = $driveRoot
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Get-OsSummary {
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    return @{
      caption = $os.Caption
      version = $os.Version
      buildNumber = $os.BuildNumber
      architecture = $os.OSArchitecture
      installDate = if ($os.InstallDate) { $os.InstallDate.ToString("o") } else { $null }
      lastBootUpTime = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString("o") } else { $null }
    }
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Get-NetworkProfiles {
  try {
    return @(Get-NetConnectionProfile -ErrorAction Stop | Select-Object Name, InterfaceAlias, InterfaceIndex, NetworkCategory, IPv4Connectivity, IPv6Connectivity)
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Get-Ipv4Addresses {
  try {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
      Select-Object IPAddress, InterfaceAlias, InterfaceIndex, PrefixLength, AddressState, PrefixOrigin, SuffixOrigin)
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Get-BellFieldServices {
  try {
    return @(Get-CimInstance Win32_Service -ErrorAction Stop |
      Where-Object { $_.Name -like "bellfield-*" } |
      Select-Object Name, State, StartMode, StartName, ExitCode, ProcessId, PathName)
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Get-PathSummary {
  param([string[]]$Paths)

  $items = @()
  foreach ($path in $Paths) {
    $items += @{
      path = $path
      exists = Test-Path -LiteralPath $path
    }
  }
  return $items
}

function Get-UsbSummary {
  param([string]$Root)

  if (-not $Root) {
    return @{
      provided = $false
    }
  }

  $resolvedRoot = Resolve-OptionalPath -Path $Root
  return @{
    provided = $true
    path = $Root
    resolvedPath = $resolvedRoot
    exists = Test-Path -LiteralPath $resolvedRoot
    startHereExists = Test-Path -LiteralPath (Join-Path $resolvedRoot "START-HERE.txt")
    sha256SumsExists = Test-Path -LiteralPath (Join-Path $resolvedRoot "SHA256SUMS.txt")
    drive = Get-DriveSummary -Path $resolvedRoot
  }
}

$resolvedInstallRoot = Resolve-OptionalPath -Path $InstallRoot
$paths = @(
  $resolvedInstallRoot,
  (Join-Path $resolvedInstallRoot "release"),
  (Join-Path $resolvedInstallRoot "bellfield-server.env"),
  (Join-Path $resolvedInstallRoot "data"),
  (Join-Path $resolvedInstallRoot "data\postgres"),
  (Join-Path $resolvedInstallRoot "data\logs"),
  (Join-Path $resolvedInstallRoot "data\logs\services"),
  (Join-Path $resolvedInstallRoot "data\license")
)

$baseline = [ordered]@{
  name = "BellField Windows install baseline"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  redactionApplied = $true
  elevated = Test-IsElevated
  userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  machineName = $env:COMPUTERNAME
  powerShellVersion = $PSVersionTable.PSVersion.ToString()
  os = Get-OsSummary
  installRoot = @{
    path = $InstallRoot
    resolvedPath = $resolvedInstallRoot
    exists = Test-Path -LiteralPath $resolvedInstallRoot
    drive = Get-DriveSummary -Path $resolvedInstallRoot
  }
  usbRoot = Get-UsbSummary -Root $UsbRoot
  networkProfiles = @(Get-NetworkProfiles)
  ipv4Addresses = @(Get-Ipv4Addresses)
  bellfieldServices = @(Get-BellFieldServices)
  installPaths = @(Get-PathSummary -Paths $paths)
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$json = ConvertTo-BellFieldRedactedText ($baseline | ConvertTo-Json -Depth 8)
[System.IO.File]::WriteAllText($OutputPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host $json
Write-Host "BellField install baseline written to $OutputPath"
