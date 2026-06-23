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

$lanPredicatesHelper = Join-Path $PSScriptRoot "lan-firewall-predicates.ps1"
if (-not (Test-Path -LiteralPath $lanPredicatesHelper)) {
  throw "BellField LAN firewall predicate helper not found at $lanPredicatesHelper."
}
. $lanPredicatesHelper

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
    $matching = @($Candidates | Where-Object { $_.IPAddress -eq $LanIp })
    if ($matching.Count -eq 1) {
      return @{
        ipAddress = $LanIp
        reason = "provided"
        interfaceAlias = $matching[0].InterfaceAlias
        interfaceIndex = $matching[0].InterfaceIndex
        probeAllowed = $true
      }
    }

    return @{
      ipAddress = $LanIp
      reason = "provided but not matched to a local non-loopback IPv4 candidate"
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

function Get-SelectedNetworkProfile {
  param($SelectedLanIp)

  try {
    if ($SelectedLanIp -and $SelectedLanIp.interfaceIndex) {
      return Get-NetConnectionProfile -InterfaceIndex ([int]$SelectedLanIp.interfaceIndex) -ErrorAction Stop |
        Select-Object Name, InterfaceAlias, InterfaceIndex, NetworkCategory, IPv4Connectivity, IPv6Connectivity
    }
  } catch {
    return @{
      ok = $false
      error = ConvertTo-BellFieldRedactedText $_.Exception.Message
    }
  }

  return $null
}

function Get-EffectiveLanAccess {
  param(
    $ActiveProfile,
    [int]$OfficePort,
    [int]$ApiPort
  )

  $reasons = @()
  $category = "Unknown"
  if (-not $ActiveProfile) {
    $reasons += "selected LAN profile could not be determined"
  } elseif ($ActiveProfile.ok -eq $false) {
    $reasons += "selected LAN profile readback failed: $($ActiveProfile.error)"
  } else {
    $category = [string]$ActiveProfile.NetworkCategory
    if (-not $category) {
      $category = "Unknown"
    }
  }

  # Exact managed-rule readback only. Get-ManagedRulePredicateReadback reads by
  # -Name, so this never enumerates all inbound rules and cannot hang on a
  # machine with a large default firewall rule set.
  $officeReadbacks = @(Get-ManagedRulePredicateReadback -Name $officeFirewallRuleName -DisplayName $officeFirewallRuleDisplayName -ExpectedPort $OfficePort -NetworkCategory $category)
  $apiReadbacks = @(Get-ManagedRulePredicateReadback -Name $apiFirewallRuleName -DisplayName $apiFirewallRuleDisplayName -ExpectedPort $ApiPort -NetworkCategory $category)
  $officeOk = Test-RuleReadbackEffective -Readbacks $officeReadbacks
  $apiOk = Test-RuleReadbackEffective -Readbacks $apiReadbacks

  if ($category -notin @("Private", "DomainAuthenticated")) {
    $reasons += "selected network profile is $category; BellField managed rules apply to Private/Domain only"
  }
  if (-not $officeOk) {
    $reasons += "managed office firewall rule is missing or not effective for port $OfficePort and profile $category"
  }
  if (-not $apiOk) {
    $reasons += "managed API firewall rule is missing or not effective for port $ApiPort and profile $category"
  }

  return @{
    effectiveLanAccess = ($reasons.Count -eq 0)
    effectiveLanAccessReasons = @($reasons)
    managedRuleReadback = @($officeReadbacks + $apiReadbacks)
  }
}

$script:LanEvidenceSteps = New-Object System.Collections.Generic.List[object]
$script:LanEvidence = $null

function Add-LanEvidenceStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$State = "completed"
  )

  $script:LanEvidenceSteps.Add([ordered]@{
    step = $Name
    state = $State
    at = (Get-Date).ToUniversalTime().ToString("o")
  })
  Write-Host ("[lan-evidence] " + $State + ": " + $Name)
}

function Save-LanEvidence {
  param([Parameter(Mandatory = $true)][string]$Status)

  $script:LanEvidence.status = $Status
  $script:LanEvidence.steps = $script:LanEvidenceSteps.ToArray()
  $json = ConvertTo-BellFieldRedactedText ($script:LanEvidence | ConvertTo-Json -Depth 8)
  Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
}

$ports = @($OfficePort, $ApiPort)

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$script:LanEvidence = [ordered]@{
  name = "BellField Windows LAN evidence"
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  redactionApplied = $true
  elevated = Test-IsElevated
  installRoot = $InstallRoot
  ports = @{
    office = $OfficePort
    api = $ApiPort
  }
  firewallReadbackScope = "bellfield-managed-rules"
  status = "started"
  steps = @()
}
Save-LanEvidence -Status "started"

try {
  $script:LanEvidence.networkProfiles = @(Get-NetworkProfiles)
  Add-LanEvidenceStep -Name "network-profiles"
  Save-LanEvidence -Status "in-progress"

  $candidates = @(Get-CandidateIpv4Addresses)
  $selectedLanIp = Select-LanIp -Candidates $candidates
  $activeNetworkProfile = Get-SelectedNetworkProfile -SelectedLanIp $selectedLanIp
  $script:LanEvidence.candidateIpv4Addresses = @($candidates)
  $script:LanEvidence.selectedLanIp = $selectedLanIp
  $script:LanEvidence.activeNetworkProfile = $activeNetworkProfile
  Add-LanEvidenceStep -Name "candidate-ip-and-active-profile"
  Save-LanEvidence -Status "in-progress"

  $effective = Get-EffectiveLanAccess -ActiveProfile $activeNetworkProfile -OfficePort $OfficePort -ApiPort $ApiPort
  $script:LanEvidence.inboundFirewallRules = @($effective.managedRuleReadback)
  $script:LanEvidence.effectiveLanAccess = $effective.effectiveLanAccess
  $script:LanEvidence.effectiveLanAccessReasons = @($effective.effectiveLanAccessReasons)
  Add-LanEvidenceStep -Name "managed-firewall-readback"
  Save-LanEvidence -Status "in-progress"

  $script:LanEvidence.listeners = @(Get-Listeners -Ports $ports)
  Add-LanEvidenceStep -Name "listeners"
  Save-LanEvidence -Status "in-progress"

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
  $script:LanEvidence.localOriginUrlChecks = @($localOriginChecks)
  Add-LanEvidenceStep -Name "local-origin-url-checks"
  Save-LanEvidence -Status "in-progress"

  Add-LanEvidenceStep -Name "complete"
  Save-LanEvidence -Status "completed"

  $finalJson = ConvertTo-BellFieldRedactedText ($script:LanEvidence | ConvertTo-Json -Depth 8)
  Write-Host $finalJson
  Write-Host "BellField LAN evidence written to $OutputPath"
} catch {
  Add-LanEvidenceStep -Name "unexpected-error" -State "failed"
  $script:LanEvidence.error = ConvertTo-BellFieldRedactedText $_.Exception.Message
  Save-LanEvidence -Status "failed"
  Write-Host "BellField LAN evidence collection failed; partial evidence written to $OutputPath"
  exit 1
}
