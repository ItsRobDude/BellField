import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArOpenBalancesReport, JobProfitabilityReport } from '@bellfield/contracts';
import * as reportingApi from '@/lib/reporting-api';
import * as downloadFile from '@/lib/download-file';
import { OfficeReportsSurface } from './office-reports-surface';

vi.mock('@/lib/reporting-api', () => ({
  getArOpenBalances: vi.fn(),
  downloadArOpenBalancesCsv: vi.fn(),
  getJobProfitability: vi.fn(),
  downloadJobProfitabilityCsv: vi.fn()
}));
vi.mock('@/lib/download-file', () => ({ downloadBlob: vi.fn() }));

const mockedApi = vi.mocked(reportingApi);
const mockedDownload = vi.mocked(downloadFile);

const profitabilityReport: JobProfitabilityReport = {
  generatedAt: '2026-06-06T00:00:00.000Z',
  totals: {
    jobCount: 2,
    revenue: 300,
    knownCost: 180,
    knownProfit: 120,
    incompleteJobCount: 1,
    unresolvedLineCount: 2
  },
  rows: [
    {
      jobId: 'a',
      jobNumber: '1003',
      customerName: 'Acme',
      status: 'completed',
      revenue: 200,
      materialCost: 50,
      laborCost: 60,
      expenseCost: 10,
      totalCost: 120,
      profit: 80,
      marginBasisPoints: 4000,
      costComplete: true,
      unresolvedLineCount: 0,
      isFinalized: true
    },
    {
      jobId: 'b',
      jobNumber: '1004',
      customerName: 'Beta',
      status: 'inProgress',
      revenue: 100,
      materialCost: 30,
      laborCost: 30,
      expenseCost: 0,
      totalCost: 60,
      profit: 40,
      marginBasisPoints: null,
      costComplete: false,
      unresolvedLineCount: 2,
      isFinalized: false
    }
  ]
};

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

function renderSurface(canExportReports: boolean, canViewProfitability = false) {
  render(
    <OfficeReportsSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canExportReports={canExportReports}
      canViewProfitability={canViewProfitability}
    />
  );
}

beforeEach(() => {
  mockedApi.getArOpenBalances.mockResolvedValue(report);
  mockedApi.getJobProfitability.mockResolvedValue(profitabilityReport);
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

  it('downloads the server-rendered CSV when reports:export is present', async () => {
    const blob = new Blob(['csv'], { type: 'text/csv' });
    mockedApi.downloadArOpenBalancesCsv.mockResolvedValue(blob);
    renderSurface(true);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mockedApi.downloadArOpenBalancesCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedDownload.downloadBlob).toHaveBeenCalledTimes(1));
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(/^ar-open-balances-2026-06-06/);
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

describe('OfficeReportsSurface (Job Profitability)', () => {
  it('hides the Job Profitability tab without jobCosting:view', async () => {
    renderSurface(true, false);
    await screen.findByText('Acme');
    expect(screen.queryByRole('tab', { name: 'Job Profitability' })).toBeNull();
  });

  it('renders profitability rows with an incomplete-cost badge and partial margin', async () => {
    renderSurface(true, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Job Profitability' }));
    // Incomplete row shows the badge with its unresolved line count, and a dash for margin.
    expect(await screen.findByText('Cost incomplete (2)')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument(); // complete row's margin (4000 bps)
    expect(screen.getByText('—')).toBeInTheDocument(); // incomplete row's null margin
  });

  it('downloads the profitability CSV when reports:export is present', async () => {
    mockedApi.downloadJobProfitabilityCsv.mockResolvedValue(
      new Blob(['csv'], { type: 'text/csv' })
    );
    renderSurface(true, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Job Profitability' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mockedApi.downloadJobProfitabilityCsv).toHaveBeenCalledTimes(1));
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(/^job-profitability-2026-06-06/);
  });
});
