import { randomUUID } from 'node:crypto';
import type { AdminAuditAction, AdminAuditEntry, EmployeeRecord } from './identity-access.types';

export function buildIdentityAuditEntry(
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

export function buildEmployeeUpdateAuditEntries(
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
      buildIdentityAuditEntry(
        actor,
        resulting,
        'employee_role_changed',
        `Role changed from ${before.roleId} to ${resulting.roleId}.`
      )
    );
  }
  if (resulting.isActive !== before.isActive) {
    entries.push(
      buildIdentityAuditEntry(
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
      buildIdentityAuditEntry(
        actor,
        resulting,
        'employee_overrides_changed',
        `Updated permission overrides (granted: ${afterGranted.length}, revoked: ${afterRevoked.length}).`
      )
    );
  }
  return entries;
}
