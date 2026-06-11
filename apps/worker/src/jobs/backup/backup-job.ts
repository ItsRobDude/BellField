import type { WorkerJob } from '../job-runner';
import { workerLog, type WorkerLogContext } from '../../common/logger';
import { BackupService } from './backup-service';

type BackupJobLog = (level: 'info' | 'error', message: string, context?: WorkerLogContext) => void;

export async function createScheduledBackupJob(input: {
  backupService: BackupService;
  intervalMs: number;
  now?: () => Date;
  log?: BackupJobLog;
}): Promise<WorkerJob> {
  const log = input.log ?? workerLog;
  let initialDelayMs = 0;

  try {
    const prepared = await input.backupService.prepareForScheduling();
    initialDelayMs = calculateInitialBackupDelayMs(
      prepared.latestSuccessfulRun?.completedAt ?? null,
      input.intervalMs,
      input.now?.() ?? new Date()
    );
    log('info', 'Scheduled backup startup check completed.', {
      initialDelayMs,
      orphanedRunningRunsFailed: prepared.orphanedRunningRunsFailed,
      removedPartialBackupSetCount: prepared.removedPartialBackupSetPaths.length
    });
  } catch (error) {
    initialDelayMs = 0;
    log('error', 'Scheduled backup startup check failed; backup will run immediately.', {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  return {
    name: 'scheduled-backup',
    intervalMs: input.intervalMs,
    initialDelayMs,
    run: ({ signal }) => input.backupService.runBackup({ signal, runKind: 'scheduled' })
  };
}

export function calculateInitialBackupDelayMs(
  latestSuccessfulCompletedAt: string | null,
  intervalMs: number,
  now: Date
): number {
  if (!latestSuccessfulCompletedAt) {
    return 0;
  }

  const completedAtMs = Date.parse(latestSuccessfulCompletedAt);
  if (!Number.isFinite(completedAtMs)) {
    return 0;
  }

  const elapsedMs = now.getTime() - completedAtMs;
  if (elapsedMs >= intervalMs) {
    return 0;
  }

  return Math.min(intervalMs, Math.max(0, intervalMs - elapsedMs));
}
