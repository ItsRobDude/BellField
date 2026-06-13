import { workerLog } from '../../common/logger';
import type { WorkerJob } from '../job-runner';
import type { PaymentEventsService } from './payment-events-service';

export function createPaymentEventsJob(input: {
  paymentEventsService: PaymentEventsService;
  intervalMs: number;
}): WorkerJob {
  return {
    name: 'payment-events',
    intervalMs: input.intervalMs,
    initialDelayMs: 25_000,
    run: async () => {
      const summary = await input.paymentEventsService.pollPaymentEvents();
      if (summary.fetched || summary.applied || summary.acknowledged) {
        workerLog('info', 'Payment event poll completed.', { ...summary });
      }
    }
  };
}
