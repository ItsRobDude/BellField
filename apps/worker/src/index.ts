import { getWorkerRuntimeConfig } from './common/config/runtime-config';
import { workerLog } from './common/logger';

const heartbeatMs = 60_000;

function startWorker(): void {
  const runtimeConfig = getWorkerRuntimeConfig();

  workerLog('info', 'Worker started.', {
    pid: process.pid,
    nodeEnv: runtimeConfig.nodeEnv
  });

  setInterval(() => {
    workerLog('info', 'Worker heartbeat.');
  }, heartbeatMs);
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

startWorker();
