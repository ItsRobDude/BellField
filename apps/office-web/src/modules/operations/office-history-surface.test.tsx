import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '@bellfield/contracts';
import * as historyApi from '@/lib/history-api';
import * as identityApi from '@/lib/identity-api';
import { OfficeHistorySurface } from './office-history-surface';

vi.mock('@/lib/history-api', () => ({ getHistory: vi.fn() }));
vi.mock('@/lib/identity-api', () => ({ getOfficeEmployees: vi.fn() }));

const mockedHistory = vi.mocked(historyApi);
const mockedIdentity = vi.mocked(identityApi);

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  recordType: 'payment',
  sourceId: 'p1',
  occurredAt: '2026-06-05T00:00:00.000Z',
  actorEmployeeId: 'owner-1',
  actorName: 'Olivia Owner',
  summary: 'Payment recorded (card)',
  jobId: 'job-1',
  ...over
});

function renderSurface(onOpenJob?: (jobId: string) => void) {
  render(
    <OfficeHistorySurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      onOpenJob={onOpenJob}
    />
  );
}

beforeEach(() => {
  mockedIdentity.getOfficeEmployees.mockResolvedValue({
    employees: [
      {
        id: 'tech-1',
        email: 't@x',
        displayName: 'Tina Tech',
        roleId: 'technician',
        roleName: 'Technician',
        isActive: true,
        effectivePermissions: [],
        permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
      }
    ]
  });
  mockedHistory.getHistory.mockResolvedValue({
    entries: [
      entry(),
      entry({
        recordType: 'registerEntry',
        sourceId: 'r1',
        actorName: 'Tina Tech',
        summary: 'Register entry: Capacitor',
        jobId: 'job-2'
      })
    ],
    nextCursor: null
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeHistorySurface', () => {
  it('renders unified entries from across sources', async () => {
    renderSurface();
    // Summaries and the row actor are unique (the badge/option labels collide, so assert these).
    expect(await screen.findByText('Payment recorded (card)')).toBeInTheDocument();
    expect(screen.getByText('Register entry: Capacitor')).toBeInTheDocument();
    expect(screen.getByText('Olivia Owner')).toBeInTheDocument();
    // The payment badge renders in addition to its filter option.
    expect(screen.getAllByText('Payment').length).toBeGreaterThanOrEqual(2);
  });

  it('refetches when a filter changes', async () => {
    renderSurface();
    await screen.findByText('Payment recorded (card)');

    fireEvent.change(screen.getByRole('combobox', { name: /record type/i }), {
      target: { value: 'payment' }
    });

    await waitFor(() => {
      const last = mockedHistory.getHistory.mock.calls.at(-1)?.[0];
      expect(last?.query?.recordType).toBe('payment');
    });
  });

  it('loads the next page via the cursor and appends', async () => {
    mockedHistory.getHistory.mockReset();
    mockedHistory.getHistory
      .mockResolvedValueOnce({ entries: [entry({ sourceId: 'p1' })], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({
        entries: [entry({ sourceId: 'p2', summary: 'Payment recorded (cash)' })],
        nextCursor: null
      });

    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Payment recorded (cash)')).toBeInTheDocument();
    // Both pages are visible (appended, not replaced).
    expect(screen.getByText('Payment recorded (card)')).toBeInTheDocument();
    expect(mockedHistory.getHistory.mock.calls.at(-1)?.[0]?.query?.cursor).toBe('cursor-1');
  });

  it('shows the empty state', async () => {
    mockedHistory.getHistory.mockResolvedValue({ entries: [], nextCursor: null });
    renderSurface();
    expect(await screen.findByText('No history entries for these filters.')).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    mockedHistory.getHistory.mockRejectedValue(new Error('Forbidden'));
    renderSurface();
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });
});
