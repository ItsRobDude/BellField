param()

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

if (-not (Test-IsElevated)) {
  throw "Run remove-windows-lan-access.ps1 from an elevated PowerShell session."
}

$removed = @()
foreach ($managedRule in $managedFirewallRules) {
  $rules = @(Get-NetFirewallRule -Name $managedRule.Name -ErrorAction SilentlyContinue)
  foreach ($rule in $rules) {
    Remove-NetFirewallRule -InputObject $rule -ErrorAction Stop
    $removed += $managedRule.DisplayName
  }
}

$summary = [ordered]@{
  name = "BellField Windows LAN access removal"
  completedAt = (Get-Date).ToUniversalTime().ToString("o")
  redactionApplied = $true
  firewallGroup = $bellFieldFirewallGroup
  managedRules = @($managedFirewallRules)
  removedRuleNames = @($removed)
}

Write-Host (ConvertTo-BellFieldRedactedText ($summary | ConvertTo-Json -Depth 4))
