import { ConflictException } from '@nestjs/common';
import { InvoiceDeliveryService } from './invoice-delivery.service';
import type { InvoiceRecord } from './invoices.types';

function postedInvoice(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 'invoice-1',
    jobId: 'job-1',
    invoiceKind: 'main',
    status: 'posted',
    taxRateBasisPoints: 0,
    lineItems: [
      {
        id: 'line-1',
        invoiceId: 'invoice-1',
        position: 1,
        kind: 'labor',
        description: 'Diagnostic labor',
        quantity: 1,
        unitPrice: 125,
        taxable: true,
        lineSubtotal: 125,
        sourceKind: 'manual',
        sourceSyncState: 'linked',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z'
      }
    ],
    totals: {
      subtotal: 125,
      discount: 0,
      taxableBase: 125,
      tax: 0,
      total: 125,
      totalCost: 0,
      profit: 125,
      marginBasisPoints: 10_000,
      costComplete: true
    },
    posted: {
      postedAt: '2026-06-01T12:00:00.000Z',
      postedByName: 'Olivia Owner',
      billTo: { customerId: 'customer-1', name: 'Acme Co' },
      serviceLocation: { locationId: 'location-1', name: 'Acme HQ' },
      jobNumber: '1001'
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    version: 2,
    ...overrides
  };
}

function outboundMessage(overrides = {}) {
  return {
    id: 'message-1',
    channel: 'email' as const,
    provider: 'relay' as const,
    status: 'sent' as const,
    jobId: 'job-1',
    invoiceId: 'invoice-1',
    documentSnapshotId: 'snapshot-1',
    recipientEmail: 'customer@example.com',
    subject: 'Invoice 1001 from Acme HVAC',
    bodyText: 'Hello Acme Co, attached is your invoice for job 1001.',
    fromName: 'Acme HVAC',
    replyToEmail: 'office@acme.example',
    sentByName: 'Olivia Owner',
    queuedAt: '2026-06-01T12:00:00.000Z',
    sentAt: '2026-06-01T12:00:01.000Z',
    attemptCount: 1,
    ...overrides
  };
}

function companySettings(overrides = {}) {
  return {
    companyName: 'Acme HVAC',
    replyToEmail: 'office@acme.example',
    estimateEmailSubject: 'Estimate from {companyName}',
    estimateEmailBody: 'Attached is your estimate.',
    invoiceEmailSubject: 'Invoice {jobNumber} from {companyName}',
    invoiceEmailBody:
      'Hello {customerName}, attached is your {invoiceLabelLower} for job {jobNumber}.',
    includeInvoicePaymentLink: false,
    sendPaymentReceipts: true,
    paymentReceiptEmailSubject: 'Receipt from {companyName}',
    paymentReceiptEmailBody: 'We received your {receiptKind} of {amount}.',
    sendRefundReceipts: true,
    refundReceiptEmailSubject: 'Refund from {companyName}',
    refundReceiptEmailBody: 'We issued a refund of {amount}.',
    ...overrides
  };
}

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'employee-1',
      displayName: 'Olivia Owner',
      effectivePermissions: ['invoices:view', 'invoices:send']
    })
  };
  const companySettingsRepository = {
    getSettings: jest.fn().mockResolvedValue(companySettings())
  };
  const customerDeliveryRepository = {
    listOutboundMessagesForInvoice: jest.fn().mockResolvedValue([]),
    cancelInvoiceOutboundMessage: jest
      .fn()
      .mockResolvedValue(outboundMessage({ status: 'canceled' })),
    addInvoiceDeliveryTimeline: jest.fn().mockResolvedValue(undefined),
    createInvoiceSendIntent: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        kind: 'created',
        message: outboundMessage({
          id: input.id,
          status: 'queued',
          documentSnapshotId: undefined,
          sentAt: undefined
        })
      })
    ),
    createDocumentSnapshot: jest.fn().mockResolvedValue({
      id: 'snapshot-1',
      documentType: 'invoice',
      jobId: 'job-1',
      invoiceId: 'invoice-1',
      sourceVersion: 2,
      filename: 'invoice-1001-invoice-1.pdf',
      contentType: 'application/pdf',
      storagePath: 'customer-documents/jobs/job-1/invoices/invoice-1/snapshot-1.pdf',
      sha256: 'a'.repeat(64),
      byteSize: 9,
      generatedByName: 'Olivia Owner',
      generatedAt: '2026-06-01T12:00:00.000Z'
    }),
    setOutboundMessageDocumentSnapshot: jest.fn().mockResolvedValue(undefined),
    updateOutboundMessageBody: jest.fn().mockResolvedValue(undefined),
    markOutboundMessageSent: jest.fn().mockResolvedValue(outboundMessage()),
    markOutboundMessageFailed: jest.fn().mockResolvedValue(outboundMessage({ status: 'failed' })),
    scheduleOutboundMessageRetry: jest
      .fn()
      .mockResolvedValue(outboundMessage({ status: 'queued', sentAt: undefined }))
  };
  const customerDocumentStorageService = {
    writeInvoicePdf: jest.fn().mockResolvedValue({
      storagePath: 'customer-documents/jobs/job-1/invoices/invoice-1/snapshot-1.pdf',
      sha256: 'a'.repeat(64),
      byteSize: 9
    })
  };
  const emailProviderService = {
    providerKey: 'relay' as const,
    getInvoiceEmailDeliveryStatus: jest.fn().mockResolvedValue({
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Invoice email is ready.'
    }),
    sendInvoiceEmail: jest.fn().mockResolvedValue({
      kind: 'sent',
      providerMessageId: 'relay-1'
    })
  };
  const invoicePdfRendererService = {
    renderInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF test'))
  };
  const invoicesRepository = {
    getInvoiceById: jest.fn().mockResolvedValue(postedInvoice())
  };
  const onlinePaymentLinkService = {
    createOnlinePaymentLink: jest
      .fn()
      .mockResolvedValue({ state: 'paymentsNotConfigured', message: 'not configured' })
  };
  const service = new InvoiceDeliveryService(
    identityAccessService as never,
    companySettingsRepository as never,
    customerDeliveryRepository as never,
    customerDocumentStorageService as never,
    emailProviderService as never,
    invoicePdfRendererService as never,
    invoicesRepository as never,
    onlinePaymentLinkService as never
  );
  return {
    service,
    identityAccessService,
    companySettingsRepository,
    customerDeliveryRepository,
    customerDocumentStorageService,
    emailProviderService,
    invoicePdfRendererService,
    invoicesRepository,
    onlinePaymentLinkService
  };
}

describe('InvoiceDeliveryService', () => {
  it('previews invoice email content and readiness for posted invoices', async () => {
    const { service, identityAccessService, emailProviderService } = createService();

    const result = await service.getInvoiceSendPreview('token', 'invoice-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:send',
      ['office-web']
    );
    expect(result.preview.subject).toBe('Invoice 1001 from Acme HVAC');
    expect(result.preview.bodyText).toContain('Hello Acme Co');
    expect(result.deliveryStatus.message).toBe('Invoice email is ready.');
    expect(emailProviderService.getInvoiceEmailDeliveryStatus).toHaveBeenCalledTimes(1);
  });

  it('uses invoice email template defaults from company settings', async () => {
    const { service, companySettingsRepository } = createService();
    companySettingsRepository.getSettings.mockResolvedValue(
      companySettings({
        invoiceEmailSubject: '{invoiceLabel} ready for {jobNumber}',
        invoiceEmailBody: 'Hi {customerName}, {companyName} attached {invoiceLabelLower}.'
      })
    );

    const result = await service.getInvoiceSendPreview('token', 'invoice-1');

    expect(result.preview.subject).toBe('Invoice ready for 1001');
    expect(result.preview.bodyText).toBe('Hi Acme Co, Acme HVAC attached invoice.');
  });

  it('rejects draft invoices and posted invoices missing frozen context', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.getInvoiceById.mockResolvedValueOnce(
      postedInvoice({ status: 'draft', posted: undefined })
    );

    await expect(
      service.sendInvoice('token', 'invoice-1', { recipientEmail: 'x@y.test' })
    ).rejects.toBeInstanceOf(ConflictException);

    invoicesRepository.getInvoiceById.mockResolvedValueOnce(postedInvoice({ posted: undefined }));
    await expect(service.getInvoiceSendPreview('token', 'invoice-1')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('sends a posted invoice from the frozen invoice record with no acceptance payload', async () => {
    const {
      service,
      customerDeliveryRepository,
      customerDocumentStorageService,
      emailProviderService,
      invoicePdfRendererService
    } = createService();

    const result = await service.sendInvoice('token', 'invoice-1', {
      recipientEmail: 'CUSTOMER@example.com'
    });

    expect(customerDeliveryRepository.createInvoiceSendIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        invoiceId: 'invoice-1',
        recipientEmail: 'customer@example.com',
        subject: 'Invoice 1001 from Acme HVAC'
      })
    );
    expect(customerDeliveryRepository.createInvoiceSendIntent.mock.calls[0][0]).not.toHaveProperty(
      'acceptancePayload'
    );
    expect(invoicePdfRendererService.renderInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({
          id: 'invoice-1',
          posted: expect.objectContaining({ jobNumber: '1001' })
        })
      })
    );
    expect(customerDocumentStorageService.writeInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        invoiceId: 'invoice-1',
        bytes: Buffer.from('%PDF test')
      })
    );
    expect(customerDeliveryRepository.createDocumentSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'invoice',
        invoiceId: 'invoice-1',
        sourceVersion: 2
      })
    );
    const sendIntent = customerDeliveryRepository.createInvoiceSendIntent.mock.calls[0][0];
    expect(emailProviderService.sendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        idempotencyKey: `invoice-send-${sendIntent.id}`
      })
    );
    expect(emailProviderService.sendInvoiceEmail.mock.calls[0][0]).not.toHaveProperty('acceptance');
    expect(customerDeliveryRepository.addInvoiceDeliveryTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'invoiceSent',
        message: 'Invoice sent to customer@example.com: Invoice for job 1001.'
      })
    );
    expect(result.outboundMessage.invoiceId).toBe('invoice-1');
    expect(result.documentSnapshot.documentType).toBe('invoice');
  });

  it('embeds a pay-now link and flags it when the owner setting is on', async () => {
    const {
      service,
      companySettingsRepository,
      onlinePaymentLinkService,
      customerDeliveryRepository
    } = createService();
    companySettingsRepository.getSettings.mockResolvedValue(
      companySettings({ includeInvoicePaymentLink: true })
    );
    onlinePaymentLinkService.createOnlinePaymentLink.mockResolvedValue({
      state: 'created',
      checkoutUrl: 'https://pay.example/cs_test_123',
      paymentSessionId: 'pay_sess_1',
      amount: 250,
      currency: 'USD',
      expiresAt: '2026-07-01T00:00:00.000Z'
    });

    const result = await service.sendInvoice('token', 'invoice-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(onlinePaymentLinkService.createOnlinePaymentLink).toHaveBeenCalledWith(
      'token',
      'invoice-1',
      {}
    );
    // Reorder invariant: the reserved intent body is the base (the link is only
    // minted after the send is viable), then the stored body is synced with it.
    const sendIntent = customerDeliveryRepository.createInvoiceSendIntent.mock.calls[0][0];
    expect(sendIntent.bodyText).not.toContain('Pay online');
    expect(customerDeliveryRepository.updateOutboundMessageBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Pay online: https://pay.example/cs_test_123'),
      expect.any(String)
    );
    expect(result.paymentLinkIncluded).toBe(true);
  });

  it('sends without a link and does not call the link service when the setting is off', async () => {
    const { service, onlinePaymentLinkService, customerDeliveryRepository } = createService();

    const result = await service.sendInvoice('token', 'invoice-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(onlinePaymentLinkService.createOnlinePaymentLink).not.toHaveBeenCalled();
    expect(customerDeliveryRepository.updateOutboundMessageBody).not.toHaveBeenCalled();
    expect(result.paymentLinkIncluded).toBeUndefined();
  });

  it('still sends the invoice (no link, no body sync) when pay-link creation needs confirmation or fails', async () => {
    const {
      service,
      companySettingsRepository,
      onlinePaymentLinkService,
      customerDeliveryRepository
    } = createService();
    companySettingsRepository.getSettings.mockResolvedValue(
      companySettings({ includeInvoicePaymentLink: true })
    );
    onlinePaymentLinkService.createOnlinePaymentLink.mockResolvedValue({
      state: 'confirmationRequired',
      code: 'sameAmountPreviouslyPaid',
      amount: 250,
      currency: 'USD',
      message: 'already paid'
    });

    const result = await service.sendInvoice('token', 'invoice-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(onlinePaymentLinkService.createOnlinePaymentLink).toHaveBeenCalled();
    expect(customerDeliveryRepository.updateOutboundMessageBody).not.toHaveBeenCalled();
    expect(result.paymentLinkIncluded).toBeUndefined();
    expect(result.outboundMessage.invoiceId).toBe('invoice-1');
  });

  it('still sends with the link when the stored-body sync fails (the link never blocks the send)', async () => {
    const {
      service,
      companySettingsRepository,
      onlinePaymentLinkService,
      customerDeliveryRepository,
      emailProviderService
    } = createService();
    companySettingsRepository.getSettings.mockResolvedValue(
      companySettings({ includeInvoicePaymentLink: true })
    );
    onlinePaymentLinkService.createOnlinePaymentLink.mockResolvedValue({
      state: 'created',
      checkoutUrl: 'https://pay.example/cs_test_123',
      paymentSessionId: 'pay_sess_1',
      amount: 250,
      currency: 'USD',
      expiresAt: '2026-07-01T00:00:00.000Z'
    });
    customerDeliveryRepository.updateOutboundMessageBody.mockRejectedValueOnce(
      new Error('db down')
    );

    const result = await service.sendInvoice('token', 'invoice-1', {
      recipientEmail: 'customer@example.com'
    });

    // The provider send uses the in-memory body, so the customer still gets the
    // link on this attempt even though syncing the stored body failed.
    expect(emailProviderService.sendInvoiceEmail).toHaveBeenCalled();
    expect(emailProviderService.sendInvoiceEmail.mock.calls[0][0].bodyText).toContain(
      'Pay online: https://pay.example/cs_test_123'
    );
    expect(result.paymentLinkIncluded).toBe(true);
    expect(result.outboundMessage.invoiceId).toBe('invoice-1');
  });

  it('does not mint a payment link when the send intent is blocked as a duplicate', async () => {
    const {
      service,
      companySettingsRepository,
      onlinePaymentLinkService,
      customerDeliveryRepository,
      invoicePdfRendererService
    } = createService();
    companySettingsRepository.getSettings.mockResolvedValue(
      companySettings({ includeInvoicePaymentLink: true })
    );
    customerDeliveryRepository.createInvoiceSendIntent.mockResolvedValueOnce({
      kind: 'blocked',
      reason: 'alreadyQueued'
    });

    await expect(
      service.sendInvoice('token', 'invoice-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toBeInstanceOf(ConflictException);

    // Ordering invariant: a blocked send never reaches the PDF render or the link mint.
    expect(invoicePdfRendererService.renderInvoicePdf).not.toHaveBeenCalled();
    expect(onlinePaymentLinkService.createOnlinePaymentLink).not.toHaveBeenCalled();
  });

  it('does not mint a payment link when the PDF render fails', async () => {
    const {
      service,
      companySettingsRepository,
      onlinePaymentLinkService,
      customerDeliveryRepository,
      invoicePdfRendererService
    } = createService();
    companySettingsRepository.getSettings.mockResolvedValue(
      companySettings({ includeInvoicePaymentLink: true })
    );
    invoicePdfRendererService.renderInvoicePdf.mockRejectedValueOnce(new Error('render boom'));

    await expect(
      service.sendInvoice('token', 'invoice-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toThrow('render boom');

    // Ordering invariant: the link is minted only after a successful render.
    expect(onlinePaymentLinkService.createOnlinePaymentLink).not.toHaveBeenCalled();
    expect(customerDeliveryRepository.updateOutboundMessageBody).not.toHaveBeenCalled();
  });

  it('leaves retryable provider failures queued without a timeline entry', async () => {
    const { service, emailProviderService, customerDeliveryRepository } = createService();
    emailProviderService.sendInvoiceEmail.mockResolvedValueOnce({
      kind: 'failed',
      code: 'deliveryUnavailable',
      retryable: true,
      message: 'safe failure'
    });

    const result = await service.sendInvoice('token', 'invoice-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(customerDeliveryRepository.scheduleOutboundMessageRetry).toHaveBeenCalled();
    expect(customerDeliveryRepository.addInvoiceDeliveryTimeline).not.toHaveBeenCalled();
    expect(result.outboundMessage.status).toBe('queued');
  });

  it('cancels queued invoice sends and writes invoice timeline copy', async () => {
    const { service, customerDeliveryRepository } = createService();

    const result = await service.cancelInvoiceOutboundMessage('token', 'invoice-1', 'message-1');

    expect(customerDeliveryRepository.cancelInvoiceOutboundMessage).toHaveBeenCalledWith(
      'message-1',
      'invoice-1',
      expect.any(String)
    );
    expect(customerDeliveryRepository.addInvoiceDeliveryTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'invoiceSendCanceled',
        message: 'Invoice send canceled for customer@example.com: Invoice for job 1001.'
      })
    );
    expect(result.outboundMessage.status).toBe('canceled');
  });
});
