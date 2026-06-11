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
  | { kind: 'sent'; relayMessageId: string; providerMessageId?: string }
  | { kind: 'failed'; code: RelaySendFailureCode; retryable: boolean; message: string };

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
