import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settingsApi from '@/lib/operations-company-settings-api';
import { OfficeSettingsSurface } from './office-settings-surface';

vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeEstimateEmailDeliveryStatus: vi.fn(),
  getOfficeCompanySettings: vi.fn(),
  updateOfficeCompanySettings: vi.fn(),
  getOfficeInvoiceNumbering: vi.fn(),
  updateOfficeInvoiceNumbering: vi.fn()
}));

const mockedApi = vi.mocked(settingsApi);

function arrange() {
  mockedApi.getOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField',
      replyToEmail: 'office@example.com',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.',
      invoiceEmailSubject: 'Invoice {jobNumber} from {companyName}',
      invoiceEmailBody: 'Attached is your invoice.',
      acceptanceLinkExpiryDays: 30,
      chargesSalesTax: true,
      defaultSalesTaxBasisPoints: 825,
      includeInvoicePaymentLink: false,
      sendPaymentReceipts: true,
      paymentReceiptEmailSubject: 'Receipt from {companyName}',
      paymentReceiptEmailBody: 'We received your {receiptKind} of {amount}.',
      sendRefundReceipts: true,
      refundReceiptEmailSubject: 'Refund from {companyName}',
      refundReceiptEmailBody: 'We issued a refund of {amount}.'
    }
  });
  mockedApi.getOfficeInvoiceNumbering.mockResolvedValue({ numbering: { nextNumber: 1 } });
  mockedApi.getOfficeEstimateEmailDeliveryStatus.mockResolvedValue({
    deliveryStatus: {
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Estimate email is ready.'
    }
  });
  mockedApi.updateOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField HVAC',
      replyToEmail: 'office@example.com',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.',
      invoiceEmailSubject: 'Invoice {jobNumber} from {companyName}',
      invoiceEmailBody: 'Attached is your invoice.',
      acceptanceLinkExpiryDays: 30,
      chargesSalesTax: true,
      defaultSalesTaxBasisPoints: 875,
      includeInvoicePaymentLink: true,
      sendPaymentReceipts: true,
      paymentReceiptEmailSubject: 'Receipt from {companyName}',
      paymentReceiptEmailBody: 'We received your {receiptKind} of {amount}.',
      sendRefundReceipts: true,
      refundReceiptEmailSubject: 'Refund from {companyName}',
      refundReceiptEmailBody: 'We issued a refund of {amount}.'
    }
  });
}

function renderSurface(canConfigure = true) {
  render(
    <OfficeSettingsSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canConfigure={canConfigure}
    />
  );
}

beforeEach(() => {
  arrange();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeSettingsSurface', () => {
  it('loads and saves company email settings', async () => {
    renderSurface();
    fireEvent.change(await screen.findByLabelText('Company name'), {
      target: { value: 'BellField HVAC' }
    });
    fireEvent.change(screen.getByLabelText('Default sales tax rate'), {
      target: { value: '8.75' }
    });
    fireEvent.change(screen.getByLabelText('Invoice email subject'), {
      target: { value: 'Invoice for {jobNumber}' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(mockedApi.updateOfficeCompanySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBaseUrl: 'http://api.test',
          sessionToken: 'session-token',
          companyName: 'BellField HVAC',
          invoiceEmailSubject: 'Invoice for {jobNumber}',
          invoiceEmailBody: 'Attached is your invoice.',
          chargesSalesTax: true,
          defaultSalesTaxBasisPoints: 875
        })
      );
    });
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });

  it('shows editable company email settings without provider controls', async () => {
    renderSurface();

    expect(await screen.findByLabelText('Reply-to email')).toHaveValue('office@example.com');
    expect(screen.getByLabelText('Invoice email subject')).toHaveValue(
      'Invoice {jobNumber} from {companyName}'
    );
    expect(screen.getByLabelText('Charge sales tax')).toBeChecked();
    expect(screen.getByLabelText('Default sales tax rate')).toHaveValue(8.25);
    expect(screen.queryByLabelText('Estimate email from address')).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByText(/resend/i)).toBeNull();
    expect(mockedApi.getOfficeEstimateEmailDeliveryStatus).not.toHaveBeenCalled();
  });

  it('preserves the saved default tax rate when sales tax is turned off', async () => {
    renderSurface();

    fireEvent.click(await screen.findByLabelText('Charge sales tax'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(mockedApi.updateOfficeCompanySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          chargesSalesTax: false,
          defaultSalesTaxBasisPoints: 825
        })
      );
    });
  });

  it('rejects a blank default tax rate with a message about the blank, not the range', async () => {
    renderSurface();

    fireEvent.change(await screen.findByLabelText('Default sales tax rate'), {
      target: { value: '' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(
      await screen.findByText(
        'Enter a default sales tax rate (use 0 if the company does not charge tax).'
      )
    ).toBeInTheDocument();
    expect(mockedApi.updateOfficeCompanySettings).not.toHaveBeenCalled();
  });

  it('rejects sub-basis-point tax input instead of silently rounding it', async () => {
    renderSurface();

    fireEvent.change(await screen.findByLabelText('Default sales tax rate'), {
      target: { value: '8.255' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(
      await screen.findByText(
        'Default sales tax rate supports up to two decimal places (e.g. 8.25).'
      )
    ).toBeInTheDocument();
    expect(mockedApi.updateOfficeCompanySettings).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range default tax rate', async () => {
    renderSurface();

    fireEvent.change(await screen.findByLabelText('Default sales tax rate'), {
      target: { value: '26' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(
      await screen.findByText('Default sales tax rate must be between 0% and 25%.')
    ).toBeInTheDocument();
    expect(mockedApi.updateOfficeCompanySettings).not.toHaveBeenCalled();
  });

  it('renders read-only settings without configure permission', async () => {
    renderSurface(false);

    expect(await screen.findByLabelText('Company name')).toBeDisabled();
    expect(screen.getByLabelText('Invoice email body')).toBeDisabled();
    expect(screen.getByLabelText('Charge sales tax')).toBeDisabled();
    expect(screen.getByLabelText('Default sales tax rate')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
  });
});
