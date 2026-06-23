# BellField LAN firewall predicate/readback helpers.
#
# Single source of truth for the managed BellField firewall rule identity and
# the predicate/readback/effectiveness logic shared by the LAN access
# configurator (configure-windows-lan-access.ps1) and the LAN evidence
# collector (collect-windows-lan-evidence.ps1). Keeping this in one dot-sourced
# file prevents the two consumers from drifting apart, which is the class of bug
# that produced the rerun-9/10 two-file fixes.
#
# These functions read firewall rules by exact -Name only. They never enumerate
# every inbound rule, so they stay fast and cannot hang on machines with large
# default firewall rule sets.

$bellFieldFirewallGroup = "BellField"
$officeFirewallRuleName = "BellField-Office-Web-TCP-Inbound"
$apiFirewallRuleName = "BellField-API-TCP-Inbound"
$officeFirewallRuleDisplayName = "BellField Office Web TCP Inbound"
$apiFirewallRuleDisplayName = "BellField API TCP Inbound"
$managedFirewallRules = @(
  @{ Name = $officeFirewallRuleName; DisplayName = $officeFirewallRuleDisplayName },
  @{ Name = $apiFirewallRuleName; DisplayName = $apiFirewallRuleDisplayName }
)

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
