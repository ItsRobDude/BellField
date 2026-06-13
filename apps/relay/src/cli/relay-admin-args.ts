export type RelayAdminCommand =
  | { command: 'create-shop'; displayName: string; licenseId: string; monthlySendQuota?: number }
  | { command: 'issue-token'; shopId: string }
  | { command: 'revoke-token'; shopId: string }
  | { command: 'reactivate-shop'; shopId: string }
  | { command: 'set-update-window'; shopId: string; updateWindowEnd: string }
  | {
      command: 'set-payments-account';
      shopId: string;
      stripeConnectedAccountId: string;
      enabled: boolean;
    }
  | { command: 'disable-payments'; shopId: string }
  | { command: 'publish-release'; file: string; version: string; releaseDate: string }
  | { command: 'inspect'; shopId: string };

export type RelayAdminParseResult =
  | { ok: true; parsed: RelayAdminCommand }
  | { ok: false; error: string };

export const relayAdminUsage = [
  'Usage:',
  '  relay-admin create-shop --name="Shop Name" --license-id=<licenseId> [--quota=<monthlySends>]',
  '  relay-admin issue-token --shop-id=<shopId>',
  '  relay-admin revoke-token --shop-id=<shopId>',
  '  relay-admin reactivate-shop --shop-id=<shopId>',
  '  relay-admin set-update-window --shop-id=<shopId> --end=YYYY-MM-DD',
  '  relay-admin set-payments-account --shop-id=<shopId> --stripe-account-id=acct_... [--enabled=true|false]',
  '  relay-admin disable-payments --shop-id=<shopId>',
  '  relay-admin publish-release --file=<path-under-artifacts-root> --version=<v> --release-date=YYYY-MM-DD',
  '  relay-admin inspect --shop-id=<shopId>'
].join('\n');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  if (
    command === 'issue-token' ||
    command === 'revoke-token' ||
    command === 'reactivate-shop' ||
    command === 'disable-payments' ||
    command === 'inspect'
  ) {
    const shopId = getFlag(rest, 'shop-id')?.trim();
    if (!shopId) {
      return { ok: false, error: `${command} requires --shop-id.` };
    }
    return { ok: true, parsed: { command, shopId } };
  }

  if (command === 'set-payments-account') {
    const shopId = getFlag(rest, 'shop-id')?.trim();
    const stripeConnectedAccountId = getFlag(rest, 'stripe-account-id')?.trim();
    const enabledRaw = getFlag(rest, 'enabled')?.trim().toLowerCase();
    if (!shopId) {
      return { ok: false, error: 'set-payments-account requires --shop-id.' };
    }
    if (!stripeConnectedAccountId || !stripeConnectedAccountId.startsWith('acct_')) {
      return { ok: false, error: 'set-payments-account requires --stripe-account-id=acct_...' };
    }
    if (enabledRaw !== undefined && enabledRaw !== 'true' && enabledRaw !== 'false') {
      return { ok: false, error: '--enabled must be true or false.' };
    }
    return {
      ok: true,
      parsed: {
        command,
        shopId,
        stripeConnectedAccountId,
        enabled: enabledRaw !== 'false'
      }
    };
  }

  if (command === 'set-update-window') {
    const shopId = getFlag(rest, 'shop-id')?.trim();
    const updateWindowEnd = getFlag(rest, 'end')?.trim();
    if (!shopId) {
      return { ok: false, error: 'set-update-window requires --shop-id.' };
    }
    if (!updateWindowEnd || !ISO_DATE_PATTERN.test(updateWindowEnd)) {
      return { ok: false, error: 'set-update-window requires --end=YYYY-MM-DD.' };
    }
    return { ok: true, parsed: { command, shopId, updateWindowEnd } };
  }

  if (command === 'publish-release') {
    const file = getFlag(rest, 'file')?.trim();
    const version = getFlag(rest, 'version')?.trim();
    const releaseDate = getFlag(rest, 'release-date')?.trim();
    if (!file) {
      return { ok: false, error: 'publish-release requires --file.' };
    }
    if (!version) {
      return { ok: false, error: 'publish-release requires --version.' };
    }
    if (!releaseDate || !ISO_DATE_PATTERN.test(releaseDate)) {
      return { ok: false, error: 'publish-release requires --release-date=YYYY-MM-DD.' };
    }
    return { ok: true, parsed: { command, file, version, releaseDate } };
  }

  return { ok: false, error: command ? `Unknown command "${command}".` : 'No command given.' };
}
