import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readArgs } from '../install/install-utils.mjs';
import { defaultReleasePrivateKeyPath } from './release-artifact.mjs';

const args = readArgs();
const privateKeyPath = resolve(String(args['private-key-output'] ?? defaultReleasePrivateKeyPath));
const publicKeyPath = resolve(
  String(
    args['public-key-output'] ?? join(dirname(privateKeyPath), 'bellfield-release-public-key.pem')
  )
);
const force = args.force === 'true';

if (!force) {
  for (const path of [privateKeyPath, publicKeyPath]) {
    if (existsSync(path)) {
      throw new Error(`${path} already exists. Pass --force=true to overwrite it.`);
    }
  }
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
mkdirSync(dirname(privateKeyPath), { recursive: true });
mkdirSync(dirname(publicKeyPath), { recursive: true });
writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
  mode: 0o600
});
writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));

console.log(`Wrote private release signing key: ${privateKeyPath}`);
console.log(`Wrote public release verification key: ${publicKeyPath}`);
