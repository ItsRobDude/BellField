param(
  [string]$ServiceId = "bellfield-postgres",
  [string]$DiagnosticRoot = (Join-Path $env:ProgramData "BellField\diagnostics\windows-service-account"),
  [string]$WinSwExe = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "tools\winsw\WinSW-x64.exe"),
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"

$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$runRoot = $null
$resultPath = $null
$serviceExe = $null
$serviceIdentity = "NT SERVICE\$ServiceId"
$exitCode = 0
$result = [ordered]@{
  name = "BellField Windows service account diagnostic"
  startedAt = (Get-Date).ToString("o")
  serviceId = $ServiceId
  preferredAccount = $serviceIdentity
  fallbackAccount = "NT AUTHORITY\LocalService"
  winSwExe = $WinSwExe
  diagnosticRoot = $DiagnosticRoot
  isElevated = $false
  windows = $null
  tests = @()
  recommendedAccount = $null
  cleanup = [ordered]@{}
}

function Get-IsElevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WindowsSummary {
  if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    return [ordered]@{
      platform = $PSVersionTable.Platform
      powerShellVersion = $PSVersionTable.PSVersion.ToString()
    }
  }

  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    return [ordered]@{
      caption = $os.Caption
      version = $os.Version
      buildNumber = $os.BuildNumber
      architecture = $os.OSArchitecture
      powerShellVersion = $PSVersionTable.PSVersion.ToString()
    }
  } catch {
    return [ordered]@{
      error = $_.Exception.Message
      powerShellVersion = $PSVersionTable.PSVersion.ToString()
    }
  }
}

function Add-TestResult {
  param([Parameter(Mandatory = $true)]$TestResult)

  $script:result["tests"] += @($TestResult)
}

function Invoke-ScCommand {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & sc.exe @Arguments 2>&1
  return [ordered]@{
    arguments = $Arguments
    exitCode = $LASTEXITCODE
    output = ($output | Out-String).Trim()
  }
}

function Get-ServiceStartName {
  param([Parameter(Mandatory = $true)][string]$Name)

  $service = Get-CimInstance Win32_Service -Filter "Name = '$Name'" -ErrorAction Stop
  if (-not $service) {
    return $null
  }

  return [string]$service.StartName
}

function Test-StartNameMatches {
  param(
    [string]$Actual,
    [string]$Expected
  )

  if (-not $Actual) {
    return $false
  }

  return [string]::Equals($Actual, $Expected, [System.StringComparison]::OrdinalIgnoreCase)
}

function Stop-ProbeService {
  param([Parameter(Mandatory = $true)][string]$Name)

  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $service -or $service.Status -eq "Stopped") {
    return
  }

  Stop-Service -Name $Name -Force -ErrorAction Stop
  $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(20))
}

function Wait-ForProbeOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Invoke-IcaclsOrThrow {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  $output = & icacls @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage Output: $(($output | Out-String).Trim())"
  }
}

function Reset-ProbeAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Identity
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }

  Invoke-IcaclsOrThrow -Arguments @(
    $Path,
    "/inheritance:r",
    "/grant:r",
    "*S-1-5-32-544:(OI)(CI)F",
    "*S-1-5-18:(OI)(CI)F",
    "${Identity}:(OI)(CI)F"
  ) -FailureMessage "Failed to prepare SID-only ACL probe path $Path."
}

function Escape-Xml {
  param([string]$Value)

  return [Security.SecurityElement]::Escape($Value)
}

function Write-ProbeFiles {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$PowerShellExe
  )

  $probeScript = Join-Path $Root "probe.ps1"
  $probeScriptContent = @'
param(
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$AclProbePath,
  [Parameter(Mandatory = $true)][string]$ServiceId
)

$ErrorActionPreference = "Continue"
$serviceSidName = "NT SERVICE\$ServiceId"
$userText = (& whoami.exe /user 2>&1 | Out-String).Trim()
$groupsText = (& whoami.exe /groups 2>&1 | Out-String).Trim()
$writePath = Join-Path $AclProbePath "service-write.txt"
$aclWriteSucceeded = $false
$aclWriteError = $null

try {
  Set-Content -LiteralPath $writePath -Value "BellField service-account diagnostic write probe" -Encoding UTF8
  $aclWriteSucceeded = Test-Path -LiteralPath $writePath
} catch {
  $aclWriteError = $_.Exception.Message
}

$result = [ordered]@{
  serviceId = $ServiceId
  capturedAt = (Get-Date).ToString("o")
  user = $userText
  groups = $groupsText
  serviceSidName = $serviceSidName
  serviceSidPresent = ($groupsText -match [regex]::Escape($serviceSidName))
  aclProbePath = $AclProbePath
  aclWritePath = $writePath
  aclWriteSucceeded = $aclWriteSucceeded
  aclWriteError = $aclWriteError
}

$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Start-Sleep -Seconds 30
'@
  Set-Content -LiteralPath $probeScript -Value $probeScriptContent -Encoding UTF8

  $probeOutput = Join-Path $Root "probe-output.json"
  $aclProbeRoot = Join-Path $Root "sid-acl-probe"
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$probeScript`" -OutputPath `"$probeOutput`" -AclProbePath `"$aclProbeRoot`" -ServiceId `"$Name`""
  $xml = @(
    "<service>",
    "  <id>$(Escape-Xml $Name)</id>",
    "  <name>BellField Service Account Diagnostic</name>",
    "  <description>Temporary BellField diagnostic for Windows service account and service SID behavior.</description>",
    "  <executable>$(Escape-Xml $PowerShellExe)</executable>",
    "  <arguments>$(Escape-Xml $arguments)</arguments>",
    "  <workingdirectory>$(Escape-Xml $Root)</workingdirectory>",
    "  <startmode>Manual</startmode>",
    "  <onfailure action=`"none`" />",
    "  <logpath>$(Escape-Xml (Join-Path $Root "logs"))</logpath>",
    "  <log mode=`"roll-by-size`">",
    "    <sizeThreshold>1024</sizeThreshold>",
    "    <keepFiles>2</keepFiles>",
    "  </log>",
    "</service>",
    ""
  ) -join "`r`n"

  Set-Content -LiteralPath (Join-Path $Root "$Name.xml") -Value $xml -Encoding UTF8

  return [ordered]@{
    probeScript = $probeScript
    probeOutput = $probeOutput
    aclProbeRoot = $aclProbeRoot
  }
}

function Invoke-AccountCandidate {
  param(
    [Parameter(Mandatory = $true)]$Candidate,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$AclProbeRoot,
    [Parameter(Mandatory = $true)][string]$ProbeOutput,
    [Parameter(Mandatory = $true)][string]$ServiceSidIdentity
  )

  $test = [ordered]@{
    name = $Candidate.name
    account = $Candidate.account
    passwordMode = $Candidate.passwordMode
    startedAt = (Get-Date).ToString("o")
    scConfig = $null
    startName = $null
    startNameMatches = $false
    startSucceeded = $false
    startError = $null
    probeOutputFound = $false
    probe = $null
    serviceStateAfterStart = $null
    passed = $false
  }

  try {
    Stop-ProbeService -Name $Name
    if (Test-Path -LiteralPath $ProbeOutput) {
      Remove-Item -LiteralPath $ProbeOutput -Force
    }

    Reset-ProbeAcl -Path $AclProbeRoot -Identity $ServiceSidIdentity

    # Virtual service accounts and the built-in LocalService account take no
    # password through sc.exe; passing an explicit empty `password=` argument is
    # both unnecessary and crashes PowerShell argument binding. The shipping
    # installer also configures the account with no password, so keep this path
    # identical: obj= only, never password=.
    $arguments = @("config", $Name, "obj=", $Candidate.account)

    $test["scConfig"] = Invoke-ScCommand -Arguments $arguments
    if ($test["scConfig"]["exitCode"] -ne 0) {
      return $test
    }

    $test["startName"] = Get-ServiceStartName -Name $Name
    $test["startNameMatches"] = Test-StartNameMatches -Actual $test["startName"] -Expected $Candidate.account
    if (-not $test["startNameMatches"]) {
      return $test
    }

    try {
      Start-Service -Name $Name -ErrorAction Stop
      $test["startSucceeded"] = $true
    } catch {
      $test["startError"] = $_.Exception.Message
      return $test
    }

    $test["probeOutputFound"] = Wait-ForProbeOutput -Path $ProbeOutput
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($service) {
      $test["serviceStateAfterStart"] = [string]$service.Status
    }

    if ($test["probeOutputFound"]) {
      $test["probe"] = Get-Content -LiteralPath $ProbeOutput -Raw | ConvertFrom-Json
      # Pass on the signals that actually prove the account works: the SCM
      # StartName is the intended low-privilege account, the service started,
      # and a process running as that (non-admin) account wrote into a directory
      # granting only Admin/System/serviceSID -- which can only succeed via the
      # service SID grant. probe.serviceSidPresent is kept as recorded evidence
      # but is NOT a gate: a service running AS its own virtual account shows that
      # SID as the process user, not a group, so `whoami /groups` never lists it.
      $test["passed"] = [bool](
        $test["startNameMatches"] -and
        $test["startSucceeded"] -and
        $test["probe"].aclWriteSucceeded
      )
    }

    return $test
  } finally {
    try {
      Stop-ProbeService -Name $Name
    } catch {
      $test["stopError"] = $_.Exception.Message
    }
    $test["completedAt"] = (Get-Date).ToString("o")
  }
}

function Write-Result {
  $script:result["completedAt"] = (Get-Date).ToString("o")
  $json = $script:result | ConvertTo-Json -Depth 10
  if ($script:resultPath) {
    Set-Content -LiteralPath $script:resultPath -Value $json -Encoding UTF8
  }
  Write-Output $json
}

try {
  $result["isElevated"] = Get-IsElevated
  $result["windows"] = Get-WindowsSummary

  if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne "Win32NT") {
    throw "This diagnostic must run on Windows."
  }

  if (-not $result["isElevated"]) {
    throw "This diagnostic must run from an elevated PowerShell session."
  }

  if (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue) {
    throw "Service $ServiceId already exists. Clean the machine first or pass a temporary -ServiceId; this script will not modify an existing service."
  }

  if (-not (Test-Path -LiteralPath $WinSwExe)) {
    throw "WinSW executable not found at $WinSwExe. Run from a release bundle or pass -WinSwExe."
  }

  $powerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  if (-not (Test-Path -LiteralPath $powerShellExe)) {
    throw "Windows PowerShell executable not found at $powerShellExe."
  }

  New-Item -ItemType Directory -Path $DiagnosticRoot -Force | Out-Null
  $runRoot = Join-Path $DiagnosticRoot "$runId-$ServiceId-work"
  New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
  $result["runRoot"] = $runRoot
  $resultPath = Join-Path $DiagnosticRoot "$runId-$ServiceId-result.json"
  $result["resultPath"] = $resultPath

  $probeFiles = Write-ProbeFiles -Root $runRoot -Name $ServiceId -PowerShellExe $powerShellExe
  $serviceExe = Join-Path $runRoot "$ServiceId.exe"
  Copy-Item -LiteralPath $WinSwExe -Destination $serviceExe -Force

  $installOutput = & $serviceExe install 2>&1
  $result["installService"] = [ordered]@{
    exitCode = $LASTEXITCODE
    output = ($installOutput | Out-String).Trim()
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install temporary diagnostic service $ServiceId."
  }

  $sidTypeResult = Invoke-ScCommand -Arguments @("sidtype", $ServiceId, "unrestricted")
  $result["sidType"] = $sidTypeResult
  if ($sidTypeResult.exitCode -ne 0) {
    throw "Failed to enable unrestricted service SID for $ServiceId."
  }

  $candidates = @(
    [ordered]@{
      name = "virtualAccountNoPassword"
      account = $serviceIdentity
      passwordMode = "omit"
    },
    [ordered]@{
      name = "localServiceFallback"
      account = "NT AUTHORITY\LocalService"
      passwordMode = "omit"
    }
  )

  foreach ($candidate in $candidates) {
    $test = Invoke-AccountCandidate `
      -Candidate $candidate `
      -Name $ServiceId `
      -AclProbeRoot $probeFiles.aclProbeRoot `
      -ProbeOutput $probeFiles.probeOutput `
      -ServiceSidIdentity $serviceIdentity

    Add-TestResult -TestResult $test

    if ($test["passed"]) {
      $result["recommendedAccount"] = $candidate.account
      $result["recommendedAccountSource"] = $candidate.name
      break
    }
  }

  if (-not $result["recommendedAccount"]) {
    throw "No service account candidate passed StartName readback, real service startup, and SID-only ACL write checks."
  }

  $result["result"] = "passed"
} catch {
  $exitCode = 1
  $result["result"] = "failed"
  $result["error"] = $_.Exception.Message
} finally {
  try {
    if ($ServiceId) {
      Stop-ProbeService -Name $ServiceId
    }
    if ($serviceExe -and (Test-Path -LiteralPath $serviceExe)) {
      $uninstallOutput = & $serviceExe uninstall 2>&1
      $result["cleanup"]["uninstall"] = [ordered]@{
        exitCode = $LASTEXITCODE
        output = ($uninstallOutput | Out-String).Trim()
      }
    }
    if (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue) {
      $deleteResult = Invoke-ScCommand -Arguments @("delete", $ServiceId)
      $result["cleanup"]["scDelete"] = $deleteResult
    }
  } catch {
    $result["cleanup"]["error"] = $_.Exception.Message
    if ($exitCode -eq 0) {
      $exitCode = 1
      $result["result"] = "failed"
      $result["error"] = "Diagnostic passed, but cleanup failed: $($_.Exception.Message)"
    }
  }

  if ($runRoot -and (Test-Path -LiteralPath $runRoot)) {
    if ($KeepArtifacts) {
      $result["cleanup"]["artifactsKept"] = $true
    } else {
      try {
        Remove-Item -LiteralPath $runRoot -Recurse -Force
        $result["cleanup"]["artifactsRemoved"] = $true
      } catch {
        $result["cleanup"]["artifactRemovalError"] = $_.Exception.Message
        if ($exitCode -eq 0) {
          $exitCode = 1
          $result["result"] = "failed"
          $result["error"] = "Diagnostic passed, but artifact cleanup failed: $($_.Exception.Message)"
        }
      }
    }
  }

  Write-Result
}

if ($exitCode -ne 0) {
  exit $exitCode
}
