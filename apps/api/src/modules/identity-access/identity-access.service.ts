import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  EmployeeAdminDetailResponse,
  EmployeeSessionsResponse,
  ResetEmployeePasswordResponse,
  RevokeEmployeeSessionResponse
} from '@bellfield/contracts';
import { defaultRoleTemplates } from './default-role-templates';
import { hashPassword, verifyPassword } from './password-hash';
import { IdentityAccessRepository } from './identity-access.repository';
import type {
  AdminAuditAction,
  AdminAuditEntry,
  AuthorizedEmployee,
  CreateEmployeeRequestDto,
  CreateFirstOwnerRequestDto,
  EmployeeRecord,
  EmployeeSummary,
  IdentitySetupStatusResponseDto,
  LoginSurface,
  LoginRequestDto,
  LoginResponseDto,
  PermissionKey,
  ResetEmployeePasswordRequestDto,
  RoleTemplate,
  SessionRecord,
  UpdateEmployeeRequestDto
} from './identity-access.types';

/** Postgres unique-violation code (duplicate email on create). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class IdentityAccessService implements OnModuleInit {
  private readonly logger = new Logger(IdentityAccessService.name);
  private setupTokenHash: Buffer | null = null;
  private setupTokenConsumed = false;
  private setupFailedAttempts = 0;
  private setupFailureWindowStartedAt = 0;
  private setupBlockedUntil = 0;

  constructor(private readonly identityAccessRepository: IdentityAccessRepository) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSetupTokenForFreshInstall();
    } catch {
      this.logger.warn('First-owner setup token check skipped; database is not ready yet.');
    }
  }

  getRoleTemplates(): RoleTemplate[] {
    return Object.values(defaultRoleTemplates);
  }

  async getSetupStatus(): Promise<IdentitySetupStatusResponseDto> {
    const setupRequired = await this.ensureSetupTokenForFreshInstall();
    return { setupRequired };
  }

  async createFirstOwner(request: CreateFirstOwnerRequestDto): Promise<LoginResponseDto> {
    const setupRequired = await this.ensureSetupTokenForFreshInstall();
    if (!setupRequired) {
      throw new NotFoundException('First-owner setup is not available.');
    }

    this.assertSetupRateLimit();

    if (!this.verifySetupToken(request.setupToken.trim())) {
      this.recordFailedSetupAttempt();
      throw new UnauthorizedException('Invalid setup token.');
    }

    const email = request.email.trim();
    const existing = await this.identityAccessRepository.findEmployeeByEmail(email.toLowerCase());
    if (existing) {
      throw new ConflictException('An employee with this email already exists.');
    }

    const employee: EmployeeRecord = {
      id: randomUUID(),
      email,
      displayName: request.displayName.trim(),
      roleId: 'owner',
      isActive: true,
      password: await hashPassword(request.password),
      permissionOverrides: { grantedPermissions: [], revokedPermissions: [] }
    };

    try {
      const created =
        await this.identityAccessRepository.createFirstOwnerIfNoActiveEmployees(employee);
      if (!created) {
        this.clearSetupToken();
        throw new NotFoundException('First-owner setup is not available.');
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An employee with this email already exists.');
      }
      throw error;
    }

    this.setupTokenConsumed = true;
    this.clearSetupToken();
    this.resetSetupRateLimit();
    this.logger.log('First-owner setup completed; setup token permanently consumed.');

    const sessionToken = randomUUID();
    await this.identityAccessRepository.createSession({
      token: sessionToken,
      id: randomUUID(),
      employeeId: employee.id,
      surface: 'office-web',
      deviceLabel: 'First Owner Setup',
      issuedAt: new Date().toISOString()
    });

    return {
      sessionToken,
      employee: this.toEmployeeSummary(employee)
    };
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

    // Request-only guards (independent of any mutable employee state) run up front.
    if (update.roleId) {
      this.assertRoleExists(update.roleId);
    }
    if (update.grantedPermissions && update.revokedPermissions) {
      const revoked = new Set(update.revokedPermissions);
      const conflict = update.grantedPermissions.find((key) => revoked.has(key));
      if (conflict) {
        throw new BadRequestException(
          `Permission "${conflict}" cannot be both granted and revoked.`
        );
      }
    }

    // Everything state-dependent runs INSIDE the locked transaction against the freshly-read ACTOR and
    // target: actor permission/active re-check, owner-protection, elevation, self-protection, the
    // last-owner/authority invariants, and the audit delta. Only role/active/overrides are written, so a
    // concurrent password reset / profile edit is never clobbered.
    const updated = await this.identityAccessRepository.runEmployeeUpdate(
      actor.id,
      employeeId,
      ({ actor: freshActor, target, employees }) => {
        this.assertActorCan(freshActor, 'employeesPermissions:configure');
        this.assertCanActOnTarget(freshActor.roleId, target.roleId);
        if (update.roleId === 'owner' && freshActor.roleId !== 'owner') {
          throw new ForbiddenException('Only an owner can promote an employee to owner.');
        }
        if (update.grantedPermissions) {
          const actorPermissions = new Set(this.resolveEffectivePermissions(freshActor));
          const escalated = update.grantedPermissions.find((key) => !actorPermissions.has(key));
          if (escalated) {
            throw new ForbiddenException(
              `You cannot grant a permission you do not hold: ${escalated}.`
            );
          }
        }

        const resulting: EmployeeRecord = {
          ...target,
          roleId: update.roleId ?? target.roleId,
          isActive: typeof update.isActive === 'boolean' ? update.isActive : target.isActive,
          permissionOverrides: {
            grantedPermissions: update.grantedPermissions
              ? this.uniquePermissionKeys(update.grantedPermissions)
              : target.permissionOverrides.grantedPermissions,
            revokedPermissions: update.revokedPermissions
              ? this.uniquePermissionKeys(update.revokedPermissions)
              : target.permissionOverrides.revokedPermissions
          }
        };

        if (employeeId === freshActor.id) {
          if (!resulting.isActive) {
            throw new ForbiddenException('You cannot deactivate your own account.');
          }
          if (
            !this.resolveEffectivePermissions(resulting).includes('employeesPermissions:configure')
          ) {
            throw new ForbiddenException(
              'You cannot remove your own employee-management authority.'
            );
          }
        }

        const world = employees.map((employee) =>
          employee.id === employeeId ? resulting : employee
        );
        this.assertRetainsEmployeeAuthority(world);
        this.assertRetainsActiveOwner(world);

        const before = {
          roleId: target.roleId,
          isActive: target.isActive,
          granted: [...target.permissionOverrides.grantedPermissions].sort(),
          revoked: [...target.permissionOverrides.revokedPermissions].sort()
        };

        return {
          fields: {
            roleId: resulting.roleId,
            isActive: resulting.isActive,
            grantedPermissions: resulting.permissionOverrides.grantedPermissions,
            revokedPermissions: resulting.permissionOverrides.revokedPermissions
          },
          auditEntries: this.buildUpdateAuditEntries(freshActor, resulting, before),
          revokeSessions: target.isActive && !resulting.isActive
        };
      }
    );

    return this.toEmployeeSummary(updated);
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
    // Actor re-validation + owner-protection run inside the locked transaction against fresh rows.
    const revoked = await this.identityAccessRepository.runSessionRevoke(
      actor.id,
      employeeId,
      sessionId,
      ({ actor: freshActor, target }) => {
        this.assertActorCan(freshActor, 'employeesPermissions:configure');
        this.assertCanActOnTarget(freshActor.roleId, target.roleId);
        return this.buildAuditEntry(
          freshActor,
          target,
          'employee_session_revoked',
          `Revoked device session ${sessionId}.`
        );
      }
    );
    return { revoked };
  }

  /** Create an employee (Owner-only `employeesPermissions:create`). Password is hashed, never returned. */
  async createEmployee(
    sessionToken: string,
    request: CreateEmployeeRequestDto
  ): Promise<EmployeeSummary> {
    const actor = await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:create', [
      'office-web'
    ]);
    this.assertRoleExists(request.roleId);

    const grantedPermissions = this.uniquePermissionKeys(request.grantedPermissions ?? []);
    const revokedPermissions = this.uniquePermissionKeys(request.revokedPermissions ?? []);
    const revokedSet = new Set(revokedPermissions);
    const conflict = grantedPermissions.find((key) => revokedSet.has(key));
    if (conflict) {
      throw new BadRequestException(`Permission "${conflict}" cannot be both granted and revoked.`);
    }

    const email = request.email.trim();
    const existing = await this.identityAccessRepository.findEmployeeByEmail(email.toLowerCase());
    if (existing) {
      throw new ConflictException('An employee with this email already exists.');
    }

    const employee: EmployeeRecord = {
      id: randomUUID(),
      email,
      displayName: request.displayName.trim(),
      roleId: request.roleId,
      isActive: request.isActive ?? true,
      password: await hashPassword(request.password),
      permissionOverrides: { grantedPermissions, revokedPermissions }
    };

    try {
      // Actor re-validation (active + create perm), owner-creation, and no-escalation run inside the
      // locked transaction against the freshly-read actor; the audit row uses that fresh actor.
      await this.identityAccessRepository.createEmployeeWithAudit(
        actor.id,
        employee,
        ({ actor: freshActor }) => {
          this.assertActorCan(freshActor, 'employeesPermissions:create');
          if (employee.roleId === 'owner' && freshActor.roleId !== 'owner') {
            throw new ForbiddenException('Only an owner can create an owner.');
          }
          const actorPermissions = new Set(this.resolveEffectivePermissions(freshActor));
          const escalated = grantedPermissions.find((key) => !actorPermissions.has(key));
          if (escalated) {
            throw new ForbiddenException(
              `You cannot grant a permission you do not hold: ${escalated}.`
            );
          }
          return this.buildAuditEntry(
            freshActor,
            employee,
            'employee_created',
            `Created ${employee.roleId} account${employee.isActive ? '' : ' (inactive)'}.`
          );
        }
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An employee with this email already exists.');
      }
      throw error;
    }

    return this.toEmployeeSummary(employee);
  }

  /** Full admin view of one employee + their sessions. Gate: employeesPermissions:view. */
  async getEmployeeDetail(
    sessionToken: string,
    employeeId: string
  ): Promise<EmployeeAdminDetailResponse> {
    await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:view', ['office-web']);
    const employee = await this.identityAccessRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    const sessions = await this.identityAccessRepository.listSessionsForEmployee(employeeId);
    return { employee: this.toEmployeeSummary(employee), sessions };
  }

  /** Admin password reset: hash the new value, revoke all of the target's sessions, audit. Gate:
   * employeesPermissions:configure (+ owner-protection). The password is never returned. */
  async resetEmployeePassword(
    sessionToken: string,
    employeeId: string,
    request: ResetEmployeePasswordRequestDto
  ): Promise<ResetEmployeePasswordResponse> {
    const actor = await this.getAuthorizedEmployee(sessionToken, 'employeesPermissions:configure', [
      'office-web'
    ]);
    const passwordHash = await hashPassword(request.password);
    // Actor re-validation + owner-protection run inside the locked transaction against fresh rows.
    const revokedSessionCount = await this.identityAccessRepository.runPasswordReset(
      actor.id,
      employeeId,
      passwordHash,
      ({ actor: freshActor, target }) => {
        this.assertActorCan(freshActor, 'employeesPermissions:configure');
        this.assertCanActOnTarget(freshActor.roleId, target.roleId);
        return this.buildAuditEntry(
          freshActor,
          target,
          'employee_password_reset',
          'Reset the account password and revoked active sessions.'
        );
      }
    );
    return { revokedSessionCount };
  }

  /** Re-validate the fresh (under-lock) actor: still active and still holding the gate permission. */
  private assertActorCan(actor: EmployeeRecord, permissionKey: PermissionKey): void {
    if (!actor.isActive) {
      throw new ForbiddenException('Your account is inactive.');
    }
    if (!this.resolveEffectivePermissions(actor).includes(permissionKey)) {
      throw new ForbiddenException('You no longer have permission to perform this action.');
    }
  }

  /** Build the per-action audit rows for an employee update (role / active / overrides). */
  private buildUpdateAuditEntries(
    actor: { id: string; displayName: string; email: string },
    resulting: EmployeeRecord,
    before: {
      roleId: EmployeeRecord['roleId'];
      isActive: boolean;
      granted: string[];
      revoked: string[];
    }
  ): AdminAuditEntry[] {
    const entries: AdminAuditEntry[] = [];
    if (resulting.roleId !== before.roleId) {
      entries.push(
        this.buildAuditEntry(
          actor,
          resulting,
          'employee_role_changed',
          `Role changed from ${before.roleId} to ${resulting.roleId}.`
        )
      );
    }
    if (resulting.isActive !== before.isActive) {
      entries.push(
        this.buildAuditEntry(
          actor,
          resulting,
          resulting.isActive ? 'employee_activated' : 'employee_deactivated',
          resulting.isActive ? 'Reactivated the account.' : 'Deactivated the account.'
        )
      );
    }
    const afterGranted = [...resulting.permissionOverrides.grantedPermissions].sort();
    const afterRevoked = [...resulting.permissionOverrides.revokedPermissions].sort();
    if (
      JSON.stringify(afterGranted) !== JSON.stringify(before.granted) ||
      JSON.stringify(afterRevoked) !== JSON.stringify(before.revoked)
    ) {
      entries.push(
        this.buildAuditEntry(
          actor,
          resulting,
          'employee_overrides_changed',
          `Updated permission overrides (granted: ${afterGranted.length}, revoked: ${afterRevoked.length}).`
        )
      );
    }
    return entries;
  }

  /** Build one non-secret audit row (no passwords/tokens in the summary). */
  private buildAuditEntry(
    actor: { id: string; displayName: string; email: string },
    target: { id: string; displayName: string; email: string },
    action: AdminAuditAction,
    summary: string
  ): AdminAuditEntry {
    return {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      actorEmployeeId: actor.id,
      actorName: actor.displayName,
      actorEmail: actor.email,
      targetEmployeeId: target.id,
      targetName: target.displayName,
      targetEmail: target.email,
      action,
      summary
    };
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

  private async ensureSetupTokenForFreshInstall(): Promise<boolean> {
    const activeEmployeeCount = await this.identityAccessRepository.countActiveEmployees();
    if (activeEmployeeCount > 0 || this.setupTokenConsumed) {
      this.clearSetupToken();
      return false;
    }

    if (!this.setupTokenHash) {
      const setupToken = randomBytes(24).toString('base64url');
      this.setupTokenHash = this.hashSetupToken(setupToken);
      this.logger.warn(
        `BellField first-owner setup token: ${setupToken}. Use it once at /identity/setup/first-owner; it is not shown in the browser.`
      );
    }

    return true;
  }

  private verifySetupToken(candidate: string): boolean {
    if (!this.setupTokenHash) {
      return false;
    }

    const candidateHash = this.hashSetupToken(candidate);
    return timingSafeEqual(candidateHash, this.setupTokenHash);
  }

  private hashSetupToken(token: string): Buffer {
    return createHash('sha256').update(token, 'utf8').digest();
  }

  private assertSetupRateLimit(): void {
    if (Date.now() < this.setupBlockedUntil) {
      throw new HttpException(
        'Too many invalid setup attempts. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private recordFailedSetupAttempt(): void {
    const now = Date.now();
    if (now - this.setupFailureWindowStartedAt > 10 * 60 * 1000) {
      this.setupFailureWindowStartedAt = now;
      this.setupFailedAttempts = 0;
    }

    this.setupFailedAttempts += 1;
    if (this.setupFailedAttempts >= 5) {
      this.setupBlockedUntil = now + 5 * 60 * 1000;
    }
  }

  private resetSetupRateLimit(): void {
    this.setupFailedAttempts = 0;
    this.setupFailureWindowStartedAt = 0;
    this.setupBlockedUntil = 0;
  }

  private clearSetupToken(): void {
    this.setupTokenHash = null;
  }

  private buildSurfaceErrorMessage(allowedSurfaces: LoginSurface[]): string {
    return allowedSurfaces.includes('field-mobile') && allowedSurfaces.includes('office-web')
      ? 'This action is not available for the current session surface.'
      : allowedSurfaces[0] === 'field-mobile'
        ? 'This action is only available from the BellField field app.'
        : 'This action is only available from the BellField office app.';
  }
}
