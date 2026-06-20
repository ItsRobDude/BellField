import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { EmployeeSessionSummary } from '@bellfield/contracts';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toTextArray } from '../../database/database-row.utils';
import type { AdminAuditEntry, EmployeeRecord, SessionRecord } from './identity-access.types';

// Single transaction-level advisory-lock key that serializes ALL sensitive identity admin writes, so
// every such write re-reads the target + employee list under the lock and re-runs its guards against
// fresh rows — no stale-target overwrite, no two writes both passing a pre-check.
const IDENTITY_ADMIN_LOCK_KEY = 4_310_010_001;

/** The mutable employee columns an update may change — deliberately NOT password/email/displayName, so
 * a concurrent password reset or profile change is never clobbered by a stale update. */
export type EmployeeUpdateFields = {
  roleId: EmployeeRecord['roleId'];
  isActive: boolean;
  grantedPermissions: EmployeeRecord['permissionOverrides']['grantedPermissions'];
  revokedPermissions: EmployeeRecord['permissionOverrides']['revokedPermissions'];
};

/** What a service-supplied `prepare` step yields after its under-lock guards pass. */
export type PreparedEmployeeUpdate = {
  fields: EmployeeUpdateFields;
  auditEntries: AdminAuditEntry[];
  revokeSessions: boolean;
};

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

type LoginAttemptRow = {
  failedCount: number;
  windowStartedAt: string | Date;
  lastFailedAt: string | Date;
  blockedUntil: string | Date | null;
};

export type LoginAttemptState = {
  failedCount: number;
  windowStartedAt: string;
  lastFailedAt: string;
  blockedUntil?: string;
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
    return this.findEmployeeByIdWithin(this.databaseService, employeeId);
  }

  private async findEmployeeByIdWithin(
    queryable: QueryExecutor,
    employeeId: string
  ): Promise<EmployeeRecord | null> {
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

  async countActiveEmployees(): Promise<number> {
    const result = await this.databaseService.query<{ count: number }>(
      'select count(*)::int as count from employees where is_active = true'
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async findLoginAttemptState(bucketKey: string): Promise<LoginAttemptState | null> {
    const result = await this.databaseService.query<LoginAttemptRow>(
      `
        select
          failed_count as "failedCount",
          window_started_at as "windowStartedAt",
          last_failed_at as "lastFailedAt",
          blocked_until as "blockedUntil"
        from identity_login_attempts
        where bucket_key = $1
        limit 1
      `,
      [bucketKey]
    );

    return result.rows[0] ? this.toLoginAttemptState(result.rows[0]) : null;
  }

  async recordFailedLoginAttempt(input: {
    bucketKey: string;
    occurredAt: string;
    windowCutoff: string;
    failureThreshold: number;
    blockedUntil: string;
  }): Promise<LoginAttemptState> {
    const result = await this.databaseService.query<LoginAttemptRow>(
      `
        insert into identity_login_attempts (
          bucket_key,
          failed_count,
          window_started_at,
          last_failed_at,
          blocked_until,
          updated_at
        )
        values ($1, 1, $2, $2, null, $2)
        on conflict (bucket_key) do update set
          failed_count = case
            when identity_login_attempts.window_started_at < $3 then 1
            else identity_login_attempts.failed_count + 1
          end,
          window_started_at = case
            when identity_login_attempts.window_started_at < $3 then $2
            else identity_login_attempts.window_started_at
          end,
          last_failed_at = $2,
          blocked_until = case
            when identity_login_attempts.window_started_at < $3 then null
            when identity_login_attempts.failed_count + 1 >= $4 then $5
            else null
          end,
          updated_at = $2
        returning
          failed_count as "failedCount",
          window_started_at as "windowStartedAt",
          last_failed_at as "lastFailedAt",
          blocked_until as "blockedUntil"
      `,
      [
        input.bucketKey,
        input.occurredAt,
        input.windowCutoff,
        input.failureThreshold,
        input.blockedUntil
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed login attempt could not be recorded.');
    }

    return this.toLoginAttemptState(row);
  }

  async clearLoginAttemptState(bucketKey: string): Promise<number> {
    const result = await this.databaseService.query(
      'delete from identity_login_attempts where bucket_key = $1',
      [bucketKey]
    );

    return result.rowCount ?? 0;
  }

  async pruneStaleLoginAttemptStates(cutoff: string): Promise<void> {
    await this.databaseService.query(
      `
        delete from identity_login_attempts
        where updated_at < $1
          and (blocked_until is null or blocked_until < $1)
      `,
      [cutoff]
    );
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

  /** Update ONLY role/active/overrides — never password/email/displayName (see EmployeeUpdateFields). */
  private async updateEmployeeFieldsWithin(
    queryable: QueryExecutor,
    employeeId: string,
    fields: EmployeeUpdateFields
  ): Promise<void> {
    await queryable.query(
      `
        update employees
        set
          role_id = $2,
          is_active = $3,
          granted_permissions = $4::text[],
          revoked_permissions = $5::text[],
          updated_at = now()
        where id = $1
      `,
      [
        employeeId,
        fields.roleId,
        fields.isActive,
        fields.grantedPermissions,
        fields.revokedPermissions
      ]
    );
  }

  private async acquireIdentityAdminLock(queryable: QueryExecutor): Promise<void> {
    await queryable.query('select pg_advisory_xact_lock($1)', [IDENTITY_ADMIN_LOCK_KEY]);
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

  async pruneSessionsIssuedBefore(cutoff: string): Promise<void> {
    await this.databaseService.query('delete from sessions where issued_at < $1', [cutoff]);
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

  /** Re-read the actor under the lock; absent (deleted) is a hard stop. */
  private async loadActorWithin(
    queryable: QueryExecutor,
    actorId: string
  ): Promise<EmployeeRecord> {
    const actor = await this.findEmployeeByIdWithin(queryable, actorId);
    if (!actor) {
      throw new ForbiddenException('Your account no longer exists.');
    }
    return actor;
  }

  /**
   * Create an employee in one locked transaction. Re-reads the CURRENT actor under the lock and lets
   * `prepare` re-validate them (active + create permission + role/elevation) against fresh rows before
   * inserting, then records the returned audit row.
   */
  async createEmployeeWithAudit(
    actorId: string,
    employee: EmployeeRecord,
    prepare: (current: { actor: EmployeeRecord }) => AdminAuditEntry
  ): Promise<void> {
    await this.databaseService.transaction(async (queryable) => {
      await this.acquireIdentityAdminLock(queryable);
      const actor = await this.loadActorWithin(queryable, actorId);
      const auditEntry = prepare({ actor });
      await this.insertEmployeeWithin(queryable, employee);
      await this.insertAuditEntryWithin(queryable, auditEntry);
    });
  }

  async createFirstOwnerIfNoActiveEmployees(employee: EmployeeRecord): Promise<boolean> {
    return this.databaseService.transaction(async (queryable) => {
      await this.acquireIdentityAdminLock(queryable);
      const activeEmployees = await queryable.query<{ count: number }>(
        'select count(*)::int as count from employees where is_active = true'
      );

      if (Number(activeEmployees.rows[0]?.count ?? 0) > 0) {
        return false;
      }

      await this.insertEmployeeWithin(queryable, employee);
      return true;
    });
  }

  /**
   * Apply an employee update atomically. Under the advisory lock, re-reads the CURRENT actor, target,
   * and employee list, then hands them to the service's `prepare` step which re-runs every
   * state-dependent guard (actor permission/active, owner-protection, elevation, self-protection,
   * last-owner/authority) against fresh rows and returns the fields to write + audit rows + whether to
   * revoke sessions. Only role/active/overrides are written, so a concurrent password reset or profile
   * change can't be clobbered. Returns the persisted record.
   */
  async runEmployeeUpdate(
    actorId: string,
    employeeId: string,
    prepare: (current: {
      actor: EmployeeRecord;
      target: EmployeeRecord;
      employees: EmployeeRecord[];
    }) => PreparedEmployeeUpdate
  ): Promise<EmployeeRecord> {
    return this.databaseService.transaction(async (queryable) => {
      await this.acquireIdentityAdminLock(queryable);
      const actor = await this.loadActorWithin(queryable, actorId);
      const target = await this.findEmployeeByIdWithin(queryable, employeeId);
      if (!target) {
        throw new NotFoundException('Employee not found.');
      }
      const employees = await this.listEmployeesWithin(queryable);
      const { fields, auditEntries, revokeSessions } = prepare({ actor, target, employees });

      await this.updateEmployeeFieldsWithin(queryable, employeeId, fields);
      for (const entry of auditEntries) {
        await this.insertAuditEntryWithin(queryable, entry);
      }
      if (revokeSessions) {
        await this.revokeAllSessionsWithin(queryable, employeeId);
      }
      const updated = await this.findEmployeeByIdWithin(queryable, employeeId);
      return updated as EmployeeRecord;
    });
  }

  /**
   * Reset a password under the lock: re-read the CURRENT actor + target, let `prepare` re-validate the
   * actor and owner-protection against fresh rows and return the audit row, then write the hash +
   * revoke all sessions + audit.
   */
  async runPasswordReset(
    actorId: string,
    employeeId: string,
    passwordHash: string,
    prepare: (current: { actor: EmployeeRecord; target: EmployeeRecord }) => AdminAuditEntry
  ): Promise<number> {
    return this.databaseService.transaction(async (queryable) => {
      await this.acquireIdentityAdminLock(queryable);
      const actor = await this.loadActorWithin(queryable, actorId);
      const target = await this.findEmployeeByIdWithin(queryable, employeeId);
      if (!target) {
        throw new NotFoundException('Employee not found.');
      }
      const auditEntry = prepare({ actor, target });
      await queryable.query(
        `update employees set password = $2, updated_at = now() where id = $1`,
        [employeeId, passwordHash]
      );
      const revokedSessionCount = await this.revokeAllSessionsWithin(queryable, employeeId);
      await this.insertAuditEntryWithin(queryable, auditEntry);
      return revokedSessionCount;
    });
  }

  /**
   * Revoke one session under the lock: re-read the CURRENT actor + target, let `prepare` re-validate
   * the actor and owner-protection against fresh rows and return the audit row, then revoke (audit only
   * if a row was removed).
   */
  async runSessionRevoke(
    actorId: string,
    employeeId: string,
    sessionId: string,
    prepare: (current: { actor: EmployeeRecord; target: EmployeeRecord }) => AdminAuditEntry
  ): Promise<boolean> {
    return this.databaseService.transaction(async (queryable) => {
      await this.acquireIdentityAdminLock(queryable);
      const actor = await this.loadActorWithin(queryable, actorId);
      const target = await this.findEmployeeByIdWithin(queryable, employeeId);
      if (!target) {
        throw new NotFoundException('Employee not found.');
      }
      const auditEntry = prepare({ actor, target });
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

  private toLoginAttemptState(row: LoginAttemptRow): LoginAttemptState {
    return {
      failedCount: Number(row.failedCount),
      windowStartedAt: toIsoString(row.windowStartedAt),
      lastFailedAt: toIsoString(row.lastFailedAt),
      blockedUntil: row.blockedUntil ? toIsoString(row.blockedUntil) : undefined
    };
  }
}
