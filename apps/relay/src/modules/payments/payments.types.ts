import type {
  RelayCreatePaymentSessionRequest,
  RelayPaymentEventRecord,
  RelayRefundEventRecord
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

export type StripeRefundCreateInput = {
  connectedAccountId: string;
  paymentIntentId: string;
  amountCents: number;
  refundRequestId: string;
  idempotencyKey: string;
};

export type StripeRefundCreateResult = {
  stripeRefundId: string;
  status: 'pending' | 'succeeded';
};

export type RelayPaymentRefundRequestRecord = {
  id: string;
  shopId: string;
  paymentSessionId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  reason: string | null;
  stripeConnectedAccountId: string;
  stripePaymentIntentId: string;
  stripeRefundId: string | null;
  applicationFeeRefundedCents: number | null;
  status: 'requested' | 'succeeded' | 'failed';
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Outcome of recording a Stripe refund webhook. `requestNotFound` is the
 * out-of-band case (a refund created in the Stripe dashboard, no BellField
 * request); `mismatch` is a webhook whose account/PaymentIntent/amount/currency
 * disagrees with the stored request. Both are logged and ignored (200), not
 * trusted into the ledger.
 */
export type RecordRefundEventOutcome = 'recorded' | 'duplicate' | 'requestNotFound' | 'mismatch';

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

  // --- Refunds ---
  /** Serialize all refund activity for one paid session so concurrent requests
   * (different idempotency keys) can't both pass the remaining-refundable check. */
  withRefundSessionLock<T>(
    shopId: string,
    stripeCheckoutSessionId: string,
    callback: () => Promise<T>
  ): Promise<T>;
  findRefundRequestByIdempotencyKey(
    shopId: string,
    idempotencyKey: string
  ): Promise<RelayPaymentRefundRequestRecord | null>;
  /** The shop's own paid session for the given Stripe checkout session id, or null. */
  findPaidSessionForRefund(
    shopId: string,
    stripeCheckoutSessionId: string
  ): Promise<RelayPaymentSessionRecord | null>;
  /** Cents already committed to refunds on a session: requested + succeeded (not failed). */
  sumConsumedRefundCentsForSession(paymentSessionId: string): Promise<number>;
  createRefundRequest(input: {
    id: string;
    shopId: string;
    paymentSessionId: string;
    idempotencyKey: string;
    amountCents: number;
    currency: string;
    reason: string | null;
    stripeConnectedAccountId: string;
    stripePaymentIntentId: string;
    applicationFeeRefundedCents: number;
    createdAt: Date;
  }): Promise<RelayPaymentRefundRequestRecord>;
  setRefundRequestStripeRefundId(input: {
    id: string;
    stripeRefundId: string;
    updatedAt: Date;
  }): Promise<void>;
  recordRefundEvent(input: {
    stripeEventId: string;
    stripeRefundId: string;
    /** Request id echoed in the Stripe refund metadata; lets a fast terminal
     * webhook attach even before createRefund persisted the refund id. */
    refundRequestId: string | null;
    /** Connected account from the webhook event, reconciled against the request. */
    connectedAccountId: string | undefined;
    /** PaymentIntent from the webhook refund, reconciled against the request. */
    paymentIntentId: string | null;
    status: 'succeeded' | 'failed';
    amountCents: number;
    currency: string;
    failureReason: string | null;
    occurredAt: Date;
  }): Promise<RecordRefundEventOutcome>;
  listUndeliveredRefundEvents(shopId: string): Promise<RelayRefundEventRecord[]>;
  acknowledgeRefundEvent(
    shopId: string,
    refundEventId: string,
    deliveredAt: Date
  ): Promise<boolean>;
}
