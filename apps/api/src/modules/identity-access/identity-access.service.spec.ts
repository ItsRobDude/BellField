import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IdentityAccessRepository } from './identity-access.repository';
import { IdentityAccessService } from './identity-access.service';
import { hashPassword, isHashed } from './password-hash';

type Role = 'owner' | 'admin' | 'csr';

function adminSessionRepo(opts: { actorRole?: Role; targetRole?: Role } = {}) {
  const employee = (id: string, roleId: Role) => ({
    id,
    email: `${id}@bellfield.local`,
    displayName: id,
    roleId,
    isActive: true,
    password: 'x',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  });
  const actor = employee('actor-1', opts.actorRole ?? 'admin');
  const target = employee('target-1', opts.targetRole ?? 'csr');
  const repo = {
    findSessionByToken: jest.fn().mockResolvedValue({
      token: 'tok',
      id: 's0',
      employeeId: 'actor-1',
      surface: 'office-web',
      issuedAt: '2026-01-01T00:00:00.000Z'
    }),
    findEmployeeById: jest.fn((id: string) =>
      Promise.resolve(id === 'actor-1' ? actor : id === 'target-1' ? target : null)
    ),
    listSessionsForEmployee: jest.fn().mockResolvedValue([
      {
        id: 'sess-1',
        surface: 'field-mobile',
        deviceLabel: 'Tablet',
        issuedAt: '2026-06-01T00:00:00.000Z'
      }
    ]),
    revokeSessionById: jest.fn().mockResolvedValue(true),
    saveEmployee: jest.fn().mockResolvedValue(undefined),
    revokeAllSessionsForEmployee: jest.fn().mockResolvedValue(1)
  };
  return { repo, actor, target };
}

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

  it('lists an employee session summaries without exposing the bearer token', async () => {
    const { repo } = adminSessionRepo();
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.listEmployeeSessions('tok', 'target-1');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).not.toHaveProperty('token');
    expect(result.sessions[0].id).toBe('sess-1');
  });

  it('revokes a single session by id', async () => {
    const { repo } = adminSessionRepo();
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.revokeEmployeeSession('tok', 'target-1', 'sess-1');
    expect(result).toEqual({ revoked: true });
    expect(repo.revokeSessionById).toHaveBeenCalledWith('target-1', 'sess-1');
  });

  it('blocks an admin from revoking an owner session (owner-protection)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.revokeEmployeeSession('tok', 'target-1', 'sess-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(repo.revokeSessionById).not.toHaveBeenCalled();
  });

  it('allows an owner to revoke an owner session', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'owner', targetRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.revokeEmployeeSession('tok', 'target-1', 'sess-1')).resolves.toEqual({
      revoked: true
    });
  });

  it('404s session listing for an unknown employee', async () => {
    const { repo } = adminSessionRepo();
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.listEmployeeSessions('tok', 'missing')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('blocks an admin from modifying an owner (owner-protection on update)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', { isActive: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.saveEmployee).not.toHaveBeenCalled();
  });

  it('revokes all sessions when an employee is deactivated', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { isActive: false });
    expect(repo.saveEmployee).toHaveBeenCalledTimes(1);
    expect(repo.revokeAllSessionsForEmployee).toHaveBeenCalledWith('target-1');
  });

  it('does not revoke sessions on a non-deactivating update', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { roleId: 'dispatcher' });
    expect(repo.saveEmployee).toHaveBeenCalledTimes(1);
    expect(repo.revokeAllSessionsForEmployee).not.toHaveBeenCalled();
  });
});
