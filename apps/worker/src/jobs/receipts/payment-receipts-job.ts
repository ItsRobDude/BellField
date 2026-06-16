import { workerLog } from '../../common/logger';
import type { WorkerJob } from '../job-runner';
import type { PaymentReceiptsService } from './payment-receipts-service';

/**
 * Sends queued customer receipt emails. Shares the delivery retry cadence —
 * same relay, same at-least-once posture — so it needs no separate interval.
 */
export function createPaymentReceiptsJob(input: {
  paymentReceiptsService: PaymentReceiptsService;
  intervalMs: number;
}): WorkerJob {
  return {
    name: 'payment-receipts',
    intervalMs: input.intervalMs,
    initialDelayMs: 25_000,
    run: async ({ signal }) => {
      const summary = await input.paymentReceiptsService.processDueReceipts({ signal });
      if (
        summary.expired ||
        summary.sent ||
        summary.failed ||
        summary.rescheduled ||
        summary.canceled
      ) {
        workerLog('info', 'Receipt send pass completed.', { ...summary });
      }
    }
  };
}
