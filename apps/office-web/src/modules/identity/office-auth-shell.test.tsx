import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityApi from '@/lib/identity-api';
import { OfficeAuthShell } from './office-auth-shell';

vi.mock('@/lib/identity-api', () => ({
  createFirstOwner: vi.fn(),
  getOfficeSetupStatus: vi.fn(),
  loginToOfficeApi: vi.fn()
}));

vi.mock('@/modules/operations/office-workspace-shell', () => ({
  OfficeWorkspaceShell: ({ initialEmployee }: { initialEmployee: { displayName: string } }) => (
    <div>Workspace for {initialEmployee.displayName}</div>
  )
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.mocked(identityApi.getOfficeSetupStatus).mockResolvedValue({ setupRequired: false });
});

describe('OfficeAuthShell', () => {
  it('does not expose demo credentials in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    render(<OfficeAuthShell />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Owner: owner@bellfield.local' })).toBeNull();
    expect(screen.queryByDisplayValue('owner@bellfield.local')).toBeNull();
    expect(screen.queryByDisplayValue('bellfield-owner')).toBeNull();
  });

  it('keeps demo shortcuts available outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    render(<OfficeAuthShell />);

    expect(screen.getByLabelText('Email')).toHaveValue('owner@bellfield.local');
    expect(screen.getByLabelText('Password')).toHaveValue('bellfield-owner');
    expect(
      screen.getByRole('button', { name: 'Owner: owner@bellfield.local' })
    ).toBeInTheDocument();
  });

  it('shows the API lockout message on sign-in', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(identityApi.loginToOfficeApi).mockRejectedValue(
      new Error('Too many sign-in attempts. Try again in 5 minutes.')
    );

    render(<OfficeAuthShell />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Too many sign-in attempts. Try again in 5 minutes.')
    ).toBeInTheDocument();
  });

  it('swaps to first-owner setup when the API reports setup mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(identityApi.getOfficeSetupStatus).mockResolvedValue({ setupRequired: true });
    vi.mocked(identityApi.createFirstOwner).mockResolvedValue({
      sessionToken: 'session-1',
      employee: {
        id: 'owner-1',
        email: 'owner@example.com',
        displayName: 'First Owner',
        roleId: 'owner',
        roleName: 'Owner',
        isActive: true,
        effectivePermissions: [],
        permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
      }
    });

    render(<OfficeAuthShell />);

    expect(
      await screen.findByRole('heading', { name: 'Create owner account' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Setup token'), { target: { value: 'setup-token' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'First Owner' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'owner-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create owner' }));

    await waitFor(() => {
      expect(identityApi.createFirstOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          setupToken: 'setup-token',
          displayName: 'First Owner',
          email: 'owner@example.com',
          password: 'owner-password'
        })
      );
    });
    expect(await screen.findByText('Workspace for First Owner')).toBeInTheDocument();
  });

  it('blocks first-owner setup passwords under twelve characters', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(identityApi.getOfficeSetupStatus).mockResolvedValue({ setupRequired: true });

    render(<OfficeAuthShell />);

    expect(
      await screen.findByRole('heading', { name: 'Create owner account' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Setup token'), { target: { value: 'setup-token' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'First Owner' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'shortpass11' } });

    expect(screen.getByText('At least 12 characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create owner' })).toBeDisabled();
    expect(identityApi.createFirstOwner).not.toHaveBeenCalled();
  });
});
