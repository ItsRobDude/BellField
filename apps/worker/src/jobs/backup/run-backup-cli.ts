import { getWorkerRuntimeConfig } from '../../common/config/runtime-config';
import { WorkerDatabase } from '../../common/database';
import { workerLog } from '../../common/logger';
import { BackupRunsRepository } from './backup-runs.repository';
import { BackupService } from './backup-service';

async function main(): Promise<void> {
  const runtimeConfig = getWorkerRuntimeConfig();
  const database = new WorkerDatabase(runtimeConfig.databaseUrl);
  try {
    const service = new BackupService(
      {
        databaseUrl: runtimeConfig.databaseUrl,
        mediaRoot: runtimeConfig.mediaRoot,
        licensePath: runtimeConfig.licensePath,
        backupRoot: runtimeConfig.backup.root,
        retentionCount: runtimeConfig.backup.retentionCount,
        postgresBin: runtimeConfig.backup.postgresBin,
        pgDumpPath: runtimeConfig.backup.pgDumpPath
      },
      new BackupRunsRepository(database)
    );
    const result = await service.runBackupOrThrow({ runKind: 'manual' });
    console.log(`BELLFIELD_BACKUP_RESULT ${JSON.stringify(result)}`);
  } finally {
    await database.close();
  }
}

void main().catch((error) => {
  workerLog('error', 'Manual backup failed.', {
    errorMessage: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
