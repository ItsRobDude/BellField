import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');
const appServicesStopOrder = ['bellfield-office-web', 'bellfield-worker', 'bellfield-api'];
const appServicesStartOrder = ['bellfield-api', 'bellfield-worker', 'bellfield-office-web'];

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

function databaseEnv(databaseUrl) {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name.');
  }

  return {
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || undefined,
      PGUSER: url.username ? decodeURIComponent(url.username) : undefined,
      PGPASSWORD: url.password ? decodeURIComponent(url.password) : undefined
    },
    databaseName
  };
}

function pgTool(name, postgresBin) {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  return postgresBin ? join(postgresBin, executable) : executable;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    shell: false,
    env: options.env ?? process.env,
    cwd: options.cwd
  });

  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 1}`);
  }
  return result;
}

function runPowerShell(command) {
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

function stopAppServices(skipServices) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service stop.');
    return;
  }

  for (const serviceName of appServicesStopOrder) {
    runPowerShell(
      `if (Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) { Stop-Service -Name '${serviceName}' -Force }`
    );
  }
}

function startAppServices(skipServices) {
  if (skipServices || process.platform !== 'win32') {
    console.log('Skipping Windows service start.');
    return;
  }

  runPowerShell(
    "if (Get-Service -Name 'bellfield-postgres' -ErrorAction SilentlyContinue) { Start-Service -Name 'bellfield-postgres' }"
  );
  for (const serviceName of appServicesStartOrder) {
    runPowerShell(
      `if (Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue) { Start-Service -Name '${serviceName}' }`
    );
  }
}

function assertSafeReplaceDirectory(path, label) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  if (absolute === root || absolute.length < root.length + 8) {
    throw new Error(`${label} is too broad to replace safely: ${absolute}`);
  }
  return absolute;
}

const args = readArgs();
if (args.confirm !== 'RESTORE') {
  throw new Error('Refusing to restore without --confirm=RESTORE.');
}

const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const backupSetPath = args['backup-set']
  ? resolve(String(args['backup-set']))
  : (() => {
      throw new Error('Missing required --backup-set=<path>.');
    })();
const skipServices = args['skip-services'] === 'true';
const env = parseEnvFile(envPath);
const databaseUrl = env.DATABASE_URL;
if (!env.BELLFIELD_MEDIA_ROOT) {
  throw new Error(`BELLFIELD_MEDIA_ROOT is missing from ${envPath}.`);
}
const mediaRoot = assertSafeReplaceDirectory(env.BELLFIELD_MEDIA_ROOT, 'BELLFIELD_MEDIA_ROOT');
const postgresBin = env.BELLFIELD_POSTGRES_BIN
  ? resolve(env.BELLFIELD_POSTGRES_BIN)
  : resolve(releaseRoot, 'postgres', 'bin');
const nodeExe = join(
  releaseRoot,
  'runtime',
  'node',
  process.platform === 'win32' ? 'node.exe' : 'node'
);
const migrationsScript = join(releaseRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs');
const manifestPath = join(backupSetPath, 'manifest.json');
const dumpPath = join(backupSetPath, 'database.dump');
const backupMediaPath = join(backupSetPath, 'media');

if (!databaseUrl) {
  throw new Error(`DATABASE_URL is missing from ${envPath}.`);
}
if (!existsSync(manifestPath) || !existsSync(dumpPath) || !existsSync(backupMediaPath)) {
  throw new Error('Backup set must contain manifest.json, database.dump, and media/.');
}

const { env: pgEnv, databaseName } = databaseEnv(databaseUrl);
const restoreEnv = { ...process.env, ...env, DATABASE_URL: databaseUrl };

console.log(`Restoring BellField backup from ${backupSetPath}`);
stopAppServices(skipServices);

run(pgTool('dropdb', postgresBin), ['--if-exists', '--force', databaseName], {
  env: { ...pgEnv, PGDATABASE: 'postgres' }
});
run(pgTool('createdb', postgresBin), [databaseName], { env: { ...pgEnv, PGDATABASE: 'postgres' } });
run(pgTool('pg_restore', postgresBin), ['--dbname', databaseName, '--no-owner', dumpPath], {
  env: pgEnv
});

rmSync(mediaRoot, { force: true, recursive: true });
mkdirSync(dirname(mediaRoot), { recursive: true });
cpSync(backupMediaPath, mediaRoot, { recursive: true });

run(nodeExe, [migrationsScript], { env: restoreEnv, cwd: releaseRoot });
startAppServices(skipServices);

console.log('BellField restore completed.');
