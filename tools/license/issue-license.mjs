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
const licenseKind = parseRequestedLicenseKind(args.kind ?? args['license-kind'] ?? 'paid');

if (!privateKeyPath || privateKeyPath === process.cwd()) {
  throw new Error('Missing required --private-key=<path>.');
}
if (!outputPath || outputPath === process.cwd()) {
  throw new Error('Missing required --output=<path>.');
}
if (existsSync(outputPath) && !force) {
  throw new Error(`${outputPath} already exists. Pass --force=true to overwrite it.`);
}

const license = buildLicense(licenseKind);

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
appendFileSync(ledgerPath, `${JSON.stringify(buildLedgerEntry(license, outputPath))}\n`);

console.log(`Wrote license file: ${outputPath}`);
console.log(`Appended issued-license ledger: ${ledgerPath}`);

function buildLicense(kind) {
  const base = {
    licenseId: assertNonBlank(args['license-id'], 'license-id'),
    shopName: assertNonBlank(args['shop-name'], 'shop-name'),
    issuedAt: args['issued-at']
      ? assertIsoTimestamp(args['issued-at'], 'issued-at')
      : new Date().toISOString()
  };

  if (kind === 'legacy') {
    assertArgumentAbsent('operation-end', 'v1 legacy licenses do not carry operationEnd.');
    assertArgumentAbsent(
      'terminated-license-id',
      'v1 legacy licenses do not terminate another license.'
    );
    assertArgumentAbsent(
      'termination-reason',
      'v1 legacy licenses do not carry terminationReason.'
    );
    return {
      schemaVersion: 1,
      ...base,
      updateWindowEnd: assertIsoDate(args['update-window-end'], 'update-window-end')
    };
  }

  if (kind === 'paid') {
    assertArgumentAbsent('operation-end', 'paid licenses must never carry operationEnd.');
    assertArgumentAbsent(
      'terminated-license-id',
      'paid licenses do not terminate another license.'
    );
    assertArgumentAbsent('termination-reason', 'paid licenses do not carry terminationReason.');
    return {
      schemaVersion: 2,
      licenseKind: 'paid',
      ...base,
      updateWindowEnd: assertIsoDate(args['update-window-end'], 'update-window-end')
    };
  }

  if (kind === 'trial') {
    assertArgumentAbsent(
      'terminated-license-id',
      'trial licenses do not terminate another license.'
    );
    assertArgumentAbsent('termination-reason', 'trial licenses do not carry terminationReason.');
    return {
      schemaVersion: 2,
      licenseKind: 'trial',
      ...base,
      updateWindowEnd: assertIsoDate(args['update-window-end'], 'update-window-end'),
      operationEnd: assertIsoDate(args['operation-end'], 'operation-end')
    };
  }

  assertArgumentAbsent('update-window-end', 'data-only licenses do not carry updateWindowEnd.');
  assertArgumentAbsent('operation-end', 'data-only licenses do not carry operationEnd.');
  return {
    schemaVersion: 2,
    licenseKind: 'dataOnly',
    ...base,
    terminatedLicenseId: assertNonBlank(args['terminated-license-id'], 'terminated-license-id'),
    terminationReason: assertNonBlank(args['termination-reason'], 'termination-reason')
  };
}

function buildLedgerEntry(licenseBody, licenseFilePath) {
  const entry = {
    recordedAt: new Date().toISOString(),
    schemaVersion: licenseBody.schemaVersion,
    licenseKind: licenseBody.schemaVersion === 1 ? 'paid' : licenseBody.licenseKind,
    licenseId: licenseBody.licenseId,
    shopName: licenseBody.shopName,
    issuedAt: licenseBody.issuedAt,
    keyId: licenseKeyId,
    licenseFilePath
  };

  if ('updateWindowEnd' in licenseBody) {
    entry.updateWindowEnd = licenseBody.updateWindowEnd;
  }
  if ('operationEnd' in licenseBody) {
    entry.operationEnd = licenseBody.operationEnd;
  }
  if ('terminatedLicenseId' in licenseBody) {
    entry.terminatedLicenseId = licenseBody.terminatedLicenseId;
  }
  if ('terminationReason' in licenseBody) {
    entry.terminationReason = licenseBody.terminationReason;
  }

  return entry;
}

function parseRequestedLicenseKind(value) {
  if (value === 'paid' || value === 'trial' || value === 'legacy') {
    return value;
  }
  if (value === 'dataOnly' || value === 'data-only') {
    return 'dataOnly';
  }
  throw new Error('--kind must be paid, trial, dataOnly, data-only, or legacy.');
}

function assertArgumentAbsent(name, message) {
  if (Object.prototype.hasOwnProperty.call(args, name)) {
    throw new Error(`--${name} is not allowed: ${message}`);
  }
}
