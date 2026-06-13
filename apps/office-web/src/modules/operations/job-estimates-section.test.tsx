import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogCategory, CatalogItem, EstimateSummary } from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import * as downloadFile from '@/lib/download-file';
import { JobEstimatesSection } from './job-estimates-section';

vi.mock('@/lib/operations-api', () => ({
  approveOfficeEstimate: vi.fn(),
  cancelOfficeEstimateOutboundMessage: vi.fn(),
  convertOfficeEstimateToInvoice: vi.fn(),
  createOfficeEstimate: vi.fn(),
  declineOfficeEstimate: vi.fn(),
  downloadOfficeEstimateDocument: vi.fn(),
  downloadOfficeEstimatePdf: vi.fn(),
  getOfficeCatalogCategories: vi.fn(),
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

function catalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'catalog-1',
    name: 'Cooling diagnostic',
    kind: 'service',
    category: 'Diagnostics',
    tradeTags: [],
    taxableDefault: true,
    defaultSalePrice: 129,
    fieldVisible: true,
    isActive: true,
    registerUsageCount: 0,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  };
}

function catalogCategory(overrides: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id: 'category-1',
    name: 'Diagnostics',
    sortOrder: 10,
    isActive: true,
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  };
}

describe('JobEstimatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [estimate] });
    mockedApi.getOfficeCatalogItems.mockResolvedValue({ items: [] });
    mockedApi.getOfficeCatalogCategories.mockResolvedValue({ categories: [] });
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

  it('starts without blank line fields and adds custom lines intentionally', async () => {
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

    expect(screen.getByText('Choose a Catalog item or add a custom line.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(screen.queryByLabelText('Qty')).toBeNull();
    expect(screen.queryByLabelText('Unit price')).toBeNull();
    expect(screen.queryByLabelText('Unit cost')).toBeNull();
    expect(screen.queryByLabelText('Taxable')).toBeNull();
    expect(screen.queryByLabelText('Kind')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add custom line' }));

    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Qty')).toHaveValue(1);
    expect(screen.getByLabelText('Unit price')).toHaveValue(null);
    expect(screen.getByLabelText('Unit cost')).toHaveValue(null);
    expect(screen.getByLabelText('Taxable')).toBeChecked();
    expect(screen.queryByLabelText('Kind')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More details' }));

    expect(screen.getByLabelText('Unit')).toBeInTheDocument();
    expect(screen.queryByLabelText('Kind')).toBeNull();

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

  it('adds Catalog lines with hidden classification and a preserved snapshot', async () => {
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [] });
    mockedApi.getOfficeCatalogItems.mockResolvedValue({
      items: [
        catalogItem({
          id: 'filter',
          name: '16x20x1 filter',
          category: 'Materials',
          kind: 'part',
          code: 'MAT-FILTER-16X20X1',
          description: 'Replace customer filter.',
          defaultSalePrice: 18,
          costHint: 5,
          unitOfMeasure: 'each',
          taxableDefault: false
        })
      ]
    });
    mockedApi.getOfficeCatalogCategories.mockResolvedValue({
      categories: [catalogCategory({ id: 'materials', name: 'Materials', sortOrder: 10 })]
    });
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
        canViewCatalog
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New estimate' }));
    fireEvent.click(await screen.findByRole('button', { name: /Materials\s*1 items/i }));
    fireEvent.click(screen.getByRole('button', { name: /16x20x1 filter/i }));

    expect(screen.getByLabelText('Description')).toHaveValue('Replace customer filter.');
    expect(screen.getByLabelText('Unit price')).toHaveValue(18);
    expect(screen.getByLabelText('Unit cost')).toHaveValue(5);
    expect(screen.queryByLabelText('Kind')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More details' }));

    expect(screen.getByLabelText('Unit')).toHaveValue('each');
    expect(screen.queryByLabelText('Kind')).toBeNull();

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Filter quote' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create estimate' }));

    await waitFor(() =>
      expect(mockedApi.createOfficeEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-1',
          lineItems: [
            expect.objectContaining({
              kind: 'part',
              catalogItemId: 'filter',
              description: 'Replace customer filter.',
              quantity: 1,
              unitPrice: 18,
              unitCost: 5,
              taxable: false,
              catalogSnapshot: expect.objectContaining({
                catalogItemId: 'filter',
                kind: 'part',
                name: '16x20x1 filter',
                selectedUnitPrice: 18,
                taxable: false
              })
            })
          ]
        })
      )
    );
  });

  it('puts new custom lines above existing lines so they are immediately editable', async () => {
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [] });
    mockedApi.getOfficeCatalogItems.mockResolvedValue({
      items: [
        catalogItem({
          id: 'filter',
          name: '16x20x1 filter',
          category: 'Materials',
          kind: 'part',
          description: 'Replace customer filter.',
          defaultSalePrice: 18
        })
      ]
    });
    mockedApi.getOfficeCatalogCategories.mockResolvedValue({
      categories: [catalogCategory({ id: 'materials', name: 'Materials', sortOrder: 10 })]
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
        canViewCatalog
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New estimate' }));
    fireEvent.click(await screen.findByRole('button', { name: /Materials\s*1 items/i }));
    fireEvent.click(screen.getByRole('button', { name: /16x20x1 filter/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add custom line' }));

    const descriptions = screen.getAllByLabelText('Description');
    expect(descriptions).toHaveLength(2);
    expect(descriptions[0]).toHaveValue('');
    expect(descriptions[1]).toHaveValue('Replace customer filter.');

    // Catalog picks land at the top too, so both adders behave the same way.
    fireEvent.click(screen.getByRole('button', { name: /16x20x1 filter/i }));
    const afterCatalogAdd = screen.getAllByLabelText('Description');
    expect(afterCatalogAdd).toHaveLength(3);
    expect(afterCatalogAdd[0]).toHaveValue('Replace customer filter.');
  });

  it('lets custom lines pick a business line type while catalog lines stay locked', async () => {
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [] });
    mockedApi.getOfficeCatalogItems.mockResolvedValue({
      items: [catalogItem({ id: 'filter', name: '16x20x1 filter', kind: 'part' })]
    });
    mockedApi.getOfficeCatalogCategories.mockResolvedValue({ categories: [] });
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
        canViewCatalog
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'New estimate' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Labor quote' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add custom line' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Install labor' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));

    const lineType = screen.getByLabelText('Line type');
    expect(lineType).toHaveValue('serviceItem');
    fireEvent.change(lineType, { target: { value: 'labor' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create estimate' }));
    await waitFor(() =>
      expect(mockedApi.createOfficeEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          lineItems: [expect.objectContaining({ kind: 'labor', description: 'Install labor' })]
        })
      )
    );
  });

  it('does not pre-select an option and labels which option the totals reflect', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Add options' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Optioned quote' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add custom line' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Good path' } });
    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create estimate' }));

    await waitFor(() =>
      expect(mockedApi.createOfficeEstimate).toHaveBeenCalledWith(
        expect.objectContaining({ selectedOptionId: undefined })
      )
    );
  });

  it('labels pending option totals as reflecting the first option', async () => {
    const optionTotalsEstimate: EstimateSummary = {
      ...estimate,
      optionGroups: [
        {
          id: 'group-1',
          title: 'Choose a path',
          position: 0,
          options: [
            { id: 'option-good', label: 'Good', position: 0, totals: estimate.totals },
            { id: 'option-better', label: 'Better', position: 1, totals: estimate.totals }
          ]
        }
      ]
    };
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [optionTotalsEstimate] });

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

    expect(
      await screen.findByText('No option chosen yet — totals reflect Good.')
    ).toBeInTheDocument();
  });

  it('still offers Decline on a pending estimate with options', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const optionEstimate: EstimateSummary = {
      ...estimate,
      id: 'estimate-options',
      title: 'Replace or repair',
      optionGroups: [
        {
          id: 'group-1',
          title: 'Choose a path',
          position: 0,
          options: [
            { id: 'option-good', label: 'Good', position: 0, totals: estimate.totals },
            { id: 'option-better', label: 'Better', position: 1, totals: estimate.totals }
          ]
        }
      ]
    };
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [optionEstimate] });
    mockedApi.declineOfficeEstimate.mockResolvedValue({
      estimate: { ...optionEstimate, status: 'declined' }
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

    expect(await screen.findByRole('button', { name: 'Mark Good approved' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Better approved' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(confirmSpy).toHaveBeenCalledWith('Decline this estimate?');
    await waitFor(() =>
      expect(mockedApi.declineOfficeEstimate).toHaveBeenCalledWith({
        estimateId: 'estimate-options',
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      })
    );
  });

  it('fires convert once on a double-click and offers a real three-way conflict choice', async () => {
    const approvedEstimate: EstimateSummary = {
      ...estimate,
      status: 'approved',
      approvedAt: '2026-06-01T00:00:00.000Z',
      approvedByEmployeeId: 'office-1',
      approvedByName: 'Olivia Owner'
    };
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({ estimates: [approvedEstimate] });
    mockedApi.convertOfficeEstimateToInvoice.mockRejectedValue(
      new Error('The invoice draft already has lines. Choose "append" or "replace" to convert.')
    );

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

    const convertButton = await screen.findByRole('button', { name: 'Convert to invoice' });
    fireEvent.click(convertButton);
    fireEvent.click(convertButton);

    await waitFor(() => expect(mockedApi.convertOfficeEstimateToInvoice).toHaveBeenCalledTimes(1));

    // The conflict surfaces as an explicit three-way prompt, never an
    // OK/Cancel where Cancel performs an action.
    expect(
      await screen.findByText('The invoice draft already has lines. What should happen to them?')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockedApi.convertOfficeEstimateToInvoice).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Convert to invoice' }));
    await screen.findByText('The invoice draft already has lines. What should happen to them?');
    mockedApi.convertOfficeEstimateToInvoice.mockResolvedValue({} as never);
    fireEvent.click(screen.getByRole('button', { name: 'Add this estimate to them' }));

    await waitFor(() =>
      expect(mockedApi.convertOfficeEstimateToInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({ estimateId: 'estimate-1', mode: 'append' })
      )
    );
  });

  it('confirms before discarding unsaved estimate edits', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

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

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Changed but unsaved' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirmSpy).toHaveBeenCalledWith('Discard unsaved estimate changes?');
    // Declined: the editor stays open with the edit intact.
    expect(screen.getByLabelText('Title')).toHaveValue('Changed but unsaved');

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('shows the effective tax rate read-only in review and editor', async () => {
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({
      estimates: [{ ...estimate, taxRateBasisPoints: 825 }]
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

    expect(await screen.findByText('Tax (8.25%)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(
      screen.getByText('Sales tax: 8.25% (set when this estimate was created)')
    ).toBeInTheDocument();
    // Tax stays read-only in the builder: no input asks for a rate.
    expect(screen.queryByLabelText(/tax rate/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'New estimate' }));
    expect(
      screen.getByText('Sales tax: the company default rate applies on save')
    ).toBeInTheDocument();
  });

  it('shows sent state and warns when an estimate was edited after sending', async () => {
    mockedApi.getOfficeEstimatesForJob.mockResolvedValue({
      estimates: [
        {
          ...estimate,
          lastSentAt: '2026-06-09T18:00:00.000Z',
          lastSentSourceVersion: 1,
          latestAcceptanceLinkExpiresAt: '2099-07-01T00:00:00.000Z',
          version: 2
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
      />
    );

    expect((await screen.findAllByText('Sent')).length).toBeGreaterThan(0);
    expect(screen.getByText('Awaiting customer')).toBeInTheDocument();
    expect(screen.getByText(/Awaiting customer response/)).toBeInTheDocument();
    expect(screen.getAllByText('Edited since sent').length).toBeGreaterThan(0);
    expect(screen.getByText(/Last sent/)).toBeInTheDocument();
  });

  it('shows customer acceptance state in delivery history', async () => {
    mockedApi.getOfficeEstimateOutboundMessages.mockResolvedValue({
      outboundMessages: [
        {
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
          sentAt: '2026-06-01T00:00:01.000Z',
          acceptanceUrl: 'https://relay.test/a/link-1',
          acceptanceLinkExpiresAt: '2099-07-01T00:00:00.000Z'
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));

    expect(await screen.findByText(/Awaiting customer response. Link expires/)).toBeInTheDocument();
    expect(screen.queryByText('https://relay.test/a/link-1')).toBeNull();
  });

  it('offers sending on a pending estimate so the customer can review before approval', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));
    expect(await screen.findByLabelText('Estimate email subject')).toHaveValue(
      'Estimate from BellField'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    expect(confirmSpy).toHaveBeenCalledWith('Send this estimate PDF to customer@example.com?');
    await waitFor(() =>
      expect(mockedApi.sendOfficeEstimate).toHaveBeenCalledWith(
        expect.objectContaining({ estimateId: 'estimate-1' })
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

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

  it('reports a queued send as a notice, not an error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedApi.sendOfficeEstimate.mockResolvedValue({
      outboundMessage: {
        id: 'message-q1',
        channel: 'email',
        status: 'queued',
        jobId: 'job-1',
        estimateId: 'estimate-1',
        recipientEmail: 'customer@example.com',
        subject: 'Estimate from BellField',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T00:00:00.000Z'
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
        byteSize: 64,
        generatedByName: 'Olivia Owner',
        generatedAt: '2026-06-01T00:00:00.000Z'
      }
    });
    mockedApi.getOfficeEstimateOutboundMessages.mockResolvedValue({
      outboundMessages: [
        {
          id: 'message-q1',
          channel: 'email',
          status: 'queued',
          jobId: 'job-1',
          estimateId: 'estimate-1',
          recipientEmail: 'customer@example.com',
          subject: 'Estimate from BellField',
          sentByName: 'Olivia Owner',
          queuedAt: '2026-06-01T00:00:00.000Z'
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));
    expect(await screen.findByLabelText('Estimate email subject')).toHaveValue(
      'Estimate from BellField'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    expect(await screen.findByText('Queued — will send automatically.')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel send' })).toBeInTheDocument();
  });

  it('cancels a queued send from the delivery history', async () => {
    mockedApi.getOfficeEstimateOutboundMessages.mockResolvedValueOnce({
      outboundMessages: [
        {
          id: 'message-q1',
          channel: 'email',
          status: 'queued',
          jobId: 'job-1',
          estimateId: 'estimate-1',
          recipientEmail: 'customer@example.com',
          subject: 'Estimate from BellField',
          sentByName: 'Olivia Owner',
          queuedAt: '2026-06-01T00:00:00.000Z'
        }
      ]
    });
    mockedApi.cancelOfficeEstimateOutboundMessage.mockResolvedValue({
      outboundMessage: {
        id: 'message-q1',
        channel: 'email',
        status: 'canceled',
        jobId: 'job-1',
        estimateId: 'estimate-1',
        recipientEmail: 'customer@example.com',
        subject: 'Estimate from BellField',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T00:00:00.000Z',
        deliveryMessage: 'Canceled before sending.'
      }
    });
    mockedApi.getOfficeEstimateOutboundMessages.mockResolvedValue({
      outboundMessages: [
        {
          id: 'message-q1',
          channel: 'email',
          status: 'canceled',
          jobId: 'job-1',
          estimateId: 'estimate-1',
          recipientEmail: 'customer@example.com',
          subject: 'Estimate from BellField',
          sentByName: 'Olivia Owner',
          queuedAt: '2026-06-01T00:00:00.000Z',
          deliveryMessage: 'Canceled before sending.'
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel send' }));

    await waitFor(() => {
      expect(mockedApi.cancelOfficeEstimateOutboundMessage).toHaveBeenCalledWith({
        estimateId: 'estimate-1',
        outboundMessageId: 'message-q1',
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      });
    });
    expect(await screen.findByText('Queued email canceled.')).toBeInTheDocument();
    expect(await screen.findByText('Canceled')).toBeInTheDocument();
    expect(screen.getByText('Canceled before sending.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel send' })).toBeNull();
  });

  it('explains a sending-limit block with the approved copy', async () => {
    mockedApi.getOfficeEstimateSendPreview.mockResolvedValue({
      preview: {
        subject: 'Estimate from BellField',
        bodyText: 'Hello Acme, attached is Replacement options.'
      },
      deliveryStatus: {
        configured: true,
        ready: false,
        status: 'quotaExhausted',
        message: 'Estimate email has reached its sending limit. Contact BellField support.'
      }
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));

    expect(
      await screen.findByText(
        'Estimate email has reached its sending limit. Contact BellField support.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send email' })).toBeDisabled();
  });

  it('disables sending and explains when estimate email is not available', async () => {
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
    mockedApi.getOfficeEstimateSendPreview.mockResolvedValue({
      preview: {
        subject: 'Estimate from BellField',
        bodyText: 'Hello Acme, attached is Replacement options.'
      },
      deliveryStatus: {
        configured: false,
        ready: false,
        status: 'needsSetup',
        message: 'Estimate email is not available on this server. Contact BellField support.'
      }
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));

    expect(
      await screen.findByText(
        'Estimate email is not available on this server. Contact BellField support.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send email' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
    expect(mockedApi.sendOfficeEstimate).not.toHaveBeenCalled();
  });

  it('warns instead of celebrating when a send is accepted but not recorded', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    mockedApi.sendOfficeEstimate.mockResolvedValue({
      outboundMessage: {
        id: 'message-1',
        channel: 'email',
        status: 'sent',
        jobId: 'job-1',
        estimateId: 'estimate-1',
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
      },
      recordingIncomplete: true
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));
    expect(await screen.findByLabelText('Estimate email subject')).toHaveValue(
      'Estimate from BellField'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    const warning = await screen.findByText(
      'The email was sent, but BellField could not finish recording it. Do not resend until support checks it.'
    );
    expect(warning).toHaveStyle({ color: '#92400e' });
    expect(screen.queryByText('Estimate sent.')).toBeNull();
  });

  it('shows a failed send as an error, not a success notice', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    mockedApi.sendOfficeEstimate.mockResolvedValue({
      outboundMessage: {
        id: 'message-failed',
        channel: 'email',
        status: 'failed',
        jobId: 'job-1',
        estimateId: 'estimate-1',
        recipientEmail: 'customer@example.com',
        subject: 'Estimate from BellField',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T00:00:00.000Z',
        failureCode: 'deliveryUnavailable',
        deliveryMessage: 'Email was not delivered. Try again or contact BellField support.'
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));
    expect(await screen.findByLabelText('Estimate email subject')).toHaveValue(
      'Estimate from BellField'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    const failureMessage = await screen.findByText(
      'Email was not delivered. Try again or contact BellField support.'
    );
    // The failure must render in the red error slot, not the green notice slot.
    expect(failureMessage).toHaveStyle({ color: '#b42318' });
    expect(screen.queryByText('Estimate sent.')).toBeNull();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Email estimate' }));

    expect(await screen.findByText('To')).toBeInTheDocument();
    expect(screen.getByText('customer@example.com')).toBeInTheDocument();
    expect(
      screen.getByText('Email was not delivered. Try again or contact BellField support.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/resend/i)).toBeNull();
    expect(screen.queryByText(/domain is not verified/i)).toBeNull();
  });
});
