import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { BackupRunsStore, LatestSuccessfulBackupRun } from './backup-runs.repository';
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

export type ProcessRunOptions = {
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export type ProcessRunner = (
  command: string,
  args: string[],
  options: ProcessRunOptions
) => Promise<ProcessRunResult>;

export type BackupServiceOptions = {
  now?: () => Date;
  processRunner?: ProcessRunner;
};

type RunBackupInput = {
  signal?: AbortSignal;
  runKind?: 'scheduled' | 'manual';
};

export type BackupRunSuccess = {
  status: 'succeeded';
  backupSetPath: string;
  databaseDumpPath: string;
  mediaBackupPath: string;
  manifestPath: string;
};

export type BackupRunFailure = {
  status: 'failed';
  errorMessage: string;
};

export type BackupRunResult = BackupRunSuccess | BackupRunFailure;

const backupManifestFilename = 'manifest.json';
const databaseDumpFilename = 'database.dump';
const mediaBackupDirectoryName = 'media';
const licenseBackupDirectoryName = 'license';
const licenseBackupFilename = 'bellfield-license.json';
const manifestlessPartialMinimumAgeMs = 30 * 60 * 1000;

export class BackupService {
  private readonly now: () => Date;
  private readonly processRunner: ProcessRunner;

  constructor(
    private readonly config: BackupJobConfig,
    private readonly repository: BackupRunsStore,
    options: BackupServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.processRunner = options.processRunner ?? defaultProcessRunner;
  }

  async runBackup(input: RunBackupInput = {}): Promise<BackupRunResult> {
    const runKind = input.runKind ?? 'scheduled';
    const startedAt = this.now();
    const backupId = randomUUID();
    const backupSetPath = resolve(
      this.config.backupRoot,
      `bellfield-backup-${timestampForPath(startedAt)}-${backupId.slice(0, 8)}`
    );
    const databaseDumpPath = join(backupSetPath, databaseDumpFilename);
    const mediaBackupPath = join(backupSetPath, mediaBackupDirectoryName);
    const manifestPath = join(backupSetPath, backupManifestFilename);
    let backupSetCreated = false;

    await this.repository.startRun({ id: backupId, runKind, startedAt });

    try {
      throwIfAborted(input.signal);
      mkdirSync(this.config.backupRoot, { recursive: true });
      mkdirSync(backupSetPath, { recursive: false });
      backupSetCreated = true;
      await this.dumpDatabase(databaseDumpPath, input.signal);

      throwIfAborted(input.signal);
      await this.copyMediaRoot(mediaBackupPath, input.signal);

      throwIfAborted(input.signal);
      const licenseBackupPath = await this.copyLicenseFile(backupSetPath, input.signal);

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

      const success = {
        status: 'succeeded' as const,
        backupSetPath,
        databaseDumpPath,
        mediaBackupPath,
        manifestPath
      };
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
      return success;
    } catch (error) {
      if (backupSetCreated && isPathInsideDirectory(backupSetPath, this.config.backupRoot)) {
        rmSync(backupSetPath, { force: true, recursive: true });
      }
      const completedAt = this.now();
      const errorMessage = sanitizeErrorMessage(error);
      await this.repository.markFailed({
        id: backupId,
        completedAt,
        errorMessage
      });
      workerLog('error', 'Backup failed.', { backupId, errorMessage });
      return {
        status: 'failed',
        errorMessage
      };
    }
  }

  async runBackupOrThrow(input: RunBackupInput = {}): Promise<BackupRunSuccess> {
    const result = await this.runBackup(input);
    if (result.status === 'failed') {
      throw new Error(result.errorMessage);
    }
    return result;
  }

  async prepareForScheduling(): Promise<{
    latestSuccessfulRun: LatestSuccessfulBackupRun | null;
    orphanedRunningRunsFailed: number;
    removedPartialBackupSetPaths: string[];
  }> {
    const completedAt = this.now();
    const orphanedRunningRunsFailed = await this.repository.markRunningAsFailed({
      completedAt,
      errorMessage: 'Backup run did not complete before worker restart.'
    });
    const removedPartialBackupSetPaths = this.removeManifestlessPartialBackupSets();
    const latestSuccessfulRun = await this.repository.findLatestSuccessfulRun();

    return {
      latestSuccessfulRun,
      orphanedRunningRunsFailed,
      removedPartialBackupSetPaths
    };
  }

  private async dumpDatabase(databaseDumpPath: string, signal: AbortSignal | undefined) {
    const command = resolvePgToolPath('pg_dump', this.config);
    const result = await this.processRunner(
      command,
      ['--format=custom', '--file', databaseDumpPath],
      {
        env: {
          ...process.env,
          ...pgEnvironmentFromDatabaseUrl(this.config.databaseUrl)
        },
        signal
      }
    );

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

  private async copyMediaRoot(
    mediaBackupPath: string,
    signal: AbortSignal | undefined
  ): Promise<void> {
    const mediaRoot = resolve(this.config.mediaRoot);
    if (!existsSync(mediaRoot)) {
      throw new Error(`Media root does not exist: ${mediaRoot}`);
    }

    await copyDirectoryInterruptibly(mediaRoot, mediaBackupPath, signal);
  }

  private async copyLicenseFile(
    backupSetPath: string,
    signal: AbortSignal | undefined
  ): Promise<string | null> {
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
    throwIfAborted(signal);
    await mkdir(join(backupSetPath, licenseBackupDirectoryName), { recursive: true });
    throwIfAborted(signal);
    await copyFile(sourcePath, licenseBackupPath);
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

  private removeManifestlessPartialBackupSets(): string[] {
    const backupRoot = resolve(this.config.backupRoot);
    if (!existsSync(backupRoot)) {
      return [];
    }

    const removed: string[] = [];
    for (const entry of readdirSync(backupRoot)) {
      if (!entry.startsWith('bellfield-backup-')) {
        continue;
      }

      const candidate = resolve(backupRoot, entry);
      if (!isPathInsideDirectory(candidate, backupRoot)) {
        continue;
      }
      if (!lstatSync(candidate).isDirectory()) {
        continue;
      }
      if (existsSync(join(candidate, backupManifestFilename))) {
        continue;
      }
      const candidateAgeMs = this.now().getTime() - statSync(candidate).mtimeMs;
      if (candidateAgeMs < manifestlessPartialMinimumAgeMs) {
        continue;
      }

      rmSync(candidate, { force: true, recursive: true });
      removed.push(candidate);
    }

    return removed;
  }
}

async function defaultProcessRunner(
  command: string,
  args: string[],
  options: ProcessRunOptions
): Promise<ProcessRunResult> {
  return await new Promise((resolve) => {
    if (options.signal?.aborted) {
      resolve({ status: null, error: new Error(`${basename(command)} canceled before start.`) });
      return;
    }

    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: ProcessRunResult) => {
      if (settled) {
        return;
      }
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => {
      child.kill();
      finish({ status: null, error: new Error(`${basename(command)} canceled during shutdown.`) });
    };

    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish({ status: null, error, stdout, stderr }));
    child.on('close', (status) => finish({ status, stdout, stderr }));
  });
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

async function copyDirectoryInterruptibly(
  source: string,
  target: string,
  signal: AbortSignal | undefined
): Promise<void> {
  throwIfAborted(signal);
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`Media copy does not support symbolic links: ${source}`);
  }
  if (sourceStat.isFile()) {
    await mkdir(dirname(target), { recursive: true });
    throwIfAborted(signal);
    await copyFile(source, target);
    return;
  }
  if (!sourceStat.isDirectory()) {
    return;
  }

  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source)) {
    throwIfAborted(signal);
    await copyDirectoryInterruptibly(join(source, entry), join(target, entry), signal);
  }
}

function isPathInsideDirectory(candidate: string, directory: string): boolean {
  const normalizedDirectory = resolve(directory);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedDirectory ||
    normalizedCandidate.startsWith(`${normalizedDirectory}\\`) ||
    normalizedCandidate.startsWith(`${normalizedDirectory}/`)
  );
}

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').slice(0, 1_000);
}
