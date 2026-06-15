// Wire contract between self-hosted installs and the BellField-hosted delivery
// relay. The relay composes the actual email itself; installs can only request
// the narrow BellField document-send shape (docs/delivery-relay-plan.md §5).

import type { CustomerDocumentType } from './document-delivery.js';

/** Header carrying the install's server instance id on every relay call. */
export const relayServerInstanceHeader = 'x-bellfield-server-instance';

export type RelaySendFailureCode =
  | 'notConfigured'
  | 'deliveryUnavailable'
  | 'deliveryRejected'
  | 'recipientUnavailable'
  | 'sendingLimitReached'
  | 'unknown';

export type RelaySendResult =
  | {
      kind: 'sent';
      relayMessageId: string;
      providerMessageId?: string;
      /**
       * Present when the send minted an acceptance link. Only the first
       * (minting) response carries it — the plaintext token is never stored
       * relay-side, so idempotent replays cannot reconstruct the URL. The
       * email itself always contains the link.
       */
      acceptanceUrl?: string;
      /** The minted link's id; decisions from the poll endpoint carry the same id. */
      acceptanceLinkId?: string;
    }
  | { kind: 'failed'; code: RelaySendFailureCode; retryable: boolean; message: string };

/** Bounds for the per-shop acceptance-link expiry setting (days). */
export const relayAcceptanceExpiryDays = { min: 7, max: 90, default: 30 } as const;

/**
 * Fixed decline-reason codes shown as checkboxes on the acceptance page.
 * Fixed enums are what make decline reasons safe to store structured and
 * aggregate; free text from the public page stays timeline-only.
 */
export const relayAcceptanceDeclineReasonCodes = [
  'price',
  'otherCompany',
  'postponing',
  'questions'
] as const;

export type RelayAcceptanceDeclineReason = (typeof relayAcceptanceDeclineReasonCodes)[number];

export interface RelayAcceptanceOptionInput {
  /** Install-side option id, opaque to the relay. */
  id: string;
  label: string;
  /** Display-only money; the relay never recomputes totals. */
  totalCents: number;
}

export interface RelayAcceptancePayload {
  /** Install-side estimate id, opaque to the relay. */
  estimateRef: string;
  /** Pinned at mint time so an edited estimate is never auto-approved stale. */
  estimateVersion: number;
  title: string;
  /** Single-option estimates send exactly one entry; the choice is the approval. */
  options: RelayAcceptanceOptionInput[];
  /** From the shop's settings; the relay clamps to relayAcceptanceExpiryDays. */
  expiresInDays?: number;
}

export interface RelaySendEstimateDocumentRequest {
  /** Install-side idempotency key; the relay returns the recorded outcome on replays. */
  idempotencyKey: string;
  /**
   * Selects the relay-owned sender identity. Callers never supply arbitrary
   * From addresses.
   */
  documentType: CustomerDocumentType;
  recipientEmail: string;
  /** Shop display name fronting the email (the From display name). */
  fromName: string;
  replyToEmail?: string;
  subject: string;
  bodyText: string;
  document: {
    filename: string;
    contentType: 'application/pdf';
    /** Base64-encoded PDF bytes, bounded by estimateEmailMaxAttachmentBytes when decoded. */
    bytesBase64: string;
  };
  /** When present, the relay mints an acceptance link and splices it into bodyText. */
  acceptance?: RelayAcceptancePayload;
}

export interface RelaySendEstimateDocumentResponse {
  result: RelaySendResult;
}

export type RelayMessageDeliveryState = 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';

export interface RelayMessageStatusResponse {
  relayMessageId: string;
  state: RelayMessageDeliveryState;
  updatedAt: string;
}

export type RelaySendingState = 'ready' | 'quotaExhausted' | 'suspended';

export interface RelayEntitlementResponse {
  shopId: string;
  sendingState: RelaySendingState;
  monthlySendQuota: number;
  remainingThisMonth: number;
}

/** A homeowner decision awaiting install pickup, delivered at-least-once until acked. */
export interface RelayAcceptanceDecisionRecord {
  acceptanceLinkId: string;
  estimateRef: string;
  /** The version pinned at mint time; the install guards application against it. */
  estimateVersion: number;
  decision: 'approved' | 'declined';
  selectedOptionId: string | null;
  declineReasons: RelayAcceptanceDeclineReason[];
  /** Free text from the homeowner; install-side it is timeline-only. */
  note: string | null;
  decidedAt: string;
}

export interface RelayAcceptanceDecisionsResponse {
  decisions: RelayAcceptanceDecisionRecord[];
}

export interface RelayAcceptanceDecisionAckResponse {
  acknowledged: boolean;
}

// --- Payment links (Phase 6b) ---------------------------------------------------

export type RelayPaymentSessionResult =
  | {
      kind: 'created';
      paymentSessionId: string;
      checkoutUrl: string;
      expiresAt: string;
      amountCents: number;
      currency: string;
      applicationFeeCents: number;
    }
  | {
      kind: 'failed';
      code: 'paymentsNotConfigured' | 'paymentsDisabled' | 'invalidAmount' | 'providerError';
      retryable: boolean;
      message: string;
    };

export interface RelayCreatePaymentSessionRequest {
  /** Install-side idempotency key. Replays return the same recorded session. */
  idempotencyKey: string;
  /** Install-side job id, opaque to the relay and returned in paid events. */
  jobRef: string;
  /** Optional initiating invoice id; allocations remain install-side. */
  invoiceRef?: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail?: string;
  // The customer-facing success/cancel URLs are NOT install-supplied: the relay
  // owns the public origin and mints them from its own publicBaseUrl, so an
  // install can never point the post-checkout redirect at an internal/wrong host.
}

export interface RelayCreatePaymentSessionResponse {
  result: RelayPaymentSessionResult;
}

/** A confirmed payment awaiting install pickup, delivered at-least-once until acked. */
export interface RelayPaymentEventRecord {
  paymentEventId: string;
  paymentSessionId: string;
  jobRef: string;
  invoiceRef: string | null;
  provider: 'stripe';
  providerPaymentId: string;
  providerSessionId: string;
  amountCents: number;
  currency: string;
  applicationFeeCents: number;
  processorFeeCents: number | null;
  paidAt: string;
}

export interface RelayPaymentEventsResponse {
  events: RelayPaymentEventRecord[];
}

export interface RelayPaymentEventAckResponse {
  acknowledged: boolean;
}

// --- Online refunds (Phase 6b slice 2) ------------------------------------------

/**
 * Install request to refund a paid relay session. The install references the
 * relay-owned session (the Stripe checkout session id it stored as the payment's
 * providerSessionId); the relay validates ownership/amount and calls Stripe on the
 * connected account. The install never supplies a raw PaymentIntent or fee.
 */
export interface RelayCreateRefundRequest {
  /** Install-side idempotency key. Replays return the same recorded refund request. */
  idempotencyKey: string;
  /** The Stripe checkout session id of the original paid session (relay-owned). */
  providerSessionId: string;
  /** Amount to refund in minor units; must be ≤ the session's remaining refundable. */
  amountCents: number;
  reason?: string;
}

export type RelayRefundResult =
  | {
      kind: 'requested';
      refundRequestId: string;
      /** Stripe refund id (`re_…`); the worker reconciles confirmed events to it. */
      providerRefundId: string;
      amountCents: number;
      currency: string;
      /**
       * Stripe-reported refund status at creation — NOT the BellField request
       * lifecycle (`requested → succeeded | failed`). Final confirmation still
       * arrives via the webhook-driven refund event.
       */
      providerStatus: 'pending' | 'succeeded';
    }
  | {
      kind: 'failed';
      code:
        | 'paymentsNotConfigured'
        | 'paymentsDisabled'
        | 'sessionNotFound'
        | 'notRefundable'
        | 'amountExceedsRefundable'
        | 'providerError';
      retryable: boolean;
      message: string;
    };

export interface RelayCreateRefundResponse {
  result: RelayRefundResult;
}

/**
 * A provider-confirmed refund outcome awaiting install pickup, delivered
 * at-least-once until acked. `status` lets the worker apply succeeded refunds to
 * the ledger and mark failed ones without writing a refund row.
 */
export interface RelayRefundEventRecord {
  refundEventId: string;
  refundRequestId: string;
  provider: 'stripe';
  /** Stripe refund id; the worker dedupes the local refund row on this. */
  providerRefundId: string;
  /** Stripe PaymentIntent id of the original payment; the worker attaches the refund to it. */
  providerPaymentId: string;
  providerSessionId: string;
  jobRef: string;
  amountCents: number;
  currency: string;
  applicationFeeRefundedCents: number | null;
  status: 'succeeded' | 'failed';
  /** Provider failure detail when status is 'failed'. */
  failureReason: string | null;
  occurredAt: string;
}

export interface RelayRefundEventsResponse {
  events: RelayRefundEventRecord[];
}

export interface RelayRefundEventAckResponse {
  acknowledged: boolean;
}
