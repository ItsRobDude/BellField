import { createPrivateKey, sign } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  assertIsoDate,
  assertIsoTimestamp,
  assertNonBlank,
  canonicalizeJson,
  licenseKeyId,
  licenseSignatureAlgorithm,
  readArgs
} from './license-format.mjs';

const args = readArgs();
const privateKeyPath = resolve(String(args['private-key'] ?? ''));
const outputPath = resolve(String(args.output ?? ''));
const force = args.force === 'true';

if (!privateKeyPath || privateKeyPath === process.cwd()) {
  throw new Error('Missing required --private-key=<path>.');
}
if (!outputPath || outputPath === process.cwd()) {
  throw new Error('Missing required --output=<path>.');
}
if (existsSync(outputPath) && !force) {
  throw new Error(`${outputPath} already exists. Pass --force=true to overwrite it.`);
}

const license = {
  schemaVersion: 1,
  licenseId: assertNonBlank(args['license-id'], 'license-id'),
  shopName: assertNonBlank(args['shop-name'], 'shop-name'),
  issuedAt: args['issued-at']
    ? assertIsoTimestamp(args['issued-at'], 'issued-at')
    : new Date().toISOString(),
  updateWindowEnd: assertIsoDate(args['update-window-end'], 'update-window-end')
};

const privateKey = createPrivateKey(readFileSync(privateKeyPath, 'utf8'));
const signedBytes = Buffer.from(canonicalizeJson(license), 'utf8');
const signature = sign(null, signedBytes, privateKey).toString('base64url');
const envelope = {
  license,
  signature: {
    algorithm: licenseSignatureAlgorithm,
    keyId: licenseKeyId,
    value: signature
  }
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, { flag: force ? 'w' : 'wx' });

const ledgerPath = resolve(
  String(args.ledger ?? join(dirname(outputPath), 'issued-licenses.jsonl'))
);
mkdirSync(dirname(ledgerPath), { recursive: true });
appendFileSync(
  ledgerPath,
  `${JSON.stringify({
    recordedAt: new Date().toISOString(),
    licenseId: license.licenseId,
    shopName: license.shopName,
    issuedAt: license.issuedAt,
    updateWindowEnd: license.updateWindowEnd,
    keyId: licenseKeyId,
    licenseFilePath: outputPath
  })}\n`
);

console.log(`Wrote license file: ${outputPath}`);
console.log(`Appended issued-license ledger: ${ledgerPath}`);
