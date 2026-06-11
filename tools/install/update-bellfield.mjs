import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnvFile, readArgs } from './install-utils.mjs';
import {
  stageDirectoryRestore,
  swapStagedDirectory,
  timestampForRestorePath
} from './restore-staging.mjs';
import {
  assertReleaseWithinUpdateWindow,
  verifyReleaseArtifact
} from '../update/release-artifact.mjs';
import { verifyLicenseFile } from '../update/license-verification.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultUpdateArtifactRoot = resolve(scriptDir, '..', '..');
const appServicesStopOrder = ['bellfield-office-web', 'bellfield-worker', 'bellfield-api'];
const appServicesStartOrder = ['bellfield-api', 'bellfield-worker', 'bellfield-office-web'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    shell: false,
    env: options.env ?? process.env,
    cwd: options.cwd
  });

  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.capture ? result.stderr || result.stdout : '';
    throw new Error(`${command} exited with ${result.status ?? 1}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function runPowerShell(command) {
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

function stopAppServices(skipServices) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service stop.');
    return;
  }

  for (const serviceName of appServicesStopOrder) {
    runPowerShell(
      `if (Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) { Stop-Service -Name '${serviceName}' -Force }`
    );
  }
}

function startAppServices(skipServices) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service start.');
    return;
  }

  runPowerShell(
    "if (Get-Service -Name 'bellfield-postgres' -ErrorAction SilentlyContinue) { Start-Service -Name 'bellfield-postgres' }"
  );
  for (const serviceName of appServicesStartOrder) {
    runPowerShell(
      `if (Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) { Start-Service -Name '${serviceName}' }`
    );
  }
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
    capture: true
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
        // not ready — exactly what this check exists to catch. Keep polling
        // until the API reports ok or the deadline passes.
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
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Health check did not pass at ${input.url}: ${lastError?.message ?? 'timeout'}`);
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
const skipServices = args['skip-services'] === 'true';
const skipHealth = args['skip-health'] === 'true';
const skipBackup = args['skip-backup'] === 'true';
const healthTimeoutMs = Number(args['health-timeout-ms'] ?? 60_000);

if (samePath(updateArtifactRoot, currentReleaseRoot)) {
  throw new Error(
    'Run the updater from the extracted new release artifact, not the installed release root.'
  );
}
if (isPathInsideDirectory(updateArtifactRoot, currentReleaseRoot)) {
  throw new Error('Update artifact root must not be inside the installed release root.');
}

const env = parseEnvFile(envPath);
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

const verifiedArtifact = verifyReleaseArtifact({ releaseRoot: updateArtifactRoot });
const licenseStatus = verifyLicenseFile({ licensePath: env.BELLFIELD_LICENSE_PATH });
if (licenseStatus.status !== 'valid') {
  throw new Error(`BellField update cannot be installed: ${licenseStatus.message}`);
}
assertReleaseWithinUpdateWindow({
  releaseDate: verifiedArtifact.build.releaseDate,
  updateWindowEnd: licenseStatus.license.updateWindowEnd
});

const restoreStamp = timestampForRestorePath();
const stagedReleasePath = stageDirectoryRestore({
  sourcePath: updateArtifactRoot,
  targetPath: currentReleaseRoot,
  stamp: restoreStamp,
  sourceLabel: 'update artifact root'
});
console.log(`Staged update artifact at ${stagedReleasePath}`);

const updateEnv = { ...process.env, ...env, DATABASE_URL: env.DATABASE_URL };
const backup = runManualBackup({
  updateArtifactRoot,
  nodeExe,
  env: updateEnv,
  skipBackup
});

console.log(
  `Installing BellField ${verifiedArtifact.build.version} (${verifiedArtifact.build.releaseDate}).`
);
stopAppServices(skipServices);
const rollbackReleasePath = swapStagedDirectory({
  stagePath: stagedReleasePath,
  targetPath: currentReleaseRoot,
  stamp: restoreStamp
});

run(nodeExe, [migrationsScript], { env: updateEnv, cwd: currentReleaseRoot });
startAppServices(skipServices);

const apiPort = env.BELLFIELD_API_PORT ?? env.PORT ?? '3001';
await waitForHealth({
  url: String(args['health-url'] ?? `http://127.0.0.1:${apiPort}/health`),
  timeoutMs: Number.isFinite(healthTimeoutMs) && healthTimeoutMs > 0 ? healthTimeoutMs : 60_000,
  skipHealth
});

console.log('BellField update completed.');
if (backup) {
  console.log(`Pre-update backup set: ${backup.backupSetPath}`);
}
if (rollbackReleasePath) {
  console.log(`Previous release preserved for rollback reference: ${rollbackReleasePath}`);
}
