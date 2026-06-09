import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settingsApi from '@/lib/operations-company-settings-api';
import { OfficeSettingsSurface } from './office-settings-surface';

vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeCompanySettings: vi.fn(),
  updateOfficeCompanySettings: vi.fn()
}));

const mockedApi = vi.mocked(settingsApi);

function arrange() {
  mockedApi.getOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.'
    }
  });
  mockedApi.updateOfficeCompanySettings.mockResolvedValue({
    settings: {
      companyName: 'BellField HVAC',
      estimateEmailSubject: 'Estimate from {companyName}',
      estimateEmailBody: 'Attached is your estimate.'
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

  it('shows the fixed BellField estimate sender without provider key controls', async () => {
    renderSurface();

    expect(await screen.findByLabelText('Estimate email from address')).toHaveValue(
      'estimates@bellfield.app'
    );
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.queryByText(/resend/i)).toBeNull();
  });

  it('renders read-only settings without configure permission', async () => {
    renderSurface(false);

    expect(await screen.findByLabelText('Company name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
  });
});
