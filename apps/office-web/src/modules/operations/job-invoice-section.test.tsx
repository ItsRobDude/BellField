import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceSummary } from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import * as downloadFile from '@/lib/download-file';
import { JobInvoiceSection } from './job-invoice-section';

vi.mock('@/lib/operations-api', () => ({
  getOfficeInvoiceForJob: vi.fn(),
  downloadOfficeInvoiceDocument: vi.fn(),
  addOfficeInvoiceLine: vi.fn(),
  editOfficeInvoiceLine: vi.fn(),
  voidOfficeInvoiceLine: vi.fn(),
  postOfficeInvoice: vi.fn(),
  // Used by the corrections section, which mounts once the main invoice is posted.
  getOfficeJobInvoiceBalance: vi.fn(),
  listOfficeJobAdjustments: vi.fn(),
  createOfficeJobAdjustment: vi.fn(),
  addOfficeInvoiceLineById: vi.fn(),
  postOfficeInvoiceById: vi.fn(),
  listOfficeJobPayments: vi.fn(),
  recordOfficePayment: vi.fn(),
  voidOfficePayment: vi.fn()
}));
vi.mock('@/lib/download-file', () => ({ downloadBlob: vi.fn() }));

const mockedApi = vi.mocked(operationsApi);
const mockedDownload = vi.mocked(downloadFile);

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults so the corrections section can load when a posted invoice mounts it.
  mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue({
    jobId: 'job-1',
    mainInvoiceStatus: 'posted',
    postedMainTotal: 0,
    postedAdjustmentsTotal: 0,
    postedCreditsTotal: 0,
    netBilled: 0,
    paidTotal: 0,
    amountDue: 0
  });
  mockedApi.listOfficeJobAdjustments.mockResolvedValue({ adjustments: [] });
  mockedApi.listOfficeJobPayments.mockResolvedValue({ payments: [] });
  mockedApi.downloadOfficeInvoiceDocument.mockResolvedValue(new Blob(['html']));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function draftInvoice(overrides: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: 'inv-1',
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

function postedInvoice(): InvoiceSummary {
  return draftInvoice({
    status: 'posted',
    version: 2,
    posted: {
      postedAt: '2026-06-01T12:00:00.000Z',
      postedByName: 'Olivia Owner',
      billTo: {
        customerId: 'customer-1',
        name: 'Acme Co',
        accountType: 'company',
        addressLine1: '1 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62704'
      },
      serviceLocation: {
        locationId: 'location-1',
        name: 'Acme HQ',
        addressLine1: '2 Plant Rd',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62704'
      },
      jobNumber: '1001',
      workOrderNumber: 'WO-9'
    }
  });
}

function renderSection(canPost: boolean) {
  return render(
    <JobInvoiceSection
      jobId="job-1"
      apiBaseUrl="http://localhost"
      sessionToken="test-token"
      canEdit
      canPost={canPost}
      canCreateAdjustments
      paymentPermissions={{ canView: true, canRecord: true, canVoid: true }}
    />
  );
}

describe('JobInvoiceSection posting', () => {
  it('posts a confirmed draft and then shows the frozen posted record', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: draftInvoice() });
    mockedApi.postOfficeInvoice.mockResolvedValueOnce({ invoice: postedInvoice() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Post invoice' }));

    await waitFor(() =>
      expect(mockedApi.postOfficeInvoice).toHaveBeenCalledWith({
        jobId: 'job-1',
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token'
      })
    );
    expect(await screen.findByText('Invoice posted.')).toBeInTheDocument();
    expect(screen.getByText('Posted record')).toBeInTheDocument();
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
    // Once posted the Post button is gone (status is no longer draft).
    expect(screen.queryByRole('button', { name: 'Post invoice' })).not.toBeInTheDocument();
  });

  it('does not post when the confirm is dismissed', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: draftInvoice() });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Post invoice' }));

    expect(mockedApi.postOfficeInvoice).not.toHaveBeenCalled();
  });

  it('renders the frozen context and hides edit controls when already posted', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });

    renderSection(true);

    expect(await screen.findByText('Posted record')).toBeInTheDocument();
    expect(screen.getByText('Posted by Olivia Owner on 2026-06-01.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post invoice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add line' })).not.toBeInTheDocument();
  });

  it('downloads the server-rendered invoice document', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Download invoice' }));

    await waitFor(() =>
      expect(mockedApi.downloadOfficeInvoiceDocument).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token'
      })
    );
    expect(mockedDownload.downloadBlob).toHaveBeenCalledWith(
      'invoice-1001-inv-1.html',
      expect.any(Blob)
    );
  });

  it('hides the Post button when the user lacks invoices:post', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: draftInvoice() });

    renderSection(false);

    // Add line proves the draft loaded and canEdit still works.
    expect(await screen.findByRole('button', { name: 'Add line' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post invoice' })).not.toBeInTheDocument();
  });
});
