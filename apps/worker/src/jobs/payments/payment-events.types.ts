import type { QueryExecutor, TransactionalQueryExecutor } from '../../common/database';
import type { RelayPaymentEvent, RelayPaymentEventsOutcome } from '../delivery/delivery-types';

export type PaymentEventApplyOutcome = 'applied' | 'alreadyApplied';

export interface PaymentEventsStore {
  applyRelayPaymentEvent(
    event: RelayPaymentEvent,
    occurredAt: Date
  ): Promise<PaymentEventApplyOutcome>;
}

export interface PaymentEventsRelayClient {
  getPaymentEvents(): Promise<RelayPaymentEventsOutcome>;
  acknowledgePaymentEvent(paymentEventId: string): Promise<boolean>;
}

export type PaymentEventsDatabase = TransactionalQueryExecutor;

export type PaymentEventsQueryExecutor = QueryExecutor;
