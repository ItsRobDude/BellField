import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { estimateEmailMaxAttachmentBytes, relayAcceptanceExpiryDays } from '@bellfield/contracts';
import type {
  CancelOutboundMessageResponse,
  CompanySettings,
  RelayAcceptancePayload
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
import {
  describeError,
  normalizeEmail,
  renderTemplate,
  safeFilenamePart,
  stripControlCharacters,
  toDocumentSnapshotSummary,
  toOutboundMessageSummary
} from '../customer-delivery/document-delivery-shared';
import { CustomerDocumentStorageService } from '../customer-delivery/customer-document-storage.service';
import {
  estimateEmailQueueExpiryMs,
  nextDeliveryRetryDelayMs
} from '../customer-delivery/delivery-retry';
import {
  buildEmailProviderInput,
  deliveryFailedMessage,
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

  async cancelEstimateOutboundMessage(
    sessionToken: string,
    estimateId: string,
    outboundMessageId: string
  ): Promise<CancelOutboundMessageResponse> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:send',
      ['office-web']
    );
    const estimate = await this.requireEstimate(estimateId);
    const canceledAt = new Date().toISOString();
    const canceled = await this.customerDeliveryRepository.cancelOutboundMessage(
      outboundMessageId,
      estimate.id,
      canceledAt
    );
    if (!canceled) {
      throw new ConflictException(
        'This email can no longer be canceled. Refresh the delivery history for its latest status.'
      );
    }
    try {
      await this.customerDeliveryRepository.addEstimateDeliveryTimeline({
        jobId: estimate.jobId,
        occurredAt: canceledAt,
        actorName: actor.displayName,
        kind: 'estimateSendCanceled',
        message: `Estimate send canceled for ${canceled.recipientEmail}: ${estimate.title}.`
      });
    } catch (error) {
      // The cancel itself succeeded; a missing timeline entry is not worth
      // confusing the office with an error.
      this.logger.error(
        `Estimate ${estimate.id} send was canceled but the timeline entry could not be written: ${describeError(error)}`
      );
    }
    return { outboundMessage: toOutboundMessageSummary(canceled) };
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
    // whole window, not just after rendering finishes. Sender identity is
    // pinned on the row at queue time (D8) so a retry hours later sends what
    // the office saw, not drifted settings.
    const outboundMessageId = randomUUID();
    const intentResult = await this.customerDeliveryRepository.createEstimateSendIntent({
      id: outboundMessageId,
      channel: 'email',
      provider: this.emailProviderService.providerKey,
      status: 'queued',
      jobId: estimate.jobId,
      estimateId: estimate.id,
      recipientEmail,
      subject: emailContent.subject,
      bodyText: emailContent.bodyText,
      fromName: settings.companyName,
      replyToEmail: settings.replyToEmail,
      sentByEmployeeId: actor.id,
      sentByName: actor.displayName,
      queuedAt: generatedAt,
      expiresAt: new Date(Date.parse(generatedAt) + estimateEmailQueueExpiryMs).toISOString(),
      // Frozen at queue time like the sender identity: a worker retry mints
      // the link (options, version pin, expiry) the office saw when it sent.
      acceptancePayload: buildEstimateAcceptancePayload(estimate, settings),
      dedupeSince: new Date(Date.now() - 60_000).toISOString(),
      now: generatedAt
    });
    if (intentResult.kind === 'blocked') {
      throw new ConflictException(
        intentResult.reason === 'alreadyQueued'
          ? 'This estimate is already queued to send to that recipient. It will send automatically.'
          : 'This estimate was just sent to that recipient. Wait a moment before trying again.'
      );
    }
    const intent = intentResult.message;

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
      if (pdfBytes.byteLength > estimateEmailMaxAttachmentBytes) {
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
      buildEmailProviderInput(
        // D8: send with the identity pinned on the intent row at queue time.
        {
          companyName: intent.fromName ?? settings.companyName,
          replyToEmail: intent.replyToEmail ?? settings.replyToEmail
        },
        {
          to: recipientEmail,
          subject: emailContent.subject,
          bodyText: emailContent.bodyText,
          attachment: {
            filename,
            contentType: 'application/pdf',
            bytes: pdfBytes
          },
          idempotencyKey: `estimate-send-${outboundMessageId}`,
          acceptance: intent.acceptancePayload
        }
      )
    );
    const completedAt = new Date().toISOString();
    let outboundMessage: OutboundMessageRecord;
    let recordingIncomplete = false;
    if (providerResult.kind === 'sent') {
      try {
        outboundMessage = await this.customerDeliveryRepository.markOutboundMessageSent(
          outboundMessageId,
          providerResult.providerMessageId,
          completedAt,
          {
            linkId: providerResult.acceptanceLinkId,
            url: providerResult.acceptanceUrl,
            expiresAt: providerResult.acceptanceUrl
              ? acceptanceLinkExpiryFrom(completedAt, intent.acceptancePayload?.expiresInDays)
              : undefined
          }
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
    } else if (providerResult.retryable) {
      // The intent stays queued; the worker retries it from the stored
      // snapshot and the office is notified when it eventually sends.
      outboundMessage = await this.customerDeliveryRepository.scheduleOutboundMessageRetry(
        outboundMessageId,
        new Date(Date.parse(completedAt) + nextDeliveryRetryDelayMs(1)).toISOString(),
        completedAt
      );
    } else {
      outboundMessage = await this.customerDeliveryRepository.markOutboundMessageFailed(
        outboundMessageId,
        providerResult.code,
        completedAt
      );
    }

    const queuedForRetry = outboundMessage.status === 'queued';
    try {
      if (!queuedForRetry) {
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
      }
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
        kind: 'failed' as const,
        code: 'deliveryUnavailable' as const,
        retryable: true,
        message: error instanceof Error ? error.message : deliveryFailedMessage
      };
    }
  }
}

function estimatePdfFilename(estimate: EstimateRecord): string {
  return `estimate-${safeFilenamePart(estimate.title, 'estimate')}-${estimate.id}.pdf`;
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
    // The subject becomes an email header; strip CR/LF and control characters
    // so template or caller input can never smuggle extra headers.
    subject: stripControlCharacters(renderTemplate(subject, tokens)),
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

/**
 * The acceptance payload the relay mints the customer link from. Pending
 * estimates send every option (the homeowner's choice IS the approval);
 * approved estimates being re-sent carry only the selected path. A
 * non-optioned estimate sends one entry whose id is the estimate id — the
 * decision poller treats that sentinel as "no option selection".
 */
function buildEstimateAcceptancePayload(
  estimate: EstimateRecord,
  settings: CompanySettings
): RelayAcceptancePayload {
  const allOptions = (estimate.optionGroups ?? []).flatMap((group) => group.options);
  let options = allOptions.map((option) => ({
    id: option.id,
    label: option.label,
    totalCents: Math.round(option.totals.total * 100)
  }));
  if (estimate.status === 'approved' && estimate.selectedOptionId) {
    options = options.filter((option) => option.id === estimate.selectedOptionId);
  }
  if (options.length === 0) {
    options = [
      {
        id: estimate.id,
        label: estimate.title,
        totalCents: Math.round(estimate.totals.total * 100)
      }
    ];
  }
  return {
    estimateRef: estimate.id,
    estimateVersion: estimate.version,
    title: estimate.title,
    options,
    expiresInDays: settings.acceptanceLinkExpiryDays
  };
}

function acceptanceLinkExpiryFrom(sentAt: string, expiresInDays: number | undefined): string {
  const days = Number.isInteger(expiresInDays)
    ? Math.min(
        relayAcceptanceExpiryDays.max,
        Math.max(relayAcceptanceExpiryDays.min, expiresInDays as number)
      )
    : relayAcceptanceExpiryDays.default;
  return new Date(Date.parse(sentAt) + days * 24 * 60 * 60 * 1000).toISOString();
}
