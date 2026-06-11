import type { QueryExecutor } from '../../common/database';

export type BackupRunKind = 'scheduled' | 'manual';

export type BackupRunSucceededInput = {
  id: string;
  completedAt: Date;
  backupSetPath: string;
  databaseDumpPath: string;
  mediaBackupPath: string;
  manifestPath: string;
};

export type BackupRunFailedInput = {
  id: string;
  completedAt: Date;
  errorMessage: string;
};

export type BackupRunRetentionCandidate = {
  id: string;
  backupSetPath: string;
};

export type LatestSuccessfulBackupRun = {
  completedAt: string;
};

export interface BackupRunsStore {
  startRun(input: { id: string; runKind: BackupRunKind; startedAt: Date }): Promise<void>;
  markSucceeded(input: BackupRunSucceededInput): Promise<void>;
  markFailed(input: BackupRunFailedInput): Promise<void>;
  listSuccessfulBeyondRetention(retentionCount: number): Promise<BackupRunRetentionCandidate[]>;
  markRetentionDeleted(input: { id: string; deletedAt: Date }): Promise<void>;
  findLatestSuccessfulRun(): Promise<LatestSuccessfulBackupRun | null>;
  markRunningAsFailed(input: { completedAt: Date; errorMessage: string }): Promise<number>;
}

export class BackupRunsRepository implements BackupRunsStore {
  constructor(private readonly database: QueryExecutor) {}

  async startRun(input: { id: string; runKind: BackupRunKind; startedAt: Date }): Promise<void> {
    await this.database.query(
      `insert into backup_runs (id, run_kind, status, started_at)
       values ($1, $2, 'running', $3)`,
      [input.id, input.runKind, input.startedAt.toISOString()]
    );
  }

  async markSucceeded(input: BackupRunSucceededInput): Promise<void> {
    await this.database.query(
      `update backup_runs
          set status = 'succeeded',
              completed_at = $2,
              backup_set_path = $3,
              database_dump_path = $4,
              media_backup_path = $5,
              manifest_path = $6,
              error_message = null
        where id = $1`,
      [
        input.id,
        input.completedAt.toISOString(),
        input.backupSetPath,
        input.databaseDumpPath,
        input.mediaBackupPath,
        input.manifestPath
      ]
    );
  }

  async markFailed(input: BackupRunFailedInput): Promise<void> {
    await this.database.query(
      `update backup_runs
          set status = 'failed',
              completed_at = $2,
              error_message = $3
        where id = $1`,
      [input.id, input.completedAt.toISOString(), input.errorMessage]
    );
  }

  async listSuccessfulBeyondRetention(
    retentionCount: number
  ): Promise<BackupRunRetentionCandidate[]> {
    const result = await this.database.query<{
      id: string;
      backupSetPath: string;
    }>(
      `select id, backup_set_path as "backupSetPath"
         from backup_runs
        where status = 'succeeded'
          and backup_set_deleted_at is null
          and backup_set_path is not null
        order by completed_at desc
        offset $1`,
      [retentionCount]
    );
    return result.rows;
  }

  async markRetentionDeleted(input: { id: string; deletedAt: Date }): Promise<void> {
    await this.database.query(
      `update backup_runs
          set backup_set_deleted_at = $2
        where id = $1`,
      [input.id, input.deletedAt.toISOString()]
    );
  }

  async findLatestSuccessfulRun(): Promise<LatestSuccessfulBackupRun | null> {
    const result = await this.database.query<LatestSuccessfulBackupRun>(
      `select completed_at as "completedAt"
         from backup_runs
        where status = 'succeeded'
          and backup_set_deleted_at is null
        order by completed_at desc
        limit 1`
    );
    return result.rows[0] ?? null;
  }

  async markRunningAsFailed(input: { completedAt: Date; errorMessage: string }): Promise<number> {
    const result = await this.database.query(
      `update backup_runs
          set status = 'failed',
              completed_at = $1,
              error_message = $2
        where status = 'running'`,
      [input.completedAt.toISOString(), input.errorMessage]
    );
    return result.rowCount ?? 0;
  }
}
