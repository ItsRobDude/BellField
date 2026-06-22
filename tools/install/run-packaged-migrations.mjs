import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { databaseConfigFromUrl, parseEnvFile, readArgs } from './install-utils.mjs';
import { redactSensitiveText } from './sensitive-redaction.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');

const args = readArgs();
const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const env = parseEnvFile(envPath);
const postgresBin = resolve(
  String(args['postgres-bin'] ?? env.BELLFIELD_POSTGRES_BIN ?? join(releaseRoot, 'postgres', 'bin'))
);
const postgresData = resolve(
  String(
    args['postgres-data'] ?? env.BELLFIELD_POSTGRES_DATA ?? join(installRoot, 'data', 'postgres')
  )
);
const postgresLog = resolve(
  String(args.log ?? join(installRoot, 'data', 'logs', 'manual-postgres-migrations.log'))
);
const timeoutMs = Number(args['timeout-ms'] ?? 180_000);
const stopTimeoutMs = Number(args['stop-timeout-ms'] ?? 180_000);
const stopTimeoutSeconds = Math.max(1, Math.ceil(stopTimeoutMs / 1000));
const pgCtl = pgTool('pg_ctl', postgresBin);
const migrationScript = join(releaseRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs');

let startedPostgres = false;
let migrationOutput = '';
let stopFailure = null;

try {
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is missing from ${envPath}.`);
  }
  if (!existsSync(pgCtl)) {
    throw new Error(
      `PostgreSQL pg_ctl not found at ${pgCtl}. Set --postgres-bin or BELLFIELD_POSTGRES_BIN.`
    );
  }
  if (!existsSync(join(postgresData, 'PG_VERSION'))) {
    throw new Error(
      `PostgreSQL data directory is not initialized at ${postgresData}. Run provision-postgres.mjs first.`
    );
  }
  if (!existsSync(migrationScript)) {
    throw new Error(`Packaged migration script is missing: ${migrationScript}`);
  }

  mkdirSync(dirname(postgresLog), { recursive: true });
  const database = databaseConfigFromUrl(env.DATABASE_URL);
  const status = runCommand(pgCtl, ['-D', postgresData, 'status'], {
    capture: true,
    allowFailure: true
  });
  if (status.status === 0) {
    throw new Error(
      `PostgreSQL already appears to be running for ${postgresData}. Stop BellField services or use a clean migration path before running this helper.`
    );
  }

  runCommand(pgCtl, [
    '-D',
    postgresData,
    '-l',
    postgresLog,
    '-o',
    `-h ${database.host} -p ${database.port}`,
    '-w',
    'start'
  ]);
  startedPostgres = true;

  const migrationResult = runCommand(process.execPath, [migrationScript], {
    cwd: join(releaseRoot, 'apps', 'api'),
    env: {
      ...process.env,
      ...env,
      DATABASE_URL: env.DATABASE_URL,
      PGCONNECT_TIMEOUT: env.PGCONNECT_TIMEOUT ?? '5'
    },
    capture: true,
    timeoutMs
  });
  migrationOutput = [migrationResult.stdout, migrationResult.stderr].filter(Boolean).join('\n');

  stopPostgres();
  startedPostgres = false;
  console.log(`Packaged migrations completed using ${migrationScript}.`);
  console.log(`Temporary PostgreSQL log: ${postgresLog}`);
} catch (error) {
  printFailureEvidence(error);
  process.exitCode = 1;
} finally {
  if (startedPostgres) {
    try {
      stopPostgres();
    } catch (error) {
      stopFailure = error;
      process.exitCode = 1;
    }
  }

  if (stopFailure) {
    printStopFailureEvidence(stopFailure);
  }
}

function pgTool(name, postgresBinPath) {
  return join(postgresBinPath, process.platform === 'win32' ? `${name}.exe` : name);
}

function stopPostgres() {
  runCommand(
    pgCtl,
    ['-D', postgresData, '-m', 'fast', '-t', String(stopTimeoutSeconds), '-w', 'stop'],
    { timeoutMs: stopTimeoutMs + 15_000 }
  );
}

function runCommand(command, commandArgs, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    timeout: options.timeoutMs ?? 120_000
  });

  if (result.error) {
    const error = new Error(`Failed to run ${command}: ${result.error.message}`);
    error.commandOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const error = new Error(`${command} ${commandArgs.join(' ')} exited with ${result.status}`);
    error.commandOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw error;
  }

  return result;
}

function printFailureEvidence(error) {
  console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));

  const commandOutput = error?.commandOutput ? String(error.commandOutput).trim() : '';
  const combinedMigrationOutput = [migrationOutput, commandOutput].filter(Boolean).join('\n');
  if (combinedMigrationOutput.trim()) {
    console.error('--- redacted migration output tail ---');
    console.error(tailText(combinedMigrationOutput, 120));
  }

  if (existsSync(postgresLog)) {
    console.error('--- redacted PostgreSQL log tail ---');
    console.error(tailText(readFileSync(postgresLog, 'utf8'), 120));
  }
}

function printStopFailureEvidence(error) {
  console.error(
    redactSensitiveText(
      `Failed to stop temporary PostgreSQL after migration helper failure: ${error.message}`
    )
  );

  try {
    const status = runCommand(pgCtl, ['-D', postgresData, 'status'], {
      capture: true,
      allowFailure: true,
      timeoutMs: 15_000
    });
    const statusOutput = [status.stdout, status.stderr].filter(Boolean).join('\n').trim();
    if (statusOutput) {
      console.error('--- redacted PostgreSQL status after failed stop ---');
      console.error(tailText(statusOutput, 40));
    }
  } catch (statusError) {
    console.error(
      redactSensitiveText(
        `Failed to capture PostgreSQL status after failed stop: ${statusError.message}`
      )
    );
  }

  if (existsSync(postgresLog)) {
    console.error('--- redacted PostgreSQL log tail after failed stop ---');
    console.error(tailText(readFileSync(postgresLog, 'utf8'), 120));
  }
}

function tailText(text, lines) {
  return redactSensitiveText(String(text).split(/\r?\n/).slice(-lines).join('\n'));
}
