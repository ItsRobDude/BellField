import type {
  RelayCreatePaymentSessionRequest,
  RelayPaymentEventRecord
} from '@bellfield/contracts';

export type RelayShopPaymentsConfig = {
  shopId: string;
  paymentsStatus: 'disabled' | 'enabled';
  stripeConnectedAccountId: string | null;
};

export type RelayPaymentSessionRecord = {
  id: string;
  shopId: string;
  idempotencyKey: string;
  jobRef: string;
  invoiceRef: string | null;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  stripeConnectedAccountId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  checkoutUrl: string;
  status: 'created' | 'paid' | 'expired' | 'canceled';
  applicationFeeCents: number;
  expiresAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StripeCheckoutSessionCreateInput = RelayCreatePaymentSessionRequest & {
  connectedAccountId: string;
  applicationFeeCents: number;
  /** Relay-generated from publicBaseUrl — never install-supplied. */
  successUrl: string;
  cancelUrl: string;
};

export type StripeCheckoutSessionCreateResult = {
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  checkoutUrl: string;
  expiresAt: Date;
};

/**
 * Outcome of reconciling a paid webhook against the stored session.
 * `mismatch`/`sessionNotFound` are no-ops the service logs rather than trusting
 * webhook-reported amount/currency/account that disagree with the contract.
 */
export type RecordPaidEventOutcome = 'recorded' | 'duplicate' | 'sessionNotFound' | 'mismatch';

export interface RelayPaymentsStore {
  withPaymentSessionLock<T>(
    shopId: string,
    idempotencyKey: string,
    callback: () => Promise<T>
  ): Promise<T>;
  findShopPaymentsConfig(shopId: string): Promise<RelayShopPaymentsConfig | null>;
  findSessionByIdempotencyKey(
    shopId: string,
    idempotencyKey: string
  ): Promise<RelayPaymentSessionRecord | null>;
  recordSession(input: {
    id: string;
    shopId: string;
    request: RelayCreatePaymentSessionRequest;
    /** Relay-generated customer redirect URLs (not from the request). */
    successUrl: string;
    cancelUrl: string;
    stripeConnectedAccountId: string;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string | null;
    checkoutUrl: string;
    applicationFeeCents: number;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<RelayPaymentSessionRecord>;
  recordPaidEvent(input: {
    stripeEventId: string;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string;
    /** Connected account from the webhook event, reconciled against the stored session. */
    connectedAccountId: string | undefined;
    amountCents: number;
    currency: string;
    paidAt: Date;
    occurredAt: Date;
  }): Promise<RecordPaidEventOutcome>;
  listUndeliveredPaymentEvents(shopId: string): Promise<RelayPaymentEventRecord[]>;
  acknowledgePaymentEvent(
    shopId: string,
    paymentEventId: string,
    deliveredAt: Date
  ): Promise<boolean>;
}
