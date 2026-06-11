import { getWorkerRuntimeConfig } from './common/config/runtime-config';
import { WorkerDatabase } from './common/database';
import { workerLog } from './common/logger';
import { BackupRunsRepository } from './jobs/backup/backup-runs.repository';
import { createScheduledBackupJob } from './jobs/backup/backup-job';
import { BackupService } from './jobs/backup/backup-service';
import { createDeliveryRetryJob, createDeliveryStatusJob } from './jobs/delivery/delivery-jobs';
import { DeliveryRepository } from './jobs/delivery/delivery.repository';
import { DeliveryService } from './jobs/delivery/delivery-service';
import { RelayClient } from './jobs/delivery/relay-client';
import { JobRunner, type WorkerJob } from './jobs/job-runner';

const heartbeatMs = 60_000;

async function startWorker(): Promise<void> {
  const runtimeConfig = getWorkerRuntimeConfig();
  const database = new WorkerDatabase(runtimeConfig.databaseUrl);
  const jobs: WorkerJob[] = [
    {
      name: 'heartbeat',
      intervalMs: heartbeatMs,
      runOnStart: true,
      run: () => {
        workerLog('info', 'Worker heartbeat.');
      }
    }
  ];

  if (runtimeConfig.backup.enabled) {
    const backupRepository = new BackupRunsRepository(database);
    const backupService = new BackupService(
      {
        databaseUrl: runtimeConfig.databaseUrl,
        mediaRoot: runtimeConfig.mediaRoot,
        licensePath: runtimeConfig.licensePath,
        backupRoot: runtimeConfig.backup.root,
        retentionCount: runtimeConfig.backup.retentionCount,
        postgresBin: runtimeConfig.backup.postgresBin,
        pgDumpPath: runtimeConfig.backup.pgDumpPath
      },
      backupRepository
    );
    jobs.push(
      await createScheduledBackupJob({
        backupService,
        intervalMs: runtimeConfig.backup.intervalMs
      })
    );
  }

  if (runtimeConfig.relay) {
    const deliveryService = new DeliveryService(
      { mediaRoot: runtimeConfig.mediaRoot },
      new DeliveryRepository(database),
      new RelayClient(runtimeConfig.relay)
    );
    jobs.push(
      createDeliveryRetryJob({
        deliveryService,
        intervalMs: runtimeConfig.delivery.retryIntervalMs
      }),
      createDeliveryStatusJob({
        deliveryService,
        intervalMs: runtimeConfig.delivery.statusIntervalMs
      })
    );
  }

  const runner = new JobRunner(jobs);

  workerLog('info', 'Worker started.', {
    pid: process.pid,
    nodeEnv: runtimeConfig.nodeEnv,
    backupEnabled: runtimeConfig.backup.enabled,
    backupIntervalMs: runtimeConfig.backup.intervalMs,
    backupRetentionCount: runtimeConfig.backup.retentionCount,
    deliveryJobsEnabled: Boolean(runtimeConfig.relay)
  });

  runner.start();

  async function shutdown(signalName: string): Promise<void> {
    workerLog('info', 'Worker shutdown requested.', { signalName });
    await runner.stop();
    await database.close();
    workerLog('info', 'Worker stopped.');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  workerLog('error', 'Unhandled promise rejection.', {
    reason: reason instanceof Error ? reason.message : String(reason)
  });
});

process.on('uncaughtException', (error) => {
  workerLog('error', 'Uncaught exception.', {
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack
  });

  process.exit(1);
});

void startWorker().catch((error) => {
  workerLog('error', 'Worker failed to start.', {
    errorMessage: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
