import type { QueryExecutor, TransactionalQueryExecutor } from '../../common/database';
import type { RelayRefundEvent, RelayRefundEventsOutcome } from '../delivery/delivery-types';

/**
 * Outcome of applying one Stripe refund event.
 * - `applied` — wrote the confirmed refund row + reversal.
 * - `alreadyApplied` — the refund row already exists (idempotent redelivery).
 * - `failedRecorded` — a failed refund: the request was marked failed, no ledger row.
 * - `deferred` — the local payment isn't recorded yet; do NOT ack, retry later.
 * - `deadLettered` — deferred past the bound; the request was failed and the event acked.
 */
export type RefundEventApplyOutcome =
  | 'applied'
  | 'alreadyApplied'
  | 'failedRecorded'
  | 'deferred'
  | 'deadLettered';

export interface RefundEventsStore {
  applyRelayRefundEvent(
    event: RelayRefundEvent,
    occurredAt: Date
  ): Promise<RefundEventApplyOutcome>;
}

export interface RefundEventsRelayClient {
  getRefundEvents(): Promise<RelayRefundEventsOutcome>;
  acknowledgeRefundEvent(refundEventId: string): Promise<boolean>;
}

export type RefundEventsDatabase = TransactionalQueryExecutor;

export type RefundEventsQueryExecutor = QueryExecutor;
