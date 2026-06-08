import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstimateSummary } from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import * as downloadFile from '@/lib/download-file';
import { JobEstimatesSection } from './job-estimates-section';

vi.mock('@/lib/operations-api', () => ({
  approveOfficeEstimate: vi.fn(),
  convertOfficeEstimateToInvoice: vi.fn(),
  createOfficeEstimate: vi.fn(),
  declineOfficeEstimate: vi.fn(),
  downloadOfficeEstimateDocument: vi.fn(),
  getOfficeCatalogItems: vi.fn(),
  getOfficeEstimatesForJob: vi.fn(),
  updateOfficeEstimate: vi.fn()
}));
vi.mock('@/lib/download-file', () => ({ downloadBlob: vi.fn() }));

const mockedApi = vi.mocked(operationsApi);
const mockedDownload = vi.mocked(downloadFile);

const estimate: EstimateSummary = {
  id: 'estimate-1',
  jobId: 'job-1',
  status: 'pending',
  title: 'Replacement options',
  taxRateBasisPoints: 0,
  lineItems: [
    {
      id: 'line-1',
      estimateId: 'estimate-1',
      position: 0,
      kind: 'serviceItem',
      description: 'Diagnostic',
      quantity: 1,
      unitPrice: 100,
      unitCost: 40,
      taxable: false,
      lineSubtotal: 100,
      lineCost: 40,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    }
  ],
  totals: {
    subtotal: 100,
    discount: 0,
    taxableBase: 0,
    tax: 0,
    total: 100,
    totalCost: 40,
    profit: 60,
    marginBasisPoints: 6000,
    costComplete: true
  },
  createdByEmployeeId: 'office-1',
  createdByName: 'Olivia Owner',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  version: 1
};

describe('JobEstimatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [estimate] });
    mockedApi.getOfficeCatalogItems.mockResolvedValue({ items: [] });
    mockedApi.downloadOfficeEstimateDocument.mockResolvedValue(new Blob(['html']));
  });

  it('downloads printable estimates with a readable title-based filename', async () => {
    render(
      <JobEstimatesSection
        jobId="job-1"
        apiBaseUrl="http://api.test"
        sessionToken="session-token"
        canCreate
        canEdit
        canApprove
        canConvert
        canViewCatalog={false}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Download estimate' }));

    await waitFor(() =>
      expect(mockedApi.downloadOfficeEstimateDocument).toHaveBeenCalledWith({
        estimateId: 'estimate-1',
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      })
    );
    expect(mockedDownload.downloadBlob).toHaveBeenCalledWith(
      'estimate-Replacement-options-estimate-1.html',
      expect.any(Blob)
    );
  });
});
