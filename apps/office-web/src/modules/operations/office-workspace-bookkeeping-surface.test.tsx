import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import { OfficeBookkeepingSurface } from './office-workspace-bookkeeping-surface';

vi.mock('@/lib/operations-api', () => ({
  getOfficeBookkeepingQueues: vi.fn()
}));

const mockedApi = vi.mocked(operationsApi);

describe('OfficeBookkeepingSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getOfficeBookkeepingQueues.mockResolvedValue({
      readyToPost: [],
      openBalance: [],
      recentlyPosted: [],
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
  });

  it('shows the bounded-worklist cue and payment batches', async () => {
    render(
      <OfficeBookkeepingSurface
        apiBaseUrl="http://api.test"
        sessionToken="session-token"
        onOpenJob={vi.fn()}
      />
    );

    expect(await screen.findByText('Showing up to 50 records per worklist.')).toBeInTheDocument();
    expect(screen.getByText('2026-06-08 · Check')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
  });
});
