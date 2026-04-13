import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { defaultRoleTemplates } from './default-role-templates';
import type {
  EmployeeRecord,
  EmployeeSummary,
  LoginRequestDto,
  LoginResponseDto,
  PermissionKey,
  RoleTemplate,
  SessionRecord,
  UpdateEmployeeRequestDto
} from './identity-access.types';
import { seededEmployees } from './seed-employees';

@Injectable()
export class IdentityAccessService {
  private readonly employees = new Map<string, EmployeeRecord>(
    seededEmployees.map((employee) => [employee.id, structuredClone(employee)])
  );

  private readonly sessions = new Map<string, SessionRecord>();

  getRoleTemplates(): RoleTemplate[] {
    return Object.values(defaultRoleTemplates);
  }

  login(loginRequest: LoginRequestDto): LoginResponseDto {
    const normalizedEmail = loginRequest.email.trim().toLowerCase();
    const employee = [...this.employees.values()].find((candidate) => candidate.email.toLowerCase() === normalizedEmail);

    if (!employee || employee.password !== loginRequest.password) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!employee.isActive) {
      throw new ForbiddenException('This employee account is inactive.');
    }

    const sessionToken = randomUUID();
    this.sessions.set(sessionToken, {
      token: sessionToken,
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

  getCurrentEmployee(sessionToken: string): EmployeeSummary {
    const employee = this.getEmployeeFromSession(sessionToken);
    return this.toEmployeeSummary(employee);
  }

  getAuthorizedEmployee(sessionToken: string, permissionKey?: PermissionKey): EmployeeSummary {
    const employee = this.getEmployeeFromSession(sessionToken);

    if (permissionKey) {
      this.ensurePermission(employee, permissionKey);
    }

    return this.toEmployeeSummary(employee);
  }

  getActiveEmployees(): EmployeeSummary[] {
    return [...this.employees.values()]
      .filter((employee) => employee.isActive)
      .map((employee) => this.toEmployeeSummary(employee))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  getEmployeeSummaryById(employeeId: string): EmployeeSummary | null {
    const employee = this.employees.get(employeeId);
    return employee ? this.toEmployeeSummary(employee) : null;
  }

  getEmployees(sessionToken: string): EmployeeSummary[] {
    const actor = this.getEmployeeFromSession(sessionToken);
    this.ensurePermission(actor, 'employeesPermissions:view');

    return [...this.employees.values()]
      .map((employee) => this.toEmployeeSummary(employee))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  updateEmployee(sessionToken: string, employeeId: string, update: UpdateEmployeeRequestDto): EmployeeSummary {
    const actor = this.getEmployeeFromSession(sessionToken);
    this.ensurePermission(actor, 'employeesPermissions:configure');

    const existingEmployee = this.employees.get(employeeId);

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
      existingEmployee.permissionOverrides.grantedPermissions = this.uniquePermissionKeys(update.grantedPermissions);
    }

    if (update.revokedPermissions) {
      existingEmployee.permissionOverrides.revokedPermissions = this.uniquePermissionKeys(update.revokedPermissions);
    }

    this.employees.set(existingEmployee.id, existingEmployee);

    return this.toEmployeeSummary(existingEmployee);
  }

  private getEmployeeFromSession(sessionToken: string): EmployeeRecord {
    const session = this.sessions.get(sessionToken);

    if (!session) {
      throw new UnauthorizedException('Session not found. Please log in again.');
    }

    const employee = this.employees.get(session.employeeId);

    if (!employee) {
      this.sessions.delete(sessionToken);
      throw new UnauthorizedException('Employee account no longer exists.');
    }

    if (!employee.isActive) {
      this.sessions.delete(sessionToken);
      throw new ForbiddenException('This employee account is inactive.');
    }

    return employee;
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
}
