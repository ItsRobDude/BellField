import { ForbiddenException } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Bea Bookkeeper',
      effectivePermissions: ['invoices:view'],
      sessionSurface: 'office-web'
    })
  };
  const bookkeepingRepository = {
    listReadyToPost: jest.fn().mockResolvedValue([]),
    listOpenBalances: jest.fn().mockResolvedValue([]),
    listRecentlyPosted: jest.fn().mockResolvedValue([])
  };

  return {
    service: new BookkeepingService(identityAccessService as never, bookkeepingRepository as never),
    identityAccessService,
    bookkeepingRepository
  };
}

describe('BookkeepingService.getInvoiceQueues', () => {
  it('returns the three worklists, gated office-only on invoices:view', async () => {
    const { service, identityAccessService, bookkeepingRepository } = createService();
    bookkeepingRepository.listReadyToPost.mockResolvedValue([
      {
        invoiceId: 'inv-1',
        jobId: 'job-1',
        jobNumber: '1001',
        invoiceKind: 'main',
        customerName: 'Acme',
        total: 100,
        updatedAt: '2026-06-02T00:00:00.000Z'
      }
    ]);
    bookkeepingRepository.listOpenBalances.mockResolvedValue([
      {
        jobId: 'job-2',
        jobNumber: '1002',
        customerName: 'Beta',
        netBilled: 200,
        paidTotal: 50,
        amountDue: 150
      }
    ]);

    const result = await service.getInvoiceQueues('token');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:view',
      ['office-web']
    );
    expect(result.readyToPost).toHaveLength(1);
    expect(result.openBalance[0].amountDue).toBe(150);
    expect(result.recentlyPosted).toEqual([]);
    // Each worklist is requested with a bounded limit.
    expect(bookkeepingRepository.listReadyToPost).toHaveBeenCalledWith(expect.any(Number));
    expect(bookkeepingRepository.listOpenBalances).toHaveBeenCalledWith(expect.any(Number));
    expect(bookkeepingRepository.listRecentlyPosted).toHaveBeenCalledWith(expect.any(Number));
  });

  it('propagates a forbidden session and queries nothing', async () => {
    const { service, identityAccessService, bookkeepingRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(service.getInvoiceQueues('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(bookkeepingRepository.listReadyToPost).not.toHaveBeenCalled();
  });
});
