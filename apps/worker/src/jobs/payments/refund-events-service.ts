import { workerLog } from '../../common/logger';
import type { RefundEventsRelayClient, RefundEventsStore } from './refund-events.types';

export type PollRefundEventsResult = {
  fetched: number;
  applied: number;
  acknowledged: number;
  deferred: number;
};

type RefundEventsServiceOptions = {
  now?: () => Date;
};

export class RefundEventsService {
  private readonly now: () => Date;

  constructor(
    private readonly store: RefundEventsStore,
    private readonly relayClient: RefundEventsRelayClient,
    options?: RefundEventsServiceOptions
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  /**
   * Confirmed refund outcomes are delivered at-least-once by the relay. A
   * succeeded refund is applied to the append-only ledger; a failed one marks the
   * pending request without writing a refund row. Ack on every terminal outcome —
   * but NOT on `deferred` (the local payment isn't recorded yet), so the relay
   * redelivers until the payment lands or the apply bound dead-letters it.
   */
  async pollRefundEvents(): Promise<PollRefundEventsResult> {
    const outcome = await this.relayClient.getRefundEvents();
    if (outcome.kind === 'unavailable') {
      return { fetched: 0, applied: 0, acknowledged: 0, deferred: 0 };
    }

    let applied = 0;
    let acknowledged = 0;
    let deferred = 0;
    for (const event of outcome.events) {
      let result;
      try {
        result = await this.store.applyRelayRefundEvent(event, this.now());
      } catch (error) {
        workerLog('error', 'Refund event could not be applied; will retry.', {
          refundEventId: event.refundEventId,
          providerRefundId: event.providerRefundId,
          providerPaymentId: event.providerPaymentId,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        continue;
      }

      if (result === 'applied') {
        applied += 1;
      }
      if (result === 'deferred') {
        // The payment this refund reverses isn't recorded yet — leave it for the
        // relay to redeliver rather than acking and losing it.
        deferred += 1;
        continue;
      }

      const acked = await this.relayClient.acknowledgeRefundEvent(event.refundEventId);
      if (acked) {
        acknowledged += 1;
      }
    }

    return { fetched: outcome.events.length, applied, acknowledged, deferred };
  }
}
