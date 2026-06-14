import { createPublicKey, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalizeJson } from '../license/license-format.mjs';

const timestamp = new Date().toISOString();
const root = mkdtempSync(path.join(tmpdir(), 'bellfield-license-key-smoke-'));
const defaultPrivateKeyPath =
  'C:\\Users\\rober\\Documents\\API Keys\\BellField\\license-v1\\bellfield-license-private-key.pem';
const privateKeyPath = getArgValue('--private-key') || defaultPrivateKeyPath;
const ledgerPath = path.join(root, 'issued-licenses.jsonl');
const evidence = {
  name: 'License key smoke',
  startedAt: timestamp,
  checks: []
};

try {
  check('private key exists outside repo', existsSync(privateKeyPath));

  const publicKeyPem = readEmbeddedPublicKeyPem();
  const paidEnvelope = issueAndVerifyLicense({
    publicKeyPem,
    outputPath: path.join(root, 'paid-license.json'),
    args: ['--kind=paid', '--license-id=lic_smoke_paid', '--update-window-end=2027-06-11']
  });
  check(
    'issued v2 paid license verifies with embedded public key',
    paidEnvelope.license.licenseKind === 'paid',
    {
      licenseKind: paidEnvelope.license.licenseKind
    }
  );

  const trialEnvelope = issueAndVerifyLicense({
    publicKeyPem,
    outputPath: path.join(root, 'trial-license.json'),
    args: [
      '--kind=trial',
      '--license-id=lic_smoke_trial',
      '--update-window-end=2026-07-11',
      '--operation-end=2026-07-11'
    ]
  });
  check(
    'issued v2 trial license verifies with embedded public key',
    trialEnvelope.license.licenseKind === 'trial',
    {
      licenseKind: trialEnvelope.license.licenseKind,
      operationEnd: trialEnvelope.license.operationEnd
    }
  );

  const dataOnlyEnvelope = issueAndVerifyLicense({
    publicKeyPem,
    outputPath: path.join(root, 'data-only-license.json'),
    args: [
      '--kind=dataOnly',
      '--license-id=lic_smoke_data_only',
      '--terminated-license-id=lic_smoke_paid',
      '--termination-reason=refund'
    ]
  });
  check(
    'issued v2 data-only license verifies with embedded public key',
    dataOnlyEnvelope.license.licenseKind === 'dataOnly',
    {
      licenseKind: dataOnlyEnvelope.license.licenseKind,
      terminatedLicenseId: dataOnlyEnvelope.license.terminatedLicenseId
    }
  );

  const ledgerEntries = readFileSync(ledgerPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const ledgerKinds = ledgerEntries.map((entry) => entry.licenseKind);
  check(
    'issued-license ledger records all v2 kinds',
    ledgerEntries.length === 3 &&
      ledgerKinds.includes('paid') &&
      ledgerKinds.includes('trial') &&
      ledgerKinds.includes('dataOnly'),
    {
      licenseKinds: ledgerKinds
    }
  );
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  rmSync(root, { force: true, recursive: true });
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function readEmbeddedPublicKeyPem() {
  const source = readFileSync(
    path.resolve('apps', 'api', 'src', 'modules', 'licensing', 'license-verification.ts'),
    'utf8'
  );
  const match = source.match(
    /'-----BEGIN PUBLIC KEY-----',\s*'([^']+)',\s*'-----END PUBLIC KEY-----'/m
  );
  if (!match) {
    throw new Error('Could not read embedded license public key from API source.');
  }

  return ['-----BEGIN PUBLIC KEY-----', match[1], '-----END PUBLIC KEY-----', ''].join('\n');
}

function issueAndVerifyLicense({ publicKeyPem, outputPath, args }) {
  const issueResult = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'license', 'issue-license.mjs'),
      `--private-key=${privateKeyPath}`,
      '--shop-name=BellField Local Key Smoke',
      `--output=${outputPath}`,
      `--ledger=${ledgerPath}`,
      ...args
    ],
    { encoding: 'utf8', shell: false }
  );
  if (issueResult.status !== 0) {
    throw new Error(
      issueResult.stderr || issueResult.stdout || `issue-license exited ${issueResult.status}`
    );
  }

  const envelope = JSON.parse(readFileSync(outputPath, 'utf8'));
  const signatureOk = verify(
    null,
    Buffer.from(canonicalizeJson(envelope.license), 'utf8'),
    createPublicKey(publicKeyPem),
    Buffer.from(envelope.signature.value, 'base64url')
  );
  if (!signatureOk) {
    throw new Error(`issued license did not verify: ${outputPath}`);
  }
  return envelope;
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
