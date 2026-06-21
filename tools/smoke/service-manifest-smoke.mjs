import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const timestamp = new Date().toISOString();
const root = mkdtempSync(path.join(tmpdir(), 'bellfield-service-manifest-smoke-'));
const releaseRoot = path.join(root, 'release');
const installRoot = path.join(root, 'install');
const envPath = path.join(installRoot, 'bellfield-server.env');
const outputDir = path.join(releaseRoot, 'services');
const renderScript = path.resolve('tools', 'install', 'render-windows-services.mjs');
const installServicesScript = path.resolve('tools', 'install', 'install-windows-services.ps1');
const runtimeConfigValidatorScript = path.resolve(
  'tools',
  'install',
  'validate-server-runtime-config.mjs'
);
const serviceAccountDiagnosticScript = path.resolve(
  'tools',
  'install',
  'diagnose-windows-service-account.ps1'
);
const serviceLogRoot = path.join(installRoot, 'data', 'logs', 'services');
const evidence = {
  name: 'Windows service manifest smoke',
  startedAt: timestamp,
  checks: []
};

try {
  mkdirSync(path.join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web'), {
    recursive: true
  });
  mkdirSync(installRoot, { recursive: true });
  writeFileSync(
    path.join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js'),
    ''
  );
  writeFileSync(
    envPath,
    [
      'NODE_ENV=production',
      'BOOTSTRAP_SEED_DATA=false',
      'DATABASE_URL=postgresql://bellfield:CHANGE_ME@127.0.0.1:5432/bellfield',
      'BELLFIELD_API_PORT=3001',
      'BELLFIELD_OFFICE_WEB_PORT=3000',
      'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001',
      'BELLFIELD_OFFICE_ORIGINS=http://localhost:3000',
      'BELLFIELD_MEDIA_ROOT=C:\\BellField\\data\\media',
      'BELLFIELD_MEDIA_TOKEN_SECRET=media-secret',
      'BELLFIELD_LICENSE_REQUIRED=true',
      'BELLFIELD_LICENSE_PATH=C:\\BellField\\data\\license\\bellfield-license.json',
      'BELLFIELD_BACKUP_ENABLED=true',
      'BELLFIELD_BACKUP_ROOT=C:\\BellField\\data\\backups',
      'BELLFIELD_BACKUP_INTERVAL_MINUTES=1440',
      'BELLFIELD_BACKUP_RETENTION_COUNT=7',
      'BELLFIELD_BACKUP_STALE_AFTER_HOURS=36',
      'BELLFIELD_RELAY_BASE_URL=https://relay.bellfield.app',
      'BELLFIELD_RELAY_TOKEN=CHANGE_ME',
      'BELLFIELD_RELAY_SERVER_INSTANCE_ID=00000000-0000-4000-8000-000000000000'
    ].join('\n')
  );

  const result = spawnSync(
    process.execPath,
    [
      renderScript,
      `--release-root=${releaseRoot}`,
      `--install-root=${installRoot}`,
      `--env=${envPath}`,
      `--output=${outputDir}`
    ],
    { encoding: 'utf8', shell: false }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `render exited ${result.status}`);
  }

  const postgresXml = readManifest('bellfield-postgres');
  const apiXml = readManifest('bellfield-api');
  const workerXml = readManifest('bellfield-worker');
  const officeXml = readManifest('bellfield-office-web');
  const installScript = readFileSync(installServicesScript, 'utf8');
  const runtimeValidatorScript = readFileSync(runtimeConfigValidatorScript, 'utf8');
  const diagnosticScript = readFileSync(serviceAccountDiagnosticScript, 'utf8');

  for (const [serviceId, xml] of Object.entries({
    postgresXml,
    apiXml,
    workerXml,
    officeXml
  })) {
    check(
      `${serviceId} uses 10MB WinSW log threshold`,
      xml.includes('<sizeThreshold>10240</sizeThreshold>')
    );
  }

  check(
    'postgres XML does not rely on WinSW serviceaccount for SCM identity',
    !postgresXml.includes('<serviceaccount>')
  );
  check('api remains on current service account model', !apiXml.includes('<serviceaccount>'));
  check('worker remains on current service account model', !workerXml.includes('<serviceaccount>'));
  check('office remains on current service account model', !officeXml.includes('<serviceaccount>'));

  for (const [serviceId, xml] of Object.entries({
    'bellfield-postgres': postgresXml,
    'bellfield-api': apiXml,
    'bellfield-worker': workerXml,
    'bellfield-office-web': officeXml
  })) {
    check(
      `${serviceId} writes WinSW logs outside the secret-bearing service manifest directory`,
      xml.includes(`<logpath>${path.join(serviceLogRoot, serviceId)}</logpath>`)
    );
  }

  check(
    'installer models the Postgres virtual service identity',
    installScript.includes('$postgresServiceIdentity = "NT SERVICE\\$postgresServiceId"')
  );
  check(
    'installer uses Postgres virtual service identity as the SCM StartName',
    installScript.includes('$postgresServiceStartName = $postgresServiceIdentity')
  );
  check(
    'installer configures the Postgres SCM service account',
    installScript.includes(
      'Set-ServiceStartAccount -ServiceId $postgresServiceId -AccountName $postgresServiceStartName'
    )
  );
  check(
    'installer configures SCM account with no password argument',
    installScript.includes('"obj=", $AccountName') && !installScript.includes('password=')
  );
  check(
    'installer reads back Win32_Service StartName after SCM account config',
    installScript.includes('Get-CimInstance Win32_Service') &&
      installScript.includes('Test-ServiceStartNameMatches')
  );
  check(
    'installer enables the Postgres service SID before ACL grants',
    installScript.includes('Set-ServiceSidType -ServiceId $postgresServiceId')
  );
  check(
    'installer grants Postgres data directory access to only the virtual service account',
    installScript.includes(
      'Protect-BellFieldPath -Path $postgresDataRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)F")'
    )
  );
  check(
    'installer is repairable by uninstalling existing services before install',
    installScript.includes('Uninstall-BellFieldServiceIfPresent')
  );
  check(
    'installer runs packaged runtime config validation before service startup',
    installScript.includes('validate-server-runtime-config.mjs') &&
      installScript.includes('Invoke-RuntimeConfigValidation')
  );
  check(
    'runtime validator uses compiled API and worker runtime config modules',
    runtimeValidatorScript.includes('getApiRuntimeConfig') &&
      runtimeValidatorScript.includes('getWorkerRuntimeConfig') &&
      runtimeValidatorScript.includes('assertRuntimeLicense')
  );
  check(
    'installer re-reads service state immediately after each Start-Service',
    installScript.includes('Start-BellFieldServiceAndConfirm') &&
      installScript.includes('Start-Service -Name $ServiceId') &&
      installScript.includes('State=$($snapshot.State), ExitCode=$($snapshot.ExitCode)')
  );
  check(
    'installer waits through a post-start service settle window',
    installScript.includes('Assert-BellFieldServicesStable -SettleSeconds 30')
  );
  check(
    'installer requires stable service process ids during settle window',
    installScript.includes('BeforePid=$beforePid AfterPid=$afterPid') &&
      installScript.includes('has no running process id after settle') &&
      installScript.includes('did not keep stable process ids')
  );
  check(
    'installer polls API health before reporting success',
    installScript.includes('Wait-BellFieldApiHealth -TimeoutSeconds 60') &&
      installScript.includes('Invoke-RestMethod -Uri $url')
  );
  check(
    'installer prints service state and log tails on startup failure',
    installScript.includes('Get-InstallFailureContext') &&
      installScript.includes('Get-ServiceLogTail') &&
      installScript.includes('Write-Host (Get-InstallFailureContext)')
  );
  check(
    'installer points operators at the packaged service evidence collector on failure',
    installScript.includes('collect-windows-service-evidence.ps1')
  );
  checkScriptOrder(
    installScript,
    'installer confirms Postgres SCM StartName before enabling SID type',
    'Set-ServiceStartAccount -ServiceId $postgresServiceId -AccountName $postgresServiceStartName',
    'Set-ServiceSidType -ServiceId $postgresServiceId'
  );
  checkScriptOrder(
    installScript,
    'installer hardens Postgres ACLs before runtime validation',
    'Protect-BellFieldPath -Path $postgresDataRoot -Container -ExtraGrants @("${postgresServiceIdentity}:(OI)(CI)F")',
    '\nInvoke-RuntimeConfigValidation\n\ntry {'
  );
  checkScriptOrder(
    installScript,
    'installer validates runtime config before starting services',
    '\nInvoke-RuntimeConfigValidation\n\ntry {',
    'Start-BellFieldServiceAndConfirm -ServiceId $serviceId'
  );
  checkScriptOrder(
    installScript,
    'installer confirms Postgres SCM StartName before service startup validation',
    'Set-ServiceStartAccount -ServiceId $postgresServiceId -AccountName $postgresServiceStartName',
    '\nInvoke-RuntimeConfigValidation\n\ntry {'
  );
  check(
    'service-account diagnostic configures SCM accounts with no password argument',
    diagnosticScript.includes('"obj=", $Candidate.account') &&
      !diagnosticScript.includes('$arguments += "password="') &&
      !diagnosticScript.includes('passwordMode = "emptyString"')
  );
  check(
    'service-account diagnostic pass predicate includes SCM StartName readback',
    diagnosticScript.includes('$test["startNameMatches"]')
  );
  check(
    'service-account diagnostic pass predicate includes real service startup',
    diagnosticScript.includes('$test["startSucceeded"]')
  );
  check(
    'service-account diagnostic pass predicate includes SID-only ACL write',
    diagnosticScript.includes('$test["probe"].aclWriteSucceeded')
  );
  check(
    'service-account diagnostic records serviceSidPresent without making it the pass gate',
    diagnosticScript.includes('serviceSidPresent = ($groupsText -match') &&
      !diagnosticScript.includes('$test["probe"].serviceSidPresent -and')
  );
  check(
    'service-account diagnostic failure text matches the actual pass predicate',
    diagnosticScript.includes(
      'No service account candidate passed StartName readback, real service startup, and SID-only ACL write checks.'
    ) &&
      !diagnosticScript.includes('No service account candidate passed StartName, token service SID')
  );

  check('api keeps database URL', apiXml.includes('DATABASE_URL'));
  check(
    'api runs in production mode',
    apiXml.includes('<env name="NODE_ENV" value="production" />')
  );
  check(
    'api disables bootstrap seed data',
    apiXml.includes('<env name="BOOTSTRAP_SEED_DATA" value="false" />')
  );
  check('api keeps media token secret', apiXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET'));
  check('worker keeps database URL', workerXml.includes('DATABASE_URL'));
  check(
    'worker runs in production mode',
    workerXml.includes('<env name="NODE_ENV" value="production" />')
  );
  check(
    'worker does not receive media token secret',
    !workerXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET')
  );
  check('postgres does not receive database URL', !postgresXml.includes('DATABASE_URL'));
  check(
    'postgres does not receive media token secret',
    !postgresXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET')
  );
  check('office does not receive database URL', !officeXml.includes('DATABASE_URL'));
  check(
    'office runs in production mode',
    officeXml.includes('<env name="NODE_ENV" value="production" />')
  );
  check(
    'office does not receive media token secret',
    !officeXml.includes('BELLFIELD_MEDIA_TOKEN_SECRET')
  );
  check('office keeps public API URL', officeXml.includes('NEXT_PUBLIC_API_BASE_URL'));
  check('api keeps relay token', apiXml.includes('BELLFIELD_RELAY_TOKEN'));
  check('worker keeps relay token', workerXml.includes('BELLFIELD_RELAY_TOKEN'));
  check('postgres does not receive relay token', !postgresXml.includes('BELLFIELD_RELAY_TOKEN'));
  check('office does not receive relay token', !officeXml.includes('BELLFIELD_RELAY_TOKEN'));

  writeFileSync(
    envPath,
    readFileSync(envPath, 'utf8').replace('NODE_ENV=production', 'NODE_ENV=development')
  );
  const developmentResult = renderServiceManifests();
  check('renderer rejects non-production service NODE_ENV', developmentResult.status !== 0);
  check(
    'renderer explains non-production service NODE_ENV refusal',
    `${developmentResult.stderr}${developmentResult.stdout}`.includes('NODE_ENV=production')
  );

  writeFileSync(
    envPath,
    readFileSync(envPath, 'utf8')
      .replace('NODE_ENV=development', 'NODE_ENV=production')
      .replace('BOOTSTRAP_SEED_DATA=false', 'BOOTSTRAP_SEED_DATA=true')
  );
  const seedResult = renderServiceManifests();
  check('renderer rejects bootstrap seed data for service manifests', seedResult.status !== 0);
  check(
    'renderer explains bootstrap seed data refusal',
    `${seedResult.stderr}${seedResult.stdout}`.includes('BOOTSTRAP_SEED_DATA')
  );

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  rmSync(root, { force: true, recursive: true });
}

function readManifest(serviceId) {
  const pathName = path.join(outputDir, `${serviceId}.xml`);
  if (!existsSync(pathName)) {
    throw new Error(`Missing service manifest: ${serviceId}`);
  }
  return readFileSync(pathName, 'utf8');
}

function renderServiceManifests() {
  return spawnSync(
    process.execPath,
    [
      renderScript,
      `--release-root=${releaseRoot}`,
      `--install-root=${installRoot}`,
      `--env=${envPath}`,
      `--output=${outputDir}`
    ],
    { encoding: 'utf8', shell: false }
  );
}

function check(name, passed) {
  evidence.checks.push({ name, passed });
  if (!passed) {
    throw new Error(name);
  }
}

function checkScriptOrder(contents, name, before, after) {
  const beforeIndex = contents.indexOf(before);
  const afterIndex = contents.indexOf(after);
  check(name, beforeIndex !== -1 && afterIndex !== -1 && beforeIndex < afterIndex);
}
