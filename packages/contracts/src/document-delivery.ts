export type CustomerDocumentType = 'estimate' | 'invoice';
export type OutboundMessageChannel = 'email';
export type OutboundMessageProvider = 'resend' | 'relay';
export const estimateEmailMaxAttachmentBytes = 15_000_000;
export type OutboundMessageStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'canceled'
  | 'delivered'
  | 'bounced'
  | 'complained';
export type OutboundMessageFailureCode =
  | 'notConfigured'
  | 'deliveryUnavailable'
  | 'deliveryRejected'
  | 'recipientUnavailable'
  | 'sendingLimitReached'
  | 'expired'
  | 'unknown';
export type EstimateEmailDeliveryReadiness =
  | 'ready'
  | 'needsSetup'
  | 'temporarilyUnavailable'
  | 'quotaExhausted'
  | 'suspended';

export interface CustomerDocumentSnapshotSummary {
  id: string;
  documentType: CustomerDocumentType;
  jobId: string;
  estimateId?: string;
  invoiceId?: string;
  sourceVersion: number;
  filename: string;
  contentType: 'application/pdf';
  sha256: string;
  byteSize: number;
  generatedByName: string;
  generatedAt: string;
}

export interface OutboundMessageSummary {
  id: string;
  channel: OutboundMessageChannel;
  status: OutboundMessageStatus;
  jobId: string;
  estimateId?: string;
  invoiceId?: string;
  documentSnapshotId?: string;
  recipientEmail: string;
  subject: string;
  sentByName: string;
  queuedAt: string;
  sentAt?: string;
  failureCode?: OutboundMessageFailureCode;
  deliveryMessage?: string;
  /** Customer acceptance URL minted by the relay, when this send supports online response. */
  acceptanceUrl?: string;
  /** Expiry timestamp for the relay-hosted customer acceptance link. */
  acceptanceLinkExpiresAt?: string;
  /** Set once BellField applied the customer's online approve/decline decision. */
  acceptanceDecisionAppliedAt?: string;
}

export interface SendEstimateRequest {
  recipientEmail: string;
  subject?: string;
  bodyText?: string;
}

export interface SendEstimateResponse {
  outboundMessage: OutboundMessageSummary;
  documentSnapshot: CustomerDocumentSnapshotSummary;
  /**
   * True when the provider accepted the email but BellField could not finish
   * recording the send (audit row or timeline write failed). The customer has
   * the email; the office must not resend until the record is repaired.
   */
  recordingIncomplete?: boolean;
}

export interface OutboundMessagesResponse {
  outboundMessages: OutboundMessageSummary[];
}

export interface CancelOutboundMessageResponse {
  outboundMessage: OutboundMessageSummary;
}

export interface EstimateEmailDeliveryStatus {
  configured: boolean;
  ready: boolean;
  status: EstimateEmailDeliveryReadiness;
  message: string;
}

export interface EstimateEmailDeliveryStatusResponse {
  deliveryStatus: EstimateEmailDeliveryStatus;
}

export interface EstimateSendPreview {
  subject: string;
  bodyText: string;
}

export interface EstimateSendPreviewResponse {
  preview: EstimateSendPreview;
  deliveryStatus: EstimateEmailDeliveryStatus;
}
