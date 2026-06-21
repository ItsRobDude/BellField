param(
  [string]$InstallRoot = "C:\BellField",
  [string]$OutputPath = (Join-Path (Get-Location) "bellfield-service-evidence.json"),
  [int]$TailLines = 120
)

$ErrorActionPreference = "Continue"

$serviceIds = @(
  "bellfield-postgres",
  "bellfield-api",
  "bellfield-worker",
  "bellfield-office-web"
)
$releaseRoot = Join-Path $InstallRoot "release"
$envPath = Join-Path $InstallRoot "bellfield-server.env"
$serviceManifestRoot = Join-Path $releaseRoot "services"
$serviceLogRoot = Join-Path $InstallRoot "data\logs\services"

function Test-IsElevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-CaptureText {
  param([Parameter(Mandatory = $true)][scriptblock]$ScriptBlock)

  try {
    return @{
      ok = $true
      text = (& $ScriptBlock 2>&1 | Out-String).Trim()
    }
  } catch {
    return @{
      ok = $false
      error = $_.Exception.Message
    }
  }
}

function Get-ServiceSnapshot {
  $items = @()
  foreach ($serviceId in $serviceIds) {
    try {
      $service = Get-CimInstance Win32_Service -Filter "Name = '$serviceId'" -ErrorAction Stop
      $items += @{
        name = $service.Name
        state = $service.State
        startMode = $service.StartMode
        startName = $service.StartName
        exitCode = $service.ExitCode
        processId = $service.ProcessId
        pathName = $service.PathName
      }
    } catch {
      $items += @{
        name = $serviceId
        state = "missing"
        error = $_.Exception.Message
      }
    }
  }
  return $items
}

function Get-ScEvidence {
  $items = @{}
  foreach ($serviceId in $serviceIds) {
    $items[$serviceId] = @{
      queryex = Invoke-CaptureText { & sc.exe queryex $serviceId }
      qc = Invoke-CaptureText { & sc.exe qc $serviceId }
    }
  }
  return $items
}

function Get-LogTails {
  $items = @{}
  foreach ($serviceId in $serviceIds) {
    $directory = Join-Path $serviceLogRoot $serviceId
    if (-not (Test-Path -LiteralPath $directory)) {
      $items[$serviceId] = @{
        ok = $false
        error = "log directory not found: $directory"
      }
      continue
    }

    try {
      $logs = @()
      $files = Get-ChildItem -LiteralPath $directory -File -Filter "*.log" -ErrorAction Stop |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 6
      foreach ($file in $files) {
        $logs += @{
          path = $file.FullName
          lastWriteTime = $file.LastWriteTime.ToString("o")
          tail = (Get-Content -LiteralPath $file.FullName -Tail $TailLines -ErrorAction Stop | Out-String).Trim()
        }
      }
      $items[$serviceId] = @{
        ok = $true
        logs = $logs
      }
    } catch {
      $items[$serviceId] = @{
        ok = $false
        error = $_.Exception.Message
      }
    }
  }
  return $items
}

function Get-IcaclsEvidence {
  $paths = @(
    $InstallRoot,
    $envPath,
    $releaseRoot,
    $serviceManifestRoot,
    (Join-Path $InstallRoot "data\postgres"),
    $serviceLogRoot,
    (Join-Path $serviceLogRoot "bellfield-postgres")
  )

  $items = @()
  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      $items += @{
        path = $path
        ok = $false
        error = "path not found"
      }
      continue
    }

    $capture = Invoke-CaptureText { & icacls $path }
    $capture["path"] = $path
    $items += $capture
  }
  return $items
}

function Get-EnvKeySummary {
  $keys = @(
    "NODE_ENV",
    "DATABASE_URL",
    "BELLFIELD_API_PORT",
    "BELLFIELD_OFFICE_WEB_PORT",
    "BELLFIELD_LICENSE_REQUIRED",
    "BELLFIELD_LICENSE_PATH",
    "BELLFIELD_RELAY_BASE_URL",
    "BELLFIELD_RELAY_TOKEN",
    "BELLFIELD_RELAY_SERVER_INSTANCE_ID",
    "BELLFIELD_MEDIA_TOKEN_SECRET"
  )
  $summary = @{}
  foreach ($key in $keys) {
    $summary[$key] = @{
      state = "missing"
    }
  }

  if (-not (Test-Path -LiteralPath $envPath)) {
    return @{
      path = $envPath
      exists = $false
      keys = $summary
    }
  }

  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -notmatch "^\s*([^#=\s][^=]*)=(.*)$") {
      continue
    }
    $name = $matches[1]
    $value = $matches[2].Trim()
    if ($keys -contains $name) {
      $summary[$name] = @{
        state = if ($value.Length -eq 0) { "blank" } else { "present" }
      }
    }
  }

  $licensePathState = $summary["BELLFIELD_LICENSE_PATH"].state
  $licenseFileExists = $false
  if ($licensePathState -eq "present") {
    foreach ($line in Get-Content -LiteralPath $envPath) {
      if ($line -match "^\s*BELLFIELD_LICENSE_PATH=(.*)$") {
        $licenseFileExists = Test-Path -LiteralPath $matches[1].Trim()
        break
      }
    }
  }

  return @{
    path = $envPath
    exists = $true
    keys = $summary
    licenseFileExists = $licenseFileExists
  }
}

function Get-ServiceControlManagerEvents {
  try {
    $events = Get-WinEvent -FilterHashtable @{
      LogName = "System"
      ProviderName = "Service Control Manager"
      StartTime = (Get-Date).AddHours(-6)
    } -ErrorAction Stop |
      Where-Object { $_.Message -match "bellfield-" } |
      Select-Object -First 40

    return @($events | ForEach-Object {
      @{
        timeCreated = $_.TimeCreated.ToString("o")
        id = $_.Id
        levelDisplayName = $_.LevelDisplayName
        message = $_.Message
      }
    })
  } catch {
    return @{
      ok = $false
      error = $_.Exception.Message
    }
  }
}

$evidence = @{
  name = "BellField Windows service evidence"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  installRoot = $InstallRoot
  releaseRoot = $releaseRoot
  elevated = Test-IsElevated
  services = Get-ServiceSnapshot
  sc = Get-ScEvidence
  env = Get-EnvKeySummary
  icacls = Get-IcaclsEvidence
  logs = Get-LogTails
  serviceControlManagerEvents = Get-ServiceControlManagerEvents
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$json = $evidence | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
Write-Host $json
Write-Host "BellField service evidence written to $OutputPath"
