import { Injectable } from '@nestjs/common';
import type { EmployeeSessionSummary } from '@bellfield/contracts';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toTextArray } from '../../database/database-row.utils';
import type { AdminAuditEntry, EmployeeRecord, SessionRecord } from './identity-access.types';

// Single transaction-level advisory-lock key that serializes identity admin writes which can affect
// the "at least one active owner / manager" invariants, so two concurrent updates can't both pass an
// in-transaction recheck and commit a state that leaves zero.
const IDENTITY_ADMIN_LOCK_KEY = 4_310_010_001;

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
  id: string;
  employeeId: string;
  surface: SessionRecord['surface'];
  deviceLabel: string | null;
  issuedAt: string | Date;
};

type SessionSummaryRow = {
  id: string;
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
    return this.listEmployeesWithin(this.databaseService);
  }

  private async listEmployeesWithin(queryable: QueryExecutor): Promise<EmployeeRecord[]> {
    const result = await queryable.query<EmployeeRow>(
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

    return result.rows.map((row: EmployeeRow) => this.toEmployeeRecord(row));
  }

  async saveEmployee(employee: EmployeeRecord): Promise<void> {
    await this.saveEmployeeWithin(this.databaseService, employee);
  }

  private async saveEmployeeWithin(
    queryable: QueryExecutor,
    employee: EmployeeRecord
  ): Promise<void> {
    await queryable.query(
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

  private async insertEmployeeWithin(
    queryable: QueryExecutor,
    employee: EmployeeRecord
  ): Promise<void> {
    await queryable.query(
      `
        insert into employees (
          id, email, display_name, role_id, is_active, password,
          granted_permissions, revoked_permissions, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], now(), now())
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

  private async insertAuditEntryWithin(
    queryable: QueryExecutor,
    entry: AdminAuditEntry
  ): Promise<void> {
    await queryable.query(
      `
        insert into admin_audit_entries (
          id, occurred_at, actor_employee_id, actor_name, actor_email,
          target_employee_id, target_name, target_email, action, summary
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        entry.id,
        entry.occurredAt,
        entry.actorEmployeeId,
        entry.actorName,
        entry.actorEmail,
        entry.targetEmployeeId,
        entry.targetName,
        entry.targetEmail,
        entry.action,
        entry.summary
      ]
    );
  }

  /** Update only the stored password (rehash-on-login and admin password reset). */
  async updateEmployeePassword(employeeId: string, password: string): Promise<void> {
    await this.databaseService.query(
      `update employees set password = $2, updated_at = now() where id = $1`,
      [employeeId, password]
    );
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.databaseService.query(
      `
        insert into sessions (token, id, employee_id, surface, device_label, issued_at)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        session.token,
        session.id,
        session.employeeId,
        session.surface,
        session.deviceLabel ?? null,
        session.issuedAt
      ]
    );
  }

  async findSessionByToken(sessionToken: string): Promise<SessionRecord | null> {
    const result = await this.databaseService.query<SessionRow>(
      `
        select
          token,
          id,
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

  /** Non-secret session summaries for an employee (newest first) — never includes the bearer token. */
  async listSessionsForEmployee(employeeId: string): Promise<EmployeeSessionSummary[]> {
    const result = await this.databaseService.query<SessionSummaryRow>(
      `
        select id, surface, device_label as "deviceLabel", issued_at as "issuedAt"
        from sessions
        where employee_id = $1
        order by issued_at desc
      `,
      [employeeId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      surface: row.surface,
      deviceLabel: row.deviceLabel ?? undefined,
      issuedAt: toIsoString(row.issuedAt)
    }));
  }

  /** Revoke a single session by its non-secret id, scoped to its owner. Returns true if one was deleted. */
  async revokeSessionById(employeeId: string, sessionId: string): Promise<boolean> {
    return this.revokeSessionByIdWithin(this.databaseService, employeeId, sessionId);
  }

  private async revokeSessionByIdWithin(
    queryable: QueryExecutor,
    employeeId: string,
    sessionId: string
  ): Promise<boolean> {
    const result = await queryable.query(
      'delete from sessions where id = $1 and employee_id = $2',
      [sessionId, employeeId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Revoke every session for an employee (used when deactivating). Returns the count removed. */
  async revokeAllSessionsForEmployee(employeeId: string): Promise<number> {
    return this.revokeAllSessionsWithin(this.databaseService, employeeId);
  }

  private async revokeAllSessionsWithin(
    queryable: QueryExecutor,
    employeeId: string
  ): Promise<number> {
    const result = await queryable.query('delete from sessions where employee_id = $1', [
      employeeId
    ]);
    return result.rowCount ?? 0;
  }

  // --- Transactional admin commands (state change + audit, atomic) -----------

  /** Create an employee and record the audit row in one transaction. */
  async createEmployeeWithAudit(
    employee: EmployeeRecord,
    auditEntry: AdminAuditEntry
  ): Promise<void> {
    await this.databaseService.transaction(async (queryable) => {
      await this.insertEmployeeWithin(queryable, employee);
      await this.insertAuditEntryWithin(queryable, auditEntry);
    });
  }

  /**
   * Persist an employee update with its audit rows (and optional session revoke on deactivation) in
   * one transaction. Takes a transaction-level advisory lock and re-checks the count invariants
   * (`assertInvariants`) against freshly-read rows INSIDE the transaction, so concurrent admin writes
   * can't both pass a pre-check and commit a state that leaves zero owners/managers.
   */
  async saveEmployeeWithAudit(
    employee: EmployeeRecord,
    auditEntries: AdminAuditEntry[],
    options: { revokeSessions: boolean; assertInvariants: (employees: EmployeeRecord[]) => void }
  ): Promise<void> {
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query('select pg_advisory_xact_lock($1)', [IDENTITY_ADMIN_LOCK_KEY]);
      const current = await this.listEmployeesWithin(queryable);
      const postChange = current.map((row) => (row.id === employee.id ? employee : row));
      options.assertInvariants(postChange);

      await this.saveEmployeeWithin(queryable, employee);
      for (const entry of auditEntries) {
        await this.insertAuditEntryWithin(queryable, entry);
      }
      if (options.revokeSessions) {
        await this.revokeAllSessionsWithin(queryable, employee.id);
      }
    });
  }

  /** Reset a password (hashed), revoke all of the target's sessions, and audit — atomically. */
  async resetEmployeePasswordWithAudit(
    employeeId: string,
    passwordHash: string,
    auditEntry: AdminAuditEntry
  ): Promise<number> {
    return this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `update employees set password = $2, updated_at = now() where id = $1`,
        [employeeId, passwordHash]
      );
      const revokedSessionCount = await this.revokeAllSessionsWithin(queryable, employeeId);
      await this.insertAuditEntryWithin(queryable, auditEntry);
      return revokedSessionCount;
    });
  }

  /** Revoke one session by id and audit it only if a session was actually removed — atomically. */
  async revokeSessionByIdWithAudit(
    employeeId: string,
    sessionId: string,
    auditEntry: AdminAuditEntry
  ): Promise<boolean> {
    return this.databaseService.transaction(async (queryable) => {
      const revoked = await this.revokeSessionByIdWithin(queryable, employeeId, sessionId);
      if (revoked) {
        await this.insertAuditEntryWithin(queryable, auditEntry);
      }
      return revoked;
    });
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
        grantedPermissions: toTextArray(
          row.grantedPermissions
        ) as EmployeeRecord['permissionOverrides']['grantedPermissions'],
        revokedPermissions: toTextArray(
          row.revokedPermissions
        ) as EmployeeRecord['permissionOverrides']['revokedPermissions']
      }
    };
  }

  private toSessionRecord(row: SessionRow): SessionRecord {
    return {
      token: row.token,
      id: row.id,
      employeeId: row.employeeId,
      surface: row.surface,
      deviceLabel: row.deviceLabel ?? undefined,
      issuedAt: toIsoString(row.issuedAt)
    };
  }
}
