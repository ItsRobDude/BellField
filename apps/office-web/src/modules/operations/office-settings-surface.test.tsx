import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settingsApi from '@/lib/operations-company-settings-api';
import { OfficeSettingsSurface } from './office-settings-surface';

vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeCompanySettings: vi.fn(),
  updateOfficeCompanySettings: vi.fn(),
  updateOfficeEmailProviderSecret: vi.fn()
}));

const mockedApi = vi.mocked(settingsApi);

function arrange() {
  mockedApi.getOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField',
      customerFacingSenderName: 'BellField Estimates',
      customerFacingFromEmail: 'estimates@bellfield.app',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.',
      emailProvider: { provider: 'resend', configured: false }
    }
  });
  mockedApi.updateOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField HVAC',
      customerFacingSenderName: 'BellField Estimates',
      customerFacingFromEmail: 'estimates@bellfield.app',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.',
      emailProvider: { provider: 'resend', configured: false }
    }
  });
  mockedApi.updateOfficeEmailProviderSecret.mockResolvedValue({
    emailProvider: {
      provider: 'resend',
      configured: true,
      lastConfiguredAt: '2026-06-09T00:00:00.000Z',
      lastConfiguredByName: 'Owner'
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
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(mockedApi.updateOfficeCompanySettings).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBaseUrl: 'http://api.test',
          sessionToken: 'session-token',
          companyName: 'BellField HVAC'
        })
      );
    });
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });

  it('keeps provider secret write-only and saves it separately', async () => {
    renderSurface();
    fireEvent.change(await screen.findByLabelText('Resend API key'), {
      target: { value: 're_12345678901234567890' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save provider key' }));

    await waitFor(() => {
      expect(mockedApi.updateOfficeEmailProviderSecret).toHaveBeenCalledWith({
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token',
        provider: 'resend',
        apiKey: 're_12345678901234567890'
      });
    });
    expect(await screen.findByText('Email provider key saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Resend API key')).toHaveValue('');
  });

  it('renders read-only settings without configure permission', async () => {
    renderSurface(false);

    expect(await screen.findByLabelText('Company name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    expect(screen.queryByLabelText('Resend API key')).toBeNull();
  });
});
