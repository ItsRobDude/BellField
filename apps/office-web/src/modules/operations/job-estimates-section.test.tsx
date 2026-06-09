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
  getOfficeEstimateOutboundMessages: vi.fn(),
  getOfficeCatalogItems: vi.fn(),
  getOfficeEstimatesForJob: vi.fn(),
  sendOfficeEstimate: vi.fn(),
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
    mockedApi.getOfficeEstimateOutboundMessages.mockResolvedValue({ outboundMessages: [] });
    mockedApi.downloadOfficeEstimateDocument.mockResolvedValue(new Blob(['html']));
    mockedApi.sendOfficeEstimate.mockResolvedValue({
      outboundMessage: {
        id: 'message-1',
        channel: 'email',
        provider: 'resend',
        status: 'sent',
        jobId: 'job-1',
        estimateId: 'estimate-1',
        documentSnapshotId: 'snapshot-1',
        recipientEmail: 'customer@example.com',
        subject: 'Estimate from BellField',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T00:00:00.000Z',
        sentAt: '2026-06-01T00:00:01.000Z',
        providerMessageId: 'resend-message-1'
      },
      documentSnapshot: {
        id: 'snapshot-1',
        documentType: 'estimate',
        jobId: 'job-1',
        estimateId: 'estimate-1',
        sourceVersion: 1,
        filename: 'estimate.pdf',
        contentType: 'application/pdf',
        sha256: 'a'.repeat(64),
        byteSize: 100,
        generatedByName: 'Olivia Owner',
        generatedAt: '2026-06-01T00:00:00.000Z'
      }
    });
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
        canSend
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

  it('sends an approved estimate PDF and refreshes delivery history', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({
      estimates: [
        {
          ...estimate,
          status: 'approved',
          approvedAt: '2026-06-01T00:00:00.000Z',
          approvedByEmployeeId: 'office-1',
          approvedByName: 'Olivia Owner'
        }
      ]
    });

    render(
      <JobEstimatesSection
        jobId="job-1"
        apiBaseUrl="http://api.test"
        sessionToken="session-token"
        canCreate
        canEdit
        canApprove
        canSend
        canConvert
        canViewCatalog={false}
        billToCustomerEmail="customer@example.com"
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Send estimate' }));
    expect(await screen.findByLabelText('Estimate recipient email')).toHaveValue(
      'customer@example.com'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send PDF' }));

    await waitFor(() => {
      expect(mockedApi.sendOfficeEstimate).toHaveBeenCalledWith({
        estimateId: 'estimate-1',
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token',
        recipientEmail: 'customer@example.com',
        subject: undefined,
        bodyText: undefined
      });
    });
    expect(confirmSpy).toHaveBeenCalledWith('Send this estimate to customer@example.com?');
    expect(await screen.findByText('Estimate sent.')).toBeInTheDocument();
    expect(mockedApi.getOfficeEstimateOutboundMessages).toHaveBeenCalledWith({
      estimateId: 'estimate-1',
      apiBaseUrl: 'http://api.test',
      sessionToken: 'session-token'
    });
  });
});
