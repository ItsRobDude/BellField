import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settingsApi from '@/lib/operations-company-settings-api';
import { OnlinePaymentsSettingsPanel } from './online-payments-settings-panel';

vi.mock('@/lib/operations-company-settings-api', () => ({
  getOfficeOnlinePaymentsSetupStatus: vi.fn(),
  createOfficeOnlinePaymentsSetupLink: vi.fn(),
  refreshOfficeOnlinePaymentsSetupLink: vi.fn()
}));

const mockedApi = vi.mocked(settingsApi);

function renderPanel(canConfigure = true) {
  render(
    <OnlinePaymentsSettingsPanel
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canConfigure={canConfigure}
    />
  );
}

beforeEach(() => {
  mockedApi.getOfficeOnlinePaymentsSetupStatus.mockResolvedValue({ status: 'notStarted' });
  mockedApi.createOfficeOnlinePaymentsSetupLink.mockResolvedValue({
    status: 'actionRequired',
    onboardingUrl: 'https://connect.stripe.test/setup',
    onboardingUrlExpiresAt: '2026-06-18T12:00:00.000Z'
  });
  mockedApi.refreshOfficeOnlinePaymentsSetupLink.mockResolvedValue({
    status: 'actionRequired',
    onboardingUrl: 'https://connect.stripe.test/refresh',
    onboardingUrlExpiresAt: '2026-06-18T12:00:00.000Z'
  });
  vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false }) as Window);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OnlinePaymentsSettingsPanel', () => {
  it.each([
    ['notStarted', 'Online payments are not set up yet.', 'Set up online payments'],
    [
      'actionRequired',
      'Continue setup so invoice and deposit payment links can be used.',
      'Continue setup'
    ],
    ['pendingReview', 'Online payments are almost ready. We are finishing verification.', null],
    ['ready', 'Online payments ready.', null],
    ['disabled', 'Online payments are disabled.', null]
  ] as const)('renders the %s state', async (status, copy, actionLabel) => {
    mockedApi.getOfficeOnlinePaymentsSetupStatus.mockResolvedValueOnce({ status });

    renderPanel();

    expect(await screen.findByText(copy)).toBeInTheDocument();
    if (actionLabel) {
      expect(screen.getByRole('button', { name: actionLabel })).toBeInTheDocument();
    } else {
      expect(
        screen.queryByRole('button', { name: /Set up online payments|Continue setup/ })
      ).toBeNull();
    }
  });

  it('opens the hosted setup link for a new setup', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Set up online payments' }));

    await waitFor(() => {
      expect(mockedApi.createOfficeOnlinePaymentsSetupLink).toHaveBeenCalledWith({
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      });
    });
    expect(window.open).toHaveBeenCalledWith(
      'https://connect.stripe.test/setup',
      '_blank',
      'noopener,noreferrer'
    );
    expect(await screen.findByText('Online payments setup opened.')).toBeInTheDocument();
  });

  it('reports when the hosted setup link is blocked', async () => {
    vi.mocked(window.open).mockReturnValueOnce(null);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Set up online payments' }));

    expect(
      await screen.findByText('Online payments setup could not open. Allow pop-ups and try again.')
    ).toBeInTheDocument();
  });

  it('uses the refresh setup link when continuing an incomplete setup', async () => {
    mockedApi.getOfficeOnlinePaymentsSetupStatus.mockResolvedValueOnce({
      status: 'actionRequired'
    });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue setup' }));

    await waitFor(() => {
      expect(mockedApi.refreshOfficeOnlinePaymentsSetupLink).toHaveBeenCalledWith({
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token'
      });
    });
    expect(window.open).toHaveBeenCalledWith(
      'https://connect.stripe.test/refresh',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('refreshes status without opening setup', async () => {
    mockedApi.getOfficeOnlinePaymentsSetupStatus
      .mockResolvedValueOnce({ status: 'pendingReview' })
      .mockResolvedValueOnce({ status: 'ready' });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh status' }));

    expect(await screen.findByText('Online payments ready.')).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('shows one calm line when the relay message matches the panel copy', async () => {
    mockedApi.getOfficeOnlinePaymentsSetupStatus.mockResolvedValueOnce({
      status: 'pendingReview',
      message: 'Online payments are almost ready. We are finishing verification.'
    });
    renderPanel();

    expect(
      await screen.findAllByText('Online payments are almost ready. We are finishing verification.')
    ).toHaveLength(1);
  });
});
