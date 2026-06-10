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
  downloadOfficeEstimatePdf: vi.fn(),
  getOfficeEstimateOutboundMessages: vi.fn(),
  getOfficeEstimateSendPreview: vi.fn(),
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
    mockedApi.getOfficeEstimateSendPreview.mockResolvedValue({
      preview: {
        subject: 'Estimate from BellField',
        bodyText: 'Hello Acme, attached is Replacement options.'
      },
      deliveryStatus: {
        configured: true,
        ready: true,
        status: 'ready',
        message: 'Estimate email is ready.'
      }
    });
    mockedApi.downloadOfficeEstimateDocument.mockResolvedValue(new Blob(['html']));
    mockedApi.downloadOfficeEstimatePdf.mockResolvedValue(new Blob(['pdf']));
    mockedApi.sendOfficeEstimate.mockResolvedValue({
      outboundMessage: {
        id: 'message-1',
        channel: 'email',
        status: 'sent',
        jobId: 'job-1',
        estimateId: 'estimate-1',
        documentSnapshotId: 'snapshot-1',
        recipientEmail: 'customer@example.com',
        subject: 'Estimate from BellField',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T00:00:00.000Z',
        sentAt: '2026-06-01T00:00:01.000Z'
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

  it('downloads estimate PDFs with a readable title-based filename', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));

    await waitFor(() =>
      expect(mockedApi.downloadOfficeEstimatePdf).toHaveBeenCalledWith({
        estimateId: 'estimate-1',
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      })
    );
    expect(mockedDownload.downloadBlob).toHaveBeenCalledWith(
      'estimate-Replacement-options-estimate-1.pdf',
      expect.any(Blob)
    );
  });

  it('shows one compact row per estimate and detail for only the selected estimate', async () => {
    const declinedEstimate: EstimateSummary = {
      ...estimate,
      id: 'estimate-declined',
      status: 'declined',
      title: 'Old repair quote',
      lineItems: [
        {
          ...estimate.lineItems[0],
          id: 'declined-line',
          estimateId: 'estimate-declined',
          description: 'Old blower motor'
        }
      ]
    };
    const newerEstimate: EstimateSummary = {
      ...estimate,
      id: 'estimate-new',
      title: 'Duct work',
      lineItems: [
        {
          ...estimate.lineItems[0],
          id: 'duct-line',
          estimateId: 'estimate-new',
          description: 'Duct sealing'
        }
      ]
    };
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({
      estimates: [declinedEstimate, newerEstimate]
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
      />
    );

    expect(await screen.findByRole('button', { name: /Old repair quote/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duct work/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Estimate list').querySelector('div')).toHaveStyle({
      overflowY: 'auto'
    });
    expect(screen.getByText(/Duct sealing/)).toBeInTheDocument();
    expect(screen.queryByText('Old blower motor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Old repair quote/ }));

    expect(await screen.findByText(/Old blower motor/)).toBeInTheDocument();
    expect(screen.queryByText(/Duct sealing/)).not.toBeInTheDocument();
  });

  it('keeps manual estimate line kind in details and defaults it to service item', async () => {
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [] });
    mockedApi.createOfficeEstimate.mockResolvedValue({ estimate });

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

    fireEvent.click(await screen.findByRole('button', { name: 'New estimate' }));

    expect(screen.queryByLabelText('Kind')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More details' }));

    expect(screen.getByLabelText('Kind')).toHaveValue('serviceItem');
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Maintenance quote' }
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Diagnostic visit' }
    });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '129' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create estimate' }));

    await waitFor(() =>
      expect(mockedApi.createOfficeEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          lineItems: [
            expect.objectContaining({
              kind: 'serviceItem',
              description: 'Diagnostic visit',
              quantity: 1,
              unitPrice: 129
            })
          ]
        })
      )
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

    fireEvent.click(await screen.findByRole('button', { name: 'Send PDF' }));
    expect(await screen.findByLabelText('Estimate recipient email')).toHaveValue(
      'customer@example.com'
    );
    expect(screen.queryByLabelText('Estimate email from address')).toBeNull();
    expect(await screen.findByLabelText('Estimate email subject')).toHaveValue(
      'Estimate from BellField'
    );
    expect(await screen.findByLabelText('Estimate email body')).toHaveValue(
      'Hello Acme, attached is Replacement options.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send PDF' }));

    await waitFor(() => {
      expect(mockedApi.sendOfficeEstimate).toHaveBeenCalledWith({
        estimateId: 'estimate-1',
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token',
        recipientEmail: 'customer@example.com',
        subject: 'Estimate from BellField',
        bodyText: 'Hello Acme, attached is Replacement options.'
      });
    });
    expect(mockedApi.getOfficeEstimateSendPreview).toHaveBeenCalledWith({
      estimateId: 'estimate-1',
      apiBaseUrl: 'http://api.test',
      sessionToken: 'session-token'
    });
    expect(confirmSpy).toHaveBeenCalledWith('Send this estimate PDF to customer@example.com?');
    expect(await screen.findByText('Estimate sent.')).toBeInTheDocument();
    expect(mockedApi.getOfficeEstimateOutboundMessages).toHaveBeenCalledWith({
      estimateId: 'estimate-1',
      apiBaseUrl: 'http://api.test',
      sessionToken: 'session-token'
    });
  });

  it('shows safe failed-delivery history without backend provider details', async () => {
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
    mockedApi.getOfficeEstimateOutboundMessages.mockResolvedValue({
      outboundMessages: [
        {
          id: 'message-failed',
          channel: 'email',
          status: 'failed',
          jobId: 'job-1',
          estimateId: 'estimate-1',
          documentSnapshotId: 'snapshot-1',
          recipientEmail: 'customer@example.com',
          subject: 'Estimate from BellField',
          sentByName: 'Olivia Owner',
          queuedAt: '2026-06-01T00:00:00.000Z',
          failureCode: 'deliveryUnavailable',
          deliveryMessage: 'Email was not delivered. Try again or contact BellField support.',
          providerError: 'The bellfield.app domain is not verified.'
        } as unknown as operationsApi.OutboundMessageSummary
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

    fireEvent.click(await screen.findByRole('button', { name: 'Send PDF' }));

    expect(await screen.findByText('To')).toBeInTheDocument();
    expect(screen.getByText('customer@example.com')).toBeInTheDocument();
    expect(
      screen.getByText('Email was not delivered. Try again or contact BellField support.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/resend/i)).toBeNull();
    expect(screen.queryByText(/domain is not verified/i)).toBeNull();
  });
});
