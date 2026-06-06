import type { PermissionKey, RoleTemplate } from '@/lib/identity-api';

/** Group `area:action` permission keys by area, returning sorted actions per area. */
export function groupByArea(keys: string[]): Array<{ area: string; actions: string[] }> {
  const groups = new Map<string, string[]>();
  for (const key of [...keys].sort()) {
    const [area, action] = key.split(':');
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)!.push(action ?? key);
  }
  return [...groups.entries()].map(([area, actions]) => ({ area, actions }));
}

/** Every permission key that appears in any role template — the grantable universe for the picker.
 * (The server still enforces no-escalation: an actor can only grant keys it itself holds.) */
export function pickablePermissionKeys(roles: RoleTemplate[]): PermissionKey[] {
  const keys = new Set<PermissionKey>();
  for (const role of roles) {
    for (const key of role.permissions) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

/** The permissions a role + overrides resolve to: (role − revoked) + granted. */
export function computeEffectivePermissions(
  rolePermissions: PermissionKey[],
  granted: PermissionKey[],
  revoked: PermissionKey[]
): Set<PermissionKey> {
  const effective = new Set<PermissionKey>(rolePermissions);
  for (const key of revoked) {
    effective.delete(key);
  }
  for (const key of granted) {
    effective.add(key);
  }
  return effective;
}
