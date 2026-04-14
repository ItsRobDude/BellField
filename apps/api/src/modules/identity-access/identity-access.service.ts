import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { defaultRoleTemplates } from './default-role-templates';
import { IdentityAccessRepository } from './identity-access.repository';
import type {
  EmployeeRecord,
  EmployeeSummary,
  LoginRequestDto,
  LoginResponseDto,
  PermissionKey,
  RoleTemplate,
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

    if (!employee || employee.password !== loginRequest.password) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!employee.isActive) {
      throw new ForbiddenException('This employee account is inactive.');
    }

    const sessionToken = randomUUID();
    await this.identityAccessRepository.createSession({
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

  async getCurrentEmployee(sessionToken: string): Promise<EmployeeSummary> {
    const employee = await this.getEmployeeFromSession(sessionToken);
    return this.toEmployeeSummary(employee);
  }

  async getAuthorizedEmployee(sessionToken: string, permissionKey?: PermissionKey): Promise<EmployeeSummary> {
    const employee = await this.getEmployeeFromSession(sessionToken);

    if (permissionKey) {
      this.ensurePermission(employee, permissionKey);
    }

    return this.toEmployeeSummary(employee);
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
    const actor = await this.getEmployeeFromSession(sessionToken);
    this.ensurePermission(actor, 'employeesPermissions:view');

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
    const actor = await this.getEmployeeFromSession(sessionToken);
    this.ensurePermission(actor, 'employeesPermissions:configure');

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
      existingEmployee.permissionOverrides.grantedPermissions = this.uniquePermissionKeys(update.grantedPermissions);
    }

    if (update.revokedPermissions) {
      existingEmployee.permissionOverrides.revokedPermissions = this.uniquePermissionKeys(update.revokedPermissions);
    }

    await this.identityAccessRepository.saveEmployee(existingEmployee);

    return this.toEmployeeSummary(existingEmployee);
  }

  private async getEmployeeFromSession(sessionToken: string): Promise<EmployeeRecord> {
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
