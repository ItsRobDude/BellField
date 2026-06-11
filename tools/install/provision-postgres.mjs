import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');

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

function parseEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function run(executable, args) {
  const result = spawnSync(executable, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`Failed to run ${executable}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${executable} exited with ${result.status}`);
  }
}

const args = readArgs();
const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const env = parseEnvFile(envPath);
const postgresBin = resolve(
  String(args['postgres-bin'] ?? env.BELLFIELD_POSTGRES_BIN ?? join(releaseRoot, 'postgres', 'bin'))
);
const postgresData = resolve(
  String(
    args['postgres-data'] ?? env.BELLFIELD_POSTGRES_DATA ?? join(installRoot, 'data', 'postgres')
  )
);
const initdb = join(postgresBin, process.platform === 'win32' ? 'initdb.exe' : 'initdb');

if (!existsSync(initdb)) {
  throw new Error(
    `PostgreSQL initdb not found at ${initdb}. Set --postgres-bin or BELLFIELD_POSTGRES_BIN.`
  );
}

if (existsSync(join(postgresData, 'PG_VERSION'))) {
  console.log(`PostgreSQL data directory already initialized at ${postgresData}`);
  process.exit(0);
}

mkdirSync(postgresData, { recursive: true });
run(initdb, ['-D', postgresData, '-U', 'postgres', '--encoding=UTF8', '--locale=C']);
console.log(`Initialized PostgreSQL data directory at ${postgresData}`);
console.log(
  'Start PostgreSQL, create the bellfield role/database from bellfield-server.env, then run migrations.'
);
