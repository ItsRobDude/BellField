import type {
  CustomerDocumentSnapshotSummary,
  CustomerDocumentType,
  OutboundMessageFailureCode,
  OutboundMessageProvider,
  OutboundMessageStatus
} from '@bellfield/contracts';

export type CustomerDocumentTypeValue = CustomerDocumentType;
export type CustomerDocumentSnapshotRecord = CustomerDocumentSnapshotSummary & {
  storagePath: string;
};
export type OutboundMessageRecord = {
  id: string;
  channel: 'email';
  provider: OutboundMessageProvider;
  status: OutboundMessageStatus;
  jobId: string;
  estimateId?: string;
  invoiceId?: string;
  documentSnapshotId?: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  sentByName: string;
  queuedAt: string;
  sentAt?: string;
  providerMessageId?: string;
  providerError?: string;
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
  /** Attached after the PDF snapshot is rendered; the intent row precedes it. */
  documentSnapshotId?: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  sentByEmployeeId: string;
  sentByName: string;
  queuedAt: string;
};

export type EmailProviderSendInput = {
  to: string;
  /** From display name; the shop fronts the email, never BellField branding. */
  fromName: string;
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
  | {
      kind: 'failed';
      code: OutboundMessageFailureCode;
      retryable: boolean;
      message: string;
    };
