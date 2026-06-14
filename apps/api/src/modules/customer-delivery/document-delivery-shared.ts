import { BadRequestException } from '@nestjs/common';
import type {
  CustomerDocumentSnapshotSummary,
  OutboundMessageFailureCode,
  OutboundMessageSummary
} from '@bellfield/contracts';
import type {
  CustomerDocumentSnapshotRecord,
  OutboundMessageRecord
} from './customer-delivery.types';

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

export function safeFilenamePart(value: string, fallback: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

export function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new BadRequestException('Recipient email is required.');
  }
  return normalized;
}

export function stripControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, tokenName: string) => {
    return tokens[tokenName] ?? match;
  });
}

export function toDocumentSnapshotSummary(
  record: CustomerDocumentSnapshotRecord
): CustomerDocumentSnapshotSummary {
  return {
    id: record.id,
    documentType: record.documentType,
    jobId: record.jobId,
    estimateId: record.estimateId,
    invoiceId: record.invoiceId,
    sourceVersion: record.sourceVersion,
    filename: record.filename,
    contentType: record.contentType,
    sha256: record.sha256,
    byteSize: record.byteSize,
    generatedByName: record.generatedByName,
    generatedAt: record.generatedAt
  };
}

export function toOutboundMessageSummary(record: OutboundMessageRecord): OutboundMessageSummary {
  const failureCode = deliveryFailureCode(record);
  const deliveryMessage = deliverySummaryMessage(record, failureCode);

  return {
    id: record.id,
    channel: record.channel,
    status: record.status,
    jobId: record.jobId,
    estimateId: record.estimateId,
    invoiceId: record.invoiceId,
    documentSnapshotId: record.documentSnapshotId,
    recipientEmail: record.recipientEmail,
    subject: record.subject,
    sentByName: record.sentByName,
    queuedAt: record.queuedAt,
    sentAt: record.sentAt,
    failureCode,
    deliveryMessage,
    acceptanceUrl: record.acceptanceUrl,
    acceptanceLinkExpiresAt: record.acceptanceLinkExpiresAt,
    acceptanceDecisionAppliedAt: record.acceptanceDecisionAppliedAt
  };
}

function deliveryFailureCode(
  record: OutboundMessageRecord
): OutboundMessageFailureCode | undefined {
  if (record.status !== 'failed') {
    return undefined;
  }
  return (
    parseFailureCode(record.providerError) ??
    (record.providerError ? 'deliveryUnavailable' : 'unknown')
  );
}

function parseFailureCode(value: string | undefined): OutboundMessageFailureCode | undefined {
  if (
    value === 'notConfigured' ||
    value === 'deliveryUnavailable' ||
    value === 'deliveryRejected' ||
    value === 'recipientUnavailable' ||
    value === 'sendingLimitReached' ||
    value === 'expired' ||
    value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}

function deliverySummaryMessage(
  record: OutboundMessageRecord,
  failureCode: OutboundMessageFailureCode | undefined
): string | undefined {
  if (record.status === 'canceled') {
    return 'Canceled before sending.';
  }
  if (!failureCode) {
    return undefined;
  }
  if (failureCode === 'notConfigured') {
    return 'Email was not sent. Contact BellField support.';
  }
  if (failureCode === 'recipientUnavailable') {
    return 'Email was not sent: this recipient is not able to receive email.';
  }
  if (failureCode === 'sendingLimitReached') {
    return 'Email was not sent: the monthly sending limit was reached. Contact BellField support.';
  }
  if (failureCode === 'expired') {
    return 'Email was not sent before it expired. Send it again if it is still needed.';
  }
  return 'Email was not delivered. Try again or contact BellField support.';
}
