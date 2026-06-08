import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { IdentityAccessRepository } from './identity-access.repository';
import { IdentityAccessService } from './identity-access.service';
import { hashPassword, isHashed } from './password-hash';

type Role = 'owner' | 'admin' | 'csr';

type EmployeeLike = {
  id: string;
  email: string;
  displayName: string;
  roleId: Role;
  isActive: boolean;
  password: string;
  permissionOverrides: { grantedPermissions: string[]; revokedPermissions: string[] };
};

function adminSessionRepo(
  opts: {
    actorRole?: Role;
    targetRole?: Role;
    otherActiveOwner?: boolean;
    /** Simulate the target as re-read under the lock (e.g. its role changed concurrently). */
    freshTarget?: EmployeeLike;
    /** Simulate the actor as re-read under the lock (e.g. demoted/deactivated/de-permissioned). */
    freshActor?: EmployeeLike;
  } = {}
) {
  const employee = (id: string, roleId: Role): EmployeeLike => ({
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
  // A standing active Owner so the active-owner invariant holds for ordinary updates. Omit it to
  // exercise the "last owner" guard.
  const others = (opts.otherActiveOwner ?? true) ? [employee('owner-keeper', 'owner')] : [];
  const captured: {
    prepared?: {
      fields: Record<string, unknown>;
      auditEntries: unknown[];
      revokeSessions: boolean;
    };
    createAudit?: { action: string; summary: string };
  } = {};
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
    findEmployeeByEmail: jest.fn().mockResolvedValue(null),
    // Faithfully simulate the locked repo commands: re-read the fresh ACTOR + target from the mock world
    // and run the service's `prepare` step (which holds actor re-validation, owner-protection, self,
    // last-owner/authority, elevation + audit), so those guards stay exercised through the mock.
    // `freshActor`/`freshTarget` let a test simulate either changing under the lock (concurrent write).
    createEmployeeWithAudit: jest.fn(
      async (
        _actorId: string,
        _employee: unknown,
        prepare: (current: { actor: unknown }) => { action: string; summary: string }
      ) => {
        captured.createAudit = prepare({ actor: opts.freshActor ?? actor });
      }
    ),
    runEmployeeUpdate: jest.fn(
      async (
        _actorId: string,
        employeeId: string,
        prepare: (current: { actor: unknown; target: unknown; employees: unknown[] }) => {
          fields: Record<string, unknown>;
          auditEntries: unknown[];
          revokeSessions: boolean;
        }
      ) => {
        const freshTarget = opts.freshTarget ?? (employeeId === 'actor-1' ? actor : target);
        const employees = [actor, target, ...others];
        const prepared = prepare({
          actor: opts.freshActor ?? actor,
          target: freshTarget,
          employees
        });
        captured.prepared = prepared;
        return {
          ...freshTarget,
          ...prepared.fields,
          permissionOverrides: freshTarget.permissionOverrides
        };
      }
    ),
    runPasswordReset: jest.fn(
      async (
        _actorId: string,
        _employeeId: string,
        _passwordHash: string,
        prepare: (current: { actor: unknown; target: unknown }) => unknown
      ) => {
        prepare({ actor: opts.freshActor ?? actor, target: opts.freshTarget ?? target });
        return 2;
      }
    ),
    runSessionRevoke: jest.fn(
      async (
        _actorId: string,
        _employeeId: string,
        _sessionId: string,
        prepare: (current: { actor: unknown; target: unknown }) => unknown
      ) => {
        prepare({ actor: opts.freshActor ?? actor, target: opts.freshTarget ?? target });
        return true;
      }
    ),
    // Actor + target + (by default) a standing active Owner, so the authority and active-owner
    // guards pass for ordinary updates.
    listEmployees: jest.fn().mockResolvedValue([actor, target, ...others])
  };
  return { repo, actor, target, captured };
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
      'catalog:view',
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
    expect(repo.runSessionRevoke).toHaveBeenCalledWith(
      'actor-1',
      'target-1',
      'sess-1',
      expect.any(Function)
    );
  });

  it('blocks an admin from revoking an owner session (owner-protection, in-tx fresh role)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.revokeEmployeeSession('tok', 'target-1', 'sess-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
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

  it('blocks an admin from modifying an owner (owner-protection, in-tx fresh role)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', { isActive: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes all sessions when an employee is deactivated', async () => {
    const { repo, captured } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { isActive: false });
    expect(repo.runEmployeeUpdate).toHaveBeenCalledTimes(1);
    expect(captured.prepared?.revokeSessions).toBe(true);
  });

  it('writes only role/active/overrides — never password/email/displayName — on update', async () => {
    const { repo, captured } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { roleId: 'dispatcher' });
    expect(repo.runEmployeeUpdate).toHaveBeenCalledTimes(1);
    expect(Object.keys(captured.prepared?.fields ?? {}).sort()).toEqual([
      'grantedPermissions',
      'isActive',
      'revokedPermissions',
      'roleId'
    ]);
  });

  it('writes one audit row per semantic change (role + active)', async () => {
    const { repo, captured } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { roleId: 'dispatcher', isActive: false });
    const auditEntries = captured.prepared?.auditEntries as Array<{ action: string }>;
    expect(auditEntries.map((entry) => entry.action).sort()).toEqual([
      'employee_deactivated',
      'employee_role_changed'
    ]);
  });

  it('writes no audit rows when an update changes nothing', async () => {
    const { repo, captured } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { roleId: 'csr' }); // same role, no-op
    expect(captured.prepared?.auditEntries).toEqual([]);
  });

  it('does not revoke sessions on a non-deactivating update', async () => {
    const { repo, captured } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await service.updateEmployee('tok', 'target-1', { roleId: 'dispatcher' });
    expect(repo.runEmployeeUpdate).toHaveBeenCalledTimes(1);
    expect(captured.prepared?.revokeSessions).toBe(false);
  });

  it('blocks a non-owner from promoting anyone to owner (in-tx against fresh actor)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', { roleId: 'owner' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an owner promote an employee to owner', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'owner', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.updateEmployee('tok', 'target-1', { roleId: 'owner' });
    expect(result.roleId).toBe('owner');
    expect(repo.runEmployeeUpdate).toHaveBeenCalledTimes(1);
  });

  it('blocks granting a permission the actor does not hold (in-tx against fresh actor)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    // employeesPermissions:create is Owner-only; an Admin must not be able to grant it.
    await expect(
      service.updateEmployee('tok', 'target-1', {
        grantedPermissions: ['employeesPermissions:create']
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an override that both grants and revokes the same permission', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', {
        grantedPermissions: ['inventory:view'],
        revokedPermissions: ['inventory:view']
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.runEmployeeUpdate).not.toHaveBeenCalled();
  });

  it('blocks self-deactivation (guard runs in-tx against the fresh target)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'actor-1', { isActive: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks removing your own employee-management authority (self-demotion)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    // csr has no employeesPermissions:configure → would strip the actor's own authority.
    await expect(
      service.updateEmployee('tok', 'actor-1', { roleId: 'csr' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks the last owner from self-demoting to admin (no active owner left)', async () => {
    // Owner -> admin keeps employeesPermissions:configure, so the authority guard passes; the
    // active-owner guard (re-checked inside the tx) must still reject — it would leave zero owners.
    const { repo } = adminSessionRepo({ actorRole: 'owner', otherActiveOwner: false });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'actor-1', { roleId: 'admin' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks the last owner from deactivating themselves', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'owner', otherActiveOwner: false });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'actor-1', { isActive: false })
    ).rejects.toBeTruthy();
  });

  it('allows demoting an owner when another active owner remains', async () => {
    const { repo } = adminSessionRepo({
      actorRole: 'owner',
      targetRole: 'owner',
      otherActiveOwner: false
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.updateEmployee('tok', 'target-1', { roleId: 'admin' });
    expect(result.roleId).toBe('admin');
    expect(repo.runEmployeeUpdate).toHaveBeenCalledTimes(1);
  });

  it('blocks an admin update against a target that became Owner before commit (in-tx re-read)', async () => {
    // The fresh under-lock read shows the target is now an Owner — owner-protection must catch it.
    const freshOwner: EmployeeLike = {
      id: 'target-1',
      email: 'target-1@bellfield.local',
      displayName: 'target-1',
      roleId: 'owner',
      isActive: true,
      password: 'x',
      permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
    };
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      targetRole: 'csr',
      freshTarget: freshOwner
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', { isActive: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  const newEmployee = {
    email: 'New.Person@bellfield.local',
    displayName: 'New Person',
    roleId: 'csr' as const,
    password: 'supersecret123'
  };

  it('rejects employee creation without employeesPermissions:create', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin' }); // admin lacks :create (owner-only)
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.createEmployee('tok', newEmployee)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(repo.createEmployeeWithAudit).not.toHaveBeenCalled();
  });

  it('creates an employee with a hashed password that is never returned, and audits it', async () => {
    const { repo, captured } = adminSessionRepo({ actorRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.createEmployee('tok', newEmployee);
    expect(result).not.toHaveProperty('password');
    expect(result.roleId).toBe('csr');
    const createdEmployee = repo.createEmployeeWithAudit.mock.calls[0][1] as { password: string };
    expect(isHashed(createdEmployee.password)).toBe(true);
    expect(createdEmployee.password).not.toContain('supersecret123');
    expect(captured.createAudit?.action).toBe('employee_created');
    expect(captured.createAudit?.summary).not.toContain('supersecret123');
  });

  it('rejects a duplicate email case-insensitively', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'owner' });
    repo.findEmployeeByEmail.mockResolvedValue({ id: 'existing' }); // a row already uses this email
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.createEmployee('tok', newEmployee)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(repo.findEmployeeByEmail).toHaveBeenCalledWith('new.person@bellfield.local');
    expect(repo.createEmployeeWithAudit).not.toHaveBeenCalled();
  });

  it('returns employee detail with sessions and no bearer token', async () => {
    const { repo } = adminSessionRepo();
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const detail = await service.getEmployeeDetail('tok', 'target-1');
    expect(detail.employee.id).toBe('target-1');
    expect(detail.sessions).toHaveLength(1);
    expect(detail.sessions[0]).not.toHaveProperty('token');
  });

  it('blocks an admin from resetting an owner password (owner-protection, in-tx fresh role)', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'owner' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.resetEmployeePassword('tok', 'target-1', { password: 'whatever123' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resets a password (hashed, never returned) and reports revoked sessions', async () => {
    const { repo } = adminSessionRepo({ actorRole: 'admin', targetRole: 'csr' });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    const result = await service.resetEmployeePassword('tok', 'target-1', {
      password: 'brandnew123'
    });
    expect(result).toEqual({ revokedSessionCount: 2 });
    const [actorId, employeeId, passwordHash] = repo.runPasswordReset.mock.calls[0];
    expect(actorId).toBe('actor-1');
    expect(employeeId).toBe('target-1');
    expect(isHashed(passwordHash)).toBe(true);
    expect(passwordHash).not.toContain('brandnew123');
  });

  const freshOwnerTarget: EmployeeLike = {
    id: 'target-1',
    email: 'target-1@bellfield.local',
    displayName: 'target-1',
    roleId: 'owner',
    isActive: true,
    password: 'x',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
  };

  it('blocks an admin reset against a target that became Owner before commit', async () => {
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      targetRole: 'csr',
      freshTarget: freshOwnerTarget
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.resetEmployeePassword('tok', 'target-1', { password: 'whatever123' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks an admin session revoke against a target that became Owner before commit', async () => {
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      targetRole: 'csr',
      freshTarget: freshOwnerTarget
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.revokeEmployeeSession('tok', 'target-1', 'sess-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  // The actor passes the request-time gate, but under the lock the fresh actor record is different.
  const freshActor = (over: Partial<EmployeeLike>): EmployeeLike => ({
    id: 'actor-1',
    email: 'actor-1@bellfield.local',
    displayName: 'actor-1',
    roleId: 'admin',
    isActive: true,
    password: 'x',
    permissionOverrides: { grantedPermissions: [], revokedPermissions: [] },
    ...over
  });

  it('rejects an update when the actor lost employeesPermissions:configure before commit', async () => {
    // Gate actor is admin (has configure); fresh actor under the lock is a csr (does not).
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      freshActor: freshActor({ roleId: 'csr' })
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', { isActive: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a password reset when the actor lost configure before commit', async () => {
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      freshActor: freshActor({ roleId: 'csr' })
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.resetEmployeePassword('tok', 'target-1', { password: 'whatever123' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a session revoke when the actor lost configure before commit', async () => {
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      freshActor: freshActor({ roleId: 'csr' })
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(service.revokeEmployeeSession('tok', 'target-1', 'sess-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('rejects an update when the actor is inactive under the lock', async () => {
    const { repo } = adminSessionRepo({
      actorRole: 'admin',
      freshActor: freshActor({ isActive: false })
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.updateEmployee('tok', 'target-1', { isActive: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects creating an owner when the actor was demoted from owner before commit', async () => {
    // Gate actor is an owner (has :create); fresh actor under the lock is an admin (does not).
    const { repo } = adminSessionRepo({
      actorRole: 'owner',
      freshActor: freshActor({ roleId: 'admin' })
    });
    const service = new IdentityAccessService(repo as unknown as IdentityAccessRepository);
    await expect(
      service.createEmployee('tok', {
        email: 'New.Owner@bellfield.local',
        displayName: 'New Owner',
        roleId: 'owner',
        password: 'supersecret123'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
