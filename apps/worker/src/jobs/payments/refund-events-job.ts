import { workerLog } from '../../common/logger';
import type { WorkerJob } from '../job-runner';
import type { RefundEventsService } from './refund-events-service';

export function createRefundEventsJob(input: {
  refundEventsService: RefundEventsService;
  intervalMs: number;
}): WorkerJob {
  return {
    name: 'refund-events',
    intervalMs: input.intervalMs,
    // Offset from the payment-events job so the two relay polls don't fire in lockstep.
    initialDelayMs: 35_000,
    run: async () => {
      const summary = await input.refundEventsService.pollRefundEvents();
      if (summary.fetched || summary.applied || summary.acknowledged || summary.deferred) {
        workerLog('info', 'Refund event poll completed.', { ...summary });
      }
    }
  };
}
