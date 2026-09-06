import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import type { BookkeepingBalanceItem, BookkeepingQueuesResponse } from '@/lib/operations-api';
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

    expect(await screen.findByText('2026-06-08 · Check')).toBeInTheDocument();
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
});
