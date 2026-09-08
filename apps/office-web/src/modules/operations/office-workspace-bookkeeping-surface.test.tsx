import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import type {
  BookkeepingBalanceItem,
  BookkeepingInvoiceItem,
  BookkeepingQueuesResponse
} from '@/lib/operations-api';
import {
  OfficeBookkeepingSurface,
  appendBookkeepingQueuePage
} from './office-workspace-bookkeeping-surface';

vi.mock('@/lib/operations-api', () => ({
  getOfficeBookkeepingQueues: vi.fn()
}));

const mockedApi = vi.mocked(operationsApi);

function buildQueues(
  overrides: Partial<BookkeepingQueuesResponse> = {}
): BookkeepingQueuesResponse {
  return {
    limit: 50,
    readyToPost: [],
    openBalance: [],
    recentlyPosted: [],
    paymentBatches: [],
    paging: {
      readyToPost: { totalCount: 0 },
      openBalance: { totalCount: 0 },
      recentlyPosted: { totalCount: 0 },
      paymentBatches: { totalCount: 0 }
    },
    ...overrides
  };
}

function buildBalance(jobId: string, jobNumber: string, amountDue: number): BookkeepingBalanceItem {
  return {
    jobId,
    jobNumber,
    customerName: 'Acme',
    netBilled: amountDue + 100,
    paidTotal: 100,
    amountDue
  };
}

function buildInvoice(invoiceId: string, jobId: string, jobNumber: string): BookkeepingInvoiceItem {
  return {
    invoiceId,
    jobId,
    jobNumber,
    invoiceKind: 'main',
    customerName: 'Acme',
    total: 10,
    updatedAt: '2026-06-01T00:00:00.000Z'
  };
}

function deferredResponse() {
  let resolve!: (value: BookkeepingQueuesResponse) => void;
  const promise = new Promise<BookkeepingQueuesResponse>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderSurface() {
  return render(
    <OfficeBookkeepingSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      onOpenJob={vi.fn()}
    />
  );
}

describe('OfficeBookkeepingSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getOfficeBookkeepingQueues.mockResolvedValue(
      buildQueues({
        paymentBatches: [
          {
            batchDate: '2026-06-08',
            method: 'check',
            paymentCount: 2,
            totalAmount: 250,
            latestReceivedAt: '2026-06-08T18:00:00.000Z'
          }
        ],
        paging: {
          readyToPost: { totalCount: 0 },
          openBalance: { totalCount: 0 },
          recentlyPosted: { totalCount: 0 },
          paymentBatches: { totalCount: 1 }
        }
      })
    );
  });

  it('shows payment batches with their worklist count', async () => {
    renderSurface();

    expect(await screen.findByText('Jun 8, 2026 · Check')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Payment batches: 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('shows the true total and loads the next page of a worklist with its cursor', async () => {
    mockedApi.getOfficeBookkeepingQueues
      .mockResolvedValueOnce(
        buildQueues({
          openBalance: [buildBalance('job-1', '1001', 300)],
          paging: {
            readyToPost: { totalCount: 0 },
            openBalance: { totalCount: 2, nextCursor: 'cursor-1' },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      )
      .mockResolvedValueOnce(
        buildQueues({
          openBalance: [buildBalance('job-2', '1002', 40)],
          paging: {
            readyToPost: { totalCount: 0 },
            openBalance: { totalCount: 2 },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      );

    renderSurface();

    expect(await screen.findByText('Job #1001 · Acme')).toBeInTheDocument();
    expect(screen.getByLabelText('Open balances: 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more (1 remaining)' }));

    expect(await screen.findByText('Job #1002 · Acme')).toBeInTheDocument();
    expect(screen.getByText('Job #1001 · Acme')).toBeInTheDocument();
    expect(mockedApi.getOfficeBookkeepingQueues).toHaveBeenLastCalledWith({
      apiBaseUrl: 'http://api.test',
      sessionToken: 'session-token',
      cursors: { openBalance: 'cursor-1' }
    });
    await waitFor(() => expect(screen.getByLabelText('Open balances: 2')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('drops a Load more page that was requested before a Refresh finished', async () => {
    const staleNextPage = deferredResponse();
    mockedApi.getOfficeBookkeepingQueues
      .mockResolvedValueOnce(
        buildQueues({
          openBalance: [buildBalance('job-1', '1001', 300)],
          paging: {
            readyToPost: { totalCount: 0 },
            openBalance: { totalCount: 2, nextCursor: 'cursor-1' },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      )
      .mockReturnValueOnce(staleNextPage.promise)
      .mockResolvedValueOnce(
        buildQueues({
          openBalance: [buildBalance('job-1', '1001', 300), buildBalance('job-2', '1002', 40)],
          paging: {
            readyToPost: { totalCount: 0 },
            openBalance: { totalCount: 2 },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      );

    renderSurface();
    expect(await screen.findByText('Job #1001 · Acme')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more (1 remaining)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Job #1002 · Acme')).toBeInTheDocument();

    // Job 1003 was paid off between the two requests: the refreshed first page no longer
    // lists it, so the late page must not bring it back.
    await act(async () => {
      staleNextPage.resolve(
        buildQueues({
          openBalance: [buildBalance('job-3', '1003', 15)],
          paging: {
            readyToPost: { totalCount: 0 },
            openBalance: { totalCount: 3 },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      );
    });

    expect(screen.queryByText('Job #1003 · Acme')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Job #100\d · Acme/)).toHaveLength(2);
    expect(screen.getByLabelText('Open balances: 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
    expect(mockedApi.getOfficeBookkeepingQueues).toHaveBeenCalledTimes(3);
  });

  it('keeps each worklist busy on its own while another worklist loads more', async () => {
    const readyNextPage = deferredResponse();
    const balanceNextPage = deferredResponse();
    mockedApi.getOfficeBookkeepingQueues
      .mockResolvedValueOnce(
        buildQueues({
          readyToPost: [buildInvoice('inv-1', 'job-1', '1001')],
          openBalance: [buildBalance('job-2', '1002', 40)],
          paging: {
            readyToPost: { totalCount: 2, nextCursor: 'ready-1' },
            openBalance: { totalCount: 2, nextCursor: 'balance-1' },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      )
      .mockReturnValueOnce(readyNextPage.promise)
      .mockReturnValueOnce(balanceNextPage.promise);

    renderSurface();
    expect(await screen.findByText('Job #1001 · Acme')).toBeInTheDocument();

    const [readyLoadMore, balanceLoadMore] = screen.getAllByRole('button', {
      name: 'Load more (1 remaining)'
    });
    fireEvent.click(readyLoadMore);
    fireEvent.click(balanceLoadMore);

    expect(screen.getAllByRole('button', { name: 'Loading…' })).toHaveLength(2);
    fireEvent.click(readyLoadMore);
    expect(mockedApi.getOfficeBookkeepingQueues).toHaveBeenCalledTimes(3);

    await act(async () => {
      readyNextPage.resolve(
        buildQueues({
          readyToPost: [buildInvoice('inv-2', 'job-3', '1003')],
          paging: {
            readyToPost: { totalCount: 2 },
            openBalance: { totalCount: 2 },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      );
    });

    expect(screen.getByText('Job #1003 · Acme')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Loading…' })).toHaveLength(1);

    await act(async () => {
      balanceNextPage.resolve(
        buildQueues({
          openBalance: [buildBalance('job-4', '1004', 15)],
          paging: {
            readyToPost: { totalCount: 2 },
            openBalance: { totalCount: 2 },
            recentlyPosted: { totalCount: 0 },
            paymentBatches: { totalCount: 0 }
          }
        })
      );
    });

    expect(screen.getByText('Job #1004 · Acme')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Loading…' })).not.toBeInTheDocument();
  });

  it('holds Load more while a Refresh is running', async () => {
    const refresh = deferredResponse();
    const firstPage = buildQueues({
      openBalance: [buildBalance('job-1', '1001', 300)],
      paging: {
        readyToPost: { totalCount: 0 },
        openBalance: { totalCount: 2, nextCursor: 'cursor-1' },
        recentlyPosted: { totalCount: 0 },
        paymentBatches: { totalCount: 0 }
      }
    });
    mockedApi.getOfficeBookkeepingQueues
      .mockResolvedValueOnce(firstPage)
      .mockReturnValueOnce(refresh.promise);

    renderSurface();
    expect(await screen.findByText('Job #1001 · Acme')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('button', { name: 'Load more (1 remaining)' })).toBeDisabled();

    await act(async () => {
      refresh.resolve(firstPage);
    });

    expect(screen.getByRole('button', { name: 'Load more (1 remaining)' })).toBeEnabled();
  });
});

describe('appendBookkeepingQueuePage', () => {
  it('appends only the requested worklist and adopts its paging', () => {
    const current = buildQueues({
      openBalance: [buildBalance('job-1', '1001', 300)],
      readyToPost: [
        {
          invoiceId: 'inv-1',
          jobId: 'job-9',
          jobNumber: '1009',
          invoiceKind: 'main',
          customerName: 'Acme',
          total: 10,
          updatedAt: '2026-06-01T00:00:00.000Z'
        }
      ],
      paging: {
        readyToPost: { totalCount: 1 },
        openBalance: { totalCount: 3, nextCursor: 'cursor-1' },
        recentlyPosted: { totalCount: 0 },
        paymentBatches: { totalCount: 0 }
      }
    });
    const nextPage = buildQueues({
      openBalance: [buildBalance('job-2', '1002', 40)],
      paging: {
        readyToPost: { totalCount: 0 },
        openBalance: { totalCount: 3, nextCursor: 'cursor-2' },
        recentlyPosted: { totalCount: 0 },
        paymentBatches: { totalCount: 0 }
      }
    });

    const merged = appendBookkeepingQueuePage(current, nextPage, 'openBalance');

    expect(merged.openBalance.map((item) => item.jobId)).toEqual(['job-1', 'job-2']);
    expect(merged.readyToPost).toHaveLength(1);
    expect(merged.paging.openBalance).toEqual({ totalCount: 3, nextCursor: 'cursor-2' });
    expect(merged.paging.readyToPost).toEqual({ totalCount: 1 });
  });

  it('skips rows the worklist already shows when a page repeats them', () => {
    const current = buildQueues({
      openBalance: [buildBalance('job-1', '1001', 300), buildBalance('job-2', '1002', 200)],
      paymentBatches: [
        {
          batchDate: '2026-06-08',
          method: 'check',
          paymentCount: 2,
          totalAmount: 250,
          latestReceivedAt: '2026-06-08T18:00:00.000Z'
        }
      ]
    });
    const nextPage = buildQueues({
      openBalance: [buildBalance('job-2', '1002', 180), buildBalance('job-3', '1003', 40)],
      paymentBatches: [
        {
          batchDate: '2026-06-08',
          method: 'check',
          paymentCount: 3,
          totalAmount: 300,
          latestReceivedAt: '2026-06-08T19:00:00.000Z'
        },
        {
          batchDate: '2026-06-07',
          method: 'cash',
          paymentCount: 1,
          totalAmount: 20,
          latestReceivedAt: '2026-06-07T18:00:00.000Z'
        }
      ]
    });

    const balances = appendBookkeepingQueuePage(current, nextPage, 'openBalance');
    expect(balances.openBalance.map((item) => item.jobId)).toEqual(['job-1', 'job-2', 'job-3']);
    expect(balances.openBalance[1]?.amountDue).toBe(200);

    const batches = appendBookkeepingQueuePage(current, nextPage, 'paymentBatches');
    expect(batches.paymentBatches.map((item) => `${item.batchDate}-${item.method}`)).toEqual([
      '2026-06-08-check',
      '2026-06-07-cash'
    ]);
  });
});
