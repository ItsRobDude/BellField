import type { EmployeeRecord } from './identity-access.types';

export const seededEmployees: EmployeeRecord[] = [
  {
    id: 'employee-owner-1',
    email: 'owner@bellfield.local',
    displayName: 'Olivia Owner',
    roleId: 'owner',
    isActive: true,
    password: 'bellfield-owner',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  },
  {
    id: 'employee-admin-1',
    email: 'admin@bellfield.local',
    displayName: 'Alex Admin',
    roleId: 'admin',
    isActive: true,
    password: 'bellfield-admin',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  },
  {
    id: 'employee-csr-1',
    email: 'csr@bellfield.local',
    displayName: 'Casey CSR',
    roleId: 'csr',
    isActive: true,
    password: 'bellfield-csr',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  },
  {
    id: 'employee-dispatcher-1',
    email: 'dispatcher@bellfield.local',
    displayName: 'Dylan Dispatcher',
    roleId: 'dispatcher',
    isActive: true,
    password: 'bellfield-dispatch',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  },
  {
    id: 'employee-bookkeeping-1',
    email: 'bookkeeping@bellfield.local',
    displayName: 'Bailey Book Keeping',
    roleId: 'bookKeeping',
    isActive: true,
    password: 'bellfield-books',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  },
  {
    id: 'employee-technician-1',
    email: 'tech@bellfield.local',
    displayName: 'Taylor Technician',
    roleId: 'technician',
    isActive: true,
    password: 'bellfield-tech',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  }
];
