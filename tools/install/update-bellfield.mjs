import { existsSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  collectUpdateProcessIds,
  createUpdateRecoveryTracker,
  decideUpdateRecovery,
  normalizePowerShellArray,
  updatePhases
} from './update-recovery.mjs';
import {
  acquireUpdateLock,
  defaultUpdateLockMaxAgeMs,
  defaultUpdateLockOwnerlessGraceMs
} from './update-lock.mjs';
import { parseEnvFile, readArgs } from './install-utils.mjs';
import {
  stageDirectoryRestore,
  swapStagedDirectoryWithRetry,
  timestampForRestorePath
} from './restore-staging.mjs';
import {
  quotePowerShellString,
  startWindowsService,
  stopWindowsService
} from './windows-service-control.mjs';
import {
  assertReleaseWithinUpdateWindow,
  verifyReleaseArtifact
} from '../update/release-artifact.mjs';
import { verifyLicenseFile } from '../update/license-verification.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultUpdateArtifactRoot = resolve(scriptDir, '..', '..');
const postgresServiceName = 'bellfield-postgres';
const appServicesStopOrder = ['bellfield-office-web', 'bellfield-worker', 'bellfield-api'];
const updateServicesStopOrder = [...appServicesStopOrder, postgresServiceName];
const appServicesStartOrder = ['bellfield-api', 'bellfield-worker', 'bellfield-office-web'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    shell: false,
    env: options.env ?? process.env,
    cwd: options.cwd,
    timeout: options.timeoutMs
  });

  if (result.error) {
    const timeoutDetail =
      result.error.code === 'ETIMEDOUT' && options.timeoutMs
        ? ` timed out after ${options.timeoutMs}ms`
        : '';
    throw new Error(`${command}${timeoutDetail} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.capture ? result.stderr || result.stdout : '';
    throw new Error(`${command} exited with ${result.status ?? 1}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function runPowerShell(command, options = {}) {
  return run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    capture: options.capture,
    timeoutMs: options.timeoutMs
  });
}

function emitUpdateEvent(prefix, payload) {
  console.log(
    `${prefix} ${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload
    })}`
  );
}

function enterUpdatePhase(recoveryTracker, phase, details = {}) {
  recoveryTracker.enter(phase);
  emitUpdateEvent('BELLFIELD_UPDATE_PHASE', { phase, ...details });
}

function emitUpdateLockBlocked(error) {
  emitUpdateEvent('BELLFIELD_UPDATE_LOCKED', {
    status: 'blocked',
    lockPath: error.lockPath ?? null,
    lockOwner: error.lockOwner ?? null,
    reason: error.reason ?? null,
    lockAgeMs: error.lockAgeMs ?? null,
    requiresOperatorInspection: Boolean(error.requiresOperatorInspection),
    manualRemediation: error.manualRemediation ?? null,
    processSnapshot: error.processSnapshot ?? null,
    message: error instanceof Error ? error.message : String(error)
  });
}

function stopUpdateServices({ skipServices, timeoutMs }) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service stop.');
    return [];
  }

  const processTree = captureServiceProcessTree(updateServicesStopOrder);
  for (const serviceName of updateServicesStopOrder) {
    stopWindowsService(serviceName, timeoutMs);
  }
  return processTree;
}

function startPostgresService({ skipServices, timeoutMs }) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping PostgreSQL service start.');
    return;
  }

  startWindowsService(postgresServiceName, timeoutMs);
}

function startAppServices({ skipServices, timeoutMs }) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service start.');
    return;
  }

  for (const serviceName of appServicesStartOrder) {
    startWindowsService(serviceName, timeoutMs);
  }
}

function captureServiceProcessTree(serviceNames) {
  const serviceArray = toPowerShellStringArray(serviceNames);
  const result = runPowerShell(
    `
$ErrorActionPreference = 'Stop'
$serviceNames = @(${serviceArray})
$allProcesses = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
function Get-ProcessTree {
  param([int]$RootPid, [object[]]$AllProcesses)
  $seen = @{}
  $pending = New-Object System.Collections.Queue
  $pending.Enqueue($RootPid)
  $items = @()
  while ($pending.Count -gt 0) {
    $processId = [int]$pending.Dequeue()
    if ($seen.ContainsKey($processId)) { continue }
    $seen[$processId] = $true
    $process = $AllProcesses | Where-Object { [int]$_.ProcessId -eq $processId } | Select-Object -First 1
    if ($null -eq $process) { continue }
    $items += [pscustomobject]@{
      processId = [int]$process.ProcessId
      parentProcessId = [int]$process.ParentProcessId
      name = [string]$process.Name
      commandLine = [string]$process.CommandLine
    }
    foreach ($child in @($AllProcesses | Where-Object { [int]$_.ParentProcessId -eq $processId })) {
      $pending.Enqueue([int]$child.ProcessId)
    }
  }
  return @($items)
}

$result = foreach ($name in $serviceNames) {
  $service = Get-CimInstance Win32_Service -Filter "Name = '$name'" -ErrorAction SilentlyContinue
  $processId = if ($service -and [int]$service.ProcessId -gt 0) { [int]$service.ProcessId } else { 0 }
  [pscustomobject]@{
    serviceName = $name
    serviceProcessId = $processId
    processes = if ($processId -gt 0) { @(Get-ProcessTree -RootPid $processId -AllProcesses $allProcesses) } else { @() }
  }
}
$result | ConvertTo-Json -Depth 8
`,
    { capture: true, timeoutMs: 30_000 }
  );

  const stdout = result.stdout.trim();
  if (!stdout) {
    return [];
  }
  const parsed = JSON.parse(stdout);
  return normalizePowerShellArray(parsed);
}

function waitForCapturedProcessTreeExit(processTree, timeoutMs) {
  if (process.platform !== 'win32') {
    return;
  }

  const processIds = collectUpdateProcessIds(processTree);
  if (processIds.length === 0) {
    console.log('No running BellField service process tree was captured before stop.');
    return;
  }

  const idArray = processIds.join(', ');
  runPowerShell(
    `
$ErrorActionPreference = 'Stop'
$processIds = @(${idArray})
$deadline = (Get-Date).AddMilliseconds(${timeoutMs})
do {
  $running = @($processIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
  if ($running.Count -eq 0) {
    Write-Host 'Captured BellField service process tree exited.'
    return
  }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
$summary = @($running | Select-Object Id, ProcessName) | ConvertTo-Json -Compress
throw "Timed out waiting for captured BellField service process tree to exit: $summary"
`,
    { timeoutMs: timeoutMs + 10_000 }
  );
}

function assertSafeReplaceDirectory(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  if (absolute === root || absolute.length < root.length + 8) {
    throw new Error(`${label} is too broad to replace safely: ${absolute}`);
  }
  return absolute;
}

function samePath(left, right) {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function isPathInsideDirectory(candidate, directory) {
  const relativePath = relative(resolve(directory), resolve(candidate));
  return Boolean(relativePath) && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

function runManualBackup(input) {
  if (input.skipBackup) {
    console.warn('Skipping pre-update backup because --skip-backup=true was passed.');
    return null;
  }

  const backupCli = join(
    input.updateArtifactRoot,
    'apps',
    'worker',
    'dist',
    'jobs',
    'backup',
    'run-backup-cli.js'
  );
  if (!existsSync(backupCli)) {
    throw new Error(`Packaged manual backup CLI is missing: ${backupCli}`);
  }

  const result = run(input.nodeExe, [backupCli], {
    cwd: input.updateArtifactRoot,
    env: input.env,
    capture: true,
    timeoutMs: input.timeoutMs
  });
  const stdout = result.stdout.trim();
  const resultLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('BELLFIELD_BACKUP_RESULT '));
  const parsed = resultLine
    ? JSON.parse(resultLine.replace(/^BELLFIELD_BACKUP_RESULT /, ''))
    : null;
  if (!parsed || parsed.status !== 'succeeded') {
    throw new Error('Pre-update backup did not report success.');
  }
  console.log(`Pre-update backup completed: ${parsed.backupSetPath}`);
  return parsed;
}

async function waitForHealth(input) {
  if (input.skipHealth) {
    console.log('Skipping health check.');
    return;
  }

  const deadline = Date.now() + input.timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(input.url);
      if (response.ok) {
        const body = await response.json().catch(() => null);
        // Post-update, "degraded" means the database or migration state is
        // not ready yet. Keep polling until the API reports ok.
        if (body && body.status === 'ok') {
          console.log(`Health check reached ${input.url}.`);
          return;
        }
        lastError = new Error(`API status ${body?.status ?? 'unreadable'}`);
      } else {
        lastError = new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(1_000);
  }

  throw new Error(`Health check did not pass at ${input.url}: ${lastError?.message ?? 'timeout'}`);
}

function cleanupStagedUpdatePath(stagedReleasePath) {
  if (!stagedReleasePath || !existsSync(stagedReleasePath)) {
    return { removed: false };
  }
  if (!basename(stagedReleasePath).includes('.restore-stage-')) {
    console.error(`Refusing to remove unexpected staged update path: ${stagedReleasePath}`);
    return { removed: false, skipped: true };
  }

  try {
    rmSync(stagedReleasePath, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
    console.error(`Removed abandoned staged update release: ${stagedReleasePath}`);
    return { removed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to remove abandoned staged update release: ${message}`);
    return { removed: false, error: message };
  }
}

function captureServiceStatesSafe() {
  if (process.platform !== 'win32') {
    return [];
  }
  try {
    const serviceArray = toPowerShellStringArray([postgresServiceName, ...appServicesStartOrder]);
    const result = runPowerShell(
      `
$serviceNames = @(${serviceArray})
$states = foreach ($name in $serviceNames) {
  $service = Get-CimInstance Win32_Service -Filter "Name = '$name'" -ErrorAction SilentlyContinue
  if ($null -eq $service) {
    [pscustomobject]@{ name = $name; found = $false }
  } else {
    [pscustomobject]@{
      name = $name
      found = $true
      state = [string]$service.State
      startName = [string]$service.StartName
      processId = [int]$service.ProcessId
      exitCode = [int]$service.ExitCode
      pathName = [string]$service.PathName
    }
  }
}
$states | ConvertTo-Json -Depth 5
`,
      { capture: true, timeoutMs: 30_000 }
    );
    const stdout = result.stdout.trim();
    if (!stdout) {
      return [];
    }
    const parsed = JSON.parse(stdout);
    return normalizePowerShellArray(parsed);
  } catch (error) {
    return [
      {
        error: error instanceof Error ? error.message : String(error)
      }
    ];
  }
}

function captureReleaseRootProcessesSafe(releaseRoot) {
  if (process.platform !== 'win32') {
    return {
      matchingReleaseRootProcesses: [],
      unavailableCommandLineProcesses: []
    };
  }

  try {
    const releaseRootValue = quotePowerShellString(resolve(releaseRoot));
    const result = runPowerShell(
      `
$releaseRoot = (${releaseRootValue}).TrimEnd('\\')
$currentNodePid = ${process.pid}
$currentPowerShellPid = $PID
$processNamePattern = '^(node|node\\.exe|winsw|winsw\\.exe|BellField.*)$'
function Test-CommandLineContainsReleaseRoot {
  param([AllowNull()][string]$Value, [string]$Root)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $index = $Value.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase)
  while ($index -ge 0) {
    $after = $index + $Root.Length
    if ($after -ge $Value.Length) { return $true }
    $next = $Value[$after]
    if ($next -eq '\\' -or $next -eq '/' -or $next -eq '"' -or $next -eq "'" -or [char]::IsWhiteSpace($next)) {
      return $true
    }
    $index = $Value.IndexOf($Root, $index + 1, [StringComparison]::OrdinalIgnoreCase)
  }
  return $false
}
$allProcesses = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.ProcessId -ne $currentNodePid -and
      $_.ProcessId -ne $currentPowerShellPid
    }
)
$matching = @(
  $allProcesses |
    Where-Object { Test-CommandLineContainsReleaseRoot -Value $_.CommandLine -Root $releaseRoot } |
    Select-Object ProcessId, ParentProcessId, Name, CommandLine
)
$unavailableCommandLine = @(
  $allProcesses |
    Where-Object {
      [string]::IsNullOrWhiteSpace($_.CommandLine) -and
      [string]$_.Name -match $processNamePattern
    } |
    Select-Object -First 10 ProcessId, ParentProcessId, Name, @{ Name = 'reason'; Expression = { 'CommandLine unavailable' } }
)
[pscustomobject]@{
  matchingReleaseRootProcesses = @($matching)
  unavailableCommandLineProcesses = @($unavailableCommandLine)
} | ConvertTo-Json -Depth 5
`,
      { capture: true, timeoutMs: 30_000 }
    );
    const stdout = result.stdout.trim();
    if (!stdout) {
      return {
        matchingReleaseRootProcesses: [],
        unavailableCommandLineProcesses: []
      };
    }
    const parsed = JSON.parse(stdout);
    return {
      matchingReleaseRootProcesses: normalizePowerShellArray(parsed?.matchingReleaseRootProcesses),
      unavailableCommandLineProcesses: normalizePowerShellArray(
        parsed?.unavailableCommandLineProcesses
      )
    };
  } catch (error) {
    return {
      matchingReleaseRootProcesses: [],
      unavailableCommandLineProcesses: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function getUpdateLockProcessSnapshot(processId) {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const result = runPowerShell(
      `
$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}" -ErrorAction SilentlyContinue
if ($null -eq $process) {
  [pscustomobject]@{
    alive = $false
    processId = ${processId}
  } | ConvertTo-Json -Depth 3
} else {
  [pscustomobject]@{
    alive = $true
    processId = [int]$process.ProcessId
    name = [string]$process.Name
    commandLine = [string]$process.CommandLine
    creationDate = [string]$process.CreationDate
  } | ConvertTo-Json -Depth 3
}
`,
      { capture: true, timeoutMs: 30_000 }
    );
    const stdout = result.stdout.trim();
    return stdout ? JSON.parse(stdout) : null;
  } catch {
    return null;
  }
}

function safeReadReleaseManifest(releaseRoot) {
  const manifestPath = join(releaseRoot, 'bellfield-build-manifest.json');
  try {
    if (!existsSync(manifestPath)) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return {
      version: parsed.version ?? null,
      releaseDate: parsed.releaseDate ?? null,
      sourceCommit: parsed.sourceCommit ?? null
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildFailureSummary(input) {
  const originalError = input.originalError ?? input.error;
  const recoveryError = input.recoveryError ?? null;
  const postRecoveryReleaseRootProcesses = captureReleaseRootProcessesSafe(
    input.currentReleaseRoot
  );
  return {
    status: 'failed',
    phase: input.snapshot.phase,
    recovery: {
      restartServices: input.recovery.restartServices,
      message: input.recovery.message,
      restartAttempted: input.restartAttempted,
      restartSucceeded: input.restartSucceeded,
      restartSkippedReason: input.restartSkippedReason ?? null
    },
    error: input.error instanceof Error ? input.error.message : String(input.error),
    originalError: originalError instanceof Error ? originalError.message : String(originalError),
    recoveryError: recoveryError
      ? recoveryError instanceof Error
        ? recoveryError.message
        : String(recoveryError)
      : null,
    versions: {
      attempted: input.attemptedVersion,
      installed: safeReadReleaseManifest(input.currentReleaseRoot)
    },
    paths: {
      currentReleaseRoot: input.currentReleaseRoot,
      currentReleaseRootExists: input.currentReleaseRootExists,
      stagedReleasePath: input.snapshot.stagedReleasePath,
      rollbackReleasePath: input.snapshot.rollbackReleasePath,
      preUpdateBackupPath: input.snapshot.preUpdateBackupPath
    },
    cleanup: input.cleanup,
    swapEvidence: readSwapEvidence(originalError) ?? readSwapEvidence(recoveryError),
    serviceStates: captureServiceStatesSafe(),
    preRecoveryReleaseRootProcesses: input.preRecoveryReleaseRootProcesses ?? null,
    postRecoveryReleaseRootProcesses,
    releaseRootProcesses: postRecoveryReleaseRootProcesses,
    guidance: input.restartSkippedReason
      ? 'The update failed before the release swap completed, but the installed release root is missing. Do not restart app services until the release directory is repaired from rollback/stage evidence.'
      : input.recovery.postSwapFailure
        ? 'The update release swap completed before readiness failed. Inspect the rollback release directory, pre-update backup, service states, and release-root process evidence before retrying.'
        : input.recovery.restartServices
          ? 'Original app services were safe to restart because the installed release swap had not completed.'
          : 'Do not start app services blindly. Inspect the rollback release directory, pre-update backup, service states, and update phase before retrying.'
  };
}

function readSwapEvidence(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }
  if (error.swapEvidence) {
    return error.swapEvidence;
  }
  return readSwapEvidence(error.cause);
}

async function retryUpdateReadiness(input) {
  startPostgresService({ skipServices: input.skipServices, timeoutMs: input.serviceTimeoutMs });
  startAppServices({ skipServices: input.skipServices, timeoutMs: input.serviceTimeoutMs });
  await waitForHealth({
    url: input.healthUrl,
    timeoutMs: input.healthTimeoutMs,
    skipHealth: input.skipHealth
  });
}

function parsePositiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number of milliseconds.`);
  }
  return Math.floor(parsed);
}

function toPowerShellStringArray(values) {
  return values.map((value) => quotePowerShellString(value)).join(', ');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const args = readArgs();
if (args.confirm !== 'UPDATE') {
  throw new Error('Refusing to update without --confirm=UPDATE.');
}

const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const updateArtifactRoot = resolve(
  String(args['update-artifact-root'] ?? defaultUpdateArtifactRoot)
);
const currentReleaseRoot = assertSafeReplaceDirectory(
  String(args['current-release-root'] ?? join(installRoot, 'release')),
  'current release root'
);
const skipServices = args['skip-services'] === 'true' || process.platform !== 'win32';
const skipHealth = args['skip-health'] === 'true' || skipServices;
const skipBackup = args['skip-backup'] === 'true';
const backupTimeoutMs = parsePositiveInteger(args['backup-timeout-ms'], 300_000, 'backup timeout');
const serviceTimeoutMs = parsePositiveInteger(
  args['service-timeout-ms'],
  60_000,
  'service timeout'
);
const serviceExitTimeoutMs = parsePositiveInteger(
  args['service-exit-timeout-ms'],
  60_000,
  'service exit timeout'
);
const swapTimeoutMs = parsePositiveInteger(args['swap-timeout-ms'], 60_000, 'swap timeout');
const migrationTimeoutMs = parsePositiveInteger(
  args['migration-timeout-ms'],
  180_000,
  'migration timeout'
);
const healthTimeoutMs = parsePositiveInteger(args['health-timeout-ms'], 60_000, 'health timeout');
const updateLockMaxAgeMs = parsePositiveInteger(
  args['update-lock-max-age-ms'],
  defaultUpdateLockMaxAgeMs,
  'update lock max age'
);
const updateLockOwnerlessGraceMs = parsePositiveInteger(
  args['update-lock-ownerless-grace-ms'],
  defaultUpdateLockOwnerlessGraceMs,
  'update lock ownerless grace'
);

if (samePath(updateArtifactRoot, currentReleaseRoot)) {
  throw new Error(
    'Run the updater from the extracted new release artifact, not the installed release root.'
  );
}
if (isPathInsideDirectory(updateArtifactRoot, currentReleaseRoot)) {
  throw new Error('Update artifact root must not be inside the installed release root.');
}

const env = parseEnvFile(envPath);
const apiPort = env.BELLFIELD_API_PORT ?? env.PORT ?? '3001';
const healthUrl = String(args['health-url'] ?? `http://127.0.0.1:${apiPort}/health`);
const nodeExe = join(
  updateArtifactRoot,
  'runtime',
  'node',
  process.platform === 'win32' ? 'node.exe' : 'node'
);
const migrationsScript = join(updateArtifactRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs');
if (!existsSync(nodeExe)) {
  throw new Error(`Bundled Node runtime is missing from update artifact: ${nodeExe}`);
}
if (!existsSync(migrationsScript)) {
  throw new Error(`Packaged migration script is missing from update artifact: ${migrationsScript}`);
}

const recoveryTracker = createUpdateRecoveryTracker({ skipServices });
let attemptedVersion = null;
let updateLock = null;

try {
  updateLock = acquireUpdateLock({
    installRoot,
    commandLine: process.argv.join(' '),
    maxAgeMs: updateLockMaxAgeMs,
    ownerlessGraceMs: updateLockOwnerlessGraceMs,
    getProcessSnapshot: getUpdateLockProcessSnapshot
  });
  console.log(`Acquired BellField update lock: ${updateLock.lockPath}`);
} catch (error) {
  if (error?.code === 'BELLFIELD_UPDATE_LOCKED') {
    emitUpdateLockBlocked(error);
  }
  throw error;
}

try {
  enterUpdatePhase(recoveryTracker, updatePhases.verifying);
  const verifiedArtifact = verifyReleaseArtifact({ releaseRoot: updateArtifactRoot });
  attemptedVersion = verifiedArtifact.build.version;
  const licenseStatus = verifyLicenseFile({ licensePath: env.BELLFIELD_LICENSE_PATH });
  if (licenseStatus.status !== 'valid') {
    throw new Error(`BellField update cannot be installed: ${licenseStatus.message}`);
  }
  if (licenseStatus.license.licenseKind === 'dataOnly') {
    throw new Error(
      'BellField update cannot be installed: this license is data-only. Install a paid license or use a BellField recovery tool.'
    );
  }
  assertReleaseWithinUpdateWindow({
    releaseDate: verifiedArtifact.build.releaseDate,
    updateWindowEnd: licenseStatus.license.updateWindowEnd
  });

  const restoreStamp = timestampForRestorePath();
  enterUpdatePhase(recoveryTracker, updatePhases.staging, { restoreStamp });
  const stagedReleasePath = stageDirectoryRestore({
    sourcePath: updateArtifactRoot,
    targetPath: currentReleaseRoot,
    stamp: restoreStamp,
    sourceLabel: 'update artifact root'
  });
  recoveryTracker.setStagedReleasePath(stagedReleasePath);
  enterUpdatePhase(recoveryTracker, updatePhases.staged, { stagedReleasePath });
  console.log(`Staged update artifact at ${stagedReleasePath}`);

  const updateEnv = { ...process.env, ...env, DATABASE_URL: env.DATABASE_URL };
  enterUpdatePhase(recoveryTracker, updatePhases.backingUp);
  const backup = runManualBackup({
    updateArtifactRoot,
    nodeExe,
    env: updateEnv,
    skipBackup,
    timeoutMs: backupTimeoutMs
  });
  recoveryTracker.setPreUpdateBackupPath(backup?.backupSetPath ?? null);
  enterUpdatePhase(recoveryTracker, updatePhases.backupComplete, {
    preUpdateBackupPath: backup?.backupSetPath ?? null
  });

  console.log(
    `Installing BellField ${verifiedArtifact.build.version} (${verifiedArtifact.build.releaseDate}).`
  );
  enterUpdatePhase(recoveryTracker, updatePhases.stoppingServices);
  recoveryTracker.markServiceStopAttempted();
  const serviceProcessTree = stopUpdateServices({ skipServices, timeoutMs: serviceTimeoutMs });
  enterUpdatePhase(recoveryTracker, updatePhases.servicesStopped, {
    capturedProcessCount: collectUpdateProcessIds(serviceProcessTree).length
  });
  enterUpdatePhase(recoveryTracker, updatePhases.waitingForProcessExit);
  waitForCapturedProcessTreeExit(serviceProcessTree, serviceExitTimeoutMs);
  enterUpdatePhase(recoveryTracker, updatePhases.processesExited);

  enterUpdatePhase(recoveryTracker, updatePhases.swappingRelease, {
    swapTimeoutMs
  });
  const rollbackReleasePath = await swapStagedDirectoryWithRetry({
    stagePath: stagedReleasePath,
    targetPath: currentReleaseRoot,
    stamp: restoreStamp,
    timeoutMs: swapTimeoutMs
  });
  recoveryTracker.setRollbackReleasePath(rollbackReleasePath);
  recoveryTracker.markReleaseSwapped();
  enterUpdatePhase(recoveryTracker, updatePhases.releaseSwapped, { rollbackReleasePath });

  enterUpdatePhase(recoveryTracker, updatePhases.startingPostgres);
  startPostgresService({ skipServices, timeoutMs: serviceTimeoutMs });
  enterUpdatePhase(recoveryTracker, updatePhases.postgresStarted);
  enterUpdatePhase(recoveryTracker, updatePhases.migrating);
  run(nodeExe, [migrationsScript], {
    env: updateEnv,
    cwd: currentReleaseRoot,
    timeoutMs: migrationTimeoutMs
  });
  enterUpdatePhase(recoveryTracker, updatePhases.migrationsRun);
  enterUpdatePhase(recoveryTracker, updatePhases.startingServices);
  startAppServices({ skipServices, timeoutMs: serviceTimeoutMs });

  enterUpdatePhase(recoveryTracker, updatePhases.healthChecking);
  await waitForHealth({
    url: healthUrl,
    timeoutMs: healthTimeoutMs,
    skipHealth
  });
  recoveryTracker.markServicesStarted();
  enterUpdatePhase(recoveryTracker, updatePhases.completed);

  emitUpdateEvent('BELLFIELD_UPDATE_RESULT', {
    status: 'succeeded',
    version: verifiedArtifact.build.version,
    releaseDate: verifiedArtifact.build.releaseDate,
    preUpdateBackupPath: backup?.backupSetPath ?? null,
    rollbackReleasePath
  });
  console.log('BellField update completed.');
  if (backup) {
    console.log(`Pre-update backup set: ${backup.backupSetPath}`);
  }
  if (rollbackReleasePath) {
    console.log(`Previous release preserved for rollback reference: ${rollbackReleasePath}`);
  }
} catch (error) {
  const snapshotAtFailure = recoveryTracker.snapshot();
  const recovery = decideUpdateRecovery(snapshotAtFailure);
  const preRecoveryReleaseRootProcesses =
    snapshotAtFailure.phase === updatePhases.swappingRelease
      ? captureReleaseRootProcessesSafe(currentReleaseRoot)
      : null;
  if (recovery.message) {
    console.error(recovery.message);
  }

  let restartAttempted = false;
  let restartSucceeded = false;
  let readinessRecovered = false;
  let recoveryError = null;
  let restartSkippedReason = null;
  const currentReleaseRootExists = existsSync(currentReleaseRoot);
  if (recovery.restartServices) {
    if (!recovery.postSwapFailure && !currentReleaseRootExists) {
      restartSkippedReason =
        'Installed release root is missing; original app services were not restarted.';
      console.error(restartSkippedReason);
    } else {
      restartAttempted = true;
      try {
        if (recovery.postSwapFailure) {
          await retryUpdateReadiness({
            skipServices,
            serviceTimeoutMs,
            skipHealth,
            healthUrl,
            healthTimeoutMs
          });
          recoveryTracker.markServicesStarted();
          recoveryTracker.enter(updatePhases.completed);
          readinessRecovered = true;
        } else {
          startPostgresService({ skipServices, timeoutMs: serviceTimeoutMs });
          startAppServices({ skipServices, timeoutMs: serviceTimeoutMs });
        }
        restartSucceeded = true;
      } catch (restartError) {
        recoveryError = restartError;
        console.error(
          `Failed to restart services after update failure: ${
            restartError instanceof Error ? restartError.message : String(restartError)
          }`
        );
      }
    }
  }

  if (readinessRecovered) {
    emitUpdateEvent('BELLFIELD_UPDATE_RESULT', {
      status: 'succeeded',
      readinessRecovered: true,
      version: attemptedVersion,
      preUpdateBackupPath: recoveryTracker.snapshot().preUpdateBackupPath,
      rollbackReleasePath: recoveryTracker.snapshot().rollbackReleasePath
    });
    console.log('BellField update completed after retrying service readiness.');
  } else {
    const cleanup = cleanupStagedUpdatePath(recoveryTracker.snapshot().stagedReleasePath);
    emitUpdateEvent(
      'BELLFIELD_UPDATE_FAILURE',
      buildFailureSummary({
        error: recoveryError ?? error,
        originalError: error,
        recoveryError,
        snapshot: recoveryTracker.snapshot(),
        recovery,
        restartAttempted,
        restartSucceeded,
        restartSkippedReason,
        cleanup,
        preRecoveryReleaseRootProcesses,
        attemptedVersion,
        currentReleaseRoot,
        currentReleaseRootExists
      })
    );
    throw recoveryError ?? error;
  }
} finally {
  updateLock?.release();
}
