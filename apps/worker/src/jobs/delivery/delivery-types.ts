// The worker is deliberately not cross-imported with other apps; these wire
// shapes mirror packages/contracts relay-delivery (AcceptancePayload /
// AcceptanceDecision).
export type AcceptancePayload = {
  estimateRef: string;
  estimateVersion: number;
  title: string;
  options: { id: string; label: string; totalCents: number }[];
  expiresInDays?: number;
};

export type AcceptanceDecision = {
  acceptanceLinkId: string;
  estimateRef: string;
  estimateVersion: number;
  decision: 'approved' | 'declined';
  selectedOptionId: string | null;
  declineReasons: string[];
  note: string | null;
  decidedAt: string;
};

export type CustomerDocumentType = 'estimate' | 'invoice';

export type DueQueuedDelivery = {
  id: string;
  jobId: string;
  documentType: CustomerDocumentType;
  documentTitle: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  /** D8: shop display/reply-to pinned; relay sender is selected from document type. */
  fromName: string | null;
  replyToEmail: string | null;
  sentByName: string;
  attemptCount: number;
  expiresAt: Date | null;
  snapshotStoragePath: string;
  snapshotSha256: string;
  snapshotFilename: string;
  /** Frozen at queue time; a retry mints the link the office saw. */
  acceptancePayload: AcceptancePayload | null;
};

export type ExpiredDelivery = {
  id: string;
  jobId: string;
  documentType: CustomerDocumentType;
  documentTitle: string;
  recipientEmail: string;
  sentByName: string;
};

export type PollableDelivery = {
  id: string;
  providerMessageId: string;
};

export type DeliveryTimelineEntry = {
  jobId: string;
  occurredAt: Date;
  actorName: string;
  kind: 'estimateSent' | 'estimateDeliveryFailed' | 'invoiceSent' | 'invoiceDeliveryFailed';
  message: string;
};

/**
 * The estimate state the decision poller needs to apply a customer decision
 * with the office-wins and version-guard rules.
 */
export type AcceptanceApplyOutcome =
  | 'applied'
  | 'versionMismatch'
  | 'alreadySettled'
  | 'estimateMissing'
  | 'alreadyApplied';

export interface DeliveryStore {
  claimDueQueued(now: Date, limit: number): Promise<DueQueuedDelivery[]>;
  markSent(
    id: string,
    providerMessageId: string | null,
    sentAt: Date,
    acceptance?: { linkId: string; url: string; expiresAt: Date }
  ): Promise<void>;
  markFailed(id: string, code: string, failedAt: Date): Promise<void>;
  scheduleRetry(id: string, nextAttemptAt: Date, occurredAt: Date): Promise<void>;
  expireDue(now: Date, legacyCutoff: Date): Promise<ExpiredDelivery[]>;
  addTimelineEntry(entry: DeliveryTimelineEntry): Promise<void>;
  listPollable(checkedBefore: Date, sentAfter: Date, limit: number): Promise<PollableDelivery[]>;
  applyDeliveryState(
    id: string,
    state: 'delivered' | 'bounced' | 'complained',
    at: Date
  ): Promise<boolean>;
  touchStatusChecked(id: string, at: Date): Promise<void>;
  /**
   * Applies one polled customer decision in a single transaction with the
   * 6a rules: pending + matching pinned version -> approve/decline with
   * actor "Customer"; edited since mint -> review-required timeline note
   * only; already settled -> responded-note only; every path stamps
   * acceptance_decision_applied_at on the outbound row (when one matches
   * the link id) so relay redelivery is a no-op.
   */
  applyAcceptanceDecision(
    decision: AcceptanceDecision,
    occurredAt: Date
  ): Promise<AcceptanceApplyOutcome>;
}

export type RelaySendOutcome =
  | { kind: 'sent'; relayMessageId?: string; acceptanceLinkId?: string; acceptanceUrl?: string }
  | { kind: 'failed'; code: string; retryable: boolean };

export type RelayStatusOutcome =
  | { kind: 'status'; state: 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed' }
  | { kind: 'notFound' }
  | { kind: 'unavailable' };

export type RelayDecisionsOutcome =
  | { kind: 'decisions'; decisions: AcceptanceDecision[] }
  | { kind: 'unavailable' };

export type RelayPaymentEvent = {
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
};

export type RelayPaymentEventsOutcome =
  | { kind: 'events'; events: RelayPaymentEvent[] }
  | { kind: 'unavailable' };

export type RelayRefundEvent = {
  refundEventId: string;
  /** The relay's own refund-request id; the install reconciles its pending request to it. */
  refundRequestId: string;
  provider: 'stripe';
  /** Stripe refund id; the local refund row dedupes on this. */
  providerRefundId: string;
  /** Stripe PaymentIntent id of the original payment; the refund attaches to it. */
  providerPaymentId: string;
  providerSessionId: string;
  jobRef: string;
  amountCents: number;
  currency: string;
  applicationFeeRefundedCents: number | null;
  status: 'succeeded' | 'failed';
  failureReason: string | null;
  occurredAt: string;
};

export type RelayRefundEventsOutcome =
  | { kind: 'events'; events: RelayRefundEvent[] }
  | { kind: 'unavailable' };

export interface RelayDeliveryClient {
  sendEstimateDocument(input: {
    idempotencyKey: string;
    documentType: CustomerDocumentType;
    recipientEmail: string;
    fromName: string;
    replyToEmail?: string;
    subject: string;
    bodyText: string;
    document: { filename: string; bytes: Buffer };
    acceptance?: AcceptancePayload;
  }): Promise<RelaySendOutcome>;
  getMessageStatus(relayMessageId: string): Promise<RelayStatusOutcome>;
  getAcceptanceDecisions(): Promise<RelayDecisionsOutcome>;
  acknowledgeAcceptanceDecision(acceptanceLinkId: string): Promise<boolean>;
}
