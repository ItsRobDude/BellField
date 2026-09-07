import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityApi from '@/lib/identity-api';
import { OfficeAuthShell } from './office-auth-shell';

vi.mock('@/lib/identity-api', () => ({
  createFirstOwner: vi.fn(),
  getCurrentOfficeSession: vi.fn(),
  getOfficeSetupStatus: vi.fn(),
  loginToOfficeApi: vi.fn(),
  OfficeIdentityApiError: class OfficeIdentityApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code?: string
    ) {
      super(message);
      this.name = 'OfficeIdentityApiError';
    }
  }
}));

type MockWorkspaceProps = {
  initialEmployee: { displayName: string };
  onSignOut?: () => void;
  onSessionExpired?: (message: string) => void;
};

vi.mock('@/modules/operations/office-workspace-shell', () => ({
  OfficeWorkspaceShell: ({ initialEmployee, onSignOut, onSessionExpired }: MockWorkspaceProps) => (
    <div>
      Workspace for {initialEmployee.displayName}
      <button type="button" onClick={() => onSignOut?.()}>
        Sign out
      </button>
      <button
        type="button"
        onClick={() => onSessionExpired?.('Session expired. Please sign in again.')}
      >
        Expire workspace session
      </button>
    </div>
  )
}));

const sessionStorageKey = 'bellfield.office.session';

function buildEmployee() {
  return {
    id: 'owner-1',
    email: 'owner@example.com',
    displayName: 'First Owner',
    roleId: 'owner' as const,
    roleName: 'Owner',
    isActive: true,
    effectivePermissions: [],
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  };
}

function rememberSession(
  session = { sessionToken: 'session-9', apiBaseUrl: 'http://office-pc:3001' }
) {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
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

  it('returns to sign-in with the server message when the workspace session expires', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(identityApi.loginToOfficeApi).mockResolvedValue({
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

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'owner-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Workspace for First Owner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expire workspace session' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Session expired. Please sign in again.')).toBeInTheDocument();
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

describe('OfficeAuthShell remembered sessions', () => {
  it('restores a remembered session without asking for credentials', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    rememberSession();
    vi.mocked(identityApi.getCurrentOfficeSession).mockResolvedValue({ employee: buildEmployee() });

    render(<OfficeAuthShell />);

    expect(screen.getByText('Signing you back in...')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(await screen.findByText('Workspace for First Owner')).toBeInTheDocument();
    expect(identityApi.getCurrentOfficeSession).toHaveBeenCalledWith({
      sessionToken: 'session-9',
      apiBaseUrl: 'http://office-pc:3001'
    });
    expect(identityApi.loginToOfficeApi).not.toHaveBeenCalled();
  });

  it('forgets a remembered session the server no longer accepts', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    rememberSession();
    vi.mocked(identityApi.getCurrentOfficeSession).mockRejectedValue(
      new identityApi.OfficeIdentityApiError(
        'Session expired. Please sign in again.',
        401,
        'sessionExpired'
      )
    );

    render(<OfficeAuthShell />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Session expired. Please sign in again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Server URL')).toHaveValue('http://office-pc:3001');
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
  });

  it('keeps a remembered session when the server cannot be reached', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    rememberSession();
    vi.mocked(identityApi.getCurrentOfficeSession).mockRejectedValue(
      new TypeError('Failed to fetch')
    );

    render(<OfficeAuthShell />);

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Could not reach the server to continue your session. Check the server address and sign in again.'
      )
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(sessionStorageKey)).not.toBeNull();
  });

  it('remembers a fresh sign-in and forgets it on sign out', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(identityApi.loginToOfficeApi).mockResolvedValue({
      sessionToken: 'session-1',
      employee: buildEmployee()
    });

    render(<OfficeAuthShell />);

    fireEvent.change(screen.getByLabelText('Server URL'), {
      target: { value: 'http://office-pc:3001' }
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'owner-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Workspace for First Owner')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(sessionStorageKey) ?? 'null')).toEqual({
      sessionToken: 'session-1',
      apiBaseUrl: 'http://office-pc:3001'
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
    expect(screen.getByLabelText('Server URL')).toHaveValue('http://office-pc:3001');
  });
});
