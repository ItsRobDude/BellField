import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { getRelayRuntimeConfig } from '../common/config/runtime-config';
import { DatabaseService } from '../database/database.service';
import { RelayIdentityRepository } from '../modules/identity/relay-identity.repository';
import { generateRelayToken } from '../modules/identity/relay-token.util';
import { RelayReleasesRepository } from '../modules/releases/releases.repository';
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

    if (input.command === 'publish-release') {
      const releasesRepository = new RelayReleasesRepository(database);
      const artifactsRoot = getRelayRuntimeConfig().artifactsRoot;
      if (!artifactsRoot) {
        console.error('Error: BELLFIELD_RELAY_ARTIFACTS_ROOT is not configured.');
        return 1;
      }
      const root = path.resolve(artifactsRoot);
      const absolute = path.resolve(root, input.file);
      if (!absolute.startsWith(root + path.sep) && absolute !== root) {
        console.error('Error: --file must live under the artifacts root.');
        return 1;
      }
      let fileStat;
      try {
        fileStat = await stat(absolute);
      } catch {
        console.error(`Error: artifact file was not found: ${absolute}`);
        return 1;
      }
      if (!fileStat.isFile() || fileStat.size <= 0) {
        console.error('Error: artifact file is empty or not a regular file.');
        return 1;
      }
      const existing = await releasesRepository.findReleaseByVersion(input.version);
      if (existing) {
        console.error(`Error: version "${input.version}" is already published.`);
        return 1;
      }
      const sha256 = await hashFile(absolute);
      const releaseId = randomUUID();
      await releasesRepository.publishRelease({
        id: releaseId,
        version: input.version,
        releaseDate: input.releaseDate,
        filename: path.relative(root, absolute).split(path.sep).join('/'),
        sha256,
        byteSize: fileStat.size
      });
      printResult({
        command: input.command,
        releaseId,
        version: input.version,
        releaseDate: input.releaseDate,
        filename: path.relative(root, absolute).split(path.sep).join('/'),
        sha256,
        byteSize: fileStat.size
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

    if (input.command === 'set-update-window') {
      await repository.setShopUpdateWindow(shop.id, input.updateWindowEnd);
      printResult({
        command: input.command,
        shopId: shop.id,
        updateWindowEnd: input.updateWindowEnd
      });
      return 0;
    }

    if (input.command === 'set-payments-account') {
      await repository.setShopPayments({
        shopId: shop.id,
        stripeConnectedAccountId: input.stripeConnectedAccountId,
        enabled: input.enabled,
        occurredAt: now
      });
      printResult({
        command: input.command,
        shopId: shop.id,
        stripeConnectedAccountId: input.stripeConnectedAccountId,
        paymentsStatus: input.enabled ? 'enabled' : 'disabled'
      });
      return 0;
    }

    if (input.command === 'disable-payments') {
      await repository.setShopPayments({
        shopId: shop.id,
        stripeConnectedAccountId: null,
        enabled: false,
        occurredAt: now
      });
      printResult({ command: input.command, shopId: shop.id, paymentsStatus: 'disabled' });
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
        updateWindowEnd: shop.updateWindowEnd,
        paymentsStatus: shop.paymentsStatus,
        paymentsSetupStatus: shop.paymentsSetupStatus,
        stripeConnectedAccountId: shop.stripeConnectedAccountId,
        paymentsEnabledAt: shop.paymentsEnabledAt?.toISOString() ?? null,
        paymentsReadyAt: shop.paymentsReadyAt?.toISOString() ?? null,
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

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
