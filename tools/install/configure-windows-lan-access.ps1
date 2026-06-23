param(
  [string]$InstallRoot = "C:\BellField",
  [string]$EnvPath = (Join-Path $InstallRoot "bellfield-server.env"),
  [string]$LanHost = "",
  [string]$LanIp = "",
  [switch]$SetCurrentNetworkPrivate
)

$ErrorActionPreference = "Stop"

$redactionHelper = Join-Path $PSScriptRoot "evidence-redaction.ps1"
if (-not (Test-Path -LiteralPath $redactionHelper)) {
  throw "BellField evidence redaction helper not found at $redactionHelper."
}
. $redactionHelper

$bellFieldFirewallGroup = "BellField"
$officeFirewallRuleName = "BellField-Office-Web-TCP-Inbound"
$apiFirewallRuleName = "BellField-API-TCP-Inbound"
$officeFirewallRuleDisplayName = "BellField Office Web TCP Inbound"
$apiFirewallRuleDisplayName = "BellField API TCP Inbound"
$managedFirewallRules = @(
  @{ Name = $officeFirewallRuleName; DisplayName = $officeFirewallRuleDisplayName },
  @{ Name = $apiFirewallRuleName; DisplayName = $apiFirewallRuleDisplayName }
)

function Test-IsElevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Read-ServerEnv {
  if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw "BellField server env file was not found at $EnvPath. Run write-server-config.mjs first."
  }

  return @(Get-Content -LiteralPath $EnvPath)
}

function Read-ServerEnvValue {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Default = ""
  )

  foreach ($line in $Lines) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=(.*)$") {
      return $matches[1].Trim()
    }
  }

  return $Default
}

function Set-ServerEnvValue {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $updated = New-Object System.Collections.Generic.List[string]
  $found = $false
  foreach ($line in $Lines) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=") {
      $updated.Add("$Name=$Value")
      $found = $true
    } else {
      $updated.Add($line)
    }
  }

  if (-not $found) {
    $updated.Add("$Name=$Value")
  }

  return $updated.ToArray()
}

function Assert-ValidLanHost {
  param([Parameter(Mandatory = $true)][string]$HostName)

  if ($HostName -match "^\s*https?://") {
    throw "Pass -LanHost as a host name or IP address without http:// or https://."
  }
  if ($HostName -match "[/:]") {
    throw "Pass -LanHost as a host name or IPv4 address only, without a port or path."
  }
}

function Get-CandidateIpv4Addresses {
  return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object {
      $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and
      $_.AddressState -eq "Preferred"
    } |
    Select-Object IPAddress, InterfaceAlias, InterfaceIndex, PrefixLength, AddressState)
}

function Get-DefaultRouteInterfaceIndex {
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
  if (-not $route) {
    throw "No IPv4 default route was found; pass -LanIp for the trusted shop LAN interface."
  }

  return [int]$route.InterfaceIndex
}

function Select-LanTarget {
  $candidates = @(Get-CandidateIpv4Addresses)
  if ($LanIp) {
    $matching = @($candidates | Where-Object { $_.IPAddress -eq $LanIp })
    if ($matching.Count -ne 1) {
      throw "Provided -LanIp '$LanIp' does not match exactly one local non-loopback IPv4 address."
    }
    return $matching[0]
  }

  $defaultInterfaceIndex = Get-DefaultRouteInterfaceIndex
  $defaultCandidates = @($candidates | Where-Object { [int]$_.InterfaceIndex -eq $defaultInterfaceIndex })
  if ($defaultCandidates.Count -ne 1) {
    throw "Could not select exactly one default-route non-loopback IPv4 address; pass -LanIp explicitly."
  }

  return $defaultCandidates[0]
}

function Get-SelectedNetworkProfile {
  param([Parameter(Mandatory = $true)]$LanTarget)

  $profile = Get-NetConnectionProfile -InterfaceIndex ([int]$LanTarget.InterfaceIndex) -ErrorAction Stop
  if (-not $profile) {
    throw "No network profile was found for interface $($LanTarget.InterfaceAlias) ($($LanTarget.InterfaceIndex))."
  }

  return $profile
}

function Quote-PowerShellLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'$($Value.Replace("'", "''"))'"
}

function Assert-PrivateOrDomainProfile {
  param([Parameter(Mandatory = $true)]$Profile)

  $category = [string]$Profile.NetworkCategory
  if ($category -in @("Private", "DomainAuthenticated")) {
    return
  }

  if ($category -eq "Public" -and $SetCurrentNetworkPrivate) {
    Write-Host "Setting selected BellField LAN interface '$($Profile.InterfaceAlias)' from Public to Private because -SetCurrentNetworkPrivate was passed."
    Set-NetConnectionProfile -InterfaceAlias $Profile.InterfaceAlias -NetworkCategory Private -ErrorAction Stop
    return
  }

  $command = "Set-NetConnectionProfile -InterfaceAlias $(Quote-PowerShellLiteral $Profile.InterfaceAlias) -NetworkCategory Private"
  throw "Selected BellField LAN profile is '$category' on interface '$($Profile.InterfaceAlias)' (index $($Profile.InterfaceIndex)). BellField only opens Private/Domain LAN ingress by default. Run this on the trusted shop LAN and rerun this helper, or rerun the helper with -SetCurrentNetworkPrivate after operator consent. Copyable command: $command"
}

function Remove-BellFieldManagedFirewallRules {
  foreach ($managedRule in $managedFirewallRules) {
    $rules = @(Get-NetFirewallRule -Name $managedRule.Name -ErrorAction SilentlyContinue)
    foreach ($rule in $rules) {
      Remove-NetFirewallRule -InputObject $rule -ErrorAction Stop
    }
  }
}

function New-BellFieldManagedFirewallRules {
  param(
    [Parameter(Mandatory = $true)][int]$OfficePort,
    [Parameter(Mandatory = $true)][int]$ApiPort
  )

  New-NetFirewallRule `
    -Name $officeFirewallRuleName `
    -DisplayName $officeFirewallRuleDisplayName `
    -Group $bellFieldFirewallGroup `
    -Direction Inbound `
    -Action Allow `
    -Enabled True `
    -Profile Private,Domain `
    -Protocol TCP `
    -LocalPort $OfficePort `
    -RemoteAddress LocalSubnet `
    -Description "Allows BellField office browsers on the local trusted subnet to reach the office web service." |
    Out-Null

  New-NetFirewallRule `
    -Name $apiFirewallRuleName `
    -DisplayName $apiFirewallRuleDisplayName `
    -Group $bellFieldFirewallGroup `
    -Direction Inbound `
    -Action Allow `
    -Enabled True `
    -Profile Private,Domain `
    -Protocol TCP `
    -LocalPort $ApiPort `
    -RemoteAddress LocalSubnet `
    -Description "Allows BellField office browsers on the local trusted subnet to reach the API service." |
    Out-Null
}

function Test-RuleProfileApplies {
  param(
    [Parameter(Mandatory = $true)][object]$RuleProfile,
    [Parameter(Mandatory = $true)][string]$NetworkCategory
  )

  $neededProfile = if ($NetworkCategory -eq "DomainAuthenticated") { "Domain" } else { $NetworkCategory }
  $text = [string]$RuleProfile
  return $text -eq "Any" -or ($text -split "[, ]+" | Where-Object { $_ }) -contains $neededProfile
}

function Test-PortFilterMatches {
  param(
    [object]$LocalPort,
    [int]$ExpectedPort
  )

  foreach ($value in @($LocalPort)) {
    $text = [string]$value
    if ($text -eq [string]$ExpectedPort) {
      return $true
    }
    if ($text -match "(^|[, ])$ExpectedPort([, ]|$)") {
      return $true
    }
    if ($text -match "^(\d+)-(\d+)$") {
      $start = [int]$matches[1]
      $end = [int]$matches[2]
      if ($ExpectedPort -ge $start -and $ExpectedPort -le $end) {
        return $true
      }
    }
  }

  return $false
}

function Test-RemoteAddressAllowsLocalSubnet {
  param([object]$RemoteAddress)

  foreach ($value in @($RemoteAddress)) {
    $text = [string]$value
    if ($text -eq "LocalSubnet") {
      return $true
    }
  }

  return $false
}

function Get-ManagedRulePredicateReadback {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$DisplayName,
    [Parameter(Mandatory = $true)][int]$ExpectedPort,
    [Parameter(Mandatory = $true)][string]$NetworkCategory
  )

  $readbacks = @()
  $rules = @(Get-NetFirewallRule -Name $Name -ErrorAction SilentlyContinue)
  foreach ($rule in $rules) {
    $portFilters = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
    $addressFilters = @(Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
    $remoteAddresses = @($addressFilters | ForEach-Object { $_.RemoteAddress })
    $localAddresses = @($addressFilters | ForEach-Object { $_.LocalAddress })

    if ($portFilters.Count -eq 0) {
      $displayNameMatches = [string]$rule.DisplayName -eq $DisplayName
      $enabledMatches = [string]$rule.Enabled -eq "True"
      $actionMatches = [string]$rule.Action -eq "Allow"
      $directionMatches = [string]$rule.Direction -eq "Inbound"
      $profileMatches = Test-RuleProfileApplies -RuleProfile $rule.Profile -NetworkCategory $NetworkCategory
      $remoteAddressMatches = Test-RemoteAddressAllowsLocalSubnet -RemoteAddress $remoteAddresses
      $readbacks += [ordered]@{
        name = [string]$rule.Name
        displayName = [string]$rule.DisplayName
        expectedDisplayName = $DisplayName
        enabled = [string]$rule.Enabled
        action = [string]$rule.Action
        direction = [string]$rule.Direction
        profile = [string]$rule.Profile
        networkCategory = $NetworkCategory
        protocol = $null
        localPort = @()
        expectedPort = $ExpectedPort
        localAddress = @($localAddresses)
        remoteAddress = @($remoteAddresses)
        displayNameMatches = $displayNameMatches
        enabledMatches = $enabledMatches
        actionMatches = $actionMatches
        directionMatches = $directionMatches
        profileApplies = $profileMatches
        protocolMatches = $false
        localPortMatches = $false
        remoteAddressMatches = $remoteAddressMatches
        effective = $false
      }
      continue
    }

    foreach ($portFilter in $portFilters) {
      $displayNameMatches = [string]$rule.DisplayName -eq $DisplayName
      $enabledMatches = [string]$rule.Enabled -eq "True"
      $actionMatches = [string]$rule.Action -eq "Allow"
      $directionMatches = [string]$rule.Direction -eq "Inbound"
      $profileMatches = Test-RuleProfileApplies -RuleProfile $rule.Profile -NetworkCategory $NetworkCategory
      $protocolMatches = [string]$portFilter.Protocol -eq "TCP"
      $localPortMatches = Test-PortFilterMatches -LocalPort $portFilter.LocalPort -ExpectedPort $ExpectedPort
      $remoteAddressMatches = Test-RemoteAddressAllowsLocalSubnet -RemoteAddress $remoteAddresses
      $effective = (
        $displayNameMatches -and
        $enabledMatches -and
        $actionMatches -and
        $directionMatches -and
        $profileMatches -and
        $protocolMatches -and
        $localPortMatches -and
        $remoteAddressMatches
      )

      $readbacks += [ordered]@{
        name = [string]$rule.Name
        displayName = [string]$rule.DisplayName
        expectedDisplayName = $DisplayName
        enabled = [string]$rule.Enabled
        action = [string]$rule.Action
        direction = [string]$rule.Direction
        profile = [string]$rule.Profile
        networkCategory = $NetworkCategory
        protocol = [string]$portFilter.Protocol
        localPort = @($portFilter.LocalPort)
        expectedPort = $ExpectedPort
        localAddress = @($localAddresses)
        remoteAddress = @($remoteAddresses)
        displayNameMatches = $displayNameMatches
        enabledMatches = $enabledMatches
        actionMatches = $actionMatches
        directionMatches = $directionMatches
        profileApplies = $profileMatches
        protocolMatches = $protocolMatches
        localPortMatches = $localPortMatches
        remoteAddressMatches = $remoteAddressMatches
        effective = $effective
      }
    }
  }

  return $readbacks
}

function Test-RuleReadbackEffective {
  param([object[]]$Readbacks)

  foreach ($readback in @($Readbacks)) {
    if ($readback.effective -eq $true) {
      return $true
    }
  }

  return $false
}

function Test-ManagedRuleEffective {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$DisplayName,
    [Parameter(Mandatory = $true)][int]$ExpectedPort,
    [Parameter(Mandatory = $true)][string]$NetworkCategory
  )

  $readbacks = @(Get-ManagedRulePredicateReadback -Name $Name -DisplayName $DisplayName -ExpectedPort $ExpectedPort -NetworkCategory $NetworkCategory)
  return Test-RuleReadbackEffective -Readbacks $readbacks
}

function Assert-BellFieldLanAccessEffective {
  param(
    [Parameter(Mandatory = $true)]$Profile,
    [Parameter(Mandatory = $true)][int]$OfficePort,
    [Parameter(Mandatory = $true)][int]$ApiPort
  )

  $category = [string]$Profile.NetworkCategory
  if ($category -notin @("Private", "DomainAuthenticated")) {
    throw "BellField LAN access is not effective because the selected network profile is '$category'."
  }

  $officeReadbacks = @(Get-ManagedRulePredicateReadback -Name $officeFirewallRuleName -DisplayName $officeFirewallRuleDisplayName -ExpectedPort $OfficePort -NetworkCategory $category)
  $apiReadbacks = @(Get-ManagedRulePredicateReadback -Name $apiFirewallRuleName -DisplayName $apiFirewallRuleDisplayName -ExpectedPort $ApiPort -NetworkCategory $category)
  $officeOk = Test-RuleReadbackEffective -Readbacks $officeReadbacks
  $apiOk = Test-RuleReadbackEffective -Readbacks $apiReadbacks
  if (-not $officeOk -or -not $apiOk) {
    $diagnostic = [ordered]@{
      category = $category
      office = @{
        expectedName = $officeFirewallRuleName
        expectedDisplayName = $officeFirewallRuleDisplayName
        expectedPort = $OfficePort
        effective = $officeOk
        readback = @($officeReadbacks)
      }
      api = @{
        expectedName = $apiFirewallRuleName
        expectedDisplayName = $apiFirewallRuleDisplayName
        expectedPort = $ApiPort
        effective = $apiOk
        readback = @($apiReadbacks)
      }
    }
    $diagnosticJson = ConvertTo-BellFieldRedactedText ($diagnostic | ConvertTo-Json -Depth 8)
    throw "BellField LAN firewall rules were created but are not effective for the active '$category' profile and configured office/API ports. Predicate readback: $diagnosticJson"
  }
}

if (-not (Test-IsElevated)) {
  throw "Run configure-windows-lan-access.ps1 from an elevated PowerShell session."
}

$lines = Read-ServerEnv
$databaseUrlBefore = Read-ServerEnvValue -Lines $lines -Name "DATABASE_URL"
$officePort = [int](Read-ServerEnvValue -Lines $lines -Name "BELLFIELD_OFFICE_WEB_PORT" -Default "3000")
$apiPort = [int](Read-ServerEnvValue -Lines $lines -Name "BELLFIELD_API_PORT" -Default "3001")

$lanTarget = Select-LanTarget
$selectedProfile = Get-SelectedNetworkProfile -LanTarget $lanTarget
Assert-PrivateOrDomainProfile -Profile $selectedProfile
$selectedProfile = Get-SelectedNetworkProfile -LanTarget $lanTarget

$effectiveLanHost = if ($LanHost) { $LanHost.Trim() } else { [string]$lanTarget.IPAddress }
Assert-ValidLanHost -HostName $effectiveLanHost

$apiBaseUrl = "http://${effectiveLanHost}:$apiPort"
$officeOrigins = @(
  "http://localhost:$officePort",
  "http://127.0.0.1:$officePort",
  "http://${effectiveLanHost}:$officePort"
) -join ","

Remove-BellFieldManagedFirewallRules
New-BellFieldManagedFirewallRules -OfficePort $officePort -ApiPort $apiPort
Assert-BellFieldLanAccessEffective -Profile $selectedProfile -OfficePort $officePort -ApiPort $apiPort

$lines = Set-ServerEnvValue -Lines $lines -Name "NEXT_PUBLIC_API_BASE_URL" -Value $apiBaseUrl
$lines = Set-ServerEnvValue -Lines $lines -Name "BELLFIELD_OFFICE_ORIGINS" -Value $officeOrigins
Set-Content -LiteralPath $EnvPath -Value $lines -Encoding UTF8

$databaseUrlAfter = Read-ServerEnvValue -Lines (Read-ServerEnv) -Name "DATABASE_URL"
if ($databaseUrlAfter -ne $databaseUrlBefore) {
  throw "Refusing to continue because DATABASE_URL changed while configuring LAN access."
}

$summary = [ordered]@{
  name = "BellField Windows LAN access configuration"
  completedAt = (Get-Date).ToUniversalTime().ToString("o")
  redactionApplied = $true
  installRoot = $InstallRoot
  envPath = $EnvPath
  lanHost = $effectiveLanHost
  lanIp = [string]$lanTarget.IPAddress
  interfaceAlias = $selectedProfile.InterfaceAlias
  interfaceIndex = $selectedProfile.InterfaceIndex
  networkCategory = [string]$selectedProfile.NetworkCategory
  ports = @{
    office = $officePort
    api = $apiPort
  }
  firewallGroup = $bellFieldFirewallGroup
  firewallRules = @($managedFirewallRules)
  postgresOpened = $false
  nextPublicApiBaseUrl = $apiBaseUrl
  officeOrigins = $officeOrigins
}

Write-Host (ConvertTo-BellFieldRedactedText ($summary | ConvertTo-Json -Depth 5))
