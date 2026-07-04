import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnvFile, readArgs } from './install-utils.mjs';
import { redactSensitiveText } from './sensitive-redaction.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');

const args = readArgs();
const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const timeoutMs = Number(args['timeout-ms'] ?? 180_000);
const nodeExe = join(
  releaseRoot,
  'runtime',
  'node',
  process.platform === 'win32' ? 'node.exe' : 'node'
);
const backupCli = join(
  releaseRoot,
  'apps',
  'worker',
  'dist',
  'jobs',
  'backup',
  'run-backup-cli.js'
);

try {
  const env = parseEnvFile(envPath);
  const postgresBinInput =
    String(args['postgres-bin'] ?? '').trim() ||
    env.BELLFIELD_POSTGRES_BIN?.trim() ||
    join(releaseRoot, 'postgres', 'bin');
  const postgresBin = resolve(postgresBinInput);
  const pgDump = resolve(
    env.BELLFIELD_PG_DUMP_PATH?.trim() ||
      join(postgresBin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump')
  );
  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is missing from ${envPath}.`);
  }
  if (!existsSync(nodeExe)) {
    throw new Error(`Packaged Node runtime is missing: ${nodeExe}`);
  }
  if (!existsSync(backupCli)) {
    throw new Error(`Packaged manual backup CLI is missing: ${backupCli}`);
  }
  if (!existsSync(pgDump)) {
    throw new Error(`Packaged pg_dump is missing: ${pgDump}`);
  }

  const result = runCommand(nodeExe, [backupCli], {
    cwd: releaseRoot,
    env: {
      ...process.env,
      ...env,
      NODE_ENV: 'production',
      BOOTSTRAP_SEED_DATA: 'false',
      BELLFIELD_POSTGRES_BIN: env.BELLFIELD_POSTGRES_BIN?.trim() || postgresBin,
      BELLFIELD_PG_DUMP_PATH: env.BELLFIELD_PG_DUMP_PATH?.trim() || pgDump
    },
    timeoutMs
  });
  const backup = parseBackupCliResult(result.stdout);
  const backupSummary = {
    status: backup.status,
    backupSetPath: backup.backupSetPath,
    databaseDumpPath: backup.databaseDumpPath,
    mediaBackupPath: backup.mediaBackupPath,
    manifestPath: backup.manifestPath
  };

  console.log('Packaged manual backup completed.');
  // Machine-readable sentinel line consumed by the Gate Day runner's
  // Parse-BackupSetPath (Gate 2 rerun-25 stopped because this wrapper consumed
  // the inner CLI's sentinel without re-emitting it). Keep the single-line
  // sentinel in addition to the pretty JSON below, which is for operators.
  console.log(`BELLFIELD_BACKUP_RESULT ${JSON.stringify(backupSummary)}`);
  console.log(JSON.stringify(backupSummary, null, 2));
} catch (error) {
  console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
  if (error?.commandOutput) {
    console.error('--- redacted backup output tail ---');
    console.error(tailText(error.commandOutput, 120));
  }
  process.exitCode = 1;
}

function runCommand(command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs
  });

  if (result.error) {
    const error = new Error(`Failed to run ${command}: ${result.error.message}`);
    error.commandOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${command} ${commandArgs.join(' ')} exited with ${result.status}`);
    error.commandOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw error;
  }
  return result;
}

function parseBackupCliResult(stdout) {
  const resultLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('BELLFIELD_BACKUP_RESULT '));
  if (!resultLine) {
    throw new Error('Manual backup CLI did not print BELLFIELD_BACKUP_RESULT.');
  }

  const parsed = JSON.parse(resultLine.replace(/^BELLFIELD_BACKUP_RESULT /, ''));
  if (parsed.status !== 'succeeded') {
    throw new Error(`Manual backup CLI reported ${parsed.status ?? 'unknown'} status.`);
  }
  return parsed;
}

function tailText(text, lines) {
  return redactSensitiveText(String(text).split(/\r?\n/).slice(-lines).join('\n'));
}
