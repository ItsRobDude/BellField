import { workerLog } from '../../common/logger';
import type { PaymentEventsRelayClient, PaymentEventsStore } from './payment-events.types';

export type PollPaymentEventsResult = {
  fetched: number;
  applied: number;
  acknowledged: number;
};

type PaymentEventsServiceOptions = {
  now?: () => Date;
};

export class PaymentEventsService {
  private readonly now: () => Date;

  constructor(
    private readonly store: PaymentEventsStore,
    private readonly relayClient: PaymentEventsRelayClient,
    options?: PaymentEventsServiceOptions
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  /**
   * Confirmed provider receipts are delivered at-least-once by the relay. Ack
   * only after the local append-only payment ledger has accepted or already
   * seen the event.
   */
  async pollPaymentEvents(): Promise<PollPaymentEventsResult> {
    const outcome = await this.relayClient.getPaymentEvents();
    if (outcome.kind === 'unavailable') {
      return { fetched: 0, applied: 0, acknowledged: 0 };
    }

    let applied = 0;
    let acknowledged = 0;
    for (const event of outcome.events) {
      try {
        const result = await this.store.applyRelayPaymentEvent(event, this.now());
        if (result === 'applied') {
          applied += 1;
        }
      } catch (error) {
        workerLog('error', 'Payment event could not be applied; will retry.', {
          paymentEventId: event.paymentEventId,
          paymentSessionId: event.paymentSessionId,
          providerPaymentId: event.providerPaymentId,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
      const acked = await this.relayClient.acknowledgePaymentEvent(event.paymentEventId);
      if (acked) {
        acknowledged += 1;
      }
    }

    return { fetched: outcome.events.length, applied, acknowledged };
  }
}
