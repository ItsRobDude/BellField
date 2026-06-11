import { randomUUID } from 'node:crypto';
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { BackupRunsWriter } from './backup-runs.repository';
import { workerLog } from '../../common/logger';

export type BackupJobConfig = {
  databaseUrl: string;
  mediaRoot: string;
  licensePath?: string;
  backupRoot: string;
  retentionCount: number;
  postgresBin?: string;
  pgDumpPath?: string;
};

export type ProcessRunResult = {
  status: number | null;
  error?: Error;
  stdout?: string;
  stderr?: string;
};

export type ProcessRunner = (
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding
) => ProcessRunResult;

export type BackupServiceOptions = {
  now?: () => Date;
  processRunner?: ProcessRunner;
};

type RunBackupInput = {
  signal?: AbortSignal;
  runKind?: 'scheduled' | 'manual';
};

const backupManifestFilename = 'manifest.json';
const databaseDumpFilename = 'database.dump';
const mediaBackupDirectoryName = 'media';
const licenseBackupDirectoryName = 'license';
const licenseBackupFilename = 'bellfield-license.json';

export class BackupService {
  private readonly now: () => Date;
  private readonly processRunner: ProcessRunner;

  constructor(
    private readonly config: BackupJobConfig,
    private readonly repository: BackupRunsWriter,
    options: BackupServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.processRunner = options.processRunner ?? defaultProcessRunner;
  }

  async runBackup(input: RunBackupInput = {}): Promise<void> {
    const runKind = input.runKind ?? 'scheduled';
    const startedAt = this.now();
    const backupId = randomUUID();
    const backupSetPath = resolve(
      this.config.backupRoot,
      `bellfield-backup-${timestampForPath(startedAt)}`
    );
    const databaseDumpPath = join(backupSetPath, databaseDumpFilename);
    const mediaBackupPath = join(backupSetPath, mediaBackupDirectoryName);
    const manifestPath = join(backupSetPath, backupManifestFilename);

    await this.repository.startRun({ id: backupId, runKind, startedAt });

    try {
      throwIfAborted(input.signal);
      mkdirSync(this.config.backupRoot, { recursive: true });
      mkdirSync(backupSetPath, { recursive: false });
      this.dumpDatabase(databaseDumpPath);

      throwIfAborted(input.signal);
      this.copyMediaRoot(mediaBackupPath);

      throwIfAborted(input.signal);
      const licenseBackupPath = this.copyLicenseFile(backupSetPath);

      const completedAt = this.now();
      const manifest = {
        schemaVersion: 1,
        backupId,
        runKind,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        database: {
          format: 'pg_dump-custom',
          file: databaseDumpFilename
        },
        media: {
          sourceRoot: resolve(this.config.mediaRoot),
          directory: mediaBackupDirectoryName
        },
        license: licenseBackupPath
          ? {
              included: true,
              sourcePath: resolve(this.config.licensePath ?? ''),
              file: `${licenseBackupDirectoryName}/${licenseBackupFilename}`
            }
          : {
              included: false,
              sourcePath: this.config.licensePath ? resolve(this.config.licensePath) : null,
              file: null
            },
        retention: {
          keepSuccessful: this.config.retentionCount
        },
        bytes: {
          backupSet: directorySizeBytes(backupSetPath)
        }
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      await this.repository.markSucceeded({
        id: backupId,
        completedAt,
        backupSetPath,
        databaseDumpPath,
        mediaBackupPath,
        manifestPath
      });
      await this.applyRetention();

      workerLog('info', 'Backup completed.', {
        backupId,
        backupSetPath,
        retentionCount: this.config.retentionCount
      });
    } catch (error) {
      rmSync(backupSetPath, { force: true, recursive: true });
      const completedAt = this.now();
      const errorMessage = sanitizeErrorMessage(error);
      await this.repository.markFailed({
        id: backupId,
        completedAt,
        errorMessage
      });
      workerLog('error', 'Backup failed.', { backupId, errorMessage });
    }
  }

  private dumpDatabase(databaseDumpPath: string): void {
    const command = resolvePgToolPath('pg_dump', this.config);
    const result = this.processRunner(command, ['--format=custom', '--file', databaseDumpPath], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...pgEnvironmentFromDatabaseUrl(this.config.databaseUrl)
      }
    });

    if (result.error) {
      throw new Error(`${basename(command)} failed: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const detail = sanitizeErrorMessage(result.stderr || result.stdout || 'no details');
      throw new Error(`${basename(command)} exited with ${result.status ?? 1}: ${detail}`);
    }

    if (!existsSync(databaseDumpPath)) {
      throw new Error(`${basename(command)} completed without writing ${databaseDumpFilename}.`);
    }
  }

  private copyMediaRoot(mediaBackupPath: string): void {
    const mediaRoot = resolve(this.config.mediaRoot);
    if (!existsSync(mediaRoot)) {
      throw new Error(`Media root does not exist: ${mediaRoot}`);
    }

    cpSync(mediaRoot, mediaBackupPath, { recursive: true });
  }

  private copyLicenseFile(backupSetPath: string): string | null {
    if (!this.config.licensePath) {
      return null;
    }

    const sourcePath = resolve(this.config.licensePath);
    if (!existsSync(sourcePath)) {
      throw new Error(`License file is configured but does not exist: ${sourcePath}`);
    }
    if (!statSync(sourcePath).isFile()) {
      throw new Error(`License path is not a file: ${sourcePath}`);
    }

    const licenseBackupPath = join(
      backupSetPath,
      licenseBackupDirectoryName,
      licenseBackupFilename
    );
    mkdirSync(join(backupSetPath, licenseBackupDirectoryName), { recursive: true });
    cpSync(sourcePath, licenseBackupPath);
    return licenseBackupPath;
  }

  private async applyRetention(): Promise<void> {
    const oldBackupSets = await this.repository.listSuccessfulBeyondRetention(
      this.config.retentionCount
    );

    for (const oldBackupSet of oldBackupSets) {
      rmSync(oldBackupSet.backupSetPath, { force: true, recursive: true });
      await this.repository.markRetentionDeleted({
        id: oldBackupSet.id,
        deletedAt: this.now()
      });
    }
  }
}

function defaultProcessRunner(
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding
): ProcessRunResult {
  return spawnSync(command, args, options);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error('Backup canceled during worker shutdown.');
  }
}

function timestampForPath(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(':', '')
    .replaceAll('-', '')
    .replace('T', '-');
}

function resolvePgToolPath(name: 'pg_dump', config: BackupJobConfig): string {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  if (config.pgDumpPath) {
    return config.pgDumpPath;
  }

  const candidates = [
    config.postgresBin ? join(config.postgresBin, executable) : undefined,
    join(process.cwd(), '..', '..', 'postgres', 'bin', executable)
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? executable;
}

function pgEnvironmentFromDatabaseUrl(databaseUrl: string): NodeJS.ProcessEnv {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection string.');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name for backups.');
  }

  return {
    PGHOST: url.hostname,
    PGPORT: url.port || undefined,
    PGUSER: url.username ? decodeURIComponent(url.username) : undefined,
    PGPASSWORD: url.password ? decodeURIComponent(url.password) : undefined,
    PGDATABASE: databaseName
  };
}

function directorySizeBytes(path: string): number {
  const stat = statSync(path);
  if (stat.isFile()) {
    return stat.size;
  }
  if (!stat.isDirectory()) {
    return 0;
  }

  return readdirSync(path).reduce((total, entry) => {
    return total + directorySizeBytes(join(path, entry));
  }, 0);
}

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').slice(0, 1_000);
}
