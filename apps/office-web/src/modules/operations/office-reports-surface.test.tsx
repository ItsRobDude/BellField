import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArOpenBalancesReport } from '@bellfield/contracts';
import * as reportingApi from '@/lib/reporting-api';
import * as reportingCsv from '@/lib/reporting-csv';
import { OfficeReportsSurface } from './office-reports-surface';

vi.mock('@/lib/reporting-api', () => ({ getArOpenBalances: vi.fn() }));
vi.mock('@/lib/reporting-csv', () => ({ toCsv: vi.fn(() => 'csv-body'), downloadCsv: vi.fn() }));

const mockedApi = vi.mocked(reportingApi);
const mockedCsv = vi.mocked(reportingCsv);

const report: ArOpenBalancesReport = {
  generatedAt: '2026-06-06T00:00:00.000Z',
  totals: { jobCount: 2, netBilled: 150, paidTotal: 30, amountDue: 120 },
  rows: [
    {
      jobId: 'a',
      jobNumber: '1003',
      customerName: 'Acme',
      netBilled: 100,
      paidTotal: 30,
      amountDue: 70
    },
    {
      jobId: 'b',
      jobNumber: '1004',
      customerName: 'Beta',
      netBilled: 50,
      paidTotal: 0,
      amountDue: 50
    }
  ]
};

function renderSurface(canExportReports: boolean) {
  render(
    <OfficeReportsSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canExportReports={canExportReports}
    />
  );
}

beforeEach(() => {
  mockedApi.getArOpenBalances.mockResolvedValue(report);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeReportsSurface (AR / Open Balances)', () => {
  it('renders totals and per-job rows', async () => {
    renderSurface(true);
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument(); // total amount due
    expect(screen.getByText('1003')).toBeInTheDocument();
  });

  it('hides the export button without reports:export', async () => {
    renderSurface(false);
    await screen.findByText('Acme');
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });

  it('exports a CSV download when reports:export is present', async () => {
    renderSurface(true);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(mockedCsv.downloadCsv).toHaveBeenCalledTimes(1);
    expect(mockedCsv.downloadCsv.mock.calls[0][0]).toMatch(/^ar-open-balances-2026-06-06/);
  });

  it('shows the empty state when no jobs owe', async () => {
    mockedApi.getArOpenBalances.mockResolvedValue({
      generatedAt: report.generatedAt,
      totals: { jobCount: 0, netBilled: 0, paidTotal: 0, amountDue: 0 },
      rows: []
    });
    renderSurface(true);
    expect(await screen.findByText('No jobs with an open balance.')).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    mockedApi.getArOpenBalances.mockRejectedValue(new Error('Forbidden'));
    renderSurface(true);
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });
});
