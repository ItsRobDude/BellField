import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  BackupService,
  resolvePgToolPath,
  type BackupJobConfig,
  type ProcessRunner
} from './backup-service';
import type {
  BackupRunFailedInput,
  BackupRunRetentionCandidate,
  BackupRunsStore,
  BackupRunSucceededInput,
  LatestSuccessfulBackupRun
} from './backup-runs.repository';

class InMemoryBackupRunsRepository implements BackupRunsStore {
  started: string[] = [];
  succeeded: BackupRunSucceededInput[] = [];
  failed: BackupRunFailedInput[] = [];
  retentionCandidates: BackupRunRetentionCandidate[] = [];
  deletedIds: string[] = [];
  latestSuccessfulRun: LatestSuccessfulBackupRun | null = null;
  runningFailedCount = 0;
  runningFailureInputs: Array<{ completedAt: Date; errorMessage: string }> = [];

  async startRun(input: { id: string; runKind: 'scheduled' | 'manual'; startedAt: Date }) {
    this.started.push(input.id);
  }

  async markSucceeded(input: BackupRunSucceededInput) {
    this.succeeded.push(input);
  }

  async markFailed(input: BackupRunFailedInput) {
    this.failed.push(input);
  }

  async listSuccessfulBeyondRetention() {
    return this.retentionCandidates;
  }

  async markRetentionDeleted(input: { id: string }) {
    this.deletedIds.push(input.id);
  }

  async findLatestSuccessfulRun() {
    return this.latestSuccessfulRun;
  }

  async markRunningAsFailed(input: { completedAt: Date; errorMessage: string }) {
    this.runningFailureInputs.push(input);
    return this.runningFailedCount;
  }
}

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'bellfield-backup-spec-'));
}

function pgDumpExecutableName(): string {
  return process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
}

function minimalBackupConfig(overrides: Partial<BackupJobConfig> = {}): BackupJobConfig {
  return {
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
    mediaRoot: 'media',
    backupRoot: 'backups',
    retentionCount: 7,
    ...overrides
  };
}

test('resolvePgToolPath honors explicit pg_dump path override', () => {
  const explicitPath = join('C:\\BellField', 'custom', pgDumpExecutableName());

  assert.equal(
    resolvePgToolPath('pg_dump', minimalBackupConfig({ pgDumpPath: explicitPath })),
    explicitPath
  );
});

test('resolvePgToolPath finds pg_dump under explicit PostgreSQL bin override', () => {
  const root = createTempRoot();
  try {
    const postgresBin = join(root, 'postgres-bin');
    const pgDump = join(postgresBin, pgDumpExecutableName());
    mkdirSync(postgresBin, { recursive: true });
    writeFileSync(pgDump, '');

    assert.equal(resolvePgToolPath('pg_dump', minimalBackupConfig({ postgresBin })), pgDump);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('resolvePgToolPath finds packaged pg_dump from worker module path regardless of cwd', () => {
  const root = createTempRoot();
  const originalCwd = process.cwd();
  try {
    const releaseRoot = join(root, 'release');
    const moduleDirectory = join(releaseRoot, 'apps', 'worker', 'dist', 'jobs', 'backup');
    const foreignCwd = join(root, 'foreign-cwd');
    const pgDump = join(releaseRoot, 'postgres', 'bin', pgDumpExecutableName());
    mkdirSync(moduleDirectory, { recursive: true });
    mkdirSync(foreignCwd, { recursive: true });
    mkdirSync(join(releaseRoot, 'postgres', 'bin'), { recursive: true });
    writeFileSync(pgDump, '');

    process.chdir(foreignCwd);

    assert.equal(resolvePgToolPath('pg_dump', minimalBackupConfig(), moduleDirectory), pgDump);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService writes a dump, copies media, records success, and writes a manifest', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    const licensePath = join(root, 'bellfield-license.json');
    mkdirSync(mediaRoot, { recursive: true });
    writeFileSync(join(mediaRoot, 'photo.txt'), 'media bytes', { flag: 'wx' });
    writeFileSync(licensePath, '{"license":"fixture"}', { flag: 'wx' });

    const repository = new InMemoryBackupRunsRepository();
    const processRunner: ProcessRunner = async (_command, args, options) => {
      assert.equal(options.env?.PGDATABASE, 'bellfield');
      assert.equal(options.env?.PGUSER, 'postgres');
      assert.equal(options.env?.PGPASSWORD, 'postgres');
      const dumpPath = args[args.indexOf('--file') + 1];
      writeFileSync(dumpPath, 'dump bytes');
      return { status: 0, stdout: '', stderr: '' };
    };

    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        licensePath,
        backupRoot,
        retentionCount: 7
      },
      repository,
      {
        processRunner,
        now: () => new Date('2026-06-11T01:15:33.000Z')
      }
    );

    const result = await service.runBackup();

    assert.equal(result.status, 'succeeded');
    if (result.status !== 'succeeded') {
      throw new Error('expected backup to succeed');
    }
    assert.equal(
      result.backupSetPath,
      join(backupRoot, `bellfield-backup-20260611-011533Z-${repository.started[0].slice(0, 8)}`)
    );
    assert.equal(repository.failed.length, 0);
    assert.equal(repository.succeeded.length, 1);
    const success = repository.succeeded[0];
    assert.ok(existsSync(success.databaseDumpPath));
    assert.ok(existsSync(join(success.mediaBackupPath, 'photo.txt')));
    assert.ok(existsSync(success.manifestPath));
    assert.ok(existsSync(join(success.backupSetPath, 'license', 'bellfield-license.json')));
    const manifest = JSON.parse(readFileSync(success.manifestPath, 'utf8'));
    assert.deepEqual(manifest.license, {
      included: true,
      sourcePath: licensePath,
      file: 'license/bellfield-license.json'
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService records failure and removes the partial backup set', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    mkdirSync(mediaRoot, { recursive: true });
    writeFileSync(join(mediaRoot, 'photo.txt'), 'media bytes', { flag: 'wx' });

    const repository = new InMemoryBackupRunsRepository();
    const processRunner: ProcessRunner = async () => ({ status: 1, stderr: 'pg_dump failed' });
    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        backupRoot,
        retentionCount: 7
      },
      repository,
      {
        processRunner,
        now: () => new Date('2026-06-11T01:15:33.000Z')
      }
    );

    const result = await service.runBackup();

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') {
      throw new Error('expected backup to fail');
    }
    assert.match(result.errorMessage, /pg_dump failed/);
    assert.equal(repository.succeeded.length, 0);
    assert.equal(repository.failed.length, 1);
    assert.match(repository.failed[0].errorMessage, /pg_dump failed/);
    assert.equal(
      existsSync(
        join(backupRoot, `bellfield-backup-20260611-011533Z-${repository.started[0].slice(0, 8)}`)
      ),
      false
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService failure does not remove a pre-existing backup set path collision', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    mkdirSync(mediaRoot, { recursive: true });
    mkdirSync(backupRoot, { recursive: true });
    writeFileSync(join(mediaRoot, 'photo.txt'), 'media bytes', { flag: 'wx' });

    const repository = new InMemoryBackupRunsRepository();
    const collisionPath = join(backupRoot, 'bellfield-backup-20260611-011533Z-collision');
    mkdirSync(collisionPath, { recursive: true });
    writeFileSync(join(collisionPath, 'marker.txt'), 'do not delete', { flag: 'wx' });

    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        backupRoot,
        retentionCount: 7
      },
      repository,
      {
        processRunner: async () => ({ status: 1, stderr: 'pg_dump failed' }),
        now: () => new Date('2026-06-11T01:15:33.000Z')
      }
    );

    await service.runBackup();

    assert.equal(existsSync(join(collisionPath, 'marker.txt')), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService runBackupOrThrow rejects when the backup fails', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    mkdirSync(mediaRoot, { recursive: true });
    const repository = new InMemoryBackupRunsRepository();
    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        backupRoot,
        retentionCount: 7
      },
      repository,
      {
        processRunner: async () => ({ status: 1, stderr: 'pg_dump failed' }),
        now: () => new Date('2026-06-11T01:15:33.000Z')
      }
    );

    await assert.rejects(() => service.runBackupOrThrow({ runKind: 'manual' }), /pg_dump failed/);
    assert.equal(repository.failed.length, 1);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService applies retention after a successful backup', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    const oldBackupSetPath = join(backupRoot, 'bellfield-backup-old');
    mkdirSync(mediaRoot, { recursive: true });
    mkdirSync(oldBackupSetPath, { recursive: true });
    writeFileSync(join(mediaRoot, 'photo.txt'), 'media bytes', { flag: 'wx' });
    writeFileSync(join(oldBackupSetPath, 'manifest.json'), '{}', { flag: 'wx' });

    const repository = new InMemoryBackupRunsRepository();
    repository.retentionCandidates = [{ id: 'old-run', backupSetPath: oldBackupSetPath }];
    const processRunner: ProcessRunner = async (_command, args) => {
      writeFileSync(args[args.indexOf('--file') + 1], 'dump bytes');
      return { status: 0, stdout: '', stderr: '' };
    };
    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        backupRoot,
        retentionCount: 1
      },
      repository,
      { processRunner }
    );

    await service.runBackup();

    assert.equal(existsSync(oldBackupSetPath), false);
    assert.deepEqual(repository.deletedIds, ['old-run']);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService startup preparation fails orphaned runs and removes manifest-less partial sets', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    const partialBackupSetPath = join(backupRoot, 'bellfield-backup-partial');
    const successfulBackupSetPath = join(backupRoot, 'bellfield-backup-successful');
    mkdirSync(mediaRoot, { recursive: true });
    mkdirSync(partialBackupSetPath, { recursive: true });
    mkdirSync(successfulBackupSetPath, { recursive: true });
    writeFileSync(join(partialBackupSetPath, 'database.dump'), 'partial', { flag: 'wx' });
    writeFileSync(join(successfulBackupSetPath, 'manifest.json'), '{}', { flag: 'wx' });
    const oldPartialTime = new Date('2026-06-11T01:00:00.000Z');
    utimesSync(partialBackupSetPath, oldPartialTime, oldPartialTime);

    const repository = new InMemoryBackupRunsRepository();
    repository.runningFailedCount = 2;
    repository.latestSuccessfulRun = { completedAt: '2026-06-11T01:00:00.000Z' };
    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        backupRoot,
        retentionCount: 7
      },
      repository,
      { now: () => new Date('2026-06-11T02:00:00.000Z') }
    );

    const prepared = await service.prepareForScheduling();

    assert.equal(prepared.orphanedRunningRunsFailed, 2);
    assert.deepEqual(prepared.latestSuccessfulRun, repository.latestSuccessfulRun);
    assert.deepEqual(repository.runningFailureInputs, [
      {
        completedAt: new Date('2026-06-11T02:00:00.000Z'),
        errorMessage: 'Backup run did not complete before worker restart.'
      }
    ]);
    assert.equal(existsSync(partialBackupSetPath), false);
    assert.equal(existsSync(successfulBackupSetPath), true);
    assert.deepEqual(prepared.removedPartialBackupSetPaths, [partialBackupSetPath]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('BackupService startup preparation leaves fresh manifest-less partial sets alone', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    const freshPartialBackupSetPath = join(backupRoot, 'bellfield-backup-fresh-partial');
    mkdirSync(mediaRoot, { recursive: true });
    mkdirSync(freshPartialBackupSetPath, { recursive: true });
    writeFileSync(join(freshPartialBackupSetPath, 'database.dump'), 'partial', { flag: 'wx' });
    const freshPartialTime = new Date('2026-06-11T01:45:00.000Z');
    utimesSync(freshPartialBackupSetPath, freshPartialTime, freshPartialTime);

    const repository = new InMemoryBackupRunsRepository();
    const service = new BackupService(
      {
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/bellfield',
        mediaRoot,
        backupRoot,
        retentionCount: 7
      },
      repository,
      { now: () => new Date('2026-06-11T02:00:00.000Z') }
    );

    const prepared = await service.prepareForScheduling();

    assert.equal(existsSync(freshPartialBackupSetPath), true);
    assert.deepEqual(prepared.removedPartialBackupSetPaths, []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
