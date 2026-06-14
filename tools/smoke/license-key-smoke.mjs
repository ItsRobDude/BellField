import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyLicenseContent } from '../update/license-verification.mjs';

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

  const paidEnvelope = issueAndVerifyLicense({
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
  expectIssueLicenseFailure({
    outputPath: path.join(root, 'invalid-paid-operation-end-license.json'),
    args: [
      '--kind=paid',
      '--license-id=lic_smoke_invalid_paid',
      '--update-window-end=2027-06-11',
      '--operation-end=2026-07-11'
    ],
    expectedMessage: 'paid licenses must never carry operationEnd'
  });
  check('paid license rejects operationEnd', true);

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

function issueAndVerifyLicense({ outputPath, args }) {
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

  const rawLicense = readFileSync(outputPath, 'utf8');
  const status = verifyLicenseContent(rawLicense);
  if (status.status !== 'valid') {
    throw new Error(`issued license did not verify: ${status.message}`);
  }
  return JSON.parse(rawLicense);
}

function expectIssueLicenseFailure({ outputPath, args, expectedMessage }) {
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
  if (issueResult.status === 0) {
    throw new Error('issue-license unexpectedly accepted an invalid paid operationEnd.');
  }
  const output = `${issueResult.stderr}\n${issueResult.stdout}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(`issue-license failed with unexpected message: ${output.trim()}`);
  }
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
