// Wire contract between self-hosted installs and the BellField-hosted delivery
// relay. The relay composes the actual email itself; installs can only request
// the narrow BellField document-send shape (docs/delivery-relay-plan.md §5).

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
