import type {
  EmployeeRoleId,
  PermissionAction,
  PermissionArea,
  PermissionKey,
  RoleTemplate
} from './identity-access.types';

function permissionKeys(area: PermissionArea, actions: PermissionAction[]): PermissionKey[] {
  return actions.map((action): PermissionKey => `${area}:${action}`);
}

function uniquePermissions(permissions: PermissionKey[]): PermissionKey[] {
  return [...new Set(permissions)];
}

const officeCore = [
  ...permissionKeys('customers', ['view', 'create', 'edit']),
  ...permissionKeys('locations', ['view', 'create', 'edit']),
  ...permissionKeys('contacts', ['view', 'create', 'edit']),
  ...permissionKeys('equipment', ['view', 'create', 'edit']),
  ...permissionKeys('jobs', ['view', 'create', 'edit']),
  ...permissionKeys('appointmentsDispatch', ['view', 'create', 'edit']),
  ...permissionKeys('register', ['view', 'create', 'edit']),
  ...permissionKeys('media', ['view', 'create', 'edit']),
  ...permissionKeys('estimates', ['view', 'create', 'edit'])
];

const adminCore = [
  ...officeCore,
  ...permissionKeys('equipment', ['configure']),
  ...permissionKeys('invoices', ['view', 'create', 'edit', 'post']),
  ...permissionKeys('payments', ['view', 'create', 'edit']),
  ...permissionKeys('purchasing', ['view', 'create', 'edit']),
  ...permissionKeys('inventory', ['view', 'create', 'edit']),
  ...permissionKeys('reports', ['view', 'export']),
  ...permissionKeys('employeesPermissions', ['view', 'configure']),
  ...permissionKeys('companySettings', ['view', 'configure']),
  ...permissionKeys('supportLogsBackups', ['view', 'export'])
];

const ownerPermissions = [
  ...adminCore,
  ...permissionKeys('customers', ['delete']),
  ...permissionKeys('locations', ['delete']),
  ...permissionKeys('contacts', ['delete']),
  ...permissionKeys('equipment', ['delete']),
  ...permissionKeys('jobs', ['delete', 'configure']),
  ...permissionKeys('appointmentsDispatch', ['delete', 'configure']),
  ...permissionKeys('register', ['delete', 'configure']),
  ...permissionKeys('media', ['delete', 'configure']),
  ...permissionKeys('estimates', ['delete', 'approve']),
  ...permissionKeys('invoices', ['delete', 'approve', 'configure']),
  ...permissionKeys('payments', ['delete', 'configure']),
  ...permissionKeys('purchasing', ['delete', 'approve', 'configure']),
  ...permissionKeys('inventory', ['delete', 'configure']),
  ...permissionKeys('reports', ['configure']),
  ...permissionKeys('employeesPermissions', ['create', 'edit', 'delete']),
  ...permissionKeys('companySettings', ['create', 'edit', 'delete']),
  ...permissionKeys('supportLogsBackups', ['configure'])
];

export const defaultRoleTemplates: Record<EmployeeRoleId, RoleTemplate> = {
  owner: {
    id: 'owner',
    name: 'Owner',
    description: 'Full business, settings, and employee authority.',
    permissions: uniquePermissions(ownerPermissions)
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    description: 'Broad operational and employee-management control.',
    permissions: uniquePermissions([...adminCore, ...permissionKeys('jobs', ['configure'])])
  },
  csr: {
    id: 'csr',
    name: 'CSR',
    description: 'Broad customer, scheduling, and intake access.',
    permissions: uniquePermissions([
      ...officeCore,
      ...permissionKeys('equipment', ['configure']),
      ...permissionKeys('invoices', ['view']),
      ...permissionKeys('payments', ['view'])
    ])
  },
  dispatcher: {
    id: 'dispatcher',
    name: 'Dispatcher',
    description: 'Scheduling and dispatch focused office access.',
    permissions: uniquePermissions([
      ...officeCore,
      ...permissionKeys('equipment', ['configure']),
      ...permissionKeys('invoices', ['view']),
      ...permissionKeys('reports', ['view'])
    ])
  },
  bookKeeping: {
    id: 'bookKeeping',
    name: 'Book Keeping',
    description: 'Financial review, posting, and payment access.',
    permissions: uniquePermissions([
      ...officeCore,
      ...permissionKeys('invoices', ['view', 'edit', 'post']),
      ...permissionKeys('payments', ['view', 'create', 'edit']),
      ...permissionKeys('reports', ['view', 'export'])
    ])
  },
  technician: {
    id: 'technician',
    name: 'Technician',
    description: 'Field-focused access for assigned work and estimates.',
    permissions: uniquePermissions([
      ...permissionKeys('customers', ['view']),
      ...permissionKeys('locations', ['view']),
      ...permissionKeys('contacts', ['view']),
      ...permissionKeys('equipment', ['create', 'edit', 'configure']),
      ...permissionKeys('appointmentsDispatch', ['view', 'edit']),
      ...permissionKeys('register', ['view', 'create', 'edit']),
      ...permissionKeys('media', ['view', 'create', 'edit']),
      ...permissionKeys('estimates', ['view', 'create', 'edit']),
      ...permissionKeys('invoices', ['view', 'edit'])
    ])
  }
};
