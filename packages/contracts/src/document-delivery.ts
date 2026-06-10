export type CustomerDocumentType = 'estimate' | 'invoice';
export type OutboundMessageChannel = 'email';
export type OutboundMessageProvider = 'resend';
export type OutboundMessageStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'bounced'
  | 'complained';
export type OutboundMessageFailureCode =
  | 'notConfigured'
  | 'deliveryUnavailable'
  | 'deliveryRejected'
  | 'unknown';
export type EstimateEmailDeliveryReadiness = 'ready' | 'needsSetup' | 'temporarilyUnavailable';

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
