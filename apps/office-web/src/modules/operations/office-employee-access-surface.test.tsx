import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EmployeeAdminDetailResponse,
  EmployeeRoleId,
  EmployeeSummary,
  RoleTemplate
} from '@bellfield/contracts';
import * as identityApi from '@/lib/identity-api';
import { OfficeEmployeeAccessSurface } from './office-employee-access-surface';
import { OfficeEmployeeCreateForm } from './office-employee-create-form';

vi.mock('@/lib/identity-api', () => ({
  getOfficeEmployees: vi.fn(),
  getOfficeRoles: vi.fn(),
  getEmployeeDetail: vi.fn(),
  updateOfficeEmployee: vi.fn(),
  createOfficeEmployee: vi.fn(),
  resetOfficeEmployeePassword: vi.fn(),
  revokeOfficeEmployeeSession: vi.fn()
}));

const mockedApi = vi.mocked(identityApi);

const roles: RoleTemplate[] = [
  {
    id: 'owner',
    name: 'Owner',
    description: '',
    permissions: [
      'employeesPermissions:view',
      'employeesPermissions:configure',
      'employeesPermissions:create',
      'jobs:view',
      'inventory:view',
      'register:edit',
      'register:create'
    ]
  },
  {
    id: 'admin',
    name: 'Admin',
    description: '',
    permissions: [
      'employeesPermissions:view',
      'employeesPermissions:configure',
      'jobs:view',
      'inventory:view',
      'register:edit'
    ]
  },
  { id: 'csr', name: 'CSR', description: '', permissions: ['jobs:view'] },
  {
    id: 'technician',
    name: 'Technician',
    description: '',
    permissions: ['inventory:view', 'register:edit']
  }
];

function employee(
  over: Partial<EmployeeSummary> & { id: string; roleId: EmployeeRoleId }
): EmployeeSummary {
  return {
    email: `${over.id}@bellfield.local`,
    displayName: over.id,
    roleName: over.roleId,
    isActive: true,
    effectivePermissions: [],
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] },
    ...over
  };
}

const ownerEmp = employee({
  id: 'e-owner',
  displayName: 'Olivia Owner',
  roleId: 'owner',
  roleName: 'Owner'
});
const adminEmp = employee({
  id: 'e-admin',
  displayName: 'Alex Admin',
  roleId: 'admin',
  roleName: 'Admin',
  effectivePermissions: ['employeesPermissions:view', 'employeesPermissions:configure']
});
const techEmp = employee({
  id: 'e-tech',
  displayName: 'Tina Tech',
  roleId: 'technician',
  roleName: 'Technician',
  isActive: false,
  permissionOverrides: {
    grantedPermissions: ['inventory:view'],
    revokedPermissions: ['register:create']
  }
});
const csrEmp = employee({ id: 'e-csr', displayName: 'Casey CSR', roleId: 'csr', roleName: 'CSR' });

const allEmployees = [ownerEmp, adminEmp, techEmp, csrEmp];

function detailFor(employeeId: string): EmployeeAdminDetailResponse {
  const found = allEmployees.find((candidate) => candidate.id === employeeId) ?? csrEmp;
  return {
    employee: found,
    sessions:
      employeeId === 'e-tech'
        ? [
            {
              id: 's1',
              surface: 'field-mobile',
              deviceLabel: 'Shop Tablet',
              issuedAt: '2026-06-01T00:00:00.000Z'
            }
          ]
        : []
  };
}

type SurfaceOpts = {
  canConfigure?: boolean;
  canCreate?: boolean;
  actorId?: string;
  actorRoleId?: EmployeeRoleId;
};

function renderSurface(opts: SurfaceOpts = {}) {
  render(
    <OfficeEmployeeAccessSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canConfigure={opts.canConfigure ?? false}
      canCreate={opts.canCreate ?? false}
      actorId={opts.actorId ?? 'e-owner'}
      actorRoleId={opts.actorRoleId ?? 'owner'}
    />
  );
}

async function selectEmployee(name: string) {
  fireEvent.click(await screen.findByText(name));
}

beforeEach(() => {
  mockedApi.getOfficeEmployees.mockResolvedValue({ employees: allEmployees });
  mockedApi.getOfficeRoles.mockResolvedValue({ roles });
  mockedApi.getEmployeeDetail.mockImplementation(async ({ employeeId }) => detailFor(employeeId));
  mockedApi.updateOfficeEmployee.mockResolvedValue(techEmp);
  mockedApi.createOfficeEmployee.mockResolvedValue(employee({ id: 'e-new', roleId: 'csr' }));
  mockedApi.resetOfficeEmployeePassword.mockResolvedValue({ revokedSessionCount: 2 });
  mockedApi.revokeOfficeEmployeeSession.mockResolvedValue({ revoked: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeEmployeeAccessSurface — read path', () => {
  it('renders the list with role, active state, and override count', async () => {
    renderSurface();
    expect(await screen.findByText('Olivia Owner')).toBeInTheDocument();
    expect(screen.getByText(/Owner · Active · 0 overrides/)).toBeInTheDocument();
    expect(screen.getByText(/Technician · Inactive · 2 overrides/)).toBeInTheDocument();
  });

  it('loads detail on select: overrides, sessions', async () => {
    renderSurface();
    await selectEmployee('Tina Tech');
    expect(await screen.findByText(/e-tech@bellfield\.local/)).toBeInTheDocument();
    expect(screen.getByText('+ inventory:view')).toBeInTheDocument();
    expect(screen.getByText('− register:create')).toBeInTheDocument();
    expect(screen.getByText('Shop Tablet')).toBeInTheDocument();
  });

  it('clears previous detail when the next selection fails to load', async () => {
    mockedApi.getEmployeeDetail.mockImplementation(async ({ employeeId }) => {
      if (employeeId === 'e-owner') throw new Error('Detail boom');
      return detailFor(employeeId);
    });
    renderSurface();
    await selectEmployee('Tina Tech');
    expect(await screen.findByText(/e-tech@bellfield\.local/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Olivia Owner'));
    await waitFor(() => expect(screen.getByText('Detail boom')).toBeInTheDocument());
    expect(screen.queryByText(/e-tech@bellfield\.local/)).toBeNull();
  });

  it('surfaces a list load error', async () => {
    mockedApi.getOfficeEmployees.mockRejectedValue(new Error('Forbidden'));
    renderSurface();
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });
});

describe('OfficeEmployeeAccessSurface — gating', () => {
  it('shows no mutation controls for a view-only user', async () => {
    renderSurface({ canConfigure: false, actorId: 'e-admin', actorRoleId: 'admin' });
    await selectEmployee('Tina Tech');
    expect(await screen.findByText(/e-tech@bellfield\.local/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revoke session/ })).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });

  it('shows mutation controls for a configure user', async () => {
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Tina Tech');
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke session s1' })).toBeInTheDocument();
  });

  it('hides the New employee button without employeesPermissions:create', async () => {
    renderSurface({ canCreate: false });
    await screen.findByText('Olivia Owner');
    expect(screen.queryByRole('button', { name: 'New employee' })).not.toBeInTheDocument();
  });

  it('opens the create form with employeesPermissions:create', async () => {
    renderSurface({ canCreate: true, actorRoleId: 'owner' });
    fireEvent.click(await screen.findByRole('button', { name: 'New employee' }));
    expect(await screen.findByRole('button', { name: 'Create employee' })).toBeInTheDocument();
  });

  it('hides New employee when the role reference data failed to load', async () => {
    mockedApi.getOfficeRoles.mockRejectedValue(new Error('roles down'));
    renderSurface({ canCreate: true, actorRoleId: 'owner' });
    await screen.findByText('Olivia Owner'); // list still renders
    expect(screen.queryByRole('button', { name: 'New employee' })).not.toBeInTheDocument();
  });
});

describe('OfficeEmployeeCreateForm — defensive guard', () => {
  it('disables submit and warns when no role options are available', () => {
    render(
      <OfficeEmployeeCreateForm
        roles={[]}
        actorRoleId="owner"
        apiBaseUrl="http://api.test"
        sessionToken="session-token"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText(/Role reference data isn't loaded yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create employee' })).toBeDisabled();
  });
});

describe('OfficeEmployeeAccessSurface — protections', () => {
  it('disables self-deactivation (active toggle) on your own account', async () => {
    renderSurface({ canConfigure: true, actorId: 'e-admin', actorRoleId: 'admin' });
    await selectEmployee('Alex Admin');
    expect(await screen.findByLabelText('Active')).toBeDisabled();
    expect(
      screen.getByText(/can't deactivate or remove the access of your own account/i)
    ).toBeInTheDocument();
  });

  it('owner-protection: an admin sees no mutation controls on an owner', async () => {
    renderSurface({ canConfigure: true, actorId: 'e-admin', actorRoleId: 'admin' });
    await selectEmployee('Olivia Owner');
    expect(await screen.findByText(/Only an owner can modify another owner/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument();
  });
});

describe('OfficeEmployeeAccessSurface — mutations', () => {
  it('saves override chip changes with the right grant/revoke payload', async () => {
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Casey CSR');
    await screen.findByText(/e-csr@bellfield\.local/);

    fireEvent.change(screen.getByLabelText('Permission to override'), {
      target: { value: 'inventory:view' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
    fireEvent.change(screen.getByLabelText('Permission to override'), {
      target: { value: 'jobs:view' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockedApi.updateOfficeEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'e-csr',
          grantedPermissions: ['inventory:view'],
          revokedPermissions: ['jobs:view']
        })
      );
    });
  });

  it('surfaces a server error when a save is rejected', async () => {
    mockedApi.updateOfficeEmployee.mockRejectedValue(new Error('Save boom'));
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Tina Tech');
    fireEvent.click(await screen.findByLabelText('Active')); // make the draft dirty
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Save boom')).toBeInTheDocument());
  });

  it('revokes a device session after the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Tina Tech');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke session s1' }));
    await waitFor(() => {
      expect(mockedApi.revokeOfficeEmployeeSession).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'e-tech', sessionId: 's1' })
      );
    });
  });

  it('does not revoke a session when the user cancels the confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Tina Tech');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke session s1' }));
    expect(mockedApi.revokeOfficeEmployeeSession).not.toHaveBeenCalled();
  });

  it('resets a password (min length + confirm) and reports revoked sessions', async () => {
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Tina Tech');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brandnew123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'brandnew123' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() => {
      expect(mockedApi.resetOfficeEmployeePassword).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'e-tech', password: 'brandnew123' })
      );
    });
    expect(await screen.findByText(/Revoked 2 session\(s\)/)).toBeInTheDocument();
  });

  it('blocks a too-short password reset before calling the API', async () => {
    renderSurface({ canConfigure: true, actorId: 'e-owner', actorRoleId: 'owner' });
    await selectEmployee('Tina Tech');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled();
    expect(mockedApi.resetOfficeEmployeePassword).not.toHaveBeenCalled();
  });

  it('creates an employee and surfaces a create error', async () => {
    mockedApi.createOfficeEmployee.mockRejectedValueOnce(new Error('Create boom'));
    renderSurface({ canCreate: true, actorRoleId: 'owner' });
    fireEvent.click(await screen.findByRole('button', { name: 'New employee' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new.person@bellfield.local' }
    });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New Person' } });
    fireEvent.change(screen.getByLabelText('Temporary password'), {
      target: { value: 'supersecret1' }
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'supersecret1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    await waitFor(() => expect(screen.getByText('Create boom')).toBeInTheDocument());
    expect(mockedApi.createOfficeEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new.person@bellfield.local', displayName: 'New Person' })
    );
  });
});
