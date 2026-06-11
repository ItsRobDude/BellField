import type { WorkerJob } from '../job-runner';
import { BackupService } from './backup-service';

export function createScheduledBackupJob(input: {
  backupService: BackupService;
  intervalMs: number;
}): WorkerJob {
  return {
    name: 'scheduled-backup',
    intervalMs: input.intervalMs,
    run: ({ signal }) => input.backupService.runBackup({ signal, runKind: 'scheduled' })
  };
}
