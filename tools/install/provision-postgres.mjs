import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { databaseConfigFromUrl, parseEnvFile, readArgs } from './install-utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    shell: false,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    env: options.env ?? process.env
  });

  if (result.error) {
    throw new Error(`Failed to run ${executable}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${executable} exited with ${result.status}`);
  }

  return result;
}

function pgTool(name, postgresBin) {
  return join(postgresBin, process.platform === 'win32' ? `${name}.exe` : name);
}

function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteSqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function hardenHostAuthentication(postgresData) {
  const pgHbaPath = join(postgresData, 'pg_hba.conf');
  const original = readFileSync(pgHbaPath, 'utf8');
  const hardened = original
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      const columns = trimmed.split(/\s+/);
      if (columns[0] === 'host' && columns.at(-1) === 'trust') {
        return line.replace(/\btrust\b\s*$/, 'scram-sha-256');
      }
      return line;
    })
    .join('\n');

  writeFileSync(pgHbaPath, `${hardened.replace(/\n*$/, '')}\n`, 'utf8');
}

function ensureAppRoleAndDatabase(input) {
  const psql = pgTool('psql', input.postgresBin);
  const createdb = pgTool('createdb', input.postgresBin);
  const pgEnv = {
    ...process.env,
    PGHOST: input.database.host,
    PGPORT: input.database.port,
    PGUSER: 'postgres',
    PGDATABASE: 'postgres'
  };
  const ensureRoleSql = [
    'do $$',
    'begin',
    `  if exists (select 1 from pg_roles where rolname = ${quoteSqlLiteral(input.database.username)}) then`,
    `    execute format('alter role %I with login password %L', ${quoteSqlLiteral(input.database.username)}, ${quoteSqlLiteral(input.database.password)});`,
    '  else',
    `    execute format('create role %I with login password %L', ${quoteSqlLiteral(input.database.username)}, ${quoteSqlLiteral(input.database.password)});`,
    '  end if;',
    'end',
    '$$;'
  ].join('\n');
  run(psql, ['--dbname', 'postgres', '--command', ensureRoleSql], { env: pgEnv });

  const databaseExists = run(
    psql,
    [
      '--dbname',
      'postgres',
      '--tuples-only',
      '--no-align',
      '--command',
      `select 1 from pg_database where datname = ${quoteSqlLiteral(input.database.databaseName)};`
    ],
    { env: pgEnv, capture: true }
  )
    .stdout.trim()
    .includes('1');

  if (!databaseExists) {
    run(createdb, ['--owner', input.database.username, input.database.databaseName], {
      env: pgEnv
    });
  } else {
    run(
      psql,
      [
        '--dbname',
        'postgres',
        '--command',
        `alter database ${quoteSqlIdentifier(input.database.databaseName)} owner to ${quoteSqlIdentifier(input.database.username)};`
      ],
      { env: pgEnv }
    );
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
const pgCtl = pgTool('pg_ctl', postgresBin);

if (!existsSync(initdb)) {
  throw new Error(
    `PostgreSQL initdb not found at ${initdb}. Set --postgres-bin or BELLFIELD_POSTGRES_BIN.`
  );
}
if (!existsSync(pgCtl)) {
  throw new Error(
    `PostgreSQL pg_ctl not found at ${pgCtl}. Set --postgres-bin or BELLFIELD_POSTGRES_BIN.`
  );
}
if (!env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is missing from ${envPath}.`);
}

if (existsSync(join(postgresData, 'PG_VERSION'))) {
  console.log(`PostgreSQL data directory already initialized at ${postgresData}`);
  process.exit(0);
}

const database = databaseConfigFromUrl(env.DATABASE_URL);

mkdirSync(postgresData, { recursive: true });
run(initdb, [
  '-D',
  postgresData,
  '-U',
  'postgres',
  '--encoding=UTF8',
  '--locale=C',
  '--auth=trust'
]);

try {
  run(pgCtl, ['-D', postgresData, '-o', `-h ${database.host} -p ${database.port}`, '-w', 'start']);
  ensureAppRoleAndDatabase({ postgresBin, database });
  hardenHostAuthentication(postgresData);
  run(pgCtl, ['-D', postgresData, '-m', 'fast', '-w', 'stop']);
} catch (error) {
  try {
    run(pgCtl, ['-D', postgresData, '-m', 'fast', '-w', 'stop']);
  } catch {
    // Keep the original provisioning failure visible.
  }
  throw error;
}

console.log(`Initialized PostgreSQL data directory at ${postgresData}`);
console.log(
  `Created or updated database ${database.databaseName} and login role ${database.username} from DATABASE_URL.`
);
console.log('Host authentication was changed from trust to scram-sha-256 for TCP connections.');
