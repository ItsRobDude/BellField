import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EmployeeSessionsResponse, RevokeEmployeeSessionResponse } from '@bellfield/contracts';
import { defaultRoleTemplates } from './default-role-templates';
import { hashPassword, verifyPassword } from './password-hash';
import { IdentityAccessRepository } from './identity-access.repository';
import type {
  AuthorizedEmployee,
  EmployeeRecord,
  EmployeeSummary,
  LoginSurface,
  LoginRequestDto,
  LoginResponseDto,
  PermissionKey,
  RoleTemplate,
  SessionRecord,
  UpdateEmployeeRequestDto
} from './identity-access.types';

@Injectable()
export class IdentityAccessService {
  constructor(private readonly identityAccessRepository: IdentityAccessRepository) {}

  getRoleTemplates(): RoleTemplate[] {
    return Object.values(defaultRoleTemplates);
  }

  async login(loginRequest: LoginRequestDto): Promise<LoginResponseDto> {
    const normalizedEmail = loginRequest.email.trim().toLowerCase();
    const employee = await this.identityAccessRepository.findEmployeeByEmail(normalizedEmail);

    const verification = employee
      ? await verifyPassword(loginRequest.password, employee.password)
      : { ok: false, needsRehash: false };

    if (!employee || !verification.ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!employee.isActive) {
      throw new ForbiddenException('This employee account is inactive.');
    }

    // Migrate a legacy plaintext password to a hash on first successful login.
    if (verification.needsRehash) {
      await this.identityAccessRepository.updateEmployeePassword(
        employee.id,
        await hashPassword(loginRequest.password)
      );
    }

    const sessionToken = randomUUID();
    await this.identityAccessRepository.createSession({
      token: sessionToken,
      id: randomUUID(),
      employeeId: employee.id,
      surface: loginRequest.surface,
      deviceLabel: loginRequest.deviceLabel?.trim() || undefined,
      issuedAt: new Date().toISOString()
    });

    return {
      sessionToken,
      employee: this.toEmployeeSummary(employee)
    };
  }

  async getCurrentEmployee(sessionToken: string): Promise<EmployeeSummary> {
    const { employee } = await this.getEmployeeFromSession(sessionToken);
    return this.toEmployeeSummary(employee);
  }

  async getAuthorizedEmployee(
    sessionToken: string,
    permissionKey?: PermissionKey,
    allowedSurfaces?: LoginSurface[]
  ): Promise<AuthorizedEmployee> {
    const { employee, session } = await this.getEmployeeFromSession(sessionToken);

    if (allowedSurfaces && !allowedSurfaces.includes(session.surface)) {
      throw new ForbiddenException(this.buildSurfaceErrorMessage(allowedSurfaces));
    }

    if (permissionKey) {
      this.ensurePermission(employee, permissionKey);
    }

    return {
      ...this.toEmployeeSummary(employee),
      sessionSurface: session.surface
    };
  }

  async getActiveEmployees(): Promise<EmployeeSummary[]> {
    const employees = await this.identityAccessRepository.listEmployees();

    return employees
      .filter((employee) => employee.isActive)
      .map((employee) => this.toEmployeeSummary(employee))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async getEmployeeSummaryById(employeeId: string): Promise<EmployeeSummary | null> {
    const employee = await this.identityAccessRepository.findEmployeeById(employeeId);
    return employee ? this.toEmployeeSummary(employee) : null;
  }

  async getEmployees(sessionToken: string): Promise<EmployeeSummary[]> {
    await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:view', ['office-web']);

    const employees = await this.identityAccessRepository.listEmployees();

    return employees
      .map((employee) => this.toEmployeeSummary(employee))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async updateEmployee(
    sessionToken: string,
    employeeId: string,
    update: UpdateEmployeeRequestDto
  ): Promise<EmployeeSummary> {
    const actor = await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:configure', [
      'office-web'
    ]);

    const existingEmployee = await this.identityAccessRepository.findEmployeeById(employeeId);

    if (!existingEmployee) {
      throw new NotFoundException('Employee not found.');
    }

    // Owner-protection: only an Owner may modify an existing Owner (role/active/overrides).
    this.assertCanActOnTarget(actor.roleId, existingEmployee.roleId);

    // Elevation guards — evaluate the REQUESTED result, not just the current role.
    // Promoting anyone (incl. self) to Owner requires an Owner actor.
    if (update.roleId === 'owner' && actor.roleId !== 'owner') {
      throw new ForbiddenException('Only an owner can promote an employee to owner.');
    }
    // A permission cannot be both granted and revoked.
    if (update.grantedPermissions && update.revokedPermissions) {
      const revoked = new Set(update.revokedPermissions);
      const conflict = update.grantedPermissions.find((key) => revoked.has(key));
      if (conflict) {
        throw new BadRequestException(
          `Permission "${conflict}" cannot be both granted and revoked.`
        );
      }
    }
    // No privilege escalation via overrides: an actor can only grant permissions it itself holds.
    if (update.grantedPermissions) {
      const actorPermissions = new Set(actor.effectivePermissions);
      const escalated = update.grantedPermissions.find((key) => !actorPermissions.has(key));
      if (escalated) {
        throw new ForbiddenException(
          `You cannot grant a permission you do not hold: ${escalated}.`
        );
      }
    }

    const wasActive = existingEmployee.isActive;

    if (update.roleId) {
      this.assertRoleExists(update.roleId);
      existingEmployee.roleId = update.roleId;
    }

    if (typeof update.isActive === 'boolean') {
      existingEmployee.isActive = update.isActive;
    }

    if (update.grantedPermissions) {
      existingEmployee.permissionOverrides.grantedPermissions = this.uniquePermissionKeys(
        update.grantedPermissions
      );
    }

    if (update.revokedPermissions) {
      existingEmployee.permissionOverrides.revokedPermissions = this.uniquePermissionKeys(
        update.revokedPermissions
      );
    }

    // Self-protection: you cannot lock yourself out (deactivate or remove your own management authority).
    if (employeeId === actor.id) {
      if (!existingEmployee.isActive) {
        throw new ForbiddenException('You cannot deactivate your own account.');
      }
      if (
        !this.resolveEffectivePermissions(existingEmployee).includes(
          'employeesPermissions:configure'
        )
      ) {
        throw new ForbiddenException('You cannot remove your own employee-management authority.');
      }
    }

    // Post-change invariants over the hypothetical employee list: keep at least one active employee
    // who can manage employees, and at least one active Owner.
    const postChangeEmployees = await this.buildPostChangeEmployees(employeeId, existingEmployee);
    this.assertRetainsEmployeeAuthority(postChangeEmployees);
    this.assertRetainsActiveOwner(postChangeEmployees);

    await this.identityAccessRepository.saveEmployee(existingEmployee);

    // Deactivating an employee revokes all their sessions immediately (locked plan §5d.2).
    if (wasActive && !existingEmployee.isActive) {
      await this.identityAccessRepository.revokeAllSessionsForEmployee(employeeId);
    }

    return this.toEmployeeSummary(existingEmployee);
  }

  async getRoleTemplatesForOffice(sessionToken: string): Promise<RoleTemplate[]> {
    await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:view', ['office-web']);
    return this.getRoleTemplates();
  }

  /** List an employee's device sessions (no bearer tokens). Gate: employeesPermissions:view. */
  async listEmployeeSessions(
    sessionToken: string,
    employeeId: string
  ): Promise<EmployeeSessionsResponse> {
    await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:view', ['office-web']);
    const employee = await this.identityAccessRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    const sessions = await this.identityAccessRepository.listSessionsForEmployee(employeeId);
    return { sessions };
  }

  /** Revoke one device session by its non-secret id. Gate: employeesPermissions:configure. */
  async revokeEmployeeSession(
    sessionToken: string,
    employeeId: string,
    sessionId: string
  ): Promise<RevokeEmployeeSessionResponse> {
    const actor = await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:configure', [
      'office-web'
    ]);
    const target = await this.identityAccessRepository.findEmployeeById(employeeId);
    if (!target) {
      throw new NotFoundException('Employee not found.');
    }
    this.assertCanActOnTarget(actor.roleId, target.roleId);
    const revoked = await this.identityAccessRepository.revokeSessionById(employeeId, sessionId);
    return { revoked };
  }

  /** Owner-protection: only an Owner may act on an Owner (reset/deactivate/role/override/revoke). */
  private assertCanActOnTarget(
    actorRoleId: EmployeeRecord['roleId'],
    targetRoleId: EmployeeRecord['roleId']
  ): void {
    if (targetRoleId === 'owner' && actorRoleId !== 'owner') {
      throw new ForbiddenException('Only an owner can manage an owner account.');
    }
  }

  /** The full employee list as it would be AFTER the change (target replaced by its resulting state). */
  private async buildPostChangeEmployees(
    employeeId: string,
    resultingEmployee: EmployeeRecord
  ): Promise<EmployeeRecord[]> {
    const employees = await this.identityAccessRepository.listEmployees();
    return employees.map((employee) => (employee.id === employeeId ? resultingEmployee : employee));
  }

  /**
   * At least one ACTIVE employee must retain effective `employeesPermissions:configure` — computed
   * over the post-change world, not a naive role check (overrides grant/revoke the authority).
   */
  private assertRetainsEmployeeAuthority(employees: EmployeeRecord[]): void {
    const stillHasAuthority = employees.some(
      (employee) =>
        employee.isActive &&
        this.resolveEffectivePermissions(employee).includes('employeesPermissions:configure')
    );
    if (!stillHasAuthority) {
      throw new ConflictException(
        'This change would leave no active employee who can manage employees.'
      );
    }
  }

  /**
   * At least one ACTIVE Owner must remain. Distinct from the authority guard: an Owner self-demoting
   * to Admin keeps `employeesPermissions:configure` (so the authority guard passes) but would leave
   * zero Owners, and owner-only actions (managing owners, creating employees) need an Owner.
   */
  private assertRetainsActiveOwner(employees: EmployeeRecord[]): void {
    const hasActiveOwner = employees.some(
      (employee) => employee.isActive && employee.roleId === 'owner'
    );
    if (!hasActiveOwner) {
      throw new ConflictException('This change would leave no active owner.');
    }
  }

  private async getEmployeeFromSession(
    sessionToken: string
  ): Promise<{ employee: EmployeeRecord; session: SessionRecord }> {
    const session = await this.identityAccessRepository.findSessionByToken(sessionToken);

    if (!session) {
      throw new UnauthorizedException('Session not found. Please log in again.');
    }

    const employee = await this.identityAccessRepository.findEmployeeById(session.employeeId);

    if (!employee) {
      await this.identityAccessRepository.deleteSession(sessionToken);
      throw new UnauthorizedException('Employee account no longer exists.');
    }

    if (!employee.isActive) {
      await this.identityAccessRepository.deleteSession(sessionToken);
      throw new ForbiddenException('This employee account is inactive.');
    }

    return { employee, session };
  }

  private toEmployeeSummary(employee: EmployeeRecord): EmployeeSummary {
    const role = defaultRoleTemplates[employee.roleId];

    return {
      id: employee.id,
      email: employee.email,
      displayName: employee.displayName,
      roleId: employee.roleId,
      roleName: role.name,
      isActive: employee.isActive,
      effectivePermissions: this.resolveEffectivePermissions(employee),
      permissionOverrides: {
        grantedPermissions: [...employee.permissionOverrides.grantedPermissions],
        revokedPermissions: [...employee.permissionOverrides.revokedPermissions]
      }
    };
  }

  private resolveEffectivePermissions(employee: EmployeeRecord): PermissionKey[] {
    const basePermissions = new Set(defaultRoleTemplates[employee.roleId].permissions);

    for (const revokedPermission of employee.permissionOverrides.revokedPermissions) {
      basePermissions.delete(revokedPermission);
    }

    for (const grantedPermission of employee.permissionOverrides.grantedPermissions) {
      basePermissions.add(grantedPermission);
    }

    return [...basePermissions].sort();
  }

  private ensurePermission(employee: EmployeeRecord, permissionKey: PermissionKey): void {
    const effectivePermissions = new Set(this.resolveEffectivePermissions(employee));

    if (!effectivePermissions.has(permissionKey)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
  }

  private assertRoleExists(roleId: string): asserts roleId is keyof typeof defaultRoleTemplates {
    if (!(roleId in defaultRoleTemplates)) {
      throw new NotFoundException('Role template not found.');
    }
  }

  private uniquePermissionKeys(permissionKeys: PermissionKey[]): PermissionKey[] {
    return [...new Set(permissionKeys)].sort();
  }

  private buildSurfaceErrorMessage(allowedSurfaces: LoginSurface[]): string {
    return allowedSurfaces.includes('field-mobile') && allowedSurfaces.includes('office-web')
      ? 'This action is not available for the current session surface.'
      : allowedSurfaces[0] === 'field-mobile'
        ? 'This action is only available from the BellField field app.'
        : 'This action is only available from the BellField office app.';
  }
}
