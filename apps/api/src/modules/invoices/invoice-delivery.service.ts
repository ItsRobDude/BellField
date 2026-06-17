import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { estimateEmailMaxAttachmentBytes } from '@bellfield/contracts';
import type { CompanySettings } from '@bellfield/contracts';
import { CompanySettingsRepository } from '../company-settings/company-settings.repository';
import { CustomerDeliveryRepository } from '../customer-delivery/customer-delivery.repository';
import type {
  CustomerDocumentSnapshotRecord,
  EmailProviderSendInput,
  OutboundMessageRecord
} from '../customer-delivery/customer-delivery.types';
import { CustomerDocumentStorageService } from '../customer-delivery/customer-document-storage.service';
import {
  describeError,
  normalizeEmail,
  renderTemplate,
  safeFilenamePart,
  stripControlCharacters,
  toDocumentSnapshotSummary,
  toOutboundMessageSummary
} from '../customer-delivery/document-delivery-shared';
import {
  estimateEmailQueueExpiryMs,
  nextDeliveryRetryDelayMs
} from '../customer-delivery/delivery-retry';
import {
  buildEmailProviderInput,
  EmailProviderService,
  invoiceDeliveryFailedMessage
} from '../customer-delivery/email-provider.service';
import { InvoicePdfRendererService } from '../customer-delivery/invoice-pdf-renderer.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { InvoicesRepository } from './invoices.repository';
import { OnlinePaymentLinkService } from './online-payment-link.service';
import type {
  InvoiceCancelOutboundMessageResponseDto,
  InvoiceOutboundMessagesResponseDto,
  InvoiceRecord,
  InvoiceSendPreviewResponseDto,
  SendInvoiceRequestDto,
  SendInvoiceResponseDto
} from './invoices.types';

@Injectable()
export class InvoiceDeliveryService {
  private readonly logger = new Logger(InvoiceDeliveryService.name);

  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly companySettingsRepository: CompanySettingsRepository,
    private readonly customerDeliveryRepository: CustomerDeliveryRepository,
    private readonly customerDocumentStorageService: CustomerDocumentStorageService,
    private readonly emailProviderService: EmailProviderService,
    private readonly invoicePdfRendererService: InvoicePdfRendererService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly onlinePaymentLinkService: OnlinePaymentLinkService
  ) {}

  async listInvoiceOutboundMessages(
    sessionToken: string,
    invoiceId: string
  ): Promise<InvoiceOutboundMessagesResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:view', [
      'office-web'
    ]);
    await this.requireInvoice(invoiceId);
    const outboundMessages =
      await this.customerDeliveryRepository.listOutboundMessagesForInvoice(invoiceId);
    return { outboundMessages: outboundMessages.map(toOutboundMessageSummary) };
  }

  async cancelInvoiceOutboundMessage(
    sessionToken: string,
    invoiceId: string,
    outboundMessageId: string
  ): Promise<InvoiceCancelOutboundMessageResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:send',
      ['office-web']
    );
    const invoice = await this.requireInvoice(invoiceId);
    this.requirePostedInvoice(invoice);
    const canceledAt = new Date().toISOString();
    const canceled = await this.customerDeliveryRepository.cancelInvoiceOutboundMessage(
      outboundMessageId,
      invoice.id,
      canceledAt
    );
    if (!canceled) {
      throw new ConflictException(
        'This email can no longer be canceled. Refresh the delivery history for its latest status.'
      );
    }
    try {
      await this.customerDeliveryRepository.addInvoiceDeliveryTimeline({
        jobId: invoice.jobId,
        occurredAt: canceledAt,
        actorName: actor.displayName,
        kind: 'invoiceSendCanceled',
        message: `Invoice send canceled for ${canceled.recipientEmail}: ${invoiceTimelineTitle(invoice)}.`
      });
    } catch (error) {
      this.logger.error(
        `Invoice ${invoice.id} send was canceled but the timeline entry could not be written: ${describeError(error)}`
      );
    }
    return { outboundMessage: toOutboundMessageSummary(canceled) };
  }

  async getInvoiceSendPreview(
    sessionToken: string,
    invoiceId: string
  ): Promise<InvoiceSendPreviewResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:send', [
      'office-web'
    ]);
    const invoice = await this.requireInvoice(invoiceId);
    this.requirePostedInvoice(invoice);
    const settings = await this.companySettingsRepository.getSettings();
    const emailContent = buildInvoiceEmailContent(
      settings,
      buildInvoiceEmailTokens(settings, invoice),
      {}
    );

    return {
      preview: {
        subject: emailContent.subject,
        bodyText: emailContent.bodyText
      },
      deliveryStatus: await this.emailProviderService.getInvoiceEmailDeliveryStatus()
    };
  }

  async sendInvoice(
    sessionToken: string,
    invoiceId: string,
    request: SendInvoiceRequestDto
  ): Promise<SendInvoiceResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:send',
      ['office-web']
    );
    const invoice = await this.requireInvoice(invoiceId);
    this.requirePostedInvoice(invoice);

    const recipientEmail = normalizeEmail(request.recipientEmail);
    const generatedAt = new Date().toISOString();
    const settings = await this.companySettingsRepository.getSettings();
    const emailContent = buildInvoiceEmailContent(
      settings,
      buildInvoiceEmailTokens(settings, invoice),
      request
    );

    const outboundMessageId = randomUUID();
    const intentResult = await this.customerDeliveryRepository.createInvoiceSendIntent({
      id: outboundMessageId,
      channel: 'email',
      provider: this.emailProviderService.providerKey,
      status: 'queued',
      jobId: invoice.jobId,
      invoiceId: invoice.id,
      recipientEmail,
      subject: emailContent.subject,
      bodyText: emailContent.bodyText,
      fromName: settings.companyName,
      replyToEmail: settings.replyToEmail,
      sentByEmployeeId: actor.id,
      sentByName: actor.displayName,
      queuedAt: generatedAt,
      expiresAt: new Date(Date.parse(generatedAt) + estimateEmailQueueExpiryMs).toISOString(),
      dedupeSince: new Date(Date.now() - 60_000).toISOString(),
      now: generatedAt
    });
    if (intentResult.kind === 'blocked') {
      throw new ConflictException(
        intentResult.reason === 'alreadyQueued'
          ? 'This invoice is already queued to send to that recipient. It will send automatically.'
          : 'This invoice was just sent to that recipient. Wait a moment before trying again.'
      );
    }
    const intent = intentResult.message;

    const filename = invoicePdfFilename(invoice);
    let documentSnapshot: CustomerDocumentSnapshotRecord;
    let pdfBytes: Buffer;
    try {
      pdfBytes = await this.invoicePdfRendererService.renderInvoicePdf({
        invoice,
        settings,
        generatedAt
      });
      if (pdfBytes.byteLength > estimateEmailMaxAttachmentBytes) {
        throw new BadRequestException('Invoice PDF is too large to email.');
      }

      const snapshotId = randomUUID();
      const stored = await this.customerDocumentStorageService.writeInvoicePdf({
        jobId: invoice.jobId,
        invoiceId: invoice.id,
        snapshotId,
        bytes: pdfBytes
      });
      documentSnapshot = await this.customerDeliveryRepository.createDocumentSnapshot({
        id: snapshotId,
        documentType: 'invoice',
        jobId: invoice.jobId,
        invoiceId: invoice.id,
        sourceVersion: invoice.version,
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
      await this.customerDeliveryRepository
        .markOutboundMessageFailed(
          outboundMessageId,
          'Invoice PDF could not be generated.',
          new Date().toISOString()
        )
        .catch(() => undefined);
      throw error;
    }

    // Only now that the send is reserved (dedupe passed) and the document is
    // rendered do we mint the payable link — so a duplicate/blocked send or a
    // PDF-render failure can never orphan a link or write a spurious
    // "Payment link created" timeline entry. Append it after the (possibly
    // customized) body and sync the stored body so a worker retry includes it.
    const paymentLinkUrl = await this.resolveInvoicePaymentLinkUrl(sessionToken, invoice, settings);
    let bodyText = emailContent.bodyText;
    if (paymentLinkUrl) {
      bodyText = `${emailContent.bodyText}\n\nPay online: ${paymentLinkUrl}`;
      // Best-effort: the provider send below uses the in-memory bodyText, so the
      // customer gets the link on this attempt regardless. We only sync the
      // stored body so a worker retry also carries it — a failure here must not
      // block a send the link was never meant to block. (A retry after a failed
      // sync would fall back to the linkless stored body, which matches the
      // best-effort posture.)
      try {
        await this.customerDeliveryRepository.updateOutboundMessageBody(
          outboundMessageId,
          bodyText,
          new Date().toISOString()
        );
      } catch (error) {
        this.logger.warn(
          `Invoice ${invoice.id} pay-now link was added to the outgoing email but the stored body could not be synced for retry: ${describeError(error)}`
        );
      }
    }

    const providerResult = await this.sendInvoiceEmailSafely(
      buildEmailProviderInput(
        {
          companyName: intent.fromName ?? settings.companyName,
          replyToEmail: intent.replyToEmail ?? settings.replyToEmail
        },
        {
          to: recipientEmail,
          subject: emailContent.subject,
          bodyText,
          attachment: {
            filename,
            contentType: 'application/pdf',
            bytes: pdfBytes
          },
          idempotencyKey: `invoice-send-${outboundMessageId}`
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
          completedAt
        );
      } catch (error) {
        this.logger.error(
          `Invoice ${invoice.id} email was accepted by the provider but could not be recorded as sent: ${describeError(error)}`
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
        await this.customerDeliveryRepository.addInvoiceDeliveryTimeline({
          jobId: invoice.jobId,
          occurredAt: completedAt,
          actorName: actor.displayName,
          kind: providerResult.kind === 'sent' ? 'invoiceSent' : 'invoiceDeliveryFailed',
          message:
            providerResult.kind === 'sent'
              ? `Invoice sent to ${recipientEmail}: ${invoiceTimelineTitle(invoice)}.`
              : `Invoice delivery failed for ${recipientEmail}: ${invoiceTimelineTitle(invoice)}.`
        });
      }
    } catch (error) {
      if (providerResult.kind !== 'sent') {
        throw error;
      }
      this.logger.error(
        `Invoice ${invoice.id} email was sent but the timeline entry could not be written: ${describeError(error)}`
      );
      recordingIncomplete = true;
    }

    return {
      outboundMessage: toOutboundMessageSummary(outboundMessage),
      documentSnapshot: toDocumentSnapshotSummary(documentSnapshot),
      ...(paymentLinkUrl ? { paymentLinkIncluded: true } : {}),
      ...(recordingIncomplete ? { recordingIncomplete: true } : {})
    };
  }

  private async requireInvoice(invoiceId: string): Promise<InvoiceRecord> {
    const invoice = await this.invoicesRepository.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }
    return invoice;
  }

  private requirePostedInvoice(invoice: InvoiceRecord): void {
    if (invoice.status !== 'posted') {
      throw new ConflictException('Only posted invoices can be emailed to customers.');
    }
    if (!invoice.posted) {
      throw new ConflictException('This posted invoice is missing its frozen posting context.');
    }
  }

  // Best-effort: when the owner has enabled invoice pay links, create-or-reuse
  // the job's default full-due online payment link for the MAIN invoice and return
  // its URL. The invoice send must NEVER be blocked by this — no balance,
  // payments not configured, a same-amount confirmation, or a missing
  // payments:create permission all just mean "send the invoice without a link."
  private async resolveInvoicePaymentLinkUrl(
    sessionToken: string,
    invoice: InvoiceRecord,
    settings: CompanySettings
  ): Promise<string | null> {
    if (!settings.includeInvoicePaymentLink || invoice.invoiceKind !== 'main') {
      return null;
    }
    try {
      const result = await this.onlinePaymentLinkService.createOnlinePaymentLink(
        sessionToken,
        invoice.id,
        {}
      );
      return result.state === 'created' ? result.checkoutUrl : null;
    } catch (error) {
      this.logger.warn(
        `Invoice ${invoice.id} sent without a payment link: ${describeError(error)}`
      );
      return null;
    }
  }

  private async sendInvoiceEmailSafely(input: EmailProviderSendInput) {
    try {
      return await this.emailProviderService.sendInvoiceEmail(input);
    } catch (error) {
      return {
        kind: 'failed' as const,
        code: 'deliveryUnavailable' as const,
        retryable: true,
        message: error instanceof Error ? error.message : invoiceDeliveryFailedMessage
      };
    }
  }
}

function buildInvoiceEmailContent(
  settings: CompanySettings,
  tokens: Record<string, string>,
  request: Partial<Pick<SendInvoiceRequestDto, 'subject' | 'bodyText'>>
): { subject: string; bodyText: string } {
  const subject = (request.subject?.trim() || settings.invoiceEmailSubject).trim();
  const bodyText = (request.bodyText?.trim() || settings.invoiceEmailBody).trim();
  if (!subject) {
    throw new BadRequestException('Invoice email subject is required.');
  }
  if (!bodyText) {
    throw new BadRequestException('Invoice email body is required.');
  }
  return {
    subject: stripControlCharacters(renderTemplate(subject, tokens)),
    bodyText: renderTemplate(bodyText, tokens)
  };
}

function buildInvoiceEmailTokens(
  settings: CompanySettings,
  invoice: InvoiceRecord
): Record<string, string> {
  const context = invoice.posted;
  if (!context) {
    throw new Error('Invoice email rendering requires posted invoice context.');
  }
  const invoiceLabel = invoiceKindLabel(invoice.invoiceKind);
  return {
    companyName: settings.companyName,
    customerName: context.billTo.name,
    invoiceLabel,
    invoiceLabelLower: invoiceLabel.toLowerCase(),
    // A posted invoice always has a number by the time it can be emailed; fall
    // back to empty so the token never renders the literal '{invoiceNumber}'.
    invoiceNumber: invoice.invoiceNumber ?? '',
    jobNumber: context.jobNumber,
    locationName: context.serviceLocation.name
  };
}

function invoicePdfFilename(invoice: InvoiceRecord): string {
  const jobNumber = invoice.posted?.jobNumber ?? invoice.jobId;
  return `invoice-${safeFilenamePart(jobNumber, 'invoice')}-${invoice.id}.pdf`;
}

function invoiceTimelineTitle(invoice: InvoiceRecord): string {
  const label = invoiceKindLabel(invoice.invoiceKind);
  const jobNumber = invoice.posted?.jobNumber;
  return jobNumber ? `${label} for job ${jobNumber}` : `${label} ${invoice.id}`;
}

function invoiceKindLabel(kind: InvoiceRecord['invoiceKind']): string {
  if (kind === 'adjustment') return 'Adjustment';
  if (kind === 'credit') return 'Credit';
  return 'Invoice';
}
