import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settingsApi from '@/lib/operations-company-settings-api';
import { OfficeSettingsSurface } from './office-settings-surface';

vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeEstimateEmailDeliveryStatus: vi.fn(),
  getOfficeCompanySettings: vi.fn(),
  updateOfficeCompanySettings: vi.fn()
}));

const mockedApi = vi.mocked(settingsApi);

function arrange() {
  mockedApi.getOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField',
      replyToEmail: 'office@example.com',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.',
      chargesSalesTax: true,
      defaultSalesTaxBasisPoints: 825
    }
  });
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
      chargesSalesTax: true,
      defaultSalesTaxBasisPoints: 875
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
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(mockedApi.updateOfficeCompanySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBaseUrl: 'http://api.test',
          sessionToken: 'session-token',
          companyName: 'BellField HVAC',
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
    expect(screen.getByLabelText('Charge sales tax')).toBeChecked();
    expect(screen.getByLabelText('Default sales tax rate')).toHaveValue(8.25);
    expect(screen.queryByLabelText('Estimate email from address')).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByText(/resend/i)).toBeNull();
    expect(mockedApi.getOfficeEstimateEmailDeliveryStatus).not.toHaveBeenCalled();
  });

  it('renders read-only settings without configure permission', async () => {
    renderSurface(false);

    expect(await screen.findByLabelText('Company name')).toBeDisabled();
    expect(screen.getByLabelText('Charge sales tax')).toBeDisabled();
    expect(screen.getByLabelText('Default sales tax rate')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
  });
});
