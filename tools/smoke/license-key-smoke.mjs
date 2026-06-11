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
const licensePath = path.join(root, 'bellfield-license.json');
const ledgerPath = path.join(root, 'issued-licenses.jsonl');
const evidence = {
  name: 'License key smoke',
  startedAt: timestamp,
  checks: []
};

try {
  check('private key exists outside repo', existsSync(privateKeyPath));

  const issueResult = spawnSync(
    process.execPath,
    [
      path.resolve('tools', 'license', 'issue-license.mjs'),
      `--private-key=${privateKeyPath}`,
      '--license-id=lic_smoke_local_key',
      '--shop-name=BellField Local Key Smoke',
      '--update-window-end=2027-06-11',
      `--output=${licensePath}`,
      `--ledger=${ledgerPath}`
    ],
    { encoding: 'utf8', shell: false }
  );
  if (issueResult.status !== 0) {
    throw new Error(
      issueResult.stderr || issueResult.stdout || `issue-license exited ${issueResult.status}`
    );
  }

  const envelope = JSON.parse(readFileSync(licensePath, 'utf8'));
  const publicKeyPem = readEmbeddedPublicKeyPem();
  const signatureOk = verify(
    null,
    Buffer.from(canonicalizeJson(envelope.license), 'utf8'),
    createPublicKey(publicKeyPem),
    Buffer.from(envelope.signature.value, 'base64url')
  );

  check('issued license verifies with embedded public key', signatureOk);
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

function check(name, passed) {
  evidence.checks.push({ name, passed });
  if (!passed) {
    throw new Error(name);
  }
}
