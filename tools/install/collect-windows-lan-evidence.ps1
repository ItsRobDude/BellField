param(
  [string]$InstallRoot = "C:\BellField",
  [int]$OfficePort = 3000,
  [int]$ApiPort = 3001,
  [string]$LanIp = "",
  [string]$OutputPath = (Join-Path (Get-Location) "bellfield-lan-evidence.json"),
  [int]$TimeoutSeconds = 10
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

function Get-CandidateIpv4Addresses {
  try {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and
        $_.AddressState -in @("Preferred", "Tentative", "Deprecated")
      } |
      Select-Object IPAddress, InterfaceAlias, InterfaceIndex, PrefixLength, AddressState, PrefixOrigin, SuffixOrigin)
  } catch {
    return @()
  }
}

function Get-DefaultRouteInterfaceIndex {
  try {
    $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
      Sort-Object RouteMetric, InterfaceMetric |
      Select-Object -First 1
    if ($route) {
      return [int]$route.InterfaceIndex
    }
  } catch {
    return $null
  }

  return $null
}

function Select-LanIp {
  param($Candidates)

  if ($LanIp) {
    return @{
      ipAddress = $LanIp
      reason = "provided"
      probeAllowed = $true
    }
  }

  if (-not $Candidates -or $Candidates.Count -eq 0) {
    return @{
      ipAddress = $null
      reason = "no non-loopback IPv4 candidates found"
      probeAllowed = $false
    }
  }

  if ($Candidates.Count -eq 1) {
    return @{
      ipAddress = $Candidates[0].IPAddress
      reason = "single candidate"
      interfaceAlias = $Candidates[0].InterfaceAlias
      interfaceIndex = $Candidates[0].InterfaceIndex
      probeAllowed = $true
    }
  }

  $defaultInterfaceIndex = Get-DefaultRouteInterfaceIndex
  if ($null -ne $defaultInterfaceIndex) {
    $defaultCandidates = @($Candidates | Where-Object { [int]$_.InterfaceIndex -eq $defaultInterfaceIndex })
    if ($defaultCandidates.Count -eq 1) {
      return @{
        ipAddress = $defaultCandidates[0].IPAddress
        reason = "default-route interface"
        interfaceAlias = $defaultCandidates[0].InterfaceAlias
        interfaceIndex = $defaultCandidates[0].InterfaceIndex
        probeAllowed = $true
      }
    }
  }

  return @{
    ipAddress = $null
    reason = "multiple IPv4 candidates and no single default-route match"
    probeAllowed = $false
  }
}

function Get-Listeners {
  param([int[]]$Ports)

  try {
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
      Where-Object { $Ports -contains [int]$_.LocalPort } |
      Select-Object LocalAddress, LocalPort, State, OwningProcess, CreationTime)
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Invoke-LocalUrlCheck {
  param(
    [string]$Url,
    [int]$Timeout
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec $Timeout -UseBasicParsing -ErrorAction Stop
    return @{
      url = $Url
      origin = "installed-pc"
      provesRemoteReachability = $false
      ok = $true
      statusCode = [int]$response.StatusCode
      contentSample = ConvertTo-BellFieldRedactedText ([string]$response.Content).Substring(0, [Math]::Min(200, ([string]$response.Content).Length))
    }
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    return @{
      url = $Url
      origin = "installed-pc"
      provesRemoteReachability = $false
      ok = $false
      statusCode = $statusCode
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

function Test-PortFilterMatches {
  param(
    [object]$LocalPort,
    [int[]]$TargetPorts
  )

  foreach ($value in @($LocalPort)) {
    $text = [string]$value
    if ($text -eq "Any") {
      continue
    }

    foreach ($target in $TargetPorts) {
      if ($text -eq [string]$target) {
        return $true
      }
      if ($text -match "(^|[, ])$target([, ]|$)") {
        return $true
      }
      if ($text -match "^(\d+)-(\d+)$") {
        $start = [int]$matches[1]
        $end = [int]$matches[2]
        if ($target -ge $start -and $target -le $end) {
          return $true
        }
      }
    }
  }

  return $false
}

function Get-FirewallReadback {
  param([int[]]$Ports)

  try {
    $items = @()
    $rules = Get-NetFirewallRule -Direction Inbound -ErrorAction Stop
    foreach ($rule in $rules) {
      $portFilters = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
      $appFilters = @(Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
      $programs = @($appFilters | ForEach-Object { $_.Program })

      foreach ($portFilter in $portFilters) {
        $matchesPort = Test-PortFilterMatches -LocalPort $portFilter.LocalPort -TargetPorts $Ports
        $looksRelevant = (
          $matchesPort -or
          $rule.DisplayName -match "BellField|node" -or
          $rule.Name -match "BellField|node" -or
          (($programs -join " ") -match "BellField|node")
        )
        if (-not $looksRelevant) {
          continue
        }

        $items += @{
          name = $rule.Name
          displayName = $rule.DisplayName
          enabled = $rule.Enabled
          action = $rule.Action
          profile = $rule.Profile
          direction = $rule.Direction
          protocol = $portFilter.Protocol
          localPort = @($portFilter.LocalPort)
          program = $programs
        }
      }
    }

    return $items
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }
}

$ports = @($OfficePort, $ApiPort)
$candidates = @(Get-CandidateIpv4Addresses)
$selectedLanIp = Select-LanIp -Candidates $candidates
$localOriginChecks = @()
if ($selectedLanIp.probeAllowed -and $selectedLanIp.ipAddress) {
  $localOriginChecks += Invoke-LocalUrlCheck -Url "http://$($selectedLanIp.ipAddress):$OfficePort/" -Timeout $TimeoutSeconds
  $localOriginChecks += Invoke-LocalUrlCheck -Url "http://$($selectedLanIp.ipAddress):$ApiPort/health" -Timeout $TimeoutSeconds
} else {
  $localOriginChecks += @{
    ok = $false
    skipped = $true
    origin = "installed-pc"
    provesRemoteReachability = $false
    reason = $selectedLanIp.reason
  }
}

$evidence = [ordered]@{
  name = "BellField Windows LAN evidence"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  redactionApplied = $true
  elevated = Test-IsElevated
  installRoot = $InstallRoot
  ports = @{
    office = $OfficePort
    api = $ApiPort
  }
  networkProfiles = @(Get-NetworkProfiles)
  candidateIpv4Addresses = @($candidates)
  selectedLanIp = $selectedLanIp
  listeners = @(Get-Listeners -Ports $ports)
  localOriginUrlChecks = @($localOriginChecks)
  inboundFirewallRules = @(Get-FirewallReadback -Ports $ports)
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$json = ConvertTo-BellFieldRedactedText ($evidence | ConvertTo-Json -Depth 8)
Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
Write-Host $json
Write-Host "BellField LAN evidence written to $OutputPath"
