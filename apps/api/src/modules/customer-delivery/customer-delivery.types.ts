import type {
  CustomerDocumentSnapshotSummary,
  CustomerDocumentType,
  OutboundMessageProvider,
  OutboundMessageStatus,
  OutboundMessageSummary
} from '@bellfield/contracts';

export type CustomerDocumentTypeValue = CustomerDocumentType;
export type CustomerDocumentSnapshotRecord = CustomerDocumentSnapshotSummary & {
  storagePath: string;
};
export type OutboundMessageRecord = OutboundMessageSummary & {
  bodyText: string;
};
export type OutboundMessageStatusValue = OutboundMessageStatus;
export type OutboundMessageProviderValue = OutboundMessageProvider;

export type CreateCustomerDocumentSnapshotInput = {
  id: string;
  documentType: CustomerDocumentTypeValue;
  jobId: string;
  estimateId?: string;
  invoiceId?: string;
  sourceVersion: number;
  filename: string;
  contentType: 'application/pdf';
  storagePath: string;
  sha256: string;
  byteSize: number;
  generatedByEmployeeId: string;
  generatedByName: string;
  generatedAt: string;
};

export type CreateOutboundMessageInput = {
  id: string;
  channel: 'email';
  provider: OutboundMessageProviderValue;
  status: 'queued';
  jobId: string;
  estimateId?: string;
  invoiceId?: string;
  documentSnapshotId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  sentByEmployeeId: string;
  sentByName: string;
  queuedAt: string;
};

export type EmailProviderSendInput = {
  to: string;
  replyToEmail?: string;
  subject: string;
  bodyText: string;
  attachment: {
    filename: string;
    contentType: 'application/pdf';
    bytes: Buffer;
  };
  idempotencyKey: string;
};

export type EmailProviderSendResult =
  | { kind: 'sent'; providerMessageId?: string }
  | { kind: 'notConfigured'; message: string }
  | { kind: 'error'; message: string };
