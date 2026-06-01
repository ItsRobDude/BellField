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
    getInvoiceById: jest.fn(),
    getActiveLineContext: jest.fn(),
    addManualLine: jest.fn(),
    addLineToInvoice: jest.fn(),
    editLine: jest.fn(),
    voidLine: jest.fn(),
    postInvoice: jest.fn(),
    createAdjustment: jest.fn(),
    listInvoiceTotalsForJob: jest.fn()
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
    // edit/void now reload the line's own invoice by id (which may be an adjustment).
    ctx.invoicesRepository.getInvoiceById.mockResolvedValue(draftInvoice());
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
    // Posts by the resolved main invoice id (draftInvoice's id), not the job id.
    expect(ctx.invoicesRepository.postInvoice).toHaveBeenCalledWith(
      'invoice-main-job-1',
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

describe('InvoicesService adjustments', () => {
  function adjustingService() {
    const ctx = createService();
    ctx.identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'book-1',
      displayName: 'Bea Books',
      effectivePermissions: ['invoices:view', 'invoices:create', 'invoices:edit', 'invoices:post'],
      sessionSurface: 'office-web'
    });
    return ctx;
  }

  it('creates a credit against a posted main, gated office-only on invoices:create', async () => {
    const ctx = adjustingService();
    ctx.invoicesRepository.getMainInvoiceForJob.mockResolvedValue(
      draftInvoice({ status: 'posted' })
    );
    ctx.invoicesRepository.createAdjustment.mockResolvedValue(
      draftInvoice({ id: 'adj-1', invoiceKind: 'credit', adjustsInvoiceId: 'invoice-main-job-1' })
    );

    const result = await ctx.service.createAdjustment('token', 'job-1', { kind: 'credit' });

    expect(ctx.identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:create',
      ['office-web']
    );
    // The new record links to the resolved main invoice id.
    expect(ctx.invoicesRepository.createAdjustment).toHaveBeenCalledWith(
      'job-1',
      'credit',
      'invoice-main-job-1',
      expect.objectContaining({ id: 'book-1' })
    );
    expect(result.invoice.invoiceKind).toBe('credit');
  });

  it('refuses to create an adjustment while the main invoice is still a draft', async () => {
    const ctx = adjustingService();
    ctx.invoicesRepository.getMainInvoiceForJob.mockResolvedValue(draftInvoice());

    await expect(
      ctx.service.createAdjustment('token', 'job-1', { kind: 'adjustment' })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.invoicesRepository.createAdjustment).not.toHaveBeenCalled();
  });

  it('rejects an unknown adjustment kind', async () => {
    const ctx = adjustingService();

    await expect(
      ctx.service.createAdjustment('token', 'job-1', { kind: 'bogus' as never })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.invoicesRepository.createAdjustment).not.toHaveBeenCalled();
  });

  it("editing an adjustment line reloads the adjustment, not the job's main invoice", async () => {
    const ctx = adjustingService();
    ctx.invoicesRepository.getActiveLineContext.mockResolvedValue({
      lineId: 'line-1',
      invoiceId: 'adj-1',
      jobId: 'job-1',
      invoiceStatus: 'draft',
      sourceSyncState: 'manual'
    });
    ctx.invoicesRepository.getInvoiceById.mockResolvedValue(
      draftInvoice({ id: 'adj-1', invoiceKind: 'adjustment' })
    );

    const result = await ctx.service.editLine('token', 'line-1', {
      kind: 'other',
      description: 'Correction',
      quantity: 1,
      unitPrice: 10,
      taxable: true
    });

    expect(ctx.invoicesRepository.editLine).toHaveBeenCalledWith(
      'line-1',
      'adj-1',
      expect.anything()
    );
    expect(ctx.invoicesRepository.getInvoiceById).toHaveBeenCalledWith('adj-1');
    expect(result.invoice.id).toBe('adj-1');
    expect(result.invoice.invoiceKind).toBe('adjustment');
  });
});

describe('InvoicesService job balance', () => {
  it('counts the posted main plus posted corrections, excluding drafts', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.listInvoiceTotalsForJob.mockResolvedValue([
      { id: 'main-1', invoiceKind: 'main', status: 'posted', total: 1000 },
      { id: 'adj-1', invoiceKind: 'adjustment', status: 'posted', total: 100 },
      { id: 'cred-1', invoiceKind: 'credit', status: 'posted', total: 50 },
      { id: 'cred-2', invoiceKind: 'credit', status: 'draft', total: 999 }
    ]);

    const result = await service.getJobInvoiceBalance('token', 'job-1');

    expect(result).toEqual({
      jobId: 'job-1',
      mainInvoiceStatus: 'posted',
      postedMainTotal: 1000,
      postedAdjustmentsTotal: 100,
      postedCreditsTotal: 50,
      netBilled: 1050
    });
  });

  it('treats a draft main as not yet billed (netBilled 0)', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.listInvoiceTotalsForJob.mockResolvedValue([
      { id: 'main-1', invoiceKind: 'main', status: 'draft', total: 500 }
    ]);

    const result = await service.getJobInvoiceBalance('token', 'job-1');

    expect(result.mainInvoiceStatus).toBe('draft');
    expect(result.postedMainTotal).toBe(0);
    expect(result.netBilled).toBe(0);
  });

  it('returns a negative netBilled for a net credit balance', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.listInvoiceTotalsForJob.mockResolvedValue([
      { id: 'main-1', invoiceKind: 'main', status: 'posted', total: 100 },
      { id: 'cred-1', invoiceKind: 'credit', status: 'posted', total: 150 }
    ]);

    const result = await service.getJobInvoiceBalance('token', 'job-1');
    expect(result.netBilled).toBe(-50);
  });

  it('sums in whole cents without float drift', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.listInvoiceTotalsForJob.mockResolvedValue([
      { id: 'main-1', invoiceKind: 'main', status: 'posted', total: 100.1 },
      { id: 'adj-1', invoiceKind: 'adjustment', status: 'posted', total: 0.05 },
      { id: 'cred-1', invoiceKind: 'credit', status: 'posted', total: 0.04 }
    ]);

    const result = await service.getJobInvoiceBalance('token', 'job-1');
    expect(result.netBilled).toBe(100.11);
  });

  it('is gated on invoices:view (forbidden propagates, no balance query)', async () => {
    const { service, identityAccessService, invoicesRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(service.getJobInvoiceBalance('token', 'job-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(invoicesRepository.listInvoiceTotalsForJob).not.toHaveBeenCalled();
  });

  it('throws NotFound for a missing job before querying invoices', async () => {
    const { service, jobsDataService, invoicesRepository } = createService();
    jobsDataService.getJobById.mockRejectedValue(new NotFoundException('Job not found.'));

    await expect(service.getJobInvoiceBalance('token', 'missing-job')).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(invoicesRepository.listInvoiceTotalsForJob).not.toHaveBeenCalled();
  });

  it('throws NotFound when the job has no main invoice (integrity gap)', async () => {
    const { service, invoicesRepository } = createService();
    invoicesRepository.listInvoiceTotalsForJob.mockResolvedValue([
      { id: 'adj-1', invoiceKind: 'adjustment', status: 'posted', total: 10 }
    ]);

    await expect(service.getJobInvoiceBalance('token', 'job-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
