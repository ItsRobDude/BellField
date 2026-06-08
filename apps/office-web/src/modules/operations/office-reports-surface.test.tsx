import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ArAgingReport,
  ArOpenBalancesReport,
  InventoryValuationReport,
  JobProfitabilityReport,
  SalesTaxSummaryReport,
  ServiceAgreementReports
} from '@bellfield/contracts';
import * as reportingApi from '@/lib/reporting-api';
import * as downloadFile from '@/lib/download-file';
import { OfficeReportsSurface } from './office-reports-surface';

vi.mock('@/lib/reporting-api', () => ({
  getArAging: vi.fn(),
  getArOpenBalances: vi.fn(),
  getServiceAgreementReports: vi.fn(),
  getSalesTaxSummary: vi.fn(),
  downloadArAgingCsv: vi.fn(),
  downloadArOpenBalancesCsv: vi.fn(),
  downloadActiveServiceAgreementsCsv: vi.fn(),
  downloadExpiringServiceAgreementsCsv: vi.fn(),
  downloadPaymentLedgerCsv: vi.fn(),
  downloadPostedInvoicesCsv: vi.fn(),
  downloadServiceAgreementBillingDueCsv: vi.fn(),
  downloadServiceAgreementVisitPromptsCsv: vi.fn(),
  downloadSalesTaxSummaryCsv: vi.fn(),
  getJobProfitability: vi.fn(),
  downloadJobProfitabilityCsv: vi.fn(),
  getInventoryValuation: vi.fn(),
  downloadInventoryValuationCsv: vi.fn()
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

const inventoryReport: InventoryValuationReport = {
  generatedAt: '2026-06-06T00:00:00.000Z',
  totals: { rowCount: 2, totalQuantity: 15, totalValue: 250 },
  rows: [
    {
      itemId: 'i1',
      itemName: 'Capacitor',
      itemKind: 'part',
      locationId: 'l1',
      locationName: 'Warehouse',
      quantity: 10,
      averageUnitCost: 20,
      totalValue: 200
    },
    {
      itemId: 'i2',
      itemName: 'Filter',
      itemKind: 'part',
      locationId: 'l1',
      locationName: 'Warehouse',
      quantity: 5,
      averageUnitCost: 10,
      totalValue: 50
    }
  ]
};

const agingReport: ArAgingReport = {
  generatedAt: '2026-06-06T00:00:00.000Z',
  totals: {
    jobCount: 1,
    current: 0,
    days31To60: 70,
    days61To90: 0,
    over90: 0,
    amountDue: 70
  },
  rows: [
    {
      jobId: 'a',
      jobNumber: '1003',
      customerName: 'Acme',
      oldestPostedAt: '2026-05-01T00:00:00.000Z',
      daysOld: 38,
      amountDue: 70,
      bucket: 'days31To60'
    }
  ]
};

const salesTaxReport: SalesTaxSummaryReport = {
  generatedAt: '2026-06-06T00:00:00.000Z',
  totals: { invoiceCount: 2, taxableBase: 100, tax: 8.25, total: 108.25 },
  rows: [
    {
      taxRateBasisPoints: 825,
      invoiceCount: 2,
      taxableBase: 100,
      tax: 8.25,
      total: 108.25
    }
  ]
};

const serviceAgreementReport: ServiceAgreementReports = {
  generatedAt: '2026-06-06T00:00:00.000Z',
  windows: {
    expiringSoonThrough: '2026-08-05',
    nextBillingDueThrough: '2026-08-05',
    visitTemplatePromptThrough: '2026-08-05'
  },
  totals: {
    activeAgreementCount: 1,
    expiringSoonCount: 1,
    nextBillingDueCount: 1,
    visitTemplatePromptCount: 1
  },
  activeAgreements: [
    {
      agreementId: 'agreement-1',
      agreementNumber: 'SA-1001',
      customerId: 'customer-1',
      customerName: 'Acme',
      name: 'Annual maintenance plan',
      status: 'active',
      startDate: '2026-01-01',
      renewalDate: '2026-07-01',
      billingCadence: 'annual',
      nextBillingDate: '2026-07-01',
      billingAmount: 240,
      coveredLocationNames: ['Main Shop'],
      coveredEquipmentCount: 2,
      activeVisitTemplateCount: 1,
      updatedAt: '2026-06-01T10:00:00.000Z'
    }
  ],
  expiringSoon: [
    {
      agreementId: 'agreement-1',
      agreementNumber: 'SA-1001',
      customerId: 'customer-1',
      customerName: 'Acme',
      name: 'Annual maintenance plan',
      status: 'active',
      startDate: '2026-01-01',
      renewalDate: '2026-07-01',
      billingCadence: 'annual',
      nextBillingDate: '2026-07-01',
      billingAmount: 240,
      coveredLocationNames: ['Main Shop'],
      coveredEquipmentCount: 2,
      activeVisitTemplateCount: 1,
      updatedAt: '2026-06-01T10:00:00.000Z'
    }
  ],
  nextBillingDue: [
    {
      agreementId: 'agreement-1',
      agreementNumber: 'SA-1001',
      customerId: 'customer-1',
      customerName: 'Acme',
      name: 'Annual maintenance plan',
      status: 'active',
      startDate: '2026-01-01',
      renewalDate: '2026-07-01',
      billingCadence: 'annual',
      nextBillingDate: '2026-07-01',
      billingAmount: 240,
      coveredLocationNames: ['Main Shop'],
      coveredEquipmentCount: 2,
      activeVisitTemplateCount: 1,
      updatedAt: '2026-06-01T10:00:00.000Z',
      daysUntilBilling: 24
    }
  ],
  visitTemplatePrompts: [
    {
      agreementId: 'agreement-1',
      agreementNumber: 'SA-1001',
      customerId: 'customer-1',
      customerName: 'Acme',
      agreementName: 'Annual maintenance plan',
      templateId: 'template-1',
      title: 'Spring visit',
      frequency: 'annual',
      preferredMonth: 6,
      preferredDayOfMonth: 15,
      projectedDueDate: '2026-06-15',
      daysUntilProjectedDue: 9,
      jobType: 'Maintenance',
      category: 'Recurring',
      coveredLocationNames: ['Main Shop']
    }
  ]
};

function renderSurface(
  canExportReports: boolean,
  canViewProfitability = false,
  canViewInventoryValuation = false,
  canViewAgreements = false
) {
  render(
    <OfficeReportsSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canExportReports={canExportReports}
      canViewProfitability={canViewProfitability}
      canViewInventoryValuation={canViewInventoryValuation}
      canViewAgreements={canViewAgreements}
    />
  );
}

beforeEach(() => {
  mockedApi.getArAging.mockResolvedValue(agingReport);
  mockedApi.getArOpenBalances.mockResolvedValue(report);
  mockedApi.getSalesTaxSummary.mockResolvedValue(salesTaxReport);
  mockedApi.getJobProfitability.mockResolvedValue(profitabilityReport);
  mockedApi.getInventoryValuation.mockResolvedValue(inventoryReport);
  mockedApi.getServiceAgreementReports.mockResolvedValue(serviceAgreementReport);
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
    expect(screen.getByText('Generated 2026-06-06 00:00 UTC')).toBeInTheDocument();
  });

  it('hides the export button without reports:export', async () => {
    renderSurface(false);
    await screen.findByText('Acme');
    expect(screen.queryByRole('button', { name: 'Export AR CSV' })).toBeNull();
  });

  it('downloads the server-rendered CSV when reports:export is present', async () => {
    const blob = new Blob(['csv'], { type: 'text/csv' });
    mockedApi.downloadArOpenBalancesCsv.mockResolvedValue(blob);
    renderSurface(true);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Export AR CSV' }));
    await waitFor(() => expect(mockedApi.downloadArOpenBalancesCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedDownload.downloadBlob).toHaveBeenCalledTimes(1));
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(/^ar-open-balances-2026-06-06/);
  });

  it('downloads posted invoice and payment CSV handoff files', async () => {
    mockedApi.downloadPostedInvoicesCsv.mockResolvedValue(new Blob(['posted']));
    mockedApi.downloadPaymentLedgerCsv.mockResolvedValue(new Blob(['payments']));
    renderSurface(true);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Export invoices CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export payments CSV' }));
    await waitFor(() => expect(mockedApi.downloadPostedInvoicesCsv).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedApi.downloadPaymentLedgerCsv).toHaveBeenCalledTimes(1));
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

describe('OfficeReportsSurface (AR Aging)', () => {
  it('renders aged balances and exports CSV', async () => {
    mockedApi.downloadArAgingCsv.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
    renderSurface(true);
    fireEvent.click(await screen.findByRole('tab', { name: 'AR Aging' }));
    await waitFor(() => expect(screen.getAllByText('31-60').length).toBeGreaterThan(0));
    expect(screen.getByText('38')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mockedApi.downloadArAgingCsv).toHaveBeenCalledTimes(1));
  });
});

describe('OfficeReportsSurface (Sales Tax)', () => {
  it('renders tax summary rows and exports CSV', async () => {
    mockedApi.downloadSalesTaxSummaryCsv.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
    renderSurface(true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Sales Tax' }));
    expect(await screen.findByText('8.25%')).toBeInTheDocument();
    expect(screen.getAllByText('$108.25').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mockedApi.downloadSalesTaxSummaryCsv).toHaveBeenCalledTimes(1));
  });
});

describe('OfficeReportsSurface (Service Agreements)', () => {
  it('hides the Agreements tab without agreements:view', async () => {
    renderSurface(true, false, false, false);
    await screen.findByText('Acme');
    expect(screen.queryByRole('tab', { name: 'Agreements' })).toBeNull();
  });

  it('renders service agreement reports when agreements:view is present', async () => {
    renderSurface(true, false, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Agreements' }));

    expect(await screen.findByText('Service Agreements')).toBeInTheDocument();
    expect(screen.getAllByText('SA-1001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Annual maintenance plan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$240.00 Annual · next 2026-07-01').length).toBeGreaterThan(0);
    expect(screen.getByText('Spring visit')).toBeInTheDocument();
    expect(screen.getByText('2026-06-15')).toBeInTheDocument();
  });

  it('downloads the active service agreement CSV when reports:export is present', async () => {
    mockedApi.downloadActiveServiceAgreementsCsv.mockResolvedValue(
      new Blob(['csv'], { type: 'text/csv' })
    );
    renderSurface(true, false, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Agreements' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export active CSV' }));
    await waitFor(() =>
      expect(mockedApi.downloadActiveServiceAgreementsCsv).toHaveBeenCalledTimes(1)
    );
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(
      /^service-agreements-active-2026-06-06/
    );
  });

  it('downloads the expiring service agreement CSV when reports:export is present', async () => {
    mockedApi.downloadExpiringServiceAgreementsCsv.mockResolvedValue(
      new Blob(['csv'], { type: 'text/csv' })
    );
    renderSurface(true, false, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Agreements' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export expiring CSV' }));
    await waitFor(() =>
      expect(mockedApi.downloadExpiringServiceAgreementsCsv).toHaveBeenCalledTimes(1)
    );
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(
      /^service-agreements-expiring-2026-06-06/
    );
  });

  it('downloads the service agreement billing due CSV when reports:export is present', async () => {
    mockedApi.downloadServiceAgreementBillingDueCsv.mockResolvedValue(
      new Blob(['csv'], { type: 'text/csv' })
    );
    renderSurface(true, false, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Agreements' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export billing CSV' }));
    await waitFor(() =>
      expect(mockedApi.downloadServiceAgreementBillingDueCsv).toHaveBeenCalledTimes(1)
    );
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(
      /^service-agreements-billing-due-2026-06-06/
    );
  });

  it('downloads the service agreement visit prompt CSV when reports:export is present', async () => {
    mockedApi.downloadServiceAgreementVisitPromptsCsv.mockResolvedValue(
      new Blob(['csv'], { type: 'text/csv' })
    );
    renderSurface(true, false, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Agreements' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export visits CSV' }));
    await waitFor(() =>
      expect(mockedApi.downloadServiceAgreementVisitPromptsCsv).toHaveBeenCalledTimes(1)
    );
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(
      /^service-agreement-visit-prompts-2026-06-06/
    );
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

describe('OfficeReportsSurface (Inventory Valuation)', () => {
  it('hides the Inventory Valuation tab without inventory:view', async () => {
    renderSurface(true, true, false);
    await screen.findByText('Acme');
    expect(screen.queryByRole('tab', { name: 'Inventory Valuation' })).toBeNull();
  });

  it('renders valuation rows with weighted-average cost and totals', async () => {
    renderSurface(true, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Inventory Valuation' }));
    expect(await screen.findByText('Capacitor')).toBeInTheDocument();
    expect(screen.getByText('Filter')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument(); // total value
  });

  it('downloads the valuation CSV when reports:export is present', async () => {
    mockedApi.downloadInventoryValuationCsv.mockResolvedValue(
      new Blob(['csv'], { type: 'text/csv' })
    );
    renderSurface(true, false, true);
    fireEvent.click(await screen.findByRole('tab', { name: 'Inventory Valuation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mockedApi.downloadInventoryValuationCsv).toHaveBeenCalledTimes(1));
    expect(mockedDownload.downloadBlob.mock.calls[0][0]).toMatch(/^inventory-valuation-2026-06-06/);
  });
});
