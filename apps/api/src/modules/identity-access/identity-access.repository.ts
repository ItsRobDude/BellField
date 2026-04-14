import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toIsoString, toTextArray } from '../../database/database-row.utils';
import type { EmployeeRecord, SessionRecord } from './identity-access.types';

type EmployeeRow = {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRecord['roleId'];
  isActive: boolean;
  password: string;
  grantedPermissions: string[] | null;
  revokedPermissions: string[] | null;
};

type SessionRow = {
  token: string;
  employeeId: string;
  surface: SessionRecord['surface'];
  deviceLabel: string | null;
  issuedAt: string | Date;
};

@Injectable()
export class IdentityAccessRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findEmployeeByEmail(email: string): Promise<EmployeeRecord | null> {
    const result = await this.databaseService.query<EmployeeRow>(
      `
        select
          id,
          email,
          display_name as "displayName",
          role_id as "roleId",
          is_active as "isActive",
          password,
          granted_permissions as "grantedPermissions",
          revoked_permissions as "revokedPermissions"
        from employees
        where lower(email) = lower($1)
        limit 1
      `,
      [email]
    );

    return result.rows[0] ? this.toEmployeeRecord(result.rows[0]) : null;
  }

  async findEmployeeById(employeeId: string): Promise<EmployeeRecord | null> {
    const result = await this.databaseService.query<EmployeeRow>(
      `
        select
          id,
          email,
          display_name as "displayName",
          role_id as "roleId",
          is_active as "isActive",
          password,
          granted_permissions as "grantedPermissions",
          revoked_permissions as "revokedPermissions"
        from employees
        where id = $1
        limit 1
      `,
      [employeeId]
    );

    return result.rows[0] ? this.toEmployeeRecord(result.rows[0]) : null;
  }

  async listEmployees(): Promise<EmployeeRecord[]> {
    const result = await this.databaseService.query<EmployeeRow>(
      `
        select
          id,
          email,
          display_name as "displayName",
          role_id as "roleId",
          is_active as "isActive",
          password,
          granted_permissions as "grantedPermissions",
          revoked_permissions as "revokedPermissions"
        from employees
        order by display_name asc
      `
    );

    return result.rows.map((row) => this.toEmployeeRecord(row));
  }

  async saveEmployee(employee: EmployeeRecord): Promise<void> {
    await this.databaseService.query(
      `
        update employees
        set
          email = $2,
          display_name = $3,
          role_id = $4,
          is_active = $5,
          password = $6,
          granted_permissions = $7::text[],
          revoked_permissions = $8::text[],
          updated_at = now()
        where id = $1
      `,
      [
        employee.id,
        employee.email,
        employee.displayName,
        employee.roleId,
        employee.isActive,
        employee.password,
        employee.permissionOverrides.grantedPermissions,
        employee.permissionOverrides.revokedPermissions
      ]
    );
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.databaseService.query(
      `
        insert into sessions (token, employee_id, surface, device_label, issued_at)
        values ($1, $2, $3, $4, $5)
      `,
      [session.token, session.employeeId, session.surface, session.deviceLabel ?? null, session.issuedAt]
    );
  }

  async findSessionByToken(sessionToken: string): Promise<SessionRecord | null> {
    const result = await this.databaseService.query<SessionRow>(
      `
        select
          token,
          employee_id as "employeeId",
          surface,
          device_label as "deviceLabel",
          issued_at as "issuedAt"
        from sessions
        where token = $1
        limit 1
      `,
      [sessionToken]
    );

    return result.rows[0] ? this.toSessionRecord(result.rows[0]) : null;
  }

  async deleteSession(sessionToken: string): Promise<void> {
    await this.databaseService.query('delete from sessions where token = $1', [sessionToken]);
  }

  private toEmployeeRecord(row: EmployeeRow): EmployeeRecord {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      roleId: row.roleId,
      isActive: row.isActive,
      password: row.password,
      permissionOverrides: {
        grantedPermissions: toTextArray(row.grantedPermissions) as EmployeeRecord['permissionOverrides']['grantedPermissions'],
        revokedPermissions: toTextArray(row.revokedPermissions) as EmployeeRecord['permissionOverrides']['revokedPermissions']
      }
    };
  }

  private toSessionRecord(row: SessionRow): SessionRecord {
    return {
      token: row.token,
      employeeId: row.employeeId,
      surface: row.surface,
      deviceLabel: row.deviceLabel ?? undefined,
      issuedAt: toIsoString(row.issuedAt)
    };
  }
}
