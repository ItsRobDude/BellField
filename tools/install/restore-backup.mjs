import { existsSync, rmSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { databaseConfigFromUrl, getBoolean, parseEnvFile, readArgs } from './install-utils.mjs';
import {
  createRestoreRecoveryTracker,
  decideRestoreRecovery,
  restorePhases
} from './restore-recovery.mjs';
import {
  stageDirectoryRestore,
  stageFileRestore,
  swapStagedDirectory,
  swapStagedFile,
  timestampForRestorePath
} from './restore-staging.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');
const appServicesStopOrder = ['bellfield-office-web', 'bellfield-worker', 'bellfield-api'];
const appServicesStartOrder = ['bellfield-api', 'bellfield-worker', 'bellfield-office-web'];

function databaseEnv(databaseUrl) {
  const database = databaseConfigFromUrl(databaseUrl);

  return {
    env: {
      ...process.env,
      PGHOST: database.host,
      PGPORT: database.port,
      PGUSER: database.username,
      PGPASSWORD: database.password
    },
    databaseName: database.databaseName,
    username: database.username
  };
}

function pgTool(name, postgresBin) {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  return postgresBin ? join(postgresBin, executable) : executable;
}

function requirePgTool(name, postgresBin) {
  const toolPath = pgTool(name, postgresBin);
  if (!existsSync(toolPath)) {
    throw new Error(`PostgreSQL ${name} not found at ${toolPath}.`);
  }
  return toolPath;
}

function quoteSqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

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
    throw new Error(`${command} exited with ${result.status ?? 1}`);
  }
  return result;
}

function runPowerShell(command) {
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

function stopAppServices(skipServices) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service stop.');
    return false;
  }

  for (const serviceName of appServicesStopOrder) {
    runPowerShell(
      `if (Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) { Stop-Service -Name '${serviceName}' -Force }`
    );
  }
  return true;
}

function startAppServices(skipServices) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service start.');
    return false;
  }

  runPowerShell(
    "if (Get-Service -Name 'bellfield-postgres' -ErrorAction SilentlyContinue) { Start-Service -Name 'bellfield-postgres' }"
  );
  for (const serviceName of appServicesStartOrder) {
    runPowerShell(
      `if (Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) { Start-Service -Name '${serviceName}' }`
    );
  }
  return true;
}

function assertSafeReplaceDirectory(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  if (absolute === root || absolute.length < root.length + 8) {
    throw new Error(`${label} is too broad to replace safely: ${absolute}`);
  }
  return absolute;
}

function assertSafeFilePath(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  if (absolute === root || absolute.length < root.length + 8) {
    throw new Error(`${label} is too broad to replace safely: ${absolute}`);
  }
  return absolute;
}

function runRestorePreflight(input) {
  const ownerCheck = run(
    input.psql,
    [
      '--dbname',
      input.databaseName,
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
      '--command',
      [
        'select case',
        "  when current_user = pg_get_userbyid(datdba) then 'ok'",
        "  else 'not_owner:' || current_user || ':' || pg_get_userbyid(datdba)",
        'end',
        'from pg_database',
        'where datname = current_database();'
      ].join('\n')
    ],
    { env: input.pgEnv, capture: true }
  )
    .stdout.trim()
    .split(/\r?\n/)
    .at(-1);

  if (ownerCheck !== 'ok') {
    throw new Error(
      `Restore requires DATABASE_URL role '${input.username}' to own database '${input.databaseName}' before services are stopped; readback was '${ownerCheck ?? ''}'.`
    );
  }

  const schemaName = `bellfield_restore_preflight_${process.pid}`;
  run(
    input.psql,
    [
      '--dbname',
      input.databaseName,
      '--set=ON_ERROR_STOP=1',
      '--command',
      [
        'begin;',
        `create schema ${quoteSqlIdentifier(schemaName)};`,
        `drop schema ${quoteSqlIdentifier(schemaName)} cascade;`,
        'rollback;'
      ].join('\n')
    ],
    { env: input.pgEnv }
  );
}

function resetDatabaseSchema(input) {
  const appRole = quoteSqlIdentifier(input.username);
  run(
    input.psql,
    [
      '--dbname',
      input.databaseName,
      '--set=ON_ERROR_STOP=1',
      '--command',
      [
        'drop schema if exists public cascade;',
        `create schema public authorization ${appRole};`
      ].join('\n')
    ],
    { env: input.pgEnv }
  );
}

const args = readArgs();
if (args.confirm !== 'RESTORE') {
  throw new Error('Refusing to restore without --confirm=RESTORE.');
}

const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const backupSetPath = args['backup-set']
  ? resolve(String(args['backup-set']))
  : (() => {
      throw new Error('Missing required --backup-set=<path>.');
    })();
const skipServices = args['skip-services'] === 'true';
const env = parseEnvFile(envPath);
const databaseUrl = env.DATABASE_URL;
if (!env.BELLFIELD_MEDIA_ROOT) {
  throw new Error(`BELLFIELD_MEDIA_ROOT is missing from ${envPath}.`);
}
const mediaRoot = assertSafeReplaceDirectory(env.BELLFIELD_MEDIA_ROOT, 'BELLFIELD_MEDIA_ROOT');
const licenseRequired = getBoolean(env.BELLFIELD_LICENSE_REQUIRED, false);
const licensePath = env.BELLFIELD_LICENSE_PATH
  ? assertSafeFilePath(env.BELLFIELD_LICENSE_PATH, 'BELLFIELD_LICENSE_PATH')
  : null;
const postgresBin = env.BELLFIELD_POSTGRES_BIN
  ? resolve(env.BELLFIELD_POSTGRES_BIN)
  : resolve(releaseRoot, 'postgres', 'bin');
const nodeExe = join(
  releaseRoot,
  'runtime',
  'node',
  process.platform === 'win32' ? 'node.exe' : 'node'
);
const migrationsScript = join(releaseRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs');
const manifestPath = join(backupSetPath, 'manifest.json');
const dumpPath = join(backupSetPath, 'database.dump');
const backupMediaPath = join(backupSetPath, 'media');
const backupLicensePath = join(backupSetPath, 'license', 'bellfield-license.json');
const restoreStamp = timestampForRestorePath();

if (!databaseUrl) {
  throw new Error(`DATABASE_URL is missing from ${envPath}.`);
}
if (!existsSync(manifestPath) || !existsSync(dumpPath) || !existsSync(backupMediaPath)) {
  throw new Error('Backup set must contain manifest.json, database.dump, and media/.');
}
if (licenseRequired && !licensePath) {
  throw new Error('BELLFIELD_LICENSE_PATH is required when BELLFIELD_LICENSE_REQUIRED=true.');
}
if (licenseRequired && !existsSync(backupLicensePath)) {
  throw new Error(
    'Backup set does not include license/bellfield-license.json. Install a re-issued license or choose a Phase 3 backup set before restoring a license-required server.'
  );
}

const { env: pgEnv, databaseName, username } = databaseEnv(databaseUrl);
const psql = requirePgTool('psql', postgresBin);
const pgRestore = requirePgTool('pg_restore', postgresBin);
const restoreEnv = { ...process.env, ...env, DATABASE_URL: databaseUrl };
const recoveryTracker = createRestoreRecoveryTracker({
  skipServices: skipServices || process.platform !== 'win32'
});
let stagedMediaPath = null;
let stagedLicensePath = null;

try {
  recoveryTracker.enter(restorePhases.preflight);
  runRestorePreflight({ psql, pgEnv, databaseName, username });

  recoveryTracker.enter(restorePhases.staging);
  stagedMediaPath = stageDirectoryRestore({
    sourcePath: backupMediaPath,
    targetPath: mediaRoot,
    stamp: restoreStamp,
    sourceLabel: 'backup media directory'
  });
  stagedLicensePath =
    licensePath && existsSync(backupLicensePath)
      ? stageFileRestore({
          sourcePath: backupLicensePath,
          targetPath: licensePath,
          stamp: restoreStamp,
          sourceLabel: 'backup license file'
        })
      : null;

  console.log(`Restoring BellField backup from ${backupSetPath}`);
  console.log(`Staged media restore at ${stagedMediaPath}`);
  if (stagedLicensePath) {
    console.log(`Staged license restore at ${stagedLicensePath}`);
  }
  recoveryTracker.enter(restorePhases.stoppingServices);
  recoveryTracker.markServiceStopAttempted();
  stopAppServices(skipServices);
  recoveryTracker.enter(restorePhases.servicesStopped);

  recoveryTracker.enter(restorePhases.resettingSchema);
  resetDatabaseSchema({ psql, pgEnv, databaseName, username });
  recoveryTracker.enter(restorePhases.schemaResetComplete);
  run(
    pgRestore,
    ['--dbname', databaseName, '--no-owner', '--exit-on-error', '--single-transaction', dumpPath],
    { env: pgEnv }
  );
  recoveryTracker.enter(restorePhases.databaseRestored);

  const mediaRollbackPath = swapStagedDirectory({
    stagePath: stagedMediaPath,
    targetPath: mediaRoot,
    stamp: restoreStamp
  });

  const licenseRollbackPath =
    licensePath && stagedLicensePath
      ? swapStagedFile({
          stagePath: stagedLicensePath,
          targetPath: licensePath,
          stamp: restoreStamp
        })
      : null;
  recoveryTracker.enter(restorePhases.filesSwapped);

  run(nodeExe, [migrationsScript], { env: restoreEnv, cwd: releaseRoot });
  recoveryTracker.enter(restorePhases.migrationsRun);
  recoveryTracker.enter(restorePhases.startingServices);
  startAppServices(skipServices);
  recoveryTracker.markServicesStarted();
  recoveryTracker.enter(restorePhases.completed);

  console.log('BellField restore completed.');
  if (mediaRollbackPath) {
    console.log(`Previous media root preserved for rollback cleanup: ${mediaRollbackPath}`);
  }
  if (licenseRollbackPath) {
    console.log(`Previous license file preserved for rollback cleanup: ${licenseRollbackPath}`);
  }
} catch (error) {
  cleanupStagedRestorePaths([
    { path: stagedMediaPath, label: 'staged media restore' },
    { path: stagedLicensePath, label: 'staged license restore' }
  ]);
  const recovery = decideRestoreRecovery(recoveryTracker.snapshot());
  if (recovery.message) {
    console.error(recovery.message);
  }
  if (recovery.restartServices) {
    try {
      startAppServices(skipServices);
    } catch (restartError) {
      console.error(
        `Failed to restart app services after restore failure: ${
          restartError instanceof Error ? restartError.message : String(restartError)
        }`
      );
    }
  }
  throw error;
}

function cleanupStagedRestorePaths(entries) {
  for (const entry of entries) {
    if (!entry.path || !existsSync(entry.path)) {
      continue;
    }
    try {
      rmSync(entry.path, { force: true, recursive: true });
      console.error(`Removed abandoned ${entry.label}: ${entry.path}`);
    } catch (cleanupError) {
      console.error(
        `Failed to remove abandoned ${entry.label} at ${entry.path}: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`
      );
    }
  }
}
