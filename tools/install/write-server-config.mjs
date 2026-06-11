import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

function readArgs() {
  return Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, ...value] = arg.slice(2).split('=');
        return [key, value.join('=') || 'true'];
      })
  );
}

function randomSecret() {
  return randomBytes(32).toString('base64url');
}

const args = readArgs();
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const outputPath = resolve(String(args.output ?? join(installRoot, 'bellfield-server.env')));
const force = args.force === 'true';

if (existsSync(outputPath) && !force) {
  throw new Error(`${outputPath} already exists. Pass --force=true to overwrite it.`);
}

const templatePath = join(repoRoot, 'bellfield-server.env.example');
const template = readFileSync(templatePath, 'utf8');
const mediaRoot = join(installRoot, 'data', 'media');
const licensePath = join(installRoot, 'data', 'license', 'bellfield-license.json');
const databasePassword = randomSecret();
const mediaSecret = randomSecret();

const config = template
  .replace('CHANGE_ME@127.0.0.1:5432', `${encodeURIComponent(databasePassword)}@127.0.0.1:5432`)
  .replace('C:\\BellField\\data\\media', mediaRoot)
  .replace('CHANGE_ME_TO_AT_LEAST_32_RANDOM_CHARACTERS', mediaSecret)
  .replace('C:\\BellField\\data\\license\\bellfield-license.json', licensePath);

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(mediaRoot, { recursive: true });
mkdirSync(dirname(licensePath), { recursive: true });
writeFileSync(outputPath, config);

console.log(`Wrote ${outputPath}`);
console.log('Record the generated database password in the customer install notes.');
