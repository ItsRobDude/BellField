import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    countReadyToPost: jest.fn().mockResolvedValue(0),
    listOpenBalances: jest.fn().mockResolvedValue([]),
    countOpenBalances: jest.fn().mockResolvedValue(0),
    listRecentlyPosted: jest.fn().mockResolvedValue([]),
    countRecentlyPosted: jest.fn().mockResolvedValue(0),
    listPaymentBatches: jest.fn().mockResolvedValue([]),
    countPaymentBatches: jest.fn().mockResolvedValue(0)
  };

  return {
    service: new BookkeepingService(identityAccessService as never, bookkeepingRepository as never),
    identityAccessService,
    bookkeepingRepository
  };
}

function balanceItem(jobId: string, amountDue: number) {
  return {
    jobId,
    jobNumber: jobId.toUpperCase(),
    customerName: 'Acme',
    netBilled: amountDue + 50,
    paidTotal: 50,
    amountDue
  };
}

function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

describe('BookkeepingService.getInvoiceQueues', () => {
  it('returns the worklists with their true totals, gated office-only on invoices:view', async () => {
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
    bookkeepingRepository.countReadyToPost.mockResolvedValue(1);
    bookkeepingRepository.listOpenBalances.mockResolvedValue([balanceItem('job-2', 150)]);
    bookkeepingRepository.countOpenBalances.mockResolvedValue(1);

    const result = await service.getInvoiceQueues('token');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'invoices:view',
      ['office-web']
    );
    expect(result.limit).toBe(50);
    expect(result.readyToPost).toHaveLength(1);
    expect(result.openBalance[0].amountDue).toBe(150);
    expect(result.recentlyPosted).toEqual([]);
    expect(result.paymentBatches).toEqual([]);
    expect(result.paging).toEqual({
      readyToPost: { totalCount: 1, nextCursor: undefined },
      openBalance: { totalCount: 1, nextCursor: undefined },
      recentlyPosted: { totalCount: 0, nextCursor: undefined },
      paymentBatches: { totalCount: 0, nextCursor: undefined }
    });
    // Each worklist asks for one row past the page so it can tell whether more exist.
    expect(bookkeepingRepository.listReadyToPost).toHaveBeenCalledWith({
      limit: 51,
      cursor: undefined
    });
    expect(bookkeepingRepository.listOpenBalances).toHaveBeenCalledWith({
      limit: 51,
      cursor: undefined
    });
    expect(bookkeepingRepository.listRecentlyPosted).toHaveBeenCalledWith({
      limit: 51,
      cursor: undefined
    });
    expect(bookkeepingRepository.listPaymentBatches).not.toHaveBeenCalled();
    expect(bookkeepingRepository.countPaymentBatches).not.toHaveBeenCalled();
  });

  it('includes payment batches only when the actor can view payments', async () => {
    const { service, identityAccessService, bookkeepingRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockResolvedValue({
      id: 'office-1',
      displayName: 'Bea Bookkeeper',
      effectivePermissions: ['invoices:view', 'payments:view'],
      sessionSurface: 'office-web'
    });
    bookkeepingRepository.listPaymentBatches.mockResolvedValue([
      {
        batchDate: '2026-06-08',
        method: 'check',
        paymentCount: 2,
        totalAmount: 250,
        latestReceivedAt: '2026-06-08T18:00:00.000Z'
      }
    ]);
    bookkeepingRepository.countPaymentBatches.mockResolvedValue(9);

    const result = await service.getInvoiceQueues('token');

    expect(result.paymentBatches).toHaveLength(1);
    expect(result.paymentBatches[0].totalAmount).toBe(250);
    expect(result.paging.paymentBatches).toEqual({ totalCount: 9, nextCursor: undefined });
    expect(bookkeepingRepository.listPaymentBatches).toHaveBeenCalledWith({
      limit: 51,
      cursor: undefined
    });
  });

  it('hands back a next-page cursor when a worklist has more rows than the page', async () => {
    const { service, bookkeepingRepository } = createService();
    bookkeepingRepository.listOpenBalances.mockResolvedValue([
      balanceItem('job-3', 300),
      balanceItem('job-2', 200),
      balanceItem('job-1', 100)
    ]);
    bookkeepingRepository.countOpenBalances.mockResolvedValue(137);

    const result = await service.getInvoiceQueues('token', { limit: '2', cursors: {} });

    expect(result.limit).toBe(2);
    expect(result.openBalance.map((item) => item.jobId)).toEqual(['job-3', 'job-2']);
    expect(result.paging.openBalance.totalCount).toBe(137);
    expect(result.paging.openBalance.nextCursor).toBeDefined();
    expect(decodeCursor(result.paging.openBalance.nextCursor ?? '')).toEqual({
      queue: 'openBalance',
      amountDue: 200,
      jobId: 'job-2'
    });
    expect(bookkeepingRepository.listOpenBalances).toHaveBeenCalledWith({
      limit: 3,
      cursor: undefined
    });
  });

  it('passes a decoded cursor to its own worklist and rejects it elsewhere', async () => {
    const { service, bookkeepingRepository } = createService();
    const cursor = encodeCursor({
      queue: 'readyToPost',
      updatedAt: '2026-06-02T00:00:00.000Z',
      id: 'inv-50'
    });

    await service.getInvoiceQueues('token', { cursors: { readyToPost: cursor } });

    expect(bookkeepingRepository.listReadyToPost).toHaveBeenCalledWith({
      limit: 51,
      cursor: expect.objectContaining({ updatedAt: '2026-06-02T00:00:00.000Z', id: 'inv-50' })
    });

    await expect(
      service.getInvoiceQueues('token', { cursors: { openBalance: cursor } })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getInvoiceQueues('token', { cursors: { recentlyPosted: 'not-a-cursor' } })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getInvoiceQueues('token', {
        cursors: { paymentBatches: encodeCursor({ queue: 'paymentBatches', batchDate: 'x' }) }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects limits outside the allowed range', async () => {
    const { service, bookkeepingRepository } = createService();

    await expect(
      service.getInvoiceQueues('token', { limit: '0', cursors: {} })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getInvoiceQueues('token', { limit: '201', cursors: {} })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bookkeepingRepository.listReadyToPost).not.toHaveBeenCalled();
  });

  it('propagates a forbidden session and queries nothing', async () => {
    const { service, identityAccessService, bookkeepingRepository } = createService();
    identityAccessService.getAuthorizedEmployee.mockRejectedValue(new ForbiddenException());

    await expect(service.getInvoiceQueues('token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(bookkeepingRepository.listReadyToPost).not.toHaveBeenCalled();
    expect(bookkeepingRepository.countReadyToPost).not.toHaveBeenCalled();
  });
});
