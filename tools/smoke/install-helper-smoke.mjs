import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  REDACTION_SECRET_FIXTURES,
  assertNoSensitiveRedactionLeaks
} from '../install/sensitive-redaction.mjs';
import { writeSmokeEvidence } from './smoke-evidence.mjs';

const evidence = {
  name: 'Install helper smoke',
  startedAt: new Date().toISOString(),
  checks: []
};

try {
  const files = {
    redaction: readRequired('tools/install/evidence-redaction.ps1'),
    serviceCollector: readRequired('tools/install/collect-windows-service-evidence.ps1'),
    installer: readRequired('tools/install/install-windows-services.ps1'),
    baselineCollector: readRequired('tools/install/collect-windows-install-baseline.ps1'),
    lanCollector: readRequired('tools/install/collect-windows-lan-evidence.ps1'),
    lanConfigurator: readRequired('tools/install/configure-windows-lan-access.ps1'),
    lanPredicates: readRequired('tools/install/lan-firewall-predicates.ps1'),
    lanCleanup: readRequired('tools/install/remove-windows-lan-access.ps1'),
    migrationHelper: readRequired('tools/install/run-packaged-migrations.mjs'),
    backupHelper: readRequired('tools/install/run-packaged-backup.mjs'),
    provisionPostgres: readRequired('tools/install/provision-postgres.mjs'),
    sensitiveRedaction: readRequired('tools/install/sensitive-redaction.mjs'),
    backupService: readRequired('apps/worker/src/jobs/backup/backup-service.ts'),
    releaseBuilder: readRequired('tools/build-release.mjs'),
    releaseZipSmoke: readRequired('tools/smoke/release-zip-smoke.mjs')
  };

  assertNoSensitiveRedactionLeaks();
  check('shared JS redactor removes every redaction fixture secret', true, {
    fixtureCount: REDACTION_SECRET_FIXTURES.length
  });
  const powershellRedactionResult = runPowerShellRedactionCorpus();
  check(
    'PowerShell redactor removes every redaction fixture secret',
    true,
    powershellRedactionResult
  );

  check(
    'redaction helper defines ConvertTo-BellFieldRedactedText',
    files.redaction.includes('function ConvertTo-BellFieldRedactedText')
  );
  for (const pattern of [
    'BellField first-owner setup token',
    'DATABASE_URL',
    'BELLFIELD_RELAY_TOKEN',
    'BELLFIELD_MEDIA_TOKEN_SECRET',
    'setupToken',
    'sessionToken',
    'PRIVATE KEY',
    'bfrt1_',
    'Bearer'
  ]) {
    check(`redaction helper covers ${pattern}`, files.redaction.includes(pattern));
  }
  check(
    'shared JS redaction helper is used by install/runtime smokes',
    files.migrationHelper.includes("from './sensitive-redaction.mjs'") &&
      files.backupHelper.includes("from './sensitive-redaction.mjs'") &&
      files.releaseZipSmoke.includes("from '../install/sensitive-redaction.mjs'")
  );

  for (const [name, contents] of Object.entries({
    serviceCollector: files.serviceCollector,
    installer: files.installer,
    baselineCollector: files.baselineCollector,
    lanCollector: files.lanCollector,
    lanConfigurator: files.lanConfigurator,
    lanCleanup: files.lanCleanup
  })) {
    check(
      `${name} dot-sources evidence redaction helper`,
      contents.includes('evidence-redaction.ps1')
    );
    check(
      `${name} calls ConvertTo-BellFieldRedactedText`,
      contents.includes('ConvertTo-BellFieldRedactedText')
    );
  }

  check(
    'service collector marks redaction as applied',
    files.serviceCollector.includes('redactionApplied = $true')
  );
  check(
    'service collector redacts command captures',
    files.serviceCollector.includes('Invoke-CaptureText') &&
      files.serviceCollector.includes('text = ConvertTo-BellFieldRedactedText')
  );
  check(
    'service collector redacts service log tails',
    files.serviceCollector.includes('tail = ConvertTo-BellFieldRedactedText')
  );
  check(
    'service collector redacts SCM event messages',
    files.serviceCollector.includes('message = ConvertTo-BellFieldRedactedText')
  );
  check(
    'installer redacts service failure log tails',
    files.installer.includes('Get-ServiceLogTail') &&
      files.installer.includes('ConvertTo-BellFieldRedactedText ($sections -join')
  );

  check(
    'baseline collector exposes expected parameters',
    declaresTopLevelParameter(files.baselineCollector, 'InstallRoot') &&
      declaresTopLevelParameter(files.baselineCollector, 'UsbRoot') &&
      declaresTopLevelParameter(files.baselineCollector, 'OutputPath')
  );
  check(
    'baseline collector writes JSON evidence',
    files.baselineCollector.includes('ConvertTo-Json') &&
      files.baselineCollector.includes('Set-Content')
  );
  check(
    'baseline collector captures OS, network, services, paths, and disks',
    includesAll(files.baselineCollector, [
      'Get-OsSummary',
      'Get-NetConnectionProfile',
      'Get-NetIPAddress',
      'Get-BellFieldServices',
      'Get-DriveSummary',
      'installPaths'
    ])
  );
  check(
    'baseline collector assignment-wraps repeated JSON fields as arrays',
    includesAll(files.baselineCollector, [
      'networkProfiles = @(Get-NetworkProfiles)',
      'ipv4Addresses = @(Get-Ipv4Addresses)',
      'bellfieldServices = @(Get-BellFieldServices)',
      'installPaths = @(Get-PathSummary -Paths $paths)'
    ])
  );
  check(
    'baseline collector handles UNC and drive-root failures as structured evidence',
    files.baselineCollector.includes('pathType = "unc"') &&
      files.baselineCollector.includes('Split-Path -Qualifier $Path -ErrorAction Stop') &&
      files.baselineCollector.includes('pathType = "relative-or-provider"')
  );

  check(
    'LAN collector exposes expected parameters',
    declaresTopLevelParameter(files.lanCollector, 'InstallRoot') &&
      declaresTopLevelParameter(files.lanCollector, 'OfficePort') &&
      declaresTopLevelParameter(files.lanCollector, 'ApiPort') &&
      declaresTopLevelParameter(files.lanCollector, 'LanIp') &&
      declaresTopLevelParameter(files.lanCollector, 'OutputPath') &&
      declaresTopLevelParameter(files.lanCollector, 'TimeoutSeconds')
  );
  check(
    'LAN access configurator exposes expected parameters',
    declaresTopLevelParameter(files.lanConfigurator, 'InstallRoot') &&
      declaresTopLevelParameter(files.lanConfigurator, 'EnvPath') &&
      declaresTopLevelParameter(files.lanConfigurator, 'LanHost') &&
      declaresTopLevelParameter(files.lanConfigurator, 'LanIp') &&
      declaresTopLevelParameter(files.lanConfigurator, 'SetCurrentNetworkPrivate')
  );
  check(
    'LAN access helpers are packaged with install tooling',
    files.releaseBuilder.includes("copyRequired(join(repoRoot, 'tools', 'install')")
  );
  check(
    'LAN access configurator reads office and API ports from server env',
    includesAll(files.lanConfigurator, ['BELLFIELD_OFFICE_WEB_PORT', 'BELLFIELD_API_PORT'])
  );
  check(
    'LAN configurator and collector dot-source the shared firewall predicate helper',
    files.lanConfigurator.includes('lan-firewall-predicates.ps1') &&
      files.lanConfigurator.includes('. $lanPredicatesHelper') &&
      files.lanCollector.includes('lan-firewall-predicates.ps1') &&
      files.lanCollector.includes('. $lanPredicatesHelper')
  );
  check(
    'shared firewall predicate helper centralizes managed rule constants and readback',
    includesAll(files.lanPredicates, [
      '$bellFieldFirewallGroup = "BellField"',
      'BellField-Office-Web-TCP-Inbound',
      'BellField-API-TCP-Inbound',
      'BellField Office Web TCP Inbound',
      'BellField API TCP Inbound',
      'function Test-RuleProfileApplies',
      'function Test-PortFilterMatches',
      'function Test-RemoteAddressAllowsLocalSubnet',
      'function Get-ManagedRulePredicateReadback',
      'function Test-RuleReadbackEffective',
      'function Test-ManagedRuleEffective'
    ])
  );
  check(
    'shared firewall predicate helper reads remote scope from address filters',
    files.lanPredicates.includes('Get-NetFirewallAddressFilter')
  );
  check(
    'LAN helpers do not read remote firewall scope from port filters',
    !files.lanConfigurator.includes('$portFilter.RemoteAddress') &&
      !files.lanCollector.includes('$portFilter.RemoteAddress') &&
      !files.lanPredicates.includes('$portFilter.RemoteAddress')
  );
  check(
    'shared firewall predicate helper never enumerates all inbound rules',
    !files.lanPredicates.includes('-Direction Inbound')
  );
  const powershellLanEnvLineResult = runPowerShellLanEnvLineCorpus();
  check(
    'LAN access configurator env helpers tolerate blank env separator lines',
    true,
    powershellLanEnvLineResult
  );
  const powershellLanFirewallResult = runPowerShellLanFirewallCorpus();
  check(
    'LAN access configurator firewall predicate helpers use address-filter readback',
    true,
    powershellLanFirewallResult
  );
  check(
    'LAN access configurator writes LAN-safe office/API URLs only',
    includesAll(files.lanConfigurator, [
      'NEXT_PUBLIC_API_BASE_URL',
      'BELLFIELD_OFFICE_ORIGINS',
      'http://localhost:$officePort',
      'http://127.0.0.1:$officePort',
      'http://${effectiveLanHost}:$officePort',
      'http://${effectiveLanHost}:$apiPort'
    ])
  );
  check(
    'LAN access helpers do not open PostgreSQL',
    !files.lanConfigurator.includes('5432') && !files.lanCleanup.includes('5432')
  );
  check(
    'LAN access configurator creates managed rules with LAN-safe firewall flags',
    includesAll(files.lanConfigurator, [
      '-Name $officeFirewallRuleName',
      '-Name $apiFirewallRuleName',
      'RemoteAddress LocalSubnet',
      'Profile Private,Domain',
      'Protocol TCP'
    ])
  );
  check(
    'LAN access configurator recreates managed firewall rules before proving effectiveness',
    files.lanConfigurator.includes(
      [
        'Remove-BellFieldManagedFirewallRules',
        'New-BellFieldManagedFirewallRules -OfficePort $officePort -ApiPort $apiPort',
        'Assert-BellFieldLanAccessEffective -Profile $selectedProfile -OfficePort $officePort -ApiPort $apiPort'
      ].join('\n')
    )
  );
  check(
    'LAN access configurator fails Public profiles unless explicit private-profile consent is passed',
    includesAll(files.lanConfigurator, [
      'NetworkCategory Private',
      'SetCurrentNetworkPrivate',
      'Public',
      'Copyable command'
    ]) && !files.lanConfigurator.includes('AllowPublicLanAccess')
  );
  check(
    'LAN access configurator proves rule effectiveness for the active profile',
    includesAll(files.lanConfigurator, [
      'Assert-BellFieldLanAccessEffective',
      'Get-ManagedRulePredicateReadback',
      'Test-RuleReadbackEffective',
      'DomainAuthenticated'
    ])
  );
  check(
    'LAN access cleanup removes only exact BellField managed firewall rule names',
    includesAll(files.lanCleanup, [
      'BellField-Office-Web-TCP-Inbound',
      'BellField-API-TCP-Inbound',
      'BellField Office Web TCP Inbound',
      'BellField API TCP Inbound',
      'Get-NetFirewallRule -Name $managedRule.Name',
      'Remove-NetFirewallRule -InputObject $rule'
    ]) && !files.lanCleanup.includes('Remove-NetFirewallRule -Group')
  );
  check(
    'LAN collector writes JSON evidence',
    files.lanCollector.includes('ConvertTo-Json') && files.lanCollector.includes('Set-Content')
  );
  check(
    'LAN collector is evidence-only for firewall/profile state',
    !files.lanCollector.includes('New-NetFirewallRule') &&
      !files.lanCollector.includes('Set-NetFirewallRule') &&
      !files.lanCollector.includes('Set-NetConnectionProfile')
  );
  check(
    'LAN collector captures listeners and local-origin URL checks',
    includesAll(files.lanCollector, ['Get-NetTCPConnection', 'Invoke-WebRequest'])
  );
  check(
    'LAN collector reads firewall state only through the shared exact-name readback',
    files.lanCollector.includes('Get-ManagedRulePredicateReadback') &&
      files.lanCollector.includes('Test-RuleReadbackEffective') &&
      !files.lanCollector.includes('-Direction Inbound')
  );
  check(
    'LAN collector reports effective managed firewall access with honest scope',
    includesAll(files.lanCollector, [
      'effectiveLanAccess',
      'effectiveLanAccessReasons',
      'activeNetworkProfile',
      'firewallReadbackScope = "bellfield-managed-rules"',
      '$officeFirewallRuleName',
      '$apiFirewallRuleName'
    ])
  );
  check(
    'LAN collector labels URL probes as local-origin only',
    files.lanCollector.includes('localOriginUrlChecks') &&
      files.lanCollector.includes('origin = "installed-pc"') &&
      files.lanCollector.includes('provesRemoteReachability = $false') &&
      !files.lanCollector.includes('localUrlChecks =')
  );
  check(
    'LAN collector assignment-wraps repeated JSON fields as arrays',
    includesAll(files.lanCollector, [
      'networkProfiles = @(Get-NetworkProfiles)',
      'candidateIpv4Addresses = @($candidates)',
      'listeners = @(Get-Listeners -Ports $ports)',
      'localOriginUrlChecks = @($localOriginChecks)',
      'inboundFirewallRules = @($effective.managedRuleReadback)',
      'effectiveLanAccessReasons = @($effective.effectiveLanAccessReasons)'
    ])
  );
  check(
    'LAN collector writes progress markers and partial JSON with a terminal status',
    includesAll(files.lanCollector, [
      'function Add-LanEvidenceStep',
      'function Save-LanEvidence',
      'Save-LanEvidence -Status "started"',
      'Save-LanEvidence -Status "completed"',
      'Save-LanEvidence -Status "failed"',
      'exit 1'
    ])
  );

  check(
    'migration helper uses pg_ctl with -l logfile',
    files.migrationHelper.includes("'pg_ctl'") &&
      files.migrationHelper.includes("'-l'") &&
      files.migrationHelper.includes('manual-postgres-migrations.log')
  );
  check(
    'migration helper checks existing pg_ctl status before start',
    files.migrationHelper.includes("'status'") &&
      files.migrationHelper.includes('PostgreSQL already appears to be running')
  );
  assertOrdered(
    files.migrationHelper,
    'migration helper runs packaged API migrations between start and stop',
    ['postgresLog,', 'runCommand(process.execPath, [migrationScript]', 'stopPostgres();']
  );
  check(
    'migration helper uses current Node runtime for migrations',
    files.migrationHelper.includes('runCommand(process.execPath, [migrationScript]')
  );
  check(
    'migration helper redacts failure output',
    files.migrationHelper.includes("from './sensitive-redaction.mjs'") &&
      files.migrationHelper.includes('redactSensitiveText') &&
      files.migrationHelper.includes('redacted PostgreSQL log tail')
  );
  check(
    'migration helper only stops PostgreSQL it started',
    files.migrationHelper.includes('let startedPostgres = false') &&
      files.migrationHelper.includes('if (startedPostgres)')
  );
  check(
    'migration helper uses explicit pg_ctl stop timeout and status evidence on stop failure',
    files.migrationHelper.includes("args['stop-timeout-ms']") &&
      files.migrationHelper.includes("'-t', String(stopTimeoutSeconds)") &&
      files.migrationHelper.includes('printStopFailureEvidence') &&
      files.migrationHelper.includes('redacted PostgreSQL status after failed stop')
  );
  check(
    'backup helper loads packaged env and points manual backup at packaged pg_dump',
    includesAll(files.backupHelper, [
      'parseEnvFile(envPath)',
      'run-backup-cli.js',
      'BELLFIELD_POSTGRES_BIN',
      'BELLFIELD_PG_DUMP_PATH',
      'pg_dump.exe',
      'BELLFIELD_BACKUP_RESULT'
    ])
  );
  check(
    'backup helper redacts failure output',
    files.backupHelper.includes("from './sensitive-redaction.mjs'") &&
      files.backupHelper.includes('redactSensitiveText') &&
      files.backupHelper.includes('redacted backup output tail')
  );
  check(
    'worker backup pg_dump resolver uses module-relative packaged path, not process cwd',
    files.backupService.includes('moduleDirectory = __dirname') &&
      files.backupService.includes("'..', '..', '..', '..', '..', 'postgres', 'bin'") &&
      !files.backupService.includes('process.cwd()')
  );
  check(
    'release ZIP smoke proves manual backup without injected PostgreSQL tool env from foreign cwd',
    files.releaseZipSmoke.includes('delete serverEnv.BELLFIELD_POSTGRES_BIN') &&
      files.releaseZipSmoke.includes('delete serverEnv.BELLFIELD_PG_DUMP_PATH') &&
      files.releaseZipSmoke.includes('manual-backup-foreign-cwd') &&
      files.releaseZipSmoke.includes('postgresToolEnvInjected: false') &&
      !files.releaseZipSmoke.includes('BELLFIELD_POSTGRES_BIN: postgresBin')
  );

  check(
    'provision-postgres uses pg_ctl -l for temporary start',
    files.provisionPostgres.includes('postgres-provision.log') &&
      files.provisionPostgres.includes("'-l'") &&
      files.provisionPostgres.includes('postgresLog')
  );

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'install-helper-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'install-helper-smoke.json')}`);
  process.exitCode = 1;
}

function readRequired(relativePath) {
  const path = resolve(relativePath);
  check(`${relativePath} exists`, existsSync(path), { path });
  return readFileSync(path, 'utf8');
}

function runPowerShellRedactionCorpus() {
  const command = findPowerShellCommand();
  if (!command) {
    if (process.platform === 'win32' || isPowerShellCorpusRequired()) {
      throw new Error('PowerShell was not available for the required Windows redaction corpus');
    }
    return { skipped: true, reason: 'PowerShell not available on this platform' };
  }

  const encodedFixtures = Buffer.from(JSON.stringify(REDACTION_SECRET_FIXTURES), 'utf8').toString(
    'base64'
  );
  const redactionPath = quotePowerShellString(resolve('tools/install/evidence-redaction.ps1'));
  const script = `
$ErrorActionPreference = "Stop"
. ${redactionPath}
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${encodedFixtures}"))
$fixtures = $json | ConvertFrom-Json
foreach ($fixture in $fixtures) {
  $redacted = ConvertTo-BellFieldRedactedText $fixture.input
  foreach ($secret in @($fixture.secrets)) {
    $secretText = [string]$secret
    if ($redacted.Contains($secretText)) {
      throw "PowerShell redaction leaked fixture '$($fixture.name)'"
    }
  }
}
Write-Host "PowerShell redaction corpus passed"
`;
  const result = spawnSync(
    command,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000
    }
  );
  if (result.error) {
    throw new Error(`Failed to run PowerShell redaction corpus: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PowerShell redaction corpus exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return { command, fixtureCount: REDACTION_SECRET_FIXTURES.length };
}

function runPowerShellLanEnvLineCorpus() {
  const command = findPowerShellCommand();
  if (!command) {
    if (process.platform === 'win32' || isPowerShellCorpusRequired()) {
      throw new Error('PowerShell was not available for the required Windows LAN env-line corpus');
    }
    return { skipped: true, reason: 'PowerShell not available on this platform' };
  }

  const configuratorPath = quotePowerShellString(
    resolve('tools/install/configure-windows-lan-access.ps1')
  );
  const script = `
$ErrorActionPreference = "Stop"
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(${configuratorPath}, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
  throw "Failed to parse configure-windows-lan-access.ps1"
}
$wanted = @("Read-ServerEnvValue", "Set-ServerEnvValue")
$functions = @($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $wanted -contains $node.Name
}, $true))
foreach ($name in $wanted) {
  if (-not ($functions | Where-Object { $_.Name -eq $name })) {
    throw "Missing function $name"
  }
}
foreach ($function in $functions) {
  Invoke-Expression $function.Extent.Text
}
$lines = @(
  "NODE_ENV=production",
  "",
  "BELLFIELD_API_PORT=3001",
  "DATABASE_URL=redacted-database-url",
  "",
  "BELLFIELD_OFFICE_WEB_PORT=3000",
  "NEXT_PUBLIC_API_BASE_URL=http://localhost:3001"
)
$databaseUrl = Read-ServerEnvValue -Lines $lines -Name "DATABASE_URL"
if ($databaseUrl -ne "redacted-database-url") {
  throw "Read-ServerEnvValue did not return DATABASE_URL"
}
$updated = @(Set-ServerEnvValue -Lines $lines -Name "NEXT_PUBLIC_API_BASE_URL" -Value "http://192.168.50.10:3001")
if (-not ($updated -contains "")) {
  throw "Set-ServerEnvValue did not preserve blank separator lines"
}
if (-not ($updated -contains "NEXT_PUBLIC_API_BASE_URL=http://192.168.50.10:3001")) {
  throw "Set-ServerEnvValue did not update NEXT_PUBLIC_API_BASE_URL"
}
Write-Host "PowerShell LAN env-line corpus passed"
`;
  const result = spawnSync(
    command,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000
    }
  );
  if (result.error) {
    throw new Error(`Failed to run PowerShell LAN env-line corpus: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PowerShell LAN env-line corpus exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return { command };
}

function runPowerShellLanFirewallCorpus() {
  const command = findPowerShellCommand();
  if (!command) {
    if (process.platform === 'win32' || isPowerShellCorpusRequired()) {
      throw new Error('PowerShell was not available for the required Windows LAN firewall corpus');
    }
    return { skipped: true, reason: 'PowerShell not available on this platform' };
  }

  const predicatesPath = quotePowerShellString(
    resolve('tools/install/lan-firewall-predicates.ps1')
  );
  const collectorPath = quotePowerShellString(
    resolve('tools/install/collect-windows-lan-evidence.ps1')
  );
  const script = `
$ErrorActionPreference = "Stop"
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(${predicatesPath}, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
  throw "Failed to parse lan-firewall-predicates.ps1"
}
$wanted = @(
  "Test-RuleProfileApplies",
  "Test-PortFilterMatches",
  "Test-RemoteAddressAllowsLocalSubnet",
  "Get-ManagedRulePredicateReadback",
  "Test-RuleReadbackEffective",
  "Test-ManagedRuleEffective"
)
$functions = @($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $wanted -contains $node.Name
}, $true))
foreach ($name in $wanted) {
  if (-not ($functions | Where-Object { $_.Name -eq $name })) {
    throw "Missing function $name"
  }
}
foreach ($function in $functions) {
  Invoke-Expression $function.Extent.Text
}

$collectorTokens = $null
$collectorErrors = $null
$collectorAst = [System.Management.Automation.Language.Parser]::ParseFile(${collectorPath}, [ref]$collectorTokens, [ref]$collectorErrors)
if ($collectorErrors -and $collectorErrors.Count -gt 0) {
  throw "Failed to parse collect-windows-lan-evidence.ps1"
}
$collectorFunction = $collectorAst.Find({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Get-EffectiveLanAccess"
}, $true)
if (-not $collectorFunction) {
  throw "Missing collector function Get-EffectiveLanAccess"
}
Invoke-Expression $collectorFunction.Extent.Text

$script:RuleName = "BellField-Office-Web-TCP-Inbound"
$script:RuleDisplayName = "BellField Office Web TCP Inbound"
$officeFirewallRuleName = "BellField-Office-Web-TCP-Inbound"
$apiFirewallRuleName = "BellField-API-TCP-Inbound"
$officeFirewallRuleDisplayName = "BellField Office Web TCP Inbound"
$apiFirewallRuleDisplayName = "BellField API TCP Inbound"
$script:FirewallRules = @()
$script:PortFilters = @{}
$script:AddressFilters = @{}

function Get-NetFirewallRule {
  param([string]$Name, [string]$Direction, [object]$ErrorAction)
  if ($Direction) {
    throw "Broad Get-NetFirewallRule -Direction enumeration is not allowed in the managed readback path"
  }
  return @($script:FirewallRules | Where-Object { $_.Name -eq $Name })
}

function Get-NetFirewallPortFilter {
  param($AssociatedNetFirewallRule, [object]$ErrorAction)
  if ($script:PortFilters.ContainsKey($AssociatedNetFirewallRule.Name)) {
    return @($script:PortFilters[$AssociatedNetFirewallRule.Name])
  }
  return @()
}

function Get-NetFirewallAddressFilter {
  param($AssociatedNetFirewallRule, [object]$ErrorAction)
  if ($script:AddressFilters.ContainsKey($AssociatedNetFirewallRule.Name)) {
    return @($script:AddressFilters[$AssociatedNetFirewallRule.Name])
  }
  return @()
}

function Set-FirewallCase {
  param(
    [string]$Enabled = "True",
    [string]$Action = "Allow",
    [string]$Direction = "Inbound",
    [string]$Profile = "Private, Domain",
    [string]$Protocol = "TCP",
    [object]$LocalPort = "3000",
    [object]$RemoteAddress = "LocalSubnet",
    [string]$DisplayName = $script:RuleDisplayName
  )

  $script:FirewallRules = @([pscustomobject]@{
    Name = $script:RuleName
    DisplayName = $DisplayName
    Enabled = $Enabled
    Action = $Action
    Direction = $Direction
    Profile = $Profile
  })
  $script:PortFilters = @{
    $script:RuleName = @([pscustomobject]@{
      Protocol = $Protocol
      LocalPort = $LocalPort
    })
  }
  $script:AddressFilters = @{
    $script:RuleName = @([pscustomobject]@{
      LocalAddress = "Any"
      RemoteAddress = $RemoteAddress
    })
  }
}

function Set-OfficeApiFirewallCase {
  $script:FirewallRules = @(
    [pscustomobject]@{
      Name = $officeFirewallRuleName
      DisplayName = $officeFirewallRuleDisplayName
      Enabled = "True"
      Action = "Allow"
      Direction = "Inbound"
      Profile = "Private, Domain"
    },
    [pscustomobject]@{
      Name = $apiFirewallRuleName
      DisplayName = $apiFirewallRuleDisplayName
      Enabled = "True"
      Action = "Allow"
      Direction = "Inbound"
      Profile = "Private, Domain"
    }
  )
  $script:PortFilters = @{
    $officeFirewallRuleName = @([pscustomobject]@{
      Protocol = "TCP"
      LocalPort = "3000"
    })
    $apiFirewallRuleName = @([pscustomobject]@{
      Protocol = "TCP"
      LocalPort = "3001"
    })
  }
  $script:AddressFilters = @{
    $officeFirewallRuleName = @([pscustomobject]@{
      LocalAddress = "Any"
      RemoteAddress = "LocalSubnet"
    })
    $apiFirewallRuleName = @([pscustomobject]@{
      LocalAddress = "Any"
      RemoteAddress = "LocalSubnet"
    })
  }
}

function Assert-Effective {
  param(
    [string]$CaseName,
    [bool]$Expected,
    [string]$NetworkCategory = "Private"
  )

  $actual = Test-ManagedRuleEffective -Name $script:RuleName -DisplayName $script:RuleDisplayName -ExpectedPort 3000 -NetworkCategory $NetworkCategory
  if ($actual -ne $Expected) {
    $readback = @(Get-ManagedRulePredicateReadback -Name $script:RuleName -DisplayName $script:RuleDisplayName -ExpectedPort 3000 -NetworkCategory $NetworkCategory)
    throw "$CaseName expected $Expected but got $actual. Readback: $($readback | ConvertTo-Json -Depth 8)"
  }
}

Set-FirewallCase
Assert-Effective -CaseName "happy path" -Expected $true

Set-FirewallCase -Profile "Domain"
Assert-Effective -CaseName "domain profile" -Expected $true -NetworkCategory "DomainAuthenticated"

Set-FirewallCase -Profile "Any"
Assert-Effective -CaseName "any profile" -Expected $false

Set-FirewallCase -Profile "Public,Private"
Assert-Effective -CaseName "public plus private profile" -Expected $false

Set-FirewallCase -LocalPort "3002"
Assert-Effective -CaseName "wrong port" -Expected $false

Set-FirewallCase -Enabled "False"
Assert-Effective -CaseName "disabled rule" -Expected $false

Set-FirewallCase -Profile "Public"
Assert-Effective -CaseName "wrong profile" -Expected $false

Set-FirewallCase -Protocol "UDP"
Assert-Effective -CaseName "wrong protocol" -Expected $false

Set-FirewallCase -Direction "Outbound"
Assert-Effective -CaseName "wrong direction" -Expected $false

Set-FirewallCase -RemoteAddress "Any"
Assert-Effective -CaseName "overbroad remote address" -Expected $false

Set-FirewallCase -RemoteAddress "Any, LocalSubnet"
Assert-Effective -CaseName "combined remote address" -Expected $false

Set-FirewallCase -RemoteAddress @("Any", "LocalSubnet")
Assert-Effective -CaseName "combined remote address array" -Expected $false

Set-FirewallCase -DisplayName "Unexpected BellField Rule"
Assert-Effective -CaseName "wrong display name" -Expected $false

Set-FirewallCase
$script:FirewallRules = @()
Assert-Effective -CaseName "missing rule" -Expected $false

Set-OfficeApiFirewallCase
$missingProfileResult = Get-EffectiveLanAccess -ActiveProfile $null -OfficePort 3000 -ApiPort 3001
if ($missingProfileResult.effectiveLanAccess -ne $false -or @($missingProfileResult.managedRuleReadback).Count -lt 2) {
  throw "Missing active profile did not preserve exact managed rule readback: $($missingProfileResult | ConvertTo-Json -Depth 8)"
}

$failedProfileResult = Get-EffectiveLanAccess -ActiveProfile @{ ok = $false; error = "profile unavailable" } -OfficePort 3000 -ApiPort 3001
if ($failedProfileResult.effectiveLanAccess -ne $false -or @($failedProfileResult.managedRuleReadback).Count -lt 2) {
  throw "Failed active profile did not preserve exact managed rule readback: $($failedProfileResult | ConvertTo-Json -Depth 8)"
}

Write-Host "PowerShell LAN firewall corpus passed"
`;
  const result = spawnSync(
    command,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000
    }
  );
  if (result.error) {
    throw new Error(`Failed to run PowerShell LAN firewall corpus: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PowerShell LAN firewall corpus exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return { command, cases: 16 };
}

function findPowerShellCommand() {
  const candidates = process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh'];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return null;
}

function isPowerShellCorpusRequired() {
  const value = String(process.env.BELLFIELD_REQUIRE_POWERSHELL_CORPUS ?? '').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function quotePowerShellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function declaresTopLevelParameter(contents, name) {
  return new RegExp(`\\$${name}\\b`).test(extractTopLevelParamBlock(contents));
}

function extractTopLevelParamBlock(contents) {
  const paramMatch = /^\s*param\s*\(/m.exec(contents);
  if (!paramMatch) {
    return '';
  }

  const openIndex = contents.indexOf('(', paramMatch.index);
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = openIndex; index < contents.length; index += 1) {
    const char = contents[index];
    const previous = contents[index - 1];
    if (!inDoubleQuote && char === "'" && previous !== '`') {
      inSingleQuote = !inSingleQuote;
    } else if (!inSingleQuote && char === '"' && previous !== '`') {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote && char === '(') {
      depth += 1;
    } else if (!inSingleQuote && !inDoubleQuote && char === ')') {
      depth -= 1;
      if (depth === 0) {
        return contents.slice(openIndex + 1, index);
      }
    }
  }

  return '';
}

function includesAll(contents, needles) {
  return needles.every((needle) => contents.includes(needle));
}

function assertOrdered(contents, name, anchors) {
  const indices = anchors.map((anchor) => contents.indexOf(anchor));
  const missing = anchors.filter((_, index) => indices[index] === -1);
  const ordered = indices.every(
    (index, position) => position === 0 || indices[position - 1] < index
  );
  check(name, missing.length === 0 && ordered, { anchors, indices, missing });
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
