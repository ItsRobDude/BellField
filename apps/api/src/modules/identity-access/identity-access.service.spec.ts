import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { IdentityAccessRepository } from './identity-access.repository';
import { IdentityAccessService } from './identity-access.service';
import { hashPassword, isHashed } from './password-hash';

describe('IdentityAccessService', () => {
  it('pins technician default permissions to field equipment work without true delete', () => {
    const service = new IdentityAccessService({} as IdentityAccessRepository);
    const technicianRole = service.getRoleTemplates().find((role) => role.id === 'technician');

    expect(technicianRole).toBeDefined();
    expect(technicianRole?.permissions).toEqual([
      'customers:view',
      'locations:view',
      'contacts:view',
      'equipment:create',
      'equipment:edit',
      'equipment:configure',
      'appointmentsDispatch:view',
      'appointmentsDispatch:edit',
      'register:view',
      'register:create',
      'register:edit',
      'media:view',
      'media:create',
      'media:edit',
      'estimates:view',
      'estimates:create',
      'estimates:edit',
      'invoices:view',
      'invoices:edit'
    ]);
    expect(technicianRole?.permissions).not.toContain('equipment:view');
    expect(technicianRole?.permissions).not.toContain('equipment:delete');
  });

  it('rejects office-only authorization checks for field sessions', async () => {
    const repository = {
      findSessionByToken: jest.fn().mockResolvedValue({
        token: 'session-token',
        employeeId: 'employee-1',
        surface: 'field-mobile',
        issuedAt: '2026-04-14T10:00:00.000Z'
      }),
      findEmployeeById: jest.fn().mockResolvedValue({
        id: 'employee-1',
        email: 'tech@example.com',
        displayName: 'Test Tech',
        roleId: 'technician',
        isActive: true,
        password: 'secret',
        permissionOverrides: {
          grantedPermissions: [],
          revokedPermissions: []
        }
      }),
      deleteSession: jest.fn()
    } satisfies Partial<IdentityAccessRepository>;

    const service = new IdentityAccessService(repository as unknown as IdentityAccessRepository);

    await expect(
      service.getAuthorizedEmployee('session-token', undefined, ['office-web'])
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  function loginRepo(password: string) {
    return {
      findEmployeeByEmail: jest.fn().mockResolvedValue({
        id: 'employee-1',
        email: 'owner@bellfield.local',
        displayName: 'Olivia Owner',
        roleId: 'owner',
        isActive: true,
        password,
        permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
      }),
      createSession: jest.fn().mockResolvedValue(undefined),
      updateEmployeePassword: jest.fn().mockResolvedValue(undefined)
    };
  }

  it('logs in with a hashed password and does not rehash', async () => {
    const repo = loginRepo(await hashPassword('bellfield-owner'));
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.login({
      email: 'owner@bellfield.local',
      password: 'bellfield-owner',
      surface: 'office-web'
    });
    expect(result.sessionToken).toBeTruthy();
    expect(repo.updateEmployeePassword).not.toHaveBeenCalled();
  });

  it('logs in with a legacy plaintext password and rehashes it to scrypt', async () => {
    const repo = loginRepo('bellfield-owner'); // legacy plaintext
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.login({
      email: 'owner@bellfield.local',
      password: 'bellfield-owner',
      surface: 'office-web'
    });
    expect(repo.updateEmployeePassword).toHaveBeenCalledTimes(1);
    const [employeeId, newStored] = repo.updateEmployeePassword.mock.calls[0];
    expect(employeeId).toBe('employee-1');
    expect(isHashed(newStored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const repo = loginRepo(await hashPassword('bellfield-owner'));
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.login({ email: 'owner@bellfield.local', password: 'nope', surface: 'office-web' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.createSession).not.toHaveBeenCalled();
  });
});
