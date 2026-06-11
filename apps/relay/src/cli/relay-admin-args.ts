export type RelayAdminCommand =
  | { command: 'create-shop'; displayName: string; licenseId: string; monthlySendQuota?: number }
  | { command: 'issue-token'; shopId: string }
  | { command: 'revoke-token'; shopId: string }
  | { command: 'inspect'; shopId: string };

export type RelayAdminParseResult =
  | { ok: true; parsed: RelayAdminCommand }
  | { ok: false; error: string };

export const relayAdminUsage = [
  'Usage:',
  '  relay-admin create-shop --name="Shop Name" --license-id=<licenseId> [--quota=<monthlySends>]',
  '  relay-admin issue-token --shop-id=<shopId>',
  '  relay-admin revoke-token --shop-id=<shopId>',
  '  relay-admin inspect --shop-id=<shopId>'
].join('\n');

function getFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

export function parseRelayAdminArgs(args: string[]): RelayAdminParseResult {
  const [command, ...rest] = args;

  if (command === 'create-shop') {
    const displayName = getFlag(rest, 'name')?.trim();
    const licenseId = getFlag(rest, 'license-id')?.trim();
    const quotaRaw = getFlag(rest, 'quota');
    if (!displayName) {
      return { ok: false, error: 'create-shop requires --name.' };
    }
    if (!licenseId) {
      return { ok: false, error: 'create-shop requires --license-id.' };
    }
    if (quotaRaw !== undefined) {
      const quota = Number(quotaRaw);
      if (!Number.isInteger(quota) || quota <= 0) {
        return { ok: false, error: '--quota must be a positive integer.' };
      }
      return {
        ok: true,
        parsed: { command: 'create-shop', displayName, licenseId, monthlySendQuota: quota }
      };
    }
    return { ok: true, parsed: { command: 'create-shop', displayName, licenseId } };
  }

  if (command === 'issue-token' || command === 'revoke-token' || command === 'inspect') {
    const shopId = getFlag(rest, 'shop-id')?.trim();
    if (!shopId) {
      return { ok: false, error: `${command} requires --shop-id.` };
    }
    return { ok: true, parsed: { command, shopId } };
  }

  return { ok: false, error: command ? `Unknown command "${command}".` : 'No command given.' };
}
