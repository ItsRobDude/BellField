import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceSummary } from '@/lib/operations-api';
import * as operationsApi from '@/lib/operations-api';
import * as invoiceDeliveryApi from '@/lib/operations-invoice-delivery-api';
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
  createOfficeOnlinePaymentLink: vi.fn(),
  recordOfficePayment: vi.fn(),
  voidOfficePayment: vi.fn(),
  refundOfficePayment: vi.fn(),
  requestOfficeOnlineRefund: vi.fn()
}));
vi.mock('@/lib/operations-invoice-delivery-api', () => ({
  getOfficeInvoiceSendPreview: vi.fn(),
  sendOfficeInvoice: vi.fn(),
  getOfficeInvoiceOutboundMessages: vi.fn(),
  cancelOfficeInvoiceOutboundMessage: vi.fn()
}));
vi.mock('@/lib/download-file', () => ({ downloadBlob: vi.fn() }));

const mockedApi = vi.mocked(operationsApi);
const mockedInvoiceDeliveryApi = vi.mocked(invoiceDeliveryApi);
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
    refundedTotal: 0,
    amountDue: 0
  });
  mockedApi.listOfficeJobAdjustments.mockResolvedValue({ adjustments: [] });
  mockedApi.listOfficeJobPayments.mockResolvedValue({
    payments: [],
    refunds: [],
    onlineRefundRequests: []
  });
  mockedApi.createOfficeOnlinePaymentLink.mockResolvedValue({
    state: 'created',
    checkoutUrl: 'https://checkout.stripe.test/pay/cs_123',
    paymentSessionId: 'pay_sess_123',
    amount: 250,
    currency: 'USD',
    expiresAt: '2026-06-14T00:00:00.000Z'
  });
  mockedApi.downloadOfficeInvoiceDocument.mockResolvedValue(new Blob(['html']));
  mockedInvoiceDeliveryApi.getOfficeInvoiceSendPreview.mockResolvedValue({
    preview: {
      subject: 'Invoice 1001 from Acme HVAC',
      bodyText: 'Hello Acme Co, attached is your invoice for job 1001.'
    },
    deliveryStatus: {
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Invoice email is ready.'
    }
  });
  mockedInvoiceDeliveryApi.getOfficeInvoiceOutboundMessages.mockResolvedValue({
    outboundMessages: []
  });
  mockedInvoiceDeliveryApi.sendOfficeInvoice.mockResolvedValue({
    outboundMessage: {
      id: 'message-1',
      channel: 'email',
      status: 'sent',
      jobId: 'job-1',
      invoiceId: 'inv-1',
      documentSnapshotId: 'snapshot-1',
      recipientEmail: 'customer@example.com',
      subject: 'Invoice 1001 from Acme HVAC',
      sentByName: 'Olivia Owner',
      queuedAt: '2026-06-01T12:00:00.000Z',
      sentAt: '2026-06-01T12:00:01.000Z'
    },
    documentSnapshot: {
      id: 'snapshot-1',
      documentType: 'invoice',
      jobId: 'job-1',
      invoiceId: 'inv-1',
      sourceVersion: 2,
      filename: 'invoice-1001-inv-1.pdf',
      contentType: 'application/pdf',
      sha256: 'a'.repeat(64),
      byteSize: 123,
      generatedByName: 'Olivia Owner',
      generatedAt: '2026-06-01T12:00:00.000Z'
    }
  });
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

function renderSection(
  canPost: boolean,
  options?: {
    canSend?: boolean;
    customerEmail?: string;
    paymentPermissions?: Partial<{
      canView: boolean;
      canRecord: boolean;
      canVoid: boolean;
      canRefund: boolean;
    }>;
  }
) {
  return render(
    <JobInvoiceSection
      jobId="job-1"
      apiBaseUrl="http://localhost"
      sessionToken="test-token"
      canEdit
      canPost={canPost}
      canSend={options?.canSend ?? false}
      billToCustomerEmail={options?.customerEmail}
      canCreateAdjustments
      paymentPermissions={{
        canView: true,
        canRecord: true,
        canVoid: true,
        canRefund: true,
        ...options?.paymentPermissions
      }}
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

  it('shows invoice email only for posted invoices with send permission', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: draftInvoice() });

    const { unmount } = renderSection(true, {
      canSend: true,
      customerEmail: 'customer@example.com'
    });

    expect(await screen.findByRole('button', { name: 'Post invoice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email invoice' })).not.toBeInTheDocument();
    unmount();

    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    renderSection(true, { canSend: false, customerEmail: 'customer@example.com' });

    expect(await screen.findByText('Posted record')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email invoice' })).not.toBeInTheDocument();
  });

  it('previews and sends a posted invoice email with the bill-to email default', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSection(true, { canSend: true, customerEmail: 'customer@example.com' });

    fireEvent.click(await screen.findByRole('button', { name: 'Email invoice' }));

    expect(await screen.findByLabelText('Invoice recipient email')).toHaveValue(
      'customer@example.com'
    );
    expect(await screen.findByLabelText('Invoice email subject')).toHaveValue(
      'Invoice 1001 from Acme HVAC'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() =>
      expect(mockedInvoiceDeliveryApi.sendOfficeInvoice).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token',
        recipientEmail: 'customer@example.com',
        subject: 'Invoice 1001 from Acme HVAC',
        bodyText: 'Hello Acme Co, attached is your invoice for job 1001.'
      })
    );
    expect(await screen.findByText('Invoice sent.')).toBeInTheDocument();
  });

  it('reports when a pay-now link was included in the sent invoice', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedInvoiceDeliveryApi.sendOfficeInvoice.mockResolvedValueOnce({
      outboundMessage: {
        id: 'message-1',
        channel: 'email',
        status: 'sent',
        jobId: 'job-1',
        invoiceId: 'inv-1',
        documentSnapshotId: 'snapshot-1',
        recipientEmail: 'customer@example.com',
        subject: 'Invoice 1001 from Acme HVAC',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T12:00:00.000Z',
        sentAt: '2026-06-01T12:00:01.000Z'
      },
      documentSnapshot: {
        id: 'snapshot-1',
        documentType: 'invoice',
        jobId: 'job-1',
        invoiceId: 'inv-1',
        sourceVersion: 2,
        filename: 'invoice-1001-inv-1.pdf',
        contentType: 'application/pdf',
        sha256: 'a'.repeat(64),
        byteSize: 123,
        generatedByName: 'Olivia Owner',
        generatedAt: '2026-06-01T12:00:00.000Z'
      },
      paymentLinkIncluded: true
    });

    renderSection(true, { canSend: true, customerEmail: 'customer@example.com' });

    fireEvent.click(await screen.findByRole('button', { name: 'Email invoice' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send email' }));

    expect(await screen.findByText('Invoice sent with a pay-now link.')).toBeInTheDocument();
    expect(screen.queryByText('Invoice sent.')).not.toBeInTheDocument();
  });

  it('warns (not confirms success) when a sent invoice could not be fully recorded', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedInvoiceDeliveryApi.sendOfficeInvoice.mockResolvedValueOnce({
      outboundMessage: {
        id: 'message-1',
        channel: 'email',
        status: 'sent',
        jobId: 'job-1',
        invoiceId: 'inv-1',
        documentSnapshotId: 'snapshot-1',
        recipientEmail: 'customer@example.com',
        subject: 'Invoice 1001 from Acme HVAC',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T12:00:00.000Z',
        sentAt: '2026-06-01T12:00:01.000Z'
      },
      documentSnapshot: {
        id: 'snapshot-1',
        documentType: 'invoice',
        jobId: 'job-1',
        invoiceId: 'inv-1',
        sourceVersion: 2,
        filename: 'invoice-1001-inv-1.pdf',
        contentType: 'application/pdf',
        sha256: 'a'.repeat(64),
        byteSize: 123,
        generatedByName: 'Olivia Owner',
        generatedAt: '2026-06-01T12:00:00.000Z'
      },
      recordingIncomplete: true
    });

    renderSection(true, { canSend: true, customerEmail: 'customer@example.com' });

    fireEvent.click(await screen.findByRole('button', { name: 'Email invoice' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send email' }));

    // The operator must see a "stop and call support" warning, never a green success.
    expect(await screen.findByText(/could not finish recording it/i)).toBeInTheDocument();
    expect(screen.queryByText('Invoice sent.')).not.toBeInTheDocument();
  });

  it('shows queued invoice delivery history and cancels queued sends', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedInvoiceDeliveryApi.getOfficeInvoiceOutboundMessages.mockResolvedValue({
      outboundMessages: [
        {
          id: 'message-queued',
          channel: 'email',
          status: 'queued',
          jobId: 'job-1',
          invoiceId: 'inv-1',
          recipientEmail: 'customer@example.com',
          subject: 'Invoice 1001 from Acme HVAC',
          sentByName: 'Olivia Owner',
          queuedAt: '2026-06-01T12:00:00.000Z'
        }
      ]
    });
    mockedInvoiceDeliveryApi.cancelOfficeInvoiceOutboundMessage.mockResolvedValue({
      outboundMessage: {
        id: 'message-queued',
        channel: 'email',
        status: 'canceled',
        jobId: 'job-1',
        invoiceId: 'inv-1',
        recipientEmail: 'customer@example.com',
        subject: 'Invoice 1001 from Acme HVAC',
        sentByName: 'Olivia Owner',
        queuedAt: '2026-06-01T12:00:00.000Z',
        deliveryMessage: 'Canceled before sending.'
      }
    });

    renderSection(true, { canSend: true, customerEmail: 'customer@example.com' });

    fireEvent.click(await screen.findByRole('button', { name: 'Email invoice' }));
    expect(await screen.findByText('Will send automatically.')).toBeInTheDocument();
    expect(screen.queryByText(/Awaiting customer response/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel send' }));

    await waitFor(() =>
      expect(mockedInvoiceDeliveryApi.cancelOfficeInvoiceOutboundMessage).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        outboundMessageId: 'message-queued',
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token'
      })
    );
    expect(await screen.findByText('Queued email canceled.')).toBeInTheDocument();
  });

  it('creates a default full-due online payment link from the posted invoice screen', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValueOnce({
      jobId: 'job-1',
      mainInvoiceStatus: 'posted',
      postedMainTotal: 250,
      postedAdjustmentsTotal: 0,
      postedCreditsTotal: 0,
      netBilled: 250,
      paidTotal: 0,
      refundedTotal: 0,
      amountDue: 250
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Create payment link' }));
    expect(await screen.findByLabelText('Payment link amount')).toHaveValue(250);

    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() =>
      expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        amount: 250,
        confirmSameAmountCharge: undefined,
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token'
      })
    );
    expect(
      await screen.findByDisplayValue('https://checkout.stripe.test/pay/cs_123')
    ).toBeInTheDocument();
  });

  it('creates a partial online payment link from the posted invoice screen', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValueOnce({
      jobId: 'job-1',
      mainInvoiceStatus: 'posted',
      postedMainTotal: 250,
      postedAdjustmentsTotal: 0,
      postedCreditsTotal: 0,
      netBilled: 250,
      paidTotal: 0,
      refundedTotal: 0,
      amountDue: 250
    });
    mockedApi.createOfficeOnlinePaymentLink.mockResolvedValueOnce({
      state: 'created',
      checkoutUrl: 'https://checkout.stripe.test/pay/cs_partial',
      paymentSessionId: 'pay_sess_partial',
      amount: 125,
      currency: 'USD',
      expiresAt: '2026-06-14T00:00:00.000Z'
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Create payment link' }));
    fireEvent.change(await screen.findByLabelText('Payment link amount'), {
      target: { value: '125' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() =>
      expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenCalledWith({
        invoiceId: 'inv-1',
        amount: 125,
        confirmSameAmountCharge: undefined,
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token'
      })
    );
    expect(
      await screen.findByDisplayValue('https://checkout.stripe.test/pay/cs_partial')
    ).toBeInTheDocument();
  });

  it('shows the reused active payment link notice when the API returns an existing session', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValueOnce({
      jobId: 'job-1',
      mainInvoiceStatus: 'posted',
      postedMainTotal: 250,
      postedAdjustmentsTotal: 0,
      postedCreditsTotal: 0,
      netBilled: 250,
      paidTotal: 0,
      refundedTotal: 0,
      amountDue: 250
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
    mockedApi.createOfficeOnlinePaymentLink.mockResolvedValueOnce({
      state: 'created',
      checkoutUrl: 'https://checkout.stripe.test/pay/reused',
      paymentSessionId: 'pay_sess_reused',
      amount: 250,
      currency: 'USD',
      expiresAt: '2026-06-14T00:00:00.000Z',
      reusedExisting: true
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Create payment link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create link' }));

    expect(
      await screen.findByDisplayValue('https://checkout.stripe.test/pay/reused')
    ).toBeInTheDocument();
    expect(await screen.findByText('Existing active payment link copied.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('https://checkout.stripe.test/pay/reused');
    expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenCalledTimes(1);
  });

  it('confirms before creating another same-amount online payment link', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValueOnce({
      jobId: 'job-1',
      mainInvoiceStatus: 'posted',
      postedMainTotal: 250,
      postedAdjustmentsTotal: 0,
      postedCreditsTotal: 0,
      netBilled: 250,
      paidTotal: 0,
      refundedTotal: 0,
      amountDue: 250
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedApi.createOfficeOnlinePaymentLink
      .mockResolvedValueOnce({
        state: 'confirmationRequired',
        code: 'sameAmountPreviouslyPaid',
        amount: 250,
        currency: 'USD',
        message:
          'This job already had an online card payment for $250.00. BellField still shows $250.00 due.'
      })
      .mockResolvedValueOnce({
        state: 'created',
        checkoutUrl: 'https://checkout.stripe.test/pay/cs_retry',
        paymentSessionId: 'pay_sess_retry',
        amount: 250,
        currency: 'USD',
        expiresAt: '2026-06-14T00:00:00.000Z'
      });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Create payment link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create link' }));

    await waitFor(() => expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenCalledTimes(2));
    expect(window.confirm).toHaveBeenCalledWith(
      'Create another $250.00 payment link?\n\nThis job already had an online card payment for $250.00. BellField still shows $250.00 due.'
    );
    expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenNthCalledWith(1, {
      invoiceId: 'inv-1',
      amount: 250,
      confirmSameAmountCharge: undefined,
      apiBaseUrl: 'http://localhost',
      sessionToken: 'test-token'
    });
    expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenNthCalledWith(2, {
      invoiceId: 'inv-1',
      amount: 250,
      confirmSameAmountCharge: true,
      apiBaseUrl: 'http://localhost',
      sessionToken: 'test-token'
    });
    expect(
      await screen.findByDisplayValue('https://checkout.stripe.test/pay/cs_retry')
    ).toBeInTheDocument();
  });

  it('does not create another same-amount link when confirmation is dismissed', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValueOnce({
      jobId: 'job-1',
      mainInvoiceStatus: 'posted',
      postedMainTotal: 250,
      postedAdjustmentsTotal: 0,
      postedCreditsTotal: 0,
      netBilled: 250,
      paidTotal: 0,
      refundedTotal: 0,
      amountDue: 250
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockedApi.createOfficeOnlinePaymentLink.mockResolvedValueOnce({
      state: 'confirmationRequired',
      code: 'sameAmountPreviouslyPaid',
      amount: 250,
      currency: 'USD',
      message:
        'This job already had an online card payment for $250.00. BellField still shows $250.00 due.'
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Create payment link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create link' }));

    await waitFor(() => expect(mockedApi.createOfficeOnlinePaymentLink).toHaveBeenCalledTimes(1));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Payment link')).not.toBeInTheDocument();
  });
});

function manualPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    jobId: 'job-1',
    invoiceId: 'inv-1',
    amount: 250,
    method: 'card' as const,
    source: 'manual' as const,
    currency: 'USD',
    receivedAt: '2026-06-13T00:00:00.000Z',
    recordedByName: 'Olivia Owner',
    allocations: [],
    isVoid: false,
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z',
    ...overrides
  };
}

const paidBalance = {
  jobId: 'job-1',
  mainInvoiceStatus: 'posted' as const,
  postedMainTotal: 250,
  postedAdjustmentsTotal: 0,
  postedCreditsTotal: 0,
  netBilled: 250,
  paidTotal: 250,
  refundedTotal: 0,
  amountDue: 0
};

describe('JobInvoiceSection refunds', () => {
  it('records a partial refund of a manual payment and shows it linked', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [manualPayment()],
      refunds: [],
      onlineRefundRequests: []
    });
    mockedApi.refundOfficePayment.mockResolvedValue({
      refund: {
        id: 'refund-1',
        paymentId: 'pay-1',
        jobId: 'job-1',
        amount: 100,
        method: 'card',
        source: 'manual',
        currency: 'USD',
        refundedAt: '2026-06-14T00:00:00.000Z',
        reason: 'partial return',
        recordedByName: 'Olivia Owner',
        allocations: [],
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:00:00.000Z'
      }
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }));
    fireEvent.change(screen.getByLabelText('Refund amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Refund reason'), {
      target: { value: 'partial return' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record refund' }));

    await waitFor(() =>
      expect(mockedApi.refundOfficePayment).toHaveBeenCalledWith({
        paymentId: 'pay-1',
        amount: 100,
        reason: 'partial return',
        apiBaseUrl: 'http://localhost',
        sessionToken: 'test-token'
      })
    );
    expect(await screen.findByText('Refund recorded.')).toBeInTheDocument();
    expect(await screen.findByText(/↳ \$100\.00 refunded/)).toBeInTheDocument();
  });

  it('blocks a refund larger than the remaining refundable amount client-side', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [manualPayment()],
      refunds: [],
      onlineRefundRequests: []
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }));
    fireEvent.change(screen.getByLabelText('Refund amount'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record refund' }));

    expect(
      await screen.findByText(/cannot exceed the \$250\.00 still refundable/)
    ).toBeInTheDocument();
    expect(mockedApi.refundOfficePayment).not.toHaveBeenCalled();
  });

  it('hides Void once a payment has a refund (matching the backend guard)', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [manualPayment()],
      refunds: [
        {
          id: 'refund-1',
          paymentId: 'pay-1',
          jobId: 'job-1',
          amount: 100,
          method: 'card',
          source: 'manual',
          currency: 'USD',
          refundedAt: '2026-06-14T00:00:00.000Z',
          recordedByName: 'Olivia Owner',
          allocations: [],
          createdAt: '2026-06-14T00:00:00.000Z',
          updatedAt: '2026-06-14T00:00:00.000Z'
        }
      ],
      onlineRefundRequests: []
    });

    renderSection(true);

    // Refund still offered (partial remaining), but Void is gone.
    expect(await screen.findByRole('button', { name: 'Refund' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });

  it('hides the Refund action without the payments:refund permission', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [manualPayment()],
      refunds: [],
      onlineRefundRequests: []
    });

    renderSection(true, { paymentPermissions: { canRefund: false } });

    expect(await screen.findByRole('button', { name: 'Void' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
  });

  it('offers an online Refund action (never a local Void) for provider-confirmed online payments', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [
        manualPayment({
          source: 'bellfieldPayments',
          provider: 'stripe',
          providerPaymentId: 'pi_123',
          providerSessionId: 'cs_123'
        })
      ],
      refunds: [],
      onlineRefundRequests: []
    });

    renderSection(true);

    expect(
      await screen.findByText((_, element) => element?.textContent === '$250.00 · Online card')
    ).toBeInTheDocument();
    // Online card payments now get an online Refund action, but never a local Void
    // (the refund is their reversal path; they are not manually voidable).
    expect(await screen.findByRole('button', { name: 'Refund' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });

  it('hides competing payment actions while a refund draft is open', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue({
      ...paidBalance,
      netBilled: 300,
      amountDue: 50
    });
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [manualPayment()],
      refunds: [],
      onlineRefundRequests: []
    });

    renderSection(true);

    expect(await screen.findByRole('button', { name: 'Create payment link' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));

    expect(screen.getByRole('button', { name: 'Record refund' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create payment link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });
});

function onlinePayment(overrides: Record<string, unknown> = {}) {
  return manualPayment({
    source: 'bellfieldPayments',
    provider: 'stripe',
    providerPaymentId: 'pi_123',
    providerSessionId: 'cs_123',
    ...overrides
  });
}

function onlineRefundRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'orr-1',
    paymentId: 'pay-1',
    amount: 100,
    currency: 'USD',
    status: 'requested' as const,
    submissionState: 'submitted' as const,
    requestedAt: '2026-06-15T00:00:00.000Z',
    ...overrides
  };
}

describe('JobInvoiceSection online refunds', () => {
  it('requests an online refund for a card payment and surfaces it pending', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments
      .mockResolvedValueOnce({ payments: [onlinePayment()], refunds: [], onlineRefundRequests: [] })
      // After the request, the reload picks up the new pending row.
      .mockResolvedValue({
        payments: [onlinePayment()],
        refunds: [],
        onlineRefundRequests: [onlineRefundRequest({ amount: 250 })]
      });
    mockedApi.requestOfficeOnlineRefund.mockResolvedValue({
      state: 'requested',
      refundRequestId: 'orr-1',
      amount: 250,
      currency: 'USD'
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request online refund' }));

    await waitFor(() =>
      expect(mockedApi.requestOfficeOnlineRefund).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'pay-1', amount: 250 })
      )
    );
    expect(await screen.findByText(/requested — pending confirmation/)).toBeInTheDocument();
  });

  it('shows a submitted pending refund and blocks a second request', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [onlinePayment()],
      refunds: [],
      onlineRefundRequests: [onlineRefundRequest()]
    });

    renderSection(true);

    expect(await screen.findByText(/requested — pending confirmation/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers Try again for a refund that never reached the processor', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [onlinePayment()],
      refunds: [],
      onlineRefundRequests: [onlineRefundRequest({ submissionState: 'needsResubmit' })]
    });

    renderSection(true);

    expect(await screen.findByText(/couldn't be submitted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // A fresh Refund is suppressed while the prior attempt is still resolvable.
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
  });

  it('re-offers Refund after a failed online refund', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [onlinePayment()],
      refunds: [],
      onlineRefundRequests: [onlineRefundRequest({ status: 'failed' })]
    });

    renderSection(true);

    expect(await screen.findByText(/didn't go through/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('surfaces the office-safe error when the processor cannot take the refund', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [onlinePayment()],
      refunds: [],
      onlineRefundRequests: []
    });
    mockedApi.requestOfficeOnlineRefund.mockResolvedValue({
      state: 'providerError',
      message: 'The refund could not be submitted right now. Please try again.'
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Refund' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request online refund' }));

    expect(
      await screen.findByText('The refund could not be submitted right now. Please try again.')
    ).toBeInTheDocument();
  });

  it('retries a needsResubmit refund by resubmitting the same amount directly', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments
      .mockResolvedValueOnce({
        payments: [onlinePayment()],
        refunds: [],
        onlineRefundRequests: [
          onlineRefundRequest({ submissionState: 'needsResubmit', amount: 100 })
        ]
      })
      .mockResolvedValue({
        payments: [onlinePayment()],
        refunds: [],
        onlineRefundRequests: [onlineRefundRequest({ amount: 100 })]
      });
    mockedApi.requestOfficeOnlineRefund.mockResolvedValue({
      state: 'requested',
      refundRequestId: 'orr-1',
      amount: 100,
      currency: 'USD'
    });

    renderSection(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    // Resubmits the original amount with no editable drawer (no second forked request).
    await waitFor(() =>
      expect(mockedApi.requestOfficeOnlineRefund).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'pay-1', amount: 100 })
      )
    );
    expect(screen.queryByRole('button', { name: 'Request online refund' })).not.toBeInTheDocument();
  });

  it('does NOT re-offer a refund when the processor accepted it but it could not be recorded', async () => {
    mockedApi.getOfficeInvoiceForJob.mockResolvedValueOnce({ invoice: postedInvoice() });
    mockedApi.getOfficeJobInvoiceBalance.mockResolvedValue(paidBalance);
    mockedApi.listOfficeJobPayments.mockResolvedValue({
      payments: [onlinePayment()],
      refunds: [],
      onlineRefundRequests: [onlineRefundRequest({ status: 'recordingFailed' })]
    });

    renderSection(true);

    // Money moved at the processor: surface support copy, never a re-request action.
    expect(
      await screen.findByText(/could not be recorded — contact BellField support/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
