import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CompanySettings,
  CustomerDocumentSnapshotSummary,
  OutboundMessageFailureCode,
  OutboundMessageSummary
} from '@bellfield/contracts';
import { CompanySettingsRepository } from '../company-settings/company-settings.repository';
import { JobsDataService } from '../company-data/jobs-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { CustomerDeliveryRepository } from '../customer-delivery/customer-delivery.repository';
import type {
  CustomerDocumentSnapshotRecord,
  EmailProviderSendInput,
  OutboundMessageRecord
} from '../customer-delivery/customer-delivery.types';
import { CustomerDocumentStorageService } from '../customer-delivery/customer-document-storage.service';
import {
  buildEmailProviderInput,
  deliveryNotConfiguredMessage,
  EmailProviderService
} from '../customer-delivery/email-provider.service';
import { EstimatePdfRendererService } from '../customer-delivery/estimate-pdf-renderer.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { EstimatesRepository } from './estimates.repository';
import type {
  EstimateRecord,
  EstimateSendPreviewResponseDto,
  OutboundMessagesResponseDto,
  SendEstimateRequestDto,
  SendEstimateResponseDto
} from './estimates.types';

export type EstimatePdfDocument = {
  filename: string;
  contentType: 'application/pdf';
  bytes: Buffer;
};

@Injectable()
export class EstimateDeliveryService {
  private readonly logger = new Logger(EstimateDeliveryService.name);

  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly referenceDataService: ReferenceDataService,
    private readonly companySettingsRepository: CompanySettingsRepository,
    private readonly customerDeliveryRepository: CustomerDeliveryRepository,
    private readonly customerDocumentStorageService: CustomerDocumentStorageService,
    private readonly emailProviderService: EmailProviderService,
    private readonly estimatePdfRendererService: EstimatePdfRendererService,
    private readonly estimatesRepository: EstimatesRepository
  ) {}

  async listEstimateOutboundMessages(
    sessionToken: string,
    estimateId: string
  ): Promise<OutboundMessagesResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:view', [
      'office-web'
    ]);
    await this.requireEstimate(estimateId);
    const outboundMessages =
      await this.customerDeliveryRepository.listOutboundMessagesForEstimate(estimateId);
    return { outboundMessages: outboundMessages.map(toOutboundMessageSummary) };
  }

  async renderEstimatePdfDocument(
    sessionToken: string,
    estimateId: string
  ): Promise<EstimatePdfDocument> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:view', [
      'office-web'
    ]);
    const estimate = await this.requireEstimate(estimateId);
    const generatedAt = new Date().toISOString();
    const context = await this.loadEstimateDocumentContext(estimate);
    const bytes = await this.estimatePdfRendererService.renderEstimatePdf({
      estimate,
      ...context,
      generatedAt
    });

    return {
      filename: estimatePdfFilename(estimate),
      contentType: 'application/pdf',
      bytes
    };
  }

  async getEstimateSendPreview(
    sessionToken: string,
    estimateId: string
  ): Promise<EstimateSendPreviewResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:send', [
      'office-web'
    ]);
    const estimate = await this.requireEstimate(estimateId);
    this.requireSendableEstimate(estimate);
    const { job, settings, location, billToCustomer } =
      await this.loadEstimateDocumentContext(estimate);
    const emailContent = buildEstimateEmailContent(
      settings,
      buildEstimateEmailTokens(settings, estimate, job, location, billToCustomer),
      {}
    );

    return {
      preview: {
        subject: emailContent.subject,
        bodyText: emailContent.bodyText
      },
      deliveryStatus: await this.emailProviderService.getEstimateEmailDeliveryStatus()
    };
  }

  async sendEstimate(
    sessionToken: string,
    estimateId: string,
    request: SendEstimateRequestDto
  ): Promise<SendEstimateResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:send',
      ['office-web']
    );
    const estimate = await this.requireEstimate(estimateId);
    this.requireSendableEstimate(estimate);

    const recipientEmail = normalizeEmail(request.recipientEmail);
    const generatedAt = new Date().toISOString();
    const { job, settings, location, billToCustomer } =
      await this.loadEstimateDocumentContext(estimate);
    const emailContent = buildEstimateEmailContent(
      settings,
      buildEstimateEmailTokens(settings, estimate, job, location, billToCustomer),
      request
    );

    // The intent row goes in before the expensive render/provider work so a
    // concurrent send for the same estimate and recipient is blocked for the
    // whole window, not just after rendering finishes.
    const outboundMessageId = randomUUID();
    const intent = await this.customerDeliveryRepository.createEstimateSendIntent({
      id: outboundMessageId,
      channel: 'email',
      provider: 'resend',
      status: 'queued',
      jobId: estimate.jobId,
      estimateId: estimate.id,
      recipientEmail,
      subject: emailContent.subject,
      bodyText: emailContent.bodyText,
      sentByEmployeeId: actor.id,
      sentByName: actor.displayName,
      queuedAt: generatedAt,
      dedupeSince: new Date(Date.now() - 60_000).toISOString()
    });
    if (!intent) {
      throw new ConflictException(
        'This estimate was just sent to that recipient. Wait a moment before trying again.'
      );
    }

    const filename = estimatePdfFilename(estimate);
    let documentSnapshot: CustomerDocumentSnapshotRecord;
    let pdfBytes: Buffer;
    try {
      pdfBytes = await this.estimatePdfRendererService.renderEstimatePdf({
        estimate,
        settings,
        job,
        location,
        billToCustomer,
        generatedAt
      });
      if (pdfBytes.byteLength > 15_000_000) {
        throw new BadRequestException('Estimate PDF is too large to email.');
      }

      const snapshotId = randomUUID();
      const stored = await this.customerDocumentStorageService.writeEstimatePdf({
        jobId: estimate.jobId,
        estimateId: estimate.id,
        snapshotId,
        bytes: pdfBytes
      });
      documentSnapshot = await this.customerDeliveryRepository.createDocumentSnapshot({
        id: snapshotId,
        documentType: 'estimate',
        jobId: estimate.jobId,
        estimateId: estimate.id,
        sourceVersion: estimate.version,
        filename,
        contentType: 'application/pdf',
        storagePath: stored.storagePath,
        sha256: stored.sha256,
        byteSize: stored.byteSize,
        generatedByEmployeeId: actor.id,
        generatedByName: actor.displayName,
        generatedAt
      });
      await this.customerDeliveryRepository.setOutboundMessageDocumentSnapshot(
        outboundMessageId,
        documentSnapshot.id,
        new Date().toISOString()
      );
    } catch (error) {
      // The email never reached the provider; keep the audit row truthful so
      // the failed intent does not block a retry.
      await this.customerDeliveryRepository
        .markOutboundMessageFailed(
          outboundMessageId,
          'Estimate PDF could not be generated.',
          new Date().toISOString()
        )
        .catch(() => undefined);
      throw error;
    }

    const providerResult = await this.sendEstimateEmailSafely(
      buildEmailProviderInput(settings, {
        to: recipientEmail,
        subject: emailContent.subject,
        bodyText: emailContent.bodyText,
        attachment: {
          filename,
          contentType: 'application/pdf',
          bytes: pdfBytes
        },
        idempotencyKey: `estimate-send-${outboundMessageId}`
      })
    );
    const completedAt = new Date().toISOString();
    let outboundMessage: OutboundMessageRecord;
    let recordingIncomplete = false;
    if (providerResult.kind === 'sent') {
      try {
        outboundMessage = await this.customerDeliveryRepository.markOutboundMessageSent(
          outboundMessageId,
          providerResult.providerMessageId,
          completedAt
        );
      } catch (error) {
        // The customer already has the email. Reporting failure here would
        // invite a duplicate send, so answer truthfully: sent, record broken.
        this.logger.error(
          `Estimate ${estimate.id} email was accepted by the provider but could not be recorded as sent: ${describeError(error)}`
        );
        recordingIncomplete = true;
        outboundMessage = {
          ...intent,
          status: 'sent',
          documentSnapshotId: documentSnapshot.id,
          sentAt: completedAt,
          providerMessageId: providerResult.providerMessageId
        };
      }
    } else {
      outboundMessage = await this.customerDeliveryRepository.markOutboundMessageFailed(
        outboundMessageId,
        providerResult.message,
        completedAt
      );
    }

    try {
      await this.customerDeliveryRepository.addEstimateDeliveryTimeline({
        jobId: estimate.jobId,
        occurredAt: completedAt,
        actorName: actor.displayName,
        kind: providerResult.kind === 'sent' ? 'estimateSent' : 'estimateDeliveryFailed',
        message:
          providerResult.kind === 'sent'
            ? `Estimate sent to ${recipientEmail}: ${estimate.title}.`
            : `Estimate delivery failed for ${recipientEmail}: ${estimate.title}.`
      });
    } catch (error) {
      if (providerResult.kind !== 'sent') {
        throw error;
      }
      this.logger.error(
        `Estimate ${estimate.id} email was sent but the timeline entry could not be written: ${describeError(error)}`
      );
      recordingIncomplete = true;
    }

    return {
      outboundMessage: toOutboundMessageSummary(outboundMessage),
      documentSnapshot: toDocumentSnapshotSummary(documentSnapshot),
      ...(recordingIncomplete ? { recordingIncomplete: true } : {})
    };
  }

  private async requireEstimate(estimateId: string): Promise<EstimateRecord> {
    const estimate = await this.estimatesRepository.getEstimateById(estimateId);
    if (!estimate) {
      throw new NotFoundException('Estimate not found.');
    }
    return estimate;
  }

  // Pending estimates are sendable on purpose: the normal flow is build, email
  // the customer, then record their decision. Each send snapshots the document
  // and stamps the estimate version, so later edits never rewrite what was sent.
  private requireSendableEstimate(estimate: EstimateRecord) {
    if (estimate.status !== 'pending' && estimate.status !== 'approved') {
      throw new ConflictException(
        `Only pending or approved estimates can be sent (status: ${estimate.status}).`
      );
    }
    if (estimate.supersededByEstimateId) {
      throw new ConflictException('This estimate has been superseded and cannot be sent.');
    }
  }

  private async loadEstimateDocumentContext(estimate: EstimateRecord) {
    const [job, settings] = await Promise.all([
      this.jobsDataService.getJobById(estimate.jobId),
      this.companySettingsRepository.getSettings()
    ]);
    const [location, billToCustomer] = await Promise.all([
      this.referenceDataService.getLocationById(job.locationId),
      this.referenceDataService.getCustomerById(job.billToCustomerId)
    ]);

    return { job, settings, location, billToCustomer };
  }

  private async sendEstimateEmailSafely(input: EmailProviderSendInput) {
    try {
      return await this.emailProviderService.sendEstimateEmail(input);
    } catch (error) {
      return {
        kind: 'error' as const,
        message: error instanceof Error ? error.message : 'Email delivery failed.'
      };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'estimate';
}

function estimatePdfFilename(estimate: EstimateRecord): string {
  return `estimate-${safeFilenamePart(estimate.title)}-${estimate.id}.pdf`;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new BadRequestException('Recipient email is required.');
  }
  return normalized;
}

function buildEstimateEmailContent(
  settings: CompanySettings,
  tokens: Record<string, string>,
  request: Partial<Pick<SendEstimateRequestDto, 'subject' | 'bodyText'>>
): { subject: string; bodyText: string } {
  const subject = (request.subject?.trim() || settings.estimateEmailSubject).trim();
  const bodyText = (request.bodyText?.trim() || settings.estimateEmailBody).trim();
  if (!subject) {
    throw new BadRequestException('Estimate email subject is required.');
  }
  if (!bodyText) {
    throw new BadRequestException('Estimate email body is required.');
  }
  return {
    subject: renderTemplate(subject, tokens),
    bodyText: renderTemplate(bodyText, tokens)
  };
}

function buildEstimateEmailTokens(
  settings: CompanySettings,
  estimate: EstimateRecord,
  job: { jobNumber: string },
  location: { name: string },
  billToCustomer: { name: string }
): Record<string, string> {
  return {
    companyName: settings.companyName,
    customerName: billToCustomer.name,
    estimateTitle: estimate.title,
    jobNumber: job.jobNumber,
    locationName: location.name
  };
}

function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, tokenName: string) => {
    return tokens[tokenName] ?? match;
  });
}

function toDocumentSnapshotSummary(
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

function toOutboundMessageSummary(record: OutboundMessageRecord): OutboundMessageSummary {
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
    deliveryMessage
  };
}

function deliveryFailureCode(
  record: OutboundMessageRecord
): OutboundMessageFailureCode | undefined {
  if (record.status !== 'failed') {
    return undefined;
  }
  if (record.providerError === deliveryNotConfiguredMessage) {
    return 'notConfigured';
  }
  if (record.providerError) {
    return 'deliveryUnavailable';
  }
  return 'unknown';
}

function deliverySummaryMessage(
  record: OutboundMessageRecord,
  failureCode: OutboundMessageFailureCode | undefined
): string | undefined {
  if (!failureCode) {
    return undefined;
  }
  if (failureCode === 'notConfigured') {
    return 'Email was not sent. Contact BellField support.';
  }
  return 'Email was not delivered. Try again or contact BellField support.';
}
