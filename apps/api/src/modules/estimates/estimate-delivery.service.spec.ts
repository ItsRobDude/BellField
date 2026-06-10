import { ConflictException } from '@nestjs/common';
import { EstimateDeliveryService } from './estimate-delivery.service';
import type { EstimateRecord } from './estimates.types';

function createDeliveryService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['estimates:view', 'estimates:send'],
      sessionSurface: 'office-web'
    })
  };
  const jobsDataService = {
    getJobById: jest.fn().mockResolvedValue({
      id: 'job-1',
      jobNumber: '1001',
      locationId: 'location-1',
      billToCustomerId: 'customer-1'
    })
  };
  const referenceDataService = {
    getLocationById: jest.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Main Shop',
      customerId: 'customer-1',
      addressLine1: '123 Main',
      city: 'Blaine',
      state: 'WA',
      postalCode: '98230'
    }),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme',
      accountType: 'company',
      billingAddressLine1: 'PO Box 1',
      billingCity: 'Blaine',
      billingState: 'WA',
      billingPostalCode: '98230',
      isActive: true,
      flags: []
    })
  };
  const companySettingsRepository = {
    getSettings: jest.fn().mockResolvedValue({
      companyName: 'BellField',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Hello {customerName}, attached is {estimateTitle}.',
      chargesSalesTax: false,
      defaultSalesTaxBasisPoints: 0
    })
  };
  const customerDeliveryRepository = {
    listOutboundMessagesForEstimate: jest.fn().mockResolvedValue([]),
    createDocumentSnapshot: jest.fn().mockImplementation(async (input) => ({
      ...input,
      generatedByName: input.generatedByName,
      generatedAt: input.generatedAt
    })),
    createEstimateSendIntent: jest.fn().mockImplementation(async (input) => ({
      ...input,
      sentByName: input.sentByName,
      queuedAt: input.queuedAt
    })),
    setOutboundMessageDocumentSnapshot: jest.fn(),
    markOutboundMessageSent: jest.fn().mockImplementation(async (messageId, providerMessageId) => ({
      id: messageId,
      channel: 'email',
      provider: 'resend',
      status: 'sent',
      jobId: 'job-1',
      estimateId: 'estimate-1',
      documentSnapshotId: 'snapshot-1',
      recipientEmail: 'customer@example.com',
      subject: 'Estimate from BellField',
      bodyText: 'Hello Acme, attached is AC replacement.',
      sentByName: 'Dispatcher',
      queuedAt: '2026-06-01T00:00:00.000Z',
      sentAt: '2026-06-01T00:00:01.000Z',
      providerMessageId
    })),
    markOutboundMessageFailed: jest.fn().mockImplementation(async (messageId, providerError) => ({
      id: messageId,
      channel: 'email',
      provider: 'resend',
      status: 'failed',
      jobId: 'job-1',
      estimateId: 'estimate-1',
      documentSnapshotId: 'snapshot-1',
      recipientEmail: 'customer@example.com',
      subject: 'Estimate from BellField',
      bodyText: 'Hello Acme, attached is AC replacement.',
      sentByName: 'Dispatcher',
      queuedAt: '2026-06-01T00:00:00.000Z',
      providerError
    })),
    addEstimateDeliveryTimeline: jest.fn()
  };
  const customerDocumentStorageService = {
    writeEstimatePdf: jest.fn().mockResolvedValue({
      storagePath: 'customer-documents/jobs/job-1/estimates/estimate-1/snapshot-1.pdf',
      sha256: 'a'.repeat(64),
      byteSize: 64
    })
  };
  const emailProviderService = {
    sendEstimateEmail: jest.fn().mockResolvedValue({
      kind: 'sent',
      providerMessageId: 'resend-message-1'
    }),
    getEstimateEmailDeliveryStatus: jest.fn().mockResolvedValue({
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Estimate email is ready.'
    })
  };
  const estimatePdfRendererService = {
    renderEstimatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF test'))
  };
  const estimatesRepository = {
    getEstimateById: jest.fn().mockResolvedValue(estimateRecord({ status: 'approved' }))
  };

  return {
    service: new EstimateDeliveryService(
      identityAccessService as never,
      jobsDataService as never,
      referenceDataService as never,
      companySettingsRepository as never,
      customerDeliveryRepository as never,
      customerDocumentStorageService as never,
      emailProviderService as never,
      estimatePdfRendererService as never,
      estimatesRepository as never
    ),
    identityAccessService,
    customerDeliveryRepository,
    customerDocumentStorageService,
    emailProviderService,
    estimatePdfRendererService,
    estimatesRepository
  };
}

function estimateRecord(overrides: Partial<EstimateRecord> = {}): EstimateRecord {
  return {
    id: 'estimate-1',
    jobId: 'job-1',
    status: 'pending',
    title: 'AC replacement',
    taxRateBasisPoints: 0,
    lineItems: [
      {
        id: 'line-1',
        estimateId: 'estimate-1',
        position: 0,
        kind: 'equipment',
        description: 'Condenser',
        quantity: 1,
        unitPrice: 100,
        unitCost: 60,
        taxable: true,
        lineSubtotal: 100,
        lineCost: 60,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z'
      }
    ],
    totals: {
      subtotal: 100,
      discount: 0,
      taxableBase: 100,
      tax: 0,
      total: 100,
      totalCost: 60,
      profit: 40,
      marginBasisPoints: 4000,
      costComplete: true
    },
    createdByEmployeeId: 'office-1',
    createdByName: 'Dispatcher',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    version: 1,
    ...overrides
  };
}

describe('EstimateDeliveryService', () => {
  it('renders an estimate PDF for download without sending or logging delivery', async () => {
    const {
      service,
      identityAccessService,
      customerDeliveryRepository,
      customerDocumentStorageService,
      emailProviderService,
      estimatePdfRendererService
    } = createDeliveryService();

    const result = await service.renderEstimatePdfDocument('token', 'estimate-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'estimates:view',
      ['office-web']
    );
    expect(estimatePdfRendererService.renderEstimatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        estimate: expect.objectContaining({ id: 'estimate-1' }),
        generatedAt: expect.any(String)
      })
    );
    expect(result).toEqual({
      filename: 'estimate-AC-replacement-estimate-1.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('%PDF test')
    });
    expect(customerDocumentStorageService.writeEstimatePdf).not.toHaveBeenCalled();
    expect(customerDeliveryRepository.createEstimateSendIntent).not.toHaveBeenCalled();
    expect(customerDeliveryRepository.addEstimateDeliveryTimeline).not.toHaveBeenCalled();
    expect(emailProviderService.sendEstimateEmail).not.toHaveBeenCalled();
  });

  it('sends an approved estimate as a PDF email and logs delivery', async () => {
    const {
      service,
      customerDeliveryRepository,
      customerDocumentStorageService,
      emailProviderService,
      estimatePdfRendererService
    } = createDeliveryService();

    const result = await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'Customer@Example.com'
    });

    expect(estimatePdfRendererService.renderEstimatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        estimate: expect.objectContaining({ id: 'estimate-1' }),
        settings: expect.objectContaining({ companyName: 'BellField' })
      })
    );
    expect(customerDocumentStorageService.writeEstimatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        estimateId: 'estimate-1',
        bytes: Buffer.from('%PDF test')
      })
    );
    expect(emailProviderService.sendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        attachment: expect.objectContaining({ filename: expect.stringMatching(/\.pdf$/) })
      })
    );
    // The shop's company name fronts the email; the From address itself is
    // never caller- or shop-supplied.
    expect(emailProviderService.sendEstimateEmail.mock.calls[0]?.[0]).not.toHaveProperty(
      'fromEmail'
    );
    expect(emailProviderService.sendEstimateEmail.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ fromName: 'BellField' })
    );
    expect(customerDeliveryRepository.addEstimateDeliveryTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        kind: 'estimateSent',
        message: 'Estimate sent to customer@example.com: AC replacement.'
      })
    );
    expect(result.outboundMessage.status).toBe('sent');
    expect(result.outboundMessage).not.toHaveProperty('bodyText');
    expect(result.outboundMessage).not.toHaveProperty('provider');
    expect(result.outboundMessage).not.toHaveProperty('providerMessageId');
    expect(result.documentSnapshot).not.toHaveProperty('storagePath');
  });

  it('previews resolved estimate email content and delivery readiness without sending', async () => {
    const { service, identityAccessService, emailProviderService } = createDeliveryService();

    const result = await service.getEstimateSendPreview('token', 'estimate-1');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'estimates:send',
      ['office-web']
    );
    expect(result).toEqual({
      preview: {
        subject: 'Estimate from BellField',
        bodyText: 'Hello Acme, attached is AC replacement.'
      },
      deliveryStatus: {
        configured: true,
        ready: true,
        status: 'ready',
        message: 'Estimate email is ready.'
      }
    });
    expect(emailProviderService.getEstimateEmailDeliveryStatus).toHaveBeenCalledTimes(1);
    expect(emailProviderService.sendEstimateEmail).not.toHaveBeenCalled();
  });

  it('sends a pending estimate so the customer can review before approval', async () => {
    const { service, estimatesRepository, emailProviderService, customerDeliveryRepository } =
      createDeliveryService();
    estimatesRepository.getEstimateById.mockResolvedValue(estimateRecord({ status: 'pending' }));

    const result = await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(emailProviderService.sendEstimateEmail).toHaveBeenCalledTimes(1);
    expect(customerDeliveryRepository.createDocumentSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ sourceVersion: 1 })
    );
    expect(result.outboundMessage.status).toBe('sent');
  });

  it('refuses to send a declined estimate', async () => {
    const { service, estimatesRepository, emailProviderService } = createDeliveryService();
    estimatesRepository.getEstimateById.mockResolvedValue(estimateRecord({ status: 'declined' }));

    await expect(
      service.sendEstimate('token', 'estimate-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(emailProviderService.sendEstimateEmail).not.toHaveBeenCalled();
  });

  it('refuses to send a superseded estimate', async () => {
    const { service, estimatesRepository, emailProviderService } = createDeliveryService();
    estimatesRepository.getEstimateById.mockResolvedValue(
      estimateRecord({ status: 'pending', supersededByEstimateId: 'estimate-2' })
    );

    await expect(
      service.sendEstimate('token', 'estimate-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(emailProviderService.sendEstimateEmail).not.toHaveBeenCalled();
  });

  it('marks provider failures as failed delivery records with a timeline entry', async () => {
    const { service, emailProviderService, customerDeliveryRepository } = createDeliveryService();
    emailProviderService.sendEstimateEmail.mockResolvedValue({
      kind: 'error',
      message: 'Provider rejected request.'
    });

    const result = await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(customerDeliveryRepository.markOutboundMessageFailed).toHaveBeenCalledWith(
      expect.any(String),
      'Provider rejected request.',
      expect.any(String)
    );
    expect(customerDeliveryRepository.addEstimateDeliveryTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'estimateDeliveryFailed' })
    );
    expect(result.outboundMessage.status).toBe('failed');
    expect(result.outboundMessage.failureCode).toBe('deliveryUnavailable');
    expect(result.outboundMessage.deliveryMessage).toBe(
      'Email was not delivered. Try again or contact BellField support.'
    );
    expect(result.outboundMessage).not.toHaveProperty('providerError');
  });

  it('blocks accidental duplicate estimate sends inside the short retry window', async () => {
    const {
      service,
      customerDeliveryRepository,
      emailProviderService,
      estimatePdfRendererService
    } = createDeliveryService();
    customerDeliveryRepository.createEstimateSendIntent.mockResolvedValue(null);

    await expect(
      service.sendEstimate('token', 'estimate-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(estimatePdfRendererService.renderEstimatePdf).not.toHaveBeenCalled();
    expect(emailProviderService.sendEstimateEmail).not.toHaveBeenCalled();
  });

  it('creates the send intent before rendering so concurrent sends are covered', async () => {
    const { service, customerDeliveryRepository, estimatePdfRendererService } =
      createDeliveryService();
    const callOrder: string[] = [];
    customerDeliveryRepository.createEstimateSendIntent.mockImplementation(async (input) => {
      callOrder.push('intent');
      return { ...input };
    });
    estimatePdfRendererService.renderEstimatePdf.mockImplementation(async () => {
      callOrder.push('render');
      return Buffer.from('%PDF test');
    });

    await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(callOrder).toEqual(['intent', 'render']);
    expect(customerDeliveryRepository.setOutboundMessageDocumentSnapshot).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
  });

  it('strips header-breaking control characters from the email subject', async () => {
    const { service, emailProviderService } = createDeliveryService();

    await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'customer@example.com',
      subject: 'Estimate ready\r\nBcc: attacker@example.com'
    });

    expect(emailProviderService.sendEstimateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Estimate ready Bcc: attacker@example.com' })
    );
  });

  it('answers sent-but-unrecorded when the provider accepts but the record write fails', async () => {
    const { service, customerDeliveryRepository } = createDeliveryService();
    customerDeliveryRepository.markOutboundMessageSent.mockRejectedValue(
      new Error('database unavailable')
    );

    const result = await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(result.outboundMessage.status).toBe('sent');
    expect(result.recordingIncomplete).toBe(true);
  });

  it('answers sent-but-unrecorded when only the timeline write fails after a send', async () => {
    const { service, customerDeliveryRepository } = createDeliveryService();
    customerDeliveryRepository.addEstimateDeliveryTimeline.mockRejectedValue(
      new Error('database unavailable')
    );

    const result = await service.sendEstimate('token', 'estimate-1', {
      recipientEmail: 'customer@example.com'
    });

    expect(result.outboundMessage.status).toBe('sent');
    expect(result.recordingIncomplete).toBe(true);
  });

  it('still fails loudly when recording breaks after a provider failure', async () => {
    const { service, customerDeliveryRepository, emailProviderService } = createDeliveryService();
    emailProviderService.sendEstimateEmail.mockResolvedValue({
      kind: 'error',
      message: 'Provider rejected request.'
    });
    customerDeliveryRepository.addEstimateDeliveryTimeline.mockRejectedValue(
      new Error('database unavailable')
    );

    await expect(
      service.sendEstimate('token', 'estimate-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toThrow('database unavailable');
  });

  it('marks the intent failed when PDF rendering fails, so retries are not blocked', async () => {
    const {
      service,
      customerDeliveryRepository,
      estimatePdfRendererService,
      emailProviderService
    } = createDeliveryService();
    estimatePdfRendererService.renderEstimatePdf.mockRejectedValue(new Error('render exploded'));

    await expect(
      service.sendEstimate('token', 'estimate-1', { recipientEmail: 'customer@example.com' })
    ).rejects.toThrow('render exploded');
    expect(customerDeliveryRepository.markOutboundMessageFailed).toHaveBeenCalledWith(
      expect.any(String),
      'Estimate PDF could not be generated.',
      expect.any(String)
    );
    expect(emailProviderService.sendEstimateEmail).not.toHaveBeenCalled();
  });
});
