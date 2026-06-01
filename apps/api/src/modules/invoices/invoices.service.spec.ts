import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  const invoicesRepository = {
    getMainInvoiceForJob: jest.fn()
  };

  return {
    service: new InvoicesService(
      identityAccessService as never,
      jobsDataService as never,
      invoicesRepository as never
    ),
    identityAccessService,
    jobsDataService,
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
