import {
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
    await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:configure', [
      'office-web'
    ]);

    const existingEmployee = await this.identityAccessRepository.findEmployeeById(employeeId);

    if (!existingEmployee) {
      throw new NotFoundException('Employee not found.');
    }

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

    await this.identityAccessRepository.saveEmployee(existingEmployee);

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
