import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readArgs } from './license-format.mjs';

const args = readArgs();
const outputDir = resolve(String(args['output-dir'] ?? 'license-keys'));
const force = args.force === 'true';
const privateKeyPath = resolve(
  String(args['private-key-output'] ?? join(outputDir, 'bellfield-license-private-key.pem'))
);
const publicKeyPath = resolve(
  String(args['public-key-output'] ?? join(outputDir, 'bellfield-license-public-key.pem'))
);

if (!force) {
  for (const path of [privateKeyPath, publicKeyPath]) {
    if (existsSync(path)) {
      throw new Error(`${path} already exists. Pass --force=true to overwrite it.`);
    }
  }
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

mkdirSync(outputDir, { recursive: true });
writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));

console.log(`Wrote private signing key: ${privateKeyPath}`);
console.log(`Wrote public verification key: ${publicKeyPath}`);
console.log('Do not commit or ship the private key.');
