import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmployeeAdminDetailResponse, EmployeeSummary } from '@bellfield/contracts';
import * as identityApi from '@/lib/identity-api';
import { OfficeEmployeeAccessSurface } from './office-employee-access-surface';

vi.mock('@/lib/identity-api', () => ({
  getOfficeEmployees: vi.fn(),
  getEmployeeDetail: vi.fn()
}));

const mockedApi = vi.mocked(identityApi);

const owner: EmployeeSummary = {
  id: 'e-owner',
  email: 'olivia@bellfield.local',
  displayName: 'Olivia Owner',
  roleId: 'owner',
  roleName: 'Owner',
  isActive: true,
  effectivePermissions: ['jobs:view', 'jobs:create'],
  permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
};

const tech: EmployeeSummary = {
  id: 'e-tech',
  email: 'tina@bellfield.local',
  displayName: 'Tina Tech',
  roleId: 'technician',
  roleName: 'Technician',
  isActive: false,
  effectivePermissions: ['inventory:view', 'register:edit'],
  permissionOverrides: {
    grantedPermissions: ['inventory:view'],
    revokedPermissions: ['register:create']
  }
};

const techDetail: EmployeeAdminDetailResponse = {
  employee: tech,
  sessions: [
    {
      id: 's1',
      surface: 'field-mobile',
      deviceLabel: 'Shop Tablet',
      issuedAt: '2026-06-01T00:00:00.000Z'
    }
  ]
};

function renderSurface() {
  render(<OfficeEmployeeAccessSurface apiBaseUrl="http://api.test" sessionToken="session-token" />);
}

beforeEach(() => {
  mockedApi.getOfficeEmployees.mockResolvedValue({ employees: [owner, tech] });
  mockedApi.getEmployeeDetail.mockResolvedValue(techDetail);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeEmployeeAccessSurface (read path)', () => {
  it('renders the employee list with role, active state, and override count', async () => {
    renderSurface();
    expect(await screen.findByText('Olivia Owner')).toBeInTheDocument();
    expect(screen.getByText('Tina Tech')).toBeInTheDocument();
    expect(screen.getByText(/Owner · Active · 0 overrides/)).toBeInTheDocument();
    expect(screen.getByText(/Technician · Inactive · 2 overrides/)).toBeInTheDocument();
  });

  it('loads detail on select: overrides, effective permissions, and sessions', async () => {
    renderSurface();
    fireEvent.click(await screen.findByText('Tina Tech'));
    // Detail loaded for the selected employee.
    expect(await screen.findByText(/tina@bellfield\.local/)).toBeInTheDocument();
    expect(mockedApi.getEmployeeDetail).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'e-tech' })
    );
    // Override chips (grant + revoke) and a session row.
    expect(screen.getByText('+ inventory:view')).toBeInTheDocument();
    expect(screen.getByText('− register:create')).toBeInTheDocument();
    expect(screen.getByText('Shop Tablet')).toBeInTheDocument();
    expect(screen.getByText('field-mobile')).toBeInTheDocument();
  });

  it('prompts to select an employee before any is chosen', async () => {
    renderSurface();
    await screen.findByText('Olivia Owner');
    expect(screen.getByText('Select an employee to view their access.')).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    mockedApi.getOfficeEmployees.mockRejectedValue(new Error('Forbidden'));
    renderSurface();
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });

  it('clears the previous detail when the next selected employee fails to load', async () => {
    mockedApi.getEmployeeDetail
      .mockResolvedValueOnce(techDetail) // Tina loads
      .mockRejectedValueOnce(new Error('Detail boom')); // Olivia fails
    renderSurface();
    fireEvent.click(await screen.findByText('Tina Tech'));
    expect(await screen.findByText(/tina@bellfield\.local/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Olivia Owner'));
    await waitFor(() => expect(screen.getByText('Detail boom')).toBeInTheDocument());
    // Tina's detail must not linger behind the error.
    expect(screen.queryByText(/tina@bellfield\.local/)).toBeNull();
  });
});
