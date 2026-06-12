import { randomBytes } from 'node:crypto';
import { getRelayRuntimeConfig } from '../common/config/runtime-config';
import { DatabaseService } from '../database/database.service';
import { RelayIdentityRepository } from '../modules/identity/relay-identity.repository';
import { generateRelayToken } from '../modules/identity/relay-token.util';
import { parseRelayAdminArgs, relayAdminUsage } from './relay-admin-args';

// BellField-side issuance tooling (docs/relay-token-design.md). Runs against
// the relay database directly; never ships in the release artifact.
async function main(): Promise<number> {
  const parsed = parseRelayAdminArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Error: ${parsed.error}`);
    console.error(relayAdminUsage);
    return 1;
  }

  const database = new DatabaseService();
  const repository = new RelayIdentityRepository(database);
  const now = new Date();

  try {
    const input = parsed.parsed;

    if (input.command === 'create-shop') {
      const shopId = `shop_${randomBytes(6).toString('hex')}`;
      const monthlySendQuota =
        input.monthlySendQuota ?? getRelayRuntimeConfig().defaultMonthlySendQuota;
      await repository.createShop({
        id: shopId,
        displayName: input.displayName,
        licenseId: input.licenseId,
        monthlySendQuota,
        createdAt: now
      });
      printResult({
        command: input.command,
        shopId,
        displayName: input.displayName,
        licenseId: input.licenseId,
        monthlySendQuota
      });
      return 0;
    }

    const shop = await repository.findShopById(input.shopId);
    if (!shop) {
      console.error(`Error: shop "${input.shopId}" was not found.`);
      return 1;
    }

    if (input.command === 'issue-token') {
      const generated = generateRelayToken();
      const { revokedTokenId } = await repository.issueToken({
        shopId: shop.id,
        tokenId: generated.tokenId,
        tokenHash: generated.tokenHash,
        issuedAt: now
      });
      printResult({
        command: input.command,
        shopId: shop.id,
        tokenId: generated.tokenId,
        revokedTokenId,
        // The plaintext token exists exactly here, once. Deliver it to the
        // shop server's env file over the same trusted channel as the license.
        relayToken: generated.token
      });
      return 0;
    }

    if (input.command === 'revoke-token') {
      const { revokedTokenId } = await repository.revokeActiveToken({
        shopId: shop.id,
        revokedAt: now
      });
      if (!revokedTokenId) {
        console.error(`Error: shop "${shop.id}" has no active token to revoke.`);
        return 1;
      }
      printResult({ command: input.command, shopId: shop.id, revokedTokenId });
      return 0;
    }

    if (input.command === 'reactivate-shop') {
      const reactivated = await repository.reactivateShop(shop.id, now);
      if (!reactivated) {
        console.error(`Error: shop "${shop.id}" is not suspended.`);
        return 1;
      }
      printResult({ command: input.command, shopId: shop.id, status: 'active' });
      return 0;
    }

    const tokens = await repository.listTokensForShop(shop.id);
    const events = await repository.listRecentEvents(shop.id, 20);
    printResult({
      command: input.command,
      shop: {
        id: shop.id,
        displayName: shop.displayName,
        licenseId: shop.licenseId,
        status: shop.status,
        monthlySendQuota: shop.monthlySendQuota,
        suspendedReason: shop.suspendedReason,
        createdAt: shop.createdAt.toISOString()
      },
      tokens: tokens.map((token) => ({
        tokenId: token.tokenId,
        status: token.status,
        boundInstanceId: token.boundInstanceId,
        boundAt: token.boundAt?.toISOString() ?? null,
        lastSeenAt: token.lastSeenAt?.toISOString() ?? null,
        createdAt: token.createdAt.toISOString(),
        revokedAt: token.revokedAt?.toISOString() ?? null
      })),
      recentEvents: events.map((event) => ({
        kind: event.kind,
        tokenId: event.tokenId,
        instanceId: event.instanceId,
        at: event.createdAt.toISOString()
      }))
    });
    return 0;
  } finally {
    await database.onModuleDestroy();
  }
}

function printResult(result: Record<string, unknown>): void {
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
