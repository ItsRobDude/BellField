import { workerLog } from '../../common/logger';
import type { WorkerJob } from '../job-runner';
import type { DeliveryService } from './delivery-service';

/**
 * Retries due queued estimate sends and expires overdue ones. Built on the
 * shared job-runner substrate like the scheduled backup job.
 */
export function createDeliveryRetryJob(input: {
  deliveryService: DeliveryService;
  intervalMs: number;
}): WorkerJob {
  return {
    name: 'delivery-retry',
    intervalMs: input.intervalMs,
    initialDelayMs: 15_000,
    run: async ({ signal }) => {
      const summary = await input.deliveryService.processDueDeliveries({ signal });
      if (summary.expired || summary.sent || summary.failed || summary.rescheduled) {
        workerLog('info', 'Delivery retry pass completed.', { ...summary });
      }
    }
  };
}

/** Polls the relay for delivered/bounced/complained on recently sent mail. */
export function createDeliveryStatusJob(input: {
  deliveryService: DeliveryService;
  intervalMs: number;
}): WorkerJob {
  return {
    name: 'delivery-status',
    intervalMs: input.intervalMs,
    run: async () => {
      const summary = await input.deliveryService.pollDeliveryStatuses();
      if (summary.updated) {
        workerLog('info', 'Delivery status poll applied updates.', { ...summary });
      }
    }
  };
}
