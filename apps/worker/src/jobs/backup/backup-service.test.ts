import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BackupService, type ProcessRunner } from './backup-service';
import type {
  BackupRunFailedInput,
  BackupRunRetentionCandidate,
  BackupRunsWriter,
  BackupRunSucceededInput
} from './backup-runs.repository';

class InMemoryBackupRunsRepository implements BackupRunsWriter {
  started: string[] = [];
  succeeded: BackupRunSucceededInput[] = [];
  failed: BackupRunFailedInput[] = [];
  retentionCandidates: BackupRunRetentionCandidate[] = [];
  deletedIds: string[] = [];

  async startRun(input: { id: string }): Promise<void> {
    this.started.push(input.id);
  }

  async markSucceeded(input: BackupRunSucceededInput): Promise<void> {
    this.succeeded.push(input);
  }

  async markFailed(input: BackupRunFailedInput): Promise<void> {
    this.failed.push(input);
  }

  async listSuccessfulBeyondRetention(): Promise<BackupRunRetentionCandidate[]> {
    return this.retentionCandidates;
  }

  async markRetentionDeleted(input: { id: string }): Promise<void> {
    this.deletedIds.push(input.id);
  }
}

function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'bellfield-backup-spec-'));
}

test('BackupService writes a dump, copies media, records success, and writes a manifest', async () => {
  const root = createTempRoot();
  try {
    const mediaRoot = join(root, 'media');
    const backupRoot = join(root, 'backups');
    mkdirSync(mediaRoot, { recursive: true });
    writeFileSync(join(mediaRoot, 'photo.txt'), 'media bytes', { flag: 'wx' });

    const repository = new InMemoryBackupRunsRepository();
    const processRunner: ProcessRunner = (_command, args, options) => {
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
        backupRoot,
        retentionCount: 7
      },
      repository,
      {
        processRunner,
        now: () => new Date('2026-06-11T01:15:33.000Z')
      }
    );

    await service.runBackup();

    assert.equal(repository.failed.length, 0);
    assert.equal(repository.succeeded.length, 1);
    const success = repository.succeeded[0];
    assert.ok(existsSync(success.databaseDumpPath));
    assert.ok(existsSync(join(success.mediaBackupPath, 'photo.txt')));
    assert.ok(existsSync(success.manifestPath));
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
    const processRunner: ProcessRunner = () => ({ status: 1, stderr: 'pg_dump failed' });
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

    await service.runBackup();

    assert.equal(repository.succeeded.length, 0);
    assert.equal(repository.failed.length, 1);
    assert.match(repository.failed[0].errorMessage, /pg_dump failed/);
    assert.equal(existsSync(join(backupRoot, 'bellfield-backup-20260611-011533Z')), false);
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
    const processRunner: ProcessRunner = (_command, args) => {
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
