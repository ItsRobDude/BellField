import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import type { InvoiceRecord } from './invoices.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Dispatcher',
      effectivePermissions: ['invoices:view'],
      sessionSurface: 'office-web'
    })
  };
  const jobsDataService = {
    getJobById: jest.fn().mockResolvedValue({ id: 'job-1', status: 'new' })
  };
  const referenceDataService = {
    getCustomerById: jest.fn(),
    getLocationById: jest.fn()
  };
  const invoicesRepository = {
    getMainInvoiceForJob: jest.fn(),
    getActiveLineContext: jest.fn(),
    addManualLine: jest.fn(),
    editLine: jest.fn(),
    voidLine: jest.fn(),
    postInvoice: jest.fn()
  };

  return {
    service: new InvoicesService(
      identityAccessService as never,
      jobsDataService as never,
      referenceDataService as never,
      invoicesRepository as never
    ),
    identityAccessService,
    jobsDataService,
    referenceDataService,
    invoicesRepository
  };
}

function draftInvoice(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: 'invoice-main-job-1',
    jobId: 'job-1',
    invoiceKind: 'main',
    status: 'draft',
    taxRateBasisPoints: 0,
    lineItems: [],
    totals: {
      subtotal: 0,
      discount: 0,
      taxableBase: 0,
      tax: 0,
      total: 0,
      totalCost: 0,
      profit: 0,
      marginBasisPoints: null,
      costComplete: true
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    version: 1,
    ...overrides
  };
}

describe('InvoicesService', () => {
  it('returns the job main invoice draft, gated office-only on invoices:view', async () => {
    const { service, identityAccessService, invoicesRepository } = createService();
    invoicesRepository.getMainInvoiceForJob.mockResolvedValue(draftInvoice());

    const result = await service.getInvoiceForJob('token', 'job-1');

    expect(result.invoice.invoiceKind).toBe('main');
    expect(result.invoice.status).toBe('draft');
    expect(result.invoice.totals.total).toBe(0);
    // Office-only: the field app has no invoice surface this milestone.
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:view',
      ['office-web']
    );
  });

  it('propagates a forbidden session (e.g. field-mobile) from the auth layer', async () => {
    const { service, identityAccessService } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(service.getInvoiceForJob('token', 'job-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('throws NotFound for a missing job', async () => {
    const { service, jobsDataService, invoicesRepository } = createService();
    jobsDataService.getJobById.mockRejectedValue(new NotFoundException('Job not found.'));

    await expect(service.getInvoiceForJob('token', 'missing-job')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(invoicesRepository.getMainInvoiceForJob).not.toHaveBeenCalled();
  });

  it('throws NotFound when a job somehow has no main draft (integrity gap)', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.getMainInvoiceForJob.mockResolvedValue(null);

    await expect(service.getInvoiceForJob('token', 'job-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('surfaces line items and snapshot totals in the read shape', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.getMainInvoiceForJob.mockResolvedValue(
      draftInvoice({
        taxRateBasisPoints: 825,
        lineItems: [
          {
            id: 'line-1',
            invoiceId: 'invoice-main-job-1',
            position: 0,
            kind: 'part',
            description: 'Capacitor',
            quantity: 1,
            unitPrice: 120,
            taxable: true,
            lineSubtotal: 120,
            sourceKind: 'register',
            sourceSyncState: 'linked',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z'
          }
        ],
        totals: {
          subtotal: 120,
          discount: 0,
          taxableBase: 120,
          tax: 9.9,
          total: 129.9,
          totalCost: 0,
          profit: 120,
          marginBasisPoints: 10000,
          costComplete: false
        }
      })
    );

    const result = await service.getInvoiceForJob('token', 'job-1');

    expect(result.invoice.lineItems).toHaveLength(1);
    expect(result.invoice.lineItems[0].sourceKind).toBe('register');
    expect(result.invoice.totals.total).toBe(129.9);
  });
});

describe('InvoicesService line editing', () => {
  function editingService() {
    const ctx = createService();
    ctx.identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Office',
      effectivePermissions: ['invoices:view', 'invoices:edit'],
      sessionSurface: 'office-web'
    });
    ctx.invoicesRepository.getMainInvoiceForJob.mockResolvedValue(draftInvoice());
    return ctx;
  }

  const validLine = {
    kind: 'other' as const,
    description: 'Trip fee',
    quantity: 1,
    unitPrice: 40,
    taxable: true
  };

  it('adds a manual line, gated office-only on invoices:edit', async () => {
    const { service, identityAccessService, invoicesRepository } = editingService();

    await service.addLine('token', 'job-1', validLine);

    expect(invoicesRepository.addManualLine).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ description: 'Trip fee', unitPrice: 40 })
    );
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:edit',
      ['office-web']
    );
  });

  it('rejects a line with non-positive quantity', async () => {
    const { service } = editingService();
    await expect(
      service.addLine('token', 'job-1', { ...validLine, quantity: 0 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to add a line to a non-draft invoice', async () => {
    const { service, invoicesRepository } = editingService();
    invoicesRepository.getMainInvoiceForJob.mockResolvedValue(draftInvoice({ status: 'posted' }));

    await expect(service.addLine('token', 'job-1', validLine)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(invoicesRepository.addManualLine).not.toHaveBeenCalled();
  });

  it('edits an existing line on a draft invoice', async () => {
    const { service, invoicesRepository } = editingService();
    invoicesRepository.getActiveLineContext.mockResolvedValue({
      lineId: 'line-1',
      invoiceId: 'invoice-main-job-1',
      jobId: 'job-1',
      invoiceStatus: 'draft',
      sourceSyncState: 'linked'
    });

    await service.editLine('token', 'line-1', { ...validLine, unitPrice: 150 });

    expect(invoicesRepository.editLine).toHaveBeenCalledWith(
      'line-1',
      'invoice-main-job-1',
      expect.objectContaining({ unitPrice: 150 })
    );
  });

  it('throws NotFound editing a missing line', async () => {
    const { service, invoicesRepository } = editingService();
    invoicesRepository.getActiveLineContext.mockResolvedValue(null);

    await expect(service.editLine('token', 'missing', validLine)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('voids a line on a draft invoice', async () => {
    const { service, invoicesRepository } = editingService();
    invoicesRepository.getActiveLineContext.mockResolvedValue({
      lineId: 'line-1',
      invoiceId: 'invoice-main-job-1',
      jobId: 'job-1',
      invoiceStatus: 'draft',
      sourceSyncState: 'register'
    });

    await service.voidLine('token', 'line-1', { reason: 'mistake' });

    expect(invoicesRepository.voidLine).toHaveBeenCalledWith(
      'line-1',
      'invoice-main-job-1',
      'mistake'
    );
  });

  it('refuses to edit a line on a non-draft invoice', async () => {
    const { service, invoicesRepository } = editingService();
    invoicesRepository.getActiveLineContext.mockResolvedValue({
      lineId: 'line-1',
      invoiceId: 'invoice-main-job-1',
      jobId: 'job-1',
      invoiceStatus: 'posted',
      sourceSyncState: 'linked'
    });

    await expect(service.editLine('token', 'line-1', validLine)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(invoicesRepository.editLine).not.toHaveBeenCalled();
  });
});

describe('InvoicesService posting', () => {
  function postingService() {
    const ctx = createService();
    ctx.identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'owner-1',
      displayName: 'Olivia Owner',
      effectivePermissions: ['invoices:view', 'invoices:post'],
      sessionSurface: 'office-web'
    });
    ctx.jobsDataService.getJobById.mockResolvedValue({
      id: 'job-1',
      jobNumber: '1001',
      locationId: 'location-1',
      billToCustomerId: 'customer-1',
      workOrderNumber: 'WO-9',
      status: 'completed'
    });
    ctx.referenceDataService.getCustomerById.mockResolvedValue({
      id: 'customer-1',
      name: 'Acme Co',
      accountType: 'company',
      billingAddressLine1: '1 Main St',
      billingCity: 'Springfield',
      billingState: 'IL',
      billingPostalCode: '62704'
    });
    ctx.referenceDataService.getLocationById.mockResolvedValue({
      id: 'location-1',
      name: 'Acme HQ',
      addressLine1: '2 Plant Rd',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704'
    });
    return ctx;
  }

  it('posts a draft, gated office-only on invoices:post, freezing the resolved snapshot', async () => {
    const ctx = postingService();
    ctx.invoicesRepository.getMainInvoiceForJob
      .mockResolvedValueOnce(draftInvoice()) // pre-check load
      .mockResolvedValueOnce(draftInvoice({ status: 'posted' })); // reload after posting

    const result = await ctx.service.postInvoice('token', 'job-1');

    expect(ctx.identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:post',
      ['office-web']
    );
    expect(ctx.invoicesRepository.postInvoice).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        billToCustomerId: 'customer-1',
        billToCustomerName: 'Acme Co',
        billToAccountType: 'company',
        billToAddressLine1: '1 Main St',
        serviceLocationId: 'location-1',
        serviceLocationName: 'Acme HQ',
        jobNumber: '1001',
        workOrderNumber: 'WO-9'
      }),
      expect.objectContaining({ id: 'owner-1', displayName: 'Olivia Owner' })
    );
    expect(result.invoice.status).toBe('posted');
  });

  it('posts a zero-dollar draft (there is no minimum-total gate)', async () => {
    const ctx = postingService();
    ctx.invoicesRepository.getMainInvoiceForJob
      .mockResolvedValueOnce(draftInvoice()) // total 0
      .mockResolvedValueOnce(draftInvoice({ status: 'posted' }));

    await expect(ctx.service.postInvoice('token', 'job-1')).resolves.toBeDefined();
    expect(ctx.invoicesRepository.postInvoice).toHaveBeenCalled();
  });

  it('refuses to post a non-draft invoice without resolving a snapshot', async () => {
    const ctx = postingService();
    ctx.invoicesRepository.getMainInvoiceForJob.mockResolvedValue(
      draftInvoice({ status: 'posted' })
    );

    await expect(ctx.service.postInvoice('token', 'job-1')).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(ctx.referenceDataService.getCustomerById).not.toHaveBeenCalled();
    expect(ctx.invoicesRepository.postInvoice).not.toHaveBeenCalled();
  });

  it('propagates a forbidden session and never posts', async () => {
    const ctx = postingService();
    ctx.identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(ctx.service.postInvoice('token', 'job-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(ctx.invoicesRepository.postInvoice).not.toHaveBeenCalled();
  });
});
