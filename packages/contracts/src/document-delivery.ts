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
  provider: OutboundMessageProvider;
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
  providerMessageId?: string;
  providerError?: string;
}

export interface SendEstimateRequest {
  recipientEmail: string;
  subject?: string;
  bodyText?: string;
}

export interface SendEstimateResponse {
  outboundMessage: OutboundMessageSummary;
  documentSnapshot: CustomerDocumentSnapshotSummary;
}

export interface OutboundMessagesResponse {
  outboundMessages: OutboundMessageSummary[];
}
