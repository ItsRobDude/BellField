import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  REDACTION_SECRET_FIXTURES,
  assertNoSensitiveRedactionLeaks
} from '../install/sensitive-redaction.mjs';
import { collectUpdateProcessIds } from '../install/update-recovery.mjs';
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
    restoreHelper: readRequired('tools/install/restore-backup.mjs'),
    restoreRecovery: readRequired('tools/install/restore-recovery.mjs'),
    restoreStaging: readRequired('tools/install/restore-staging.mjs'),
    restoreStagingTest: readRequired('tools/install/restore-staging.test.mjs'),
    windowsServiceControl: readRequired('tools/install/windows-service-control.mjs'),
    updateHelper: readRequired('tools/install/update-bellfield.mjs'),
    updateEvidenceCollector: readRequired('tools/install/collect-windows-update-evidence.ps1'),
    updateEvidenceLog: readRequired('tools/install/update-evidence-log.mjs'),
    updateLock: readRequired('tools/install/update-lock.mjs'),
    updateLockTest: readRequired('tools/install/update-lock.test.mjs'),
    updateRecovery: readRequired('tools/install/update-recovery.mjs'),
    updateRecoveryTest: readRequired('tools/install/update-recovery.test.mjs'),
    gateDayAdminRunner: readRequired('tools/install/run-gate-day-admin.ps1'),
    provisionPostgres: readRequired('tools/install/provision-postgres.mjs'),
    sensitiveRedaction: readRequired('tools/install/sensitive-redaction.mjs'),
    backupService: readRequired('apps/worker/src/jobs/backup/backup-service.ts'),
    releaseBuilder: readRequired('tools/build-release.mjs'),
    releaseZipSmoke: readRequired('tools/smoke/release-zip-smoke.mjs'),
    gateDayAdminSmoke: readRequired('tools/smoke/gate-day-admin-runner-smoke.mjs'),
    packageJson: readRequired('package.json'),
    gateDayChecklist: readRequired('docs/gate-day-checklist.md'),
    installRunbook: readRequired('docs/install-runbook.md'),
    operatorRules: readRequired('docs/codex-install-test-operator-rules.md'),
    releaseUsbPreflight: readRequired('docs/release-usb-preflight-checklist.md'),
    releaseUsbCheckoff: readRequired('docs/release-usb-preflight-checkoff-template.md')
  };
  const fatalSummaryBody = extractFunctionBody(files.updateHelper, 'buildFatalSummary');
  const fatalDetailsSummaryBody = extractFunctionBody(
    files.updateHelper,
    'buildFatalDetailsSummary'
  );
  const gateDaySelfElevationBody = extractPowerShellFunctionBody(
    files.gateDayAdminRunner,
    'Invoke-SelfElevation'
  );
  const gateDayQuoteBody = extractPowerShellFunctionBody(
    files.gateDayAdminRunner,
    'Quote-ProcessArgument'
  );

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
  const powershellRedactionJsonResult = runPowerShellRedactionJsonParseCorpus();
  check(
    'PowerShell redactor preserves parseable serialized JSON with setup-token log tails',
    true,
    powershellRedactionJsonResult
  );
  const powershellProcessJsonResult = runPowerShellProcessTreeJsonCorpus();
  check(
    'PowerShell process-tree JSON corpus normalizes single-process arrays',
    true,
    powershellProcessJsonResult
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
    'Gate Day admin runner is packaged with install tooling and has a smoke command',
    files.releaseBuilder.includes("copyRequired(join(repoRoot, 'tools', 'install')") &&
      files.gateDayAdminSmoke.includes('run-gate-day-admin.ps1') &&
      files.packageJson.includes('"smoke:gate-day-admin"')
  );
  check(
    'Gate Day admin runner exposes only fixed modes and no arbitrary command parameter',
    includesAll(files.gateDayAdminRunner, [
      'ValidateSet("gate1-admin-install", "gate1-post-reboot-check", "gate2-backup-restore", "gate3-update", "collect-only")',
      '[string]$UpdateArtifactRoot',
      '[string]$BackupSet',
      '[switch]$NoSelfElevate',
      '[switch]$DryRun'
    ]) &&
      !declaresTopLevelParameter(files.gateDayAdminRunner, 'Command') &&
      !declaresTopLevelParameter(files.gateDayAdminRunner, 'EncodedCommand')
  );
  check(
    'Gate Day admin runner self-elevates once and records UAC outcomes',
    includesAll(files.gateDayAdminRunner, [
      'Start-Process -FilePath "powershell.exe" -Verb RunAs',
      '-ElevatedChild',
      'uac-requested',
      'uac-approved',
      'uac-cancelled',
      'uac-timeout',
      '$UacTimeoutSeconds'
    ])
  );
  check(
    'Gate Day admin runner UAC timeout only covers elevated child launch',
    includesAll(gateDaySelfElevationBody, [
      '$launchMarkerPath',
      '$completionMarkerPath',
      'Set-Content -LiteralPath $LaunchMarkerPath',
      'childProcessId = $launch.processId',
      'Wait-Job -Job $job | Out-Null',
      'child-exit-evidence-missing'
    ]) &&
      !gateDaySelfElevationBody.includes('Wait-Job -Job $job -Timeout $UacTimeoutSeconds') &&
      assertOrderedValue(gateDaySelfElevationBody, [
        'Start-Process -FilePath "powershell.exe" -Verb RunAs',
        'Set-Content -LiteralPath $LaunchMarkerPath',
        '$process.WaitForExit()'
      ])
  );
  check(
    'Gate Day admin runner quotes Windows child-process arguments safely',
    includesAll(gateDayQuoteBody, [
      "if ($Value -notmatch '[\\s\"]')",
      "$char -eq '\\'",
      "$char -eq '\"'",
      '$backslashes * 2',
      "[void]$quoted.Append('\\\"')"
    ]) &&
      includesAll(files.gateDayAdminSmoke, [
        'evidence root with spaces',
        'evidenceRootBase + path.sep',
        'dry-run accepts evidence root with spaces and a trailing separator'
      ])
  );
  check(
    'Gate Day admin runner writes structured JSONL evidence to USB and local logs',
    includesAll(files.gateDayAdminRunner, [
      'gate-day-admin-runner-$RunId.jsonl',
      'data\\logs\\gate-day',
      'BELLFIELD_GATE_ADMIN_LAUNCH',
      'BELLFIELD_GATE_ADMIN_STEP',
      'BELLFIELD_GATE_ADMIN_RESULT',
      'BELLFIELD_GATE_ADMIN_FAILURE',
      'AppendAllText'
    ])
  );
  check(
    'Gate Day admin runner starts a transcript and emits needs-human-action steps',
    includesAll(files.gateDayAdminRunner, [
      'Start-Transcript',
      'Stop-Transcript',
      'needs-human-action',
      'create-first-owner-in-browser',
      'create-post-backup-marker'
    ])
  );
  check(
    'Gate Day admin runner avoids first-owner setup token leakage',
    files.gateDayAdminRunner.includes('copy-first-owner-setup-token.ps1') &&
      files.gateDayAdminRunner.includes('copy-first-owner-setup-token-metadata') &&
      files.gateDayAdminRunner.includes('tokenLineCount') &&
      !files.gateDayAdminRunner.includes('-ShowToken') &&
      !files.gateDayAdminRunner.includes('setupToken')
  );
  check(
    'Gate Day admin runner uses packaged backup, restore, update, and evidence collectors',
    includesAll(files.gateDayAdminRunner, [
      'run-packaged-backup.mjs',
      'restore-backup.mjs',
      'update-bellfield.mjs',
      'collect-windows-service-evidence.ps1',
      'collect-windows-lan-evidence.ps1',
      'collect-windows-update-evidence.ps1',
      'Copy-LatestUpdateLog',
      'Get-TerminalUpdateEvent'
    ])
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
    'restore helper resets the owned database schema without CREATEDB privileges',
    includesAll(files.restoreHelper, [
      'function runRestorePreflight',
      'function resetDatabaseSchema',
      'drop schema if exists public cascade',
      'create schema public authorization',
      "'pg_restore'",
      "'--single-transaction'",
      "'--exit-on-error'"
    ]) &&
      !files.restoreHelper.includes("pgTool('dropdb'") &&
      !files.restoreHelper.includes("pgTool('createdb'") &&
      !files.restoreHelper.includes('grant usage, create on schema public') &&
      !files.restoreHelper.includes('databaseRestoreStarted') &&
      !files.restoreHelper.includes('appServicesStopped')
  );
  check(
    'restore recovery helper owns phase-based restart decisions',
    includesAll(files.restoreRecovery, [
      'export const restorePhases',
      'createRestoreRecoveryTracker',
      'decideRestoreRecovery',
      'serviceStopAttempted',
      'schemaResetComplete',
      'migrationsRun'
    ]) &&
      !files.restoreRecovery.includes('startingServices') &&
      !files.restoreRecovery.includes('markServicesStarted') &&
      files.restoreHelper.includes("from './restore-recovery.mjs'") &&
      files.restoreHelper.includes('recoveryTracker.markServiceStopAttempted();') &&
      files.restoreHelper.includes('decideRestoreRecovery(recoveryTracker.snapshot())')
  );
  assertOrdered(files.restoreHelper, 'restore helper preflights before stopping app services', [
    'runRestorePreflight({ psql, pgEnv, databaseName, username });',
    'stageDirectoryRestore({',
    'stopAppServices({ skipServices, timeoutMs: serviceTimeoutMs });',
    'resetDatabaseSchema({ psql, pgEnv, databaseName, username });'
  ]);
  assertOrdered(
    files.restoreHelper,
    'restore helper marks service stop attempt before stopping app services',
    [
      'recoveryTracker.enter(restorePhases.stoppingServices);',
      'recoveryTracker.markServiceStopAttempted();',
      'stopAppServices({ skipServices, timeoutMs: serviceTimeoutMs });'
    ]
  );
  assertOrdered(files.restoreHelper, 'restore helper marks schema reset complete after reset', [
    'recoveryTracker.enter(restorePhases.resettingSchema);',
    'resetDatabaseSchema({ psql, pgEnv, databaseName, username });',
    'recoveryTracker.enter(restorePhases.schemaResetComplete);'
  ]);
  assertOrdered(files.restoreHelper, 'restore helper checks readiness outside destructive catch', [
    'recoveryTracker.enter(restorePhases.migrationsRun);',
    'cleanupStagedRestorePaths([',
    'throw error;',
    "console.log('BellField restore data, media, license, and migrations completed.');",
    'const restoreReady = await verifyRestoreReadiness({',
    "console.log('BellField restore completed.');"
  ]);
  check(
    'restore helper exposes conservative health and service timeout flags',
    includesAll(files.restoreHelper, [
      "args['skip-health']",
      "args['health-timeout-ms']",
      "args['health-url']",
      "args['service-timeout-ms']",
      'async function waitForHealth',
      'async function verifyRestoreReadiness',
      "from './windows-service-control.mjs'",
      'startAppServices({ skipServices: input.skipServices',
      'API readiness is not confirmed yet',
      'Retrying BellField service start and API readiness check once.'
    ]) &&
      includesAll(files.windowsServiceControl, [
        "WaitForStatus('Stopped'",
        "WaitForStatus('Running'"
      ])
  );
  check(
    'restore service start is handled by readiness, not destructive recovery',
    extractFunctionBody(files.restoreHelper, 'verifyRestoreReadiness').includes(
      'startAppServices({ skipServices: input.skipServices'
    ) &&
      !files.restoreHelper.includes('recoveryTracker.enter(restorePhases.startingServices)') &&
      !files.restoreHelper.includes('recoveryTracker.markServicesStarted()')
  );
  check(
    'updater recovery helper owns phase-based recovery decisions',
    includesAll(files.updateRecovery, [
      'export const updatePhases',
      'createUpdateRecoveryTracker',
      'decideUpdateRecovery',
      'serviceStopAttempted',
      'swappingRelease',
      'releaseSwapped',
      'startingPostgres',
      'postgresStarted',
      'startingServices',
      'healthChecking'
    ]) &&
      files.updateHelper.includes("from './update-recovery.mjs'") &&
      files.updateHelper.includes('createUpdateRecoveryTracker') &&
      files.updateHelper.includes('decideUpdateRecovery(snapshotAtFailure)')
  );
  check(
    'updater owns a single active update lock for the full run',
    includesAll(files.updateLock, [
      'export function acquireUpdateLock',
      'defaultUpdateLockPath',
      'defaultUpdateLockMaxAgeMs',
      'defaultUpdateLockOwnerlessGraceMs',
      'owner.json',
      'BELLFIELD_UPDATE_LOCKED',
      'process.kill(processId, 0)',
      'removeStaleLockIfUnchanged',
      'ownersMatch',
      'owner-process-still-appears-active',
      'owner-process-identity-mismatch',
      'ownerless-lock-in-progress',
      'verifiedOwner?.ownerToken !== ownerToken'
    ]) &&
      includesAll(files.updateHelper, [
        "from './update-lock.mjs'",
        'let updateLock = null;',
        'updateLock = acquireUpdateLock({',
        'installRoot,',
        'update-lock-max-age-ms',
        'update-lock-ownerless-grace-ms',
        'getProcessSnapshot: getUpdateLockProcessSnapshot',
        'updateLock?.release();'
      ]) &&
      files.updateLockTest.includes('update lock rejects a young active updater owner') &&
      files.updateLockTest.includes('update lock removes a dead owner') &&
      files.updateLockTest.includes('PID-reused owner') &&
      files.updateLockTest.includes('unreadable command line') &&
      files.updateLockTest.includes('brand-new ownerless lock') &&
      files.updateLockTest.includes('changed during stale removal') &&
      files.updateLock.includes('manualRemediation') &&
      files.updateLock.includes('After confirming no BellField update is running')
  );
  assertOrdered(files.updateHelper, 'updater acquires lock before destructive update recovery', [
    'let updateLock = null;',
    'updateLock = acquireUpdateLock({',
    "if (error?.code === 'BELLFIELD_UPDATE_LOCKED')",
    'emitUpdateLockBlocked(error);',
    'throw error;',
    'enterUpdatePhase(recoveryTracker, updatePhases.verifying);'
  ]);
  check(
    'updater lock conflicts emit blocked output outside generic failure recovery',
    includesAll(files.updateHelper, [
      'function emitUpdateLockBlocked',
      'BELLFIELD_UPDATE_LOCKED',
      "status: 'blocked'",
      'requiresOperatorInspection',
      'manualRemediation: error.manualRemediation ?? null',
      'processSnapshot: error.processSnapshot ?? null',
      "if (error?.code === 'BELLFIELD_UPDATE_LOCKED')",
      'emitUpdateLockBlocked(error);'
    ]) &&
      orderedIndices(files.updateHelper, [
        "emitUpdateEvent('BELLFIELD_UPDATE_LOCKED'",
        'const snapshotAtFailure = recoveryTracker.snapshot();',
        'BELLFIELD_UPDATE_FAILURE'
      ]).every((index) => index !== -1)
  );
  check(
    'updater recovery tests pin both sides of the release-swap boundary',
    files.updateRecoveryTest.includes('swappingRelease is still pre-swap') &&
      files.updateRecoveryTest.includes('releaseSwapped is post-swap') &&
      files.updateRecoveryTest.includes('health failure retries service readiness')
  );
  check(
    'updater emits structured phase, failure, and result lines',
    includesAll(files.updateHelper, [
      'BELLFIELD_UPDATE_PHASE',
      'BELLFIELD_UPDATE_FAILURE',
      'BELLFIELD_UPDATE_RESULT',
      'buildFailureSummary'
    ])
  );
  check(
    'updater tees structured evidence to synchronous durable JSONL',
    includesAll(files.updateHelper, [
      "from './update-evidence-log.mjs'",
      'createUpdateEvidenceLog({ installRoot })',
      'BellField update evidence log:',
      "emitUpdateEvent('BELLFIELD_UPDATE_LOG'",
      'updateEvidenceLog.writeEvent(prefix, eventPayload)',
      'BELLFIELD_UPDATE_REJECTED',
      'BELLFIELD_UPDATE_FATAL',
      'BELLFIELD_UPDATE_FATAL_DETAILS',
      'durableTerminalUpdateEventWritten',
      'rejectUpdate(',
      'updateLogPath'
    ]) &&
      !fatalSummaryBody.includes('captureServiceStatesSafe') &&
      fatalDetailsSummaryBody.includes('captureServiceStatesSafe') &&
      assertOrderedValue(files.updateHelper, [
        "emitUpdateEvent('BELLFIELD_UPDATE_FATAL', buildFatalSummary(error));",
        "emitUpdateEvent('BELLFIELD_UPDATE_FATAL_DETAILS', buildFatalDetailsSummary(error));"
      ]) &&
      includesAll(files.updateEvidenceLog, [
        'export function createUpdateEvidenceLog',
        "join(installRoot, 'data', 'logs', 'update')",
        'openSync',
        'writeSync',
        'fsyncSync',
        'closeSync',
        'writeFatal(payload)',
        "'BELLFIELD_UPDATE_FATAL'"
      ]) &&
      !files.updateEvidenceLog.includes('createWriteStream') &&
      !files.updateHelper.includes('createWriteStream')
  );
  check(
    'Gate 3 docs require durable updater JSONL collection',
    includesAll(files.gateDayChecklist, [
      'C:\\BellField\\data\\logs\\update\\*.jsonl',
      'durable update log',
      'terminal success, failure, locked, rejected, or fatal event'
    ]) &&
      includesAll(files.installRunbook, [
        'C:\\BellField\\data\\logs\\update\\*.jsonl',
        'BELLFIELD_UPDATE_REJECTED',
        'BELLFIELD_UPDATE_FATAL',
        'BELLFIELD_UPDATE_FATAL_DETAILS',
        'durable update JSONL'
      ])
  );
  check(
    'Gate 3 update evidence collector is read-only and captures durable update state',
    includesAll(files.updateEvidenceCollector, [
      'data\\logs\\update',
      'update-*.jsonl',
      'BELLFIELD_UPDATE_RESULT',
      'BELLFIELD_UPDATE_FAILURE',
      'BELLFIELD_UPDATE_LOCKED',
      'BELLFIELD_UPDATE_REJECTED',
      'BELLFIELD_UPDATE_FATAL',
      'bellfield-build-manifest.json',
      'release.restore-stage-*',
      'release.restore-rollback-*',
      'bellfield-backup-*',
      'Get-CimInstance Win32_Service',
      'Invoke-RestMethod',
      'ConvertTo-Json'
    ]) &&
      !files.updateEvidenceCollector.includes('Start-Service') &&
      !files.updateEvidenceCollector.includes('Stop-Service') &&
      !files.updateEvidenceCollector.includes('Remove-Item')
  );
  check(
    'Gate 3 docs classify missed UAC separately and prefer update evidence collection',
    includesAll(files.gateDayChecklist, [
      'collect-windows-update-evidence.ps1',
      'missed UAC prompt',
      'terminal success, failure, locked, rejected, or fatal event',
      'attention-missed',
      'product blocker'
    ]) &&
      includesAll(files.installRunbook, [
        'collect-windows-update-evidence.ps1',
        'nonzero exit, timeout, missed UAC prompt, or quiet wrapper',
        'durable update JSONL',
        'attention-missed',
        'not proof that the packaged product failed'
      ]) &&
      includesAll(files.operatorRules, [
        'attention-missed',
        'missed UAC prompt',
        'not a product blocker by itself'
      ])
  );
  check(
    'Gate Day docs prefer the fixed-mode elevated admin runner over per-helper UAC wrappers',
    includesAll(files.gateDayChecklist, [
      'run-gate-day-admin.ps1',
      'Gate Day admin runner',
      'one UAC prompt',
      'default Gate Day path',
      'fallback reference',
      'attention-missed'
    ]) &&
      includesAll(files.installRunbook, [
        'Preferred Gate Day Elevated Runner',
        'run-gate-day-admin.ps1',
        'arbitrary commands',
        'C:\\BellField\\data\\logs\\gate-day',
        'diagnostic fallback reference',
        'successful runner mode',
        'runner JSONL/transcript plus readback evidence'
      ]) &&
      includesAll(files.operatorRules, [
        'run-gate-day-admin.ps1',
        'named BellField modes',
        'not permission to hand an elevated shell arbitrary commands',
        'single runner-launch prompt',
        'failed runner step is classified by the product state'
      ])
  );
  check(
    'Gate Day docs make runner modes the default for Gate 1, Gate 2, and Gate 3',
    includesAll(files.gateDayChecklist, [
      '-Mode gate1-admin-install',
      '-Mode gate1-post-reboot-check',
      '-Mode gate2-backup-restore',
      '-Mode gate3-update',
      'direct helper command is fallback/diagnostic only',
      'direct collector',
      'fallback/diagnostic only'
    ]) &&
      includesAll(files.installRunbook, [
        '-Mode gate1-admin-install',
        '-Mode gate2-backup-restore',
        '-Mode gate3-update',
        'direct updater command',
        'manual install recipe or diagnostic fallback',
        'collector directly only',
        'runner did not',
        'produce collector evidence'
      ])
  );
  check(
    'Release USB prep requires runner-first START-HERE instructions',
    includesAll(files.releaseUsbPreflight, [
      '`START-HERE.txt` points the scratch-machine operator at',
      'run-gate-day-admin.ps1',
      'Gate 1',
      'Gate 2',
      'Gate 3',
      'diagnostic/fallback only'
    ]) &&
      includesAll(files.releaseUsbCheckoff, [
        '`START-HERE.txt` names `run-gate-day-admin.ps1` as the default Gate Day admin path',
        'Runner modes listed for Gate 1, Gate 2, and Gate 3',
        'Per-helper `Start-Process -Verb RunAs` commands are diagnostic/fallback only'
      ])
  );
  assertOrdered(
    files.updateHelper,
    'updater stops postgres and waits for service process exit before swap',
    [
      'const postgresServiceName =',
      'const updateServicesStopOrder = [...appServicesStopOrder, postgresServiceName];',
      'enterUpdatePhase(recoveryTracker, updatePhases.stoppingServices);',
      'recoveryTracker.markServiceStopAttempted();',
      'stopUpdateServices({ skipServices, timeoutMs: serviceTimeoutMs });',
      'enterUpdatePhase(recoveryTracker, updatePhases.waitingForProcessExit);',
      'waitForCapturedProcessTreeExit(serviceProcessTree, serviceExitTimeoutMs);',
      'enterUpdatePhase(recoveryTracker, updatePhases.swappingRelease,',
      'swapStagedDirectoryWithRetry({'
    ]
  );
  assertOrdered(
    files.updateHelper,
    'updater starts postgres before migrations and app services after migrations',
    [
      'enterUpdatePhase(recoveryTracker, updatePhases.releaseSwapped,',
      'enterUpdatePhase(recoveryTracker, updatePhases.startingPostgres);',
      'startPostgresService({ skipServices, timeoutMs: serviceTimeoutMs });',
      'enterUpdatePhase(recoveryTracker, updatePhases.postgresStarted);',
      'enterUpdatePhase(recoveryTracker, updatePhases.migrating);',
      'run(nodeExe, [migrationsScript],',
      'enterUpdatePhase(recoveryTracker, updatePhases.migrationsRun);',
      'enterUpdatePhase(recoveryTracker, updatePhases.startingServices);',
      'startAppServices({ skipServices, timeoutMs: serviceTimeoutMs });'
    ]
  );
  check(
    'updater pre-swap recovery restarts postgres before app services',
    assertOrderedAfterValue(files.updateHelper, 'if (recovery.restartServices) {', [
      'if (recovery.postSwapFailure) {',
      'await retryUpdateReadiness({',
      'readinessRecovered = true;',
      '} else {',
      'startPostgresService({ skipServices, timeoutMs: serviceTimeoutMs });',
      'startAppServices({ skipServices, timeoutMs: serviceTimeoutMs });'
    ])
  );
  check(
    'updater captures service process trees before stop',
    includesAll(files.updateHelper, [
      'captureServiceProcessTree(updateServicesStopOrder)',
      'Get-CimInstance Win32_Process',
      'Get-ProcessTree',
      'collectUpdateProcessIds(serviceProcessTree)'
    ])
  );
  check(
    'restore staging helper owns bounded directory swap retry',
    includesAll(files.restoreStaging, [
      'export async function swapStagedDirectoryWithRetry',
      'const swapOnce = input.swapOnce ?? swapStagedDirectory',
      'restoreMissingTargetFromRollback',
      'isRetryableSwapError',
      'Directory swap attempt'
    ]) &&
      files.updateHelper.includes('swapStagedDirectoryWithRetry') &&
      !files.updateHelper.includes('async function swapStagedReleaseWithRetry')
  );
  check(
    'restore staging reserves stage directories atomically',
    includesAll(files.restoreStaging, [
      'reserveUniqueSiblingDirectory',
      'mkdirSync(candidate)',
      "error?.code === 'EEXIST'",
      'removePathBestEffort(stagePath, { recursive: true })'
    ]) &&
      files.restoreStagingTest.includes(
        'stageDirectoryRestore reserves unique same-stamp stage directories'
      )
  );
  check(
    'restore staging swap retry verifies helper rollback leaves a usable target or stage',
    includesAll(files.restoreStaging, [
      'if (!existsSync(input.targetPath))',
      'target could not be restored',
      'if (!existsSync(input.stagePath))',
      'staged directory is no longer available',
      'swapEvidence',
      'rollbackCandidatePath'
    ])
  );
  check(
    'restore staging rollback repair chooses highest same-stamp numeric suffix',
    includesAll(files.restoreStaging, [
      'entry.name === prefix',
      'suffix: 1',
      '/^\\d+$/.test(suffix)',
      'right.suffix - left.suffix'
    ])
  );
  check(
    'updater cleans abandoned staged releases without deleting rollback releases',
    includesAll(files.updateHelper, [
      'function cleanupStagedUpdatePath',
      ".includes('.restore-stage-')",
      'Removed abandoned staged update release',
      'cleanupStagedUpdatePath(recoveryTracker.snapshot().stagedReleasePath)'
    ]) && !files.updateHelper.includes('rmSync(rollbackReleasePath')
  );
  check(
    'updater failure summary includes recovery evidence',
    includesAll(files.updateHelper, [
      'rollbackReleasePath',
      'preUpdateBackupPath',
      'serviceStates',
      'releaseRootProcesses',
      'preRecoveryReleaseRootProcesses',
      'postRecoveryReleaseRootProcesses',
      'currentReleaseRootExists',
      'restartSkippedReason',
      'originalError',
      'recoveryError',
      'swapEvidence',
      'postSwapFailure',
      'restartAttempted',
      'restartSucceeded',
      'Do not start app services blindly'
    ])
  );
  check(
    'updater captures release-root processes before pre-swap recovery restart',
    assertOrderedAfterValue(
      files.updateHelper,
      'const snapshotAtFailure = recoveryTracker.snapshot();',
      [
        'const snapshotAtFailure = recoveryTracker.snapshot();',
        'const preRecoveryReleaseRootProcesses =',
        'captureReleaseRootProcessesSafe(currentReleaseRoot)',
        'if (recovery.restartServices) {',
        'startPostgresService({ skipServices, timeoutMs: serviceTimeoutMs });'
      ]
    )
  );
  check(
    'updater catch gates pre-swap restart on installed release root existence',
    includesAll(files.updateHelper, [
      'const currentReleaseRootExists = existsSync(currentReleaseRoot);',
      '!recovery.postSwapFailure && !currentReleaseRootExists',
      'Installed release root is missing; original app services were not restarted.',
      'restartSkippedReason'
    ])
  );
  check(
    'updater release-root diagnostics use path-boundary matching and unavailable command-line evidence',
    includesAll(files.updateHelper, [
      'function Test-CommandLineContainsReleaseRoot',
      "$next -eq '\\\\'",
      'unavailableCommandLineProcesses',
      'CommandLine unavailable',
      'matchingReleaseRootProcesses'
    ]) &&
      !files.updateHelper.includes(
        '$_.CommandLine.IndexOf($releaseRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0'
      )
  );
  check(
    'updater health failures produce post-swap rollback guidance after readiness retry',
    includesAll(files.updateRecovery, [
      'postSwapFailure: true',
      'retrying service readiness once',
      'rollback release directory',
      'pre-update backup path'
    ]) &&
      files.updateHelper.includes('readinessRecovered: true') &&
      files.updateHelper.includes('recovery.postSwapFailure')
  );
  check(
    'updater normalizes PowerShell process JSON scalar and array shapes',
    includesAll(files.updateRecovery, [
      'export function collectUpdateProcessIds',
      'export function normalizePowerShellArray',
      'normalizePowerShellArray(entry?.processes)'
    ]) && files.updateRecoveryTest.includes('collectUpdateProcessIds normalizes PowerShell scalar')
  );
  check(
    'updater does not claim fake taskkill containment for spawnSync timeouts',
    !extractFunctionBody(files.updateHelper, 'run').includes('taskkill') &&
      !extractFunctionBody(files.restoreHelper, 'run').includes('taskkill')
  );
  check(
    'updater exposes bounded timeout flags for destructive phases',
    includesAll(files.updateHelper, [
      "args['backup-timeout-ms']",
      "args['service-timeout-ms']",
      "args['service-exit-timeout-ms']",
      "args['swap-timeout-ms']",
      "args['migration-timeout-ms']",
      "args['health-timeout-ms']"
    ])
  );
  check(
    'release ZIP smoke proves restore with a non-CREATEDB app role and marker rollback',
    includesAll(files.releaseZipSmoke, [
      'appRoleCreatedb: false',
      'bellfield_restore_smoke_marker',
      'restore-foreign-cwd',
      'restore-backup.mjs',
      'markerRowsAfterRestore'
    ])
  );
  check(
    'release ZIP smoke proves media and license restore rollback with byte comparisons',
    includesAll(files.releaseZipSmoke, [
      'mkdirSync(mediaRoot, { recursive: true })',
      'restore-smoke-media-sentinel.bin',
      'restore-smoke-post-backup-only.bin',
      'backupMediaSentinelBytes',
      'restoredMediaSentinelBytes.equals(backupMediaSentinelBytes)',
      'postBackupMediaRemoved: true',
      'restoredLicenseBytes.equals(backupLicenseBytes)',
      'licenseBytesMatchBackup: true'
    ])
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

function runPowerShellRedactionJsonParseCorpus() {
  const command = findPowerShellCommand();
  if (!command) {
    if (process.platform === 'win32' || isPowerShellCorpusRequired()) {
      throw new Error(
        'PowerShell was not available for the required Windows redaction JSON corpus'
      );
    }
    return { skipped: true, reason: 'PowerShell not available on this platform' };
  }

  const redactionPath = quotePowerShellString(resolve('tools/install/evidence-redaction.ps1'));
  const script = `
$ErrorActionPreference = "Stop"
. ${redactionPath}
$secret = "setup-token-json-tail-ABC1234567890"
$payload = [pscustomobject]@{
  serviceLogTail = "before\`r\`nBellField first-owner setup token: $secret\`r\`nafter"
  nested = [pscustomobject]@{
    setupToken = $secret
  }
}
$json = $payload | ConvertTo-Json -Depth 5
$redacted = ConvertTo-BellFieldRedactedText $json
if ($redacted.Contains($secret)) {
  throw "PowerShell redaction leaked setup token inside serialized JSON"
}
$parsed = $redacted | ConvertFrom-Json
if ($null -eq $parsed.serviceLogTail -or -not $parsed.serviceLogTail.Contains("[REDACTED]")) {
  throw "Redacted setup-token log tail did not survive JSON round-trip"
}
if ($parsed.nested.setupToken -ne "[REDACTED]") {
  throw "Nested setupToken JSON field was not redacted safely"
}
$emptyTokenLine = "BellField first-owner setup token: \`r\`nNEXT-LINE-SHOULD-REMAIN"
$emptyRedacted = ConvertTo-BellFieldRedactedText $emptyTokenLine
if (-not $emptyRedacted.Contains("NEXT-LINE-SHOULD-REMAIN")) {
  throw "Empty setup-token line consumed the next evidence line"
}
Write-Host "PowerShell redaction JSON parse corpus passed"
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
    throw new Error(`Failed to run PowerShell redaction JSON corpus: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PowerShell redaction JSON corpus exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return { command };
}

function runPowerShellProcessTreeJsonCorpus() {
  const command = findPowerShellCommand();
  if (!command) {
    if (process.platform === 'win32' || isPowerShellCorpusRequired()) {
      throw new Error('PowerShell was not available for the required process-tree JSON corpus');
    }
    return { skipped: true, reason: 'PowerShell not available on this platform' };
  }

  const script = `
$ErrorActionPreference = "Stop"
function Get-ProcessTree {
  param([int]$RootPid)
  $items = @()
  $items += [pscustomobject]@{
    processId = $RootPid
    parentProcessId = 100
    name = "node.exe"
    commandLine = "C:\\BellField\\release\\runtime\\node\\node.exe"
  }
  return @($items)
}
$index = 0
$result = foreach ($name in @("bellfield-api", "bellfield-worker")) {
  $index += 1
  $processId = 200 + $index
  [pscustomobject]@{
    serviceName = $name
    serviceProcessId = 100 + $index
    processes = if ($processId -gt 0) { @(Get-ProcessTree -RootPid $processId) } else { @() }
  }
}
$result | ConvertTo-Json -Depth 8
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
    throw new Error(`Failed to run PowerShell process-tree JSON corpus: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `PowerShell process-tree JSON corpus exited with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const parsed = JSON.parse(result.stdout.trim());
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const scalarProcessEntries = entries.filter(
    (entry) => entry?.processes && !Array.isArray(entry.processes)
  );
  if (scalarProcessEntries.length === 0) {
    throw new Error('PowerShell process-tree corpus did not produce scalar processes objects');
  }
  const ids = collectUpdateProcessIds(parsed);
  if (!ids.includes(101) || !ids.includes(102) || !ids.includes(201) || !ids.includes(202)) {
    throw new Error(`Process-tree JSON normalization missed expected IDs: ${ids.join(', ')}`);
  }

  return { command, processIds: ids, scalarProcessEntryCount: scalarProcessEntries.length };
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

function extractFunctionBody(contents, name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = pattern.exec(contents);
  if (!match) {
    return '';
  }

  const openIndex = contents.indexOf('{', match.index);
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  for (let index = openIndex; index < contents.length; index += 1) {
    const char = contents[index];
    const previous = contents[index - 1];
    if (!inDoubleQuote && !inTemplate && char === "'" && previous !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (!inSingleQuote && !inTemplate && char === '"' && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote && char === '`' && previous !== '\\') {
      inTemplate = !inTemplate;
    } else if (!inSingleQuote && !inDoubleQuote && !inTemplate && char === '{') {
      depth += 1;
    } else if (!inSingleQuote && !inDoubleQuote && !inTemplate && char === '}') {
      depth -= 1;
      if (depth === 0) {
        return contents.slice(openIndex + 1, index);
      }
    }
  }

  return '';
}

function extractPowerShellFunctionBody(contents, name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\{`);
  const match = pattern.exec(contents);
  if (!match) {
    return '';
  }

  const openIndex = contents.indexOf('{', match.index);
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
    } else if (!inSingleQuote && !inDoubleQuote && char === '{') {
      depth += 1;
    } else if (!inSingleQuote && !inDoubleQuote && char === '}') {
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

function assertOrderedValue(contents, anchors) {
  return orderedIndices(contents, anchors).every((index) => index !== -1);
}

function assertOrderedAfterValue(contents, startAnchor, anchors) {
  const startIndex = contents.indexOf(startAnchor);
  return startIndex !== -1 && assertOrderedValue(contents.slice(startIndex), anchors);
}

function assertOrdered(contents, name, anchors) {
  const indices = orderedIndices(contents, anchors);
  const missing = anchors.filter((_, index) => indices[index] === -1);
  check(name, missing.length === 0, { anchors, indices, missing });
}

function orderedIndices(contents, anchors) {
  let searchFrom = 0;
  return anchors.map((anchor) => {
    const index = contents.indexOf(anchor, searchFrom);
    if (index !== -1) {
      searchFrom = index + anchor.length;
    }
    return index;
  });
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
