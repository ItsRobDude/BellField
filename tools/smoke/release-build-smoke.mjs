import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSmokeEvidence } from './smoke-evidence.mjs';
import { verifyReleaseArtifact } from '../update/release-artifact.mjs';

// Validates that `pnpm build:release` produced a coherent, production-shaped
// release tree. With gate-day dependencies present it also exercises packaged
// PostgreSQL end to end, and on Windows checks app-local VC++ runtime DLLs, so
// incomplete bundles fail before they reach a clean Windows install.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseRoot = resolve(getArgValue('--release-root') ?? join(repoRoot, 'release'));
const releasePublicKeyPath =
  getArgValue('--release-public-key') ?? process.env.BELLFIELD_RELEASE_PUBLIC_KEY_PATH;
const requireGateDayDeps = getBooleanArg('--require-gate-day-deps', false);
const requiredPostgresVcRuntimeFiles = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'];

const evidence = {
  name: 'Release build smoke',
  startedAt: new Date().toISOString(),
  releaseRoot,
  checks: []
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

try {
  check('release root exists', existsSync(releaseRoot), { releaseRoot });
  const expectedSourceCommit =
    getArgValue('--expected-source-commit') ?? runCapture('git', ['rev-parse', '--short', 'HEAD']);

  const manifestPath = join(releaseRoot, 'bellfield-build-manifest.json');
  check('build manifest exists', existsSync(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check('manifest marks a release build', manifest.buildKind === 'release', {
    buildKind: manifest.buildKind
  });
  check('manifest requires a license', manifest.licenseRequired === true);
  check(
    'manifest carries a version',
    typeof manifest.version === 'string' && manifest.version.length > 0,
    {
      version: manifest.version
    }
  );
  check('manifest release date is YYYY-MM-DD', DATE_PATTERN.test(String(manifest.releaseDate)), {
    releaseDate: manifest.releaseDate
  });
  check(
    'manifest stamps a source commit',
    typeof manifest.sourceCommit === 'string' && manifest.sourceCommit.length > 0,
    {
      sourceCommit: manifest.sourceCommit
    }
  );
  check(
    'manifest source commit matches current checkout',
    manifest.sourceCommit === expectedSourceCommit,
    {
      sourceCommit: manifest.sourceCommit,
      expectedSourceCommit
    }
  );

  // Signed update artifact (the updater verifies these at install time).
  check(
    'signed update manifest exists',
    existsSync(join(releaseRoot, 'bellfield-update-manifest.json'))
  );
  check(
    'update signature exists',
    existsSync(join(releaseRoot, 'bellfield-update-signature.json'))
  );
  const verifiedArtifact = verifyReleaseArtifact({
    releaseRoot,
    publicKeyPem: releasePublicKeyPath
      ? readFileSync(resolve(releasePublicKeyPath), 'utf8')
      : undefined
  });
  check('signed update artifact verifies release tree', true, {
    version: verifiedArtifact.build.version,
    releaseDate: verifiedArtifact.build.releaseDate,
    fileCount: verifiedArtifact.files.length,
    releasePublicKeyPath: releasePublicKeyPath ? resolve(releasePublicKeyPath) : 'embedded'
  });

  // Bundled Node runtime (node.exe on a Windows build, node on a POSIX build).
  const nodeDir = join(releaseRoot, 'runtime', 'node');
  const nodeExe = firstExisting([join(nodeDir, 'node.exe'), join(nodeDir, 'node')]);
  check('bundled node runtime exists', Boolean(nodeExe), { nodeDir });
  const nodeVersion = runCommand(nodeExe, ['--version'], { capture: true }).stdout.trim();
  check('bundled node runtime executes', /^v\d+\.\d+\.\d+/.test(nodeVersion), {
    nodeVersion
  });

  // Compiled apps.
  check(
    'api dist main exists',
    existsSync(join(releaseRoot, 'apps', 'api', 'dist', 'apps', 'api', 'src', 'main.js'))
  );
  check(
    'worker dist index exists',
    existsSync(join(releaseRoot, 'apps', 'worker', 'dist', 'index.js'))
  );
  const officeServer = firstExisting([
    join(releaseRoot, 'apps', 'office-web', 'server.js'),
    join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
  ]);
  check('office-web standalone server exists', Boolean(officeServer), {
    officeServer: officeServer ? relative(repoRoot, officeServer) : null
  });
  const officeServerRoot = dirname(officeServer);
  const officeStaticRoot = join(officeServerRoot, '.next', 'static');
  check('office-web static assets are beside the standalone server', existsSync(officeStaticRoot), {
    officeServerRoot: relative(repoRoot, officeServerRoot),
    officeStaticRoot: relative(repoRoot, officeStaticRoot)
  });
  check(
    'office-web static JavaScript assets are packaged',
    hasFileMatching(officeStaticRoot, /\.js$/),
    {
      officeStaticRoot: relative(repoRoot, officeStaticRoot)
    }
  );
  const officeSourcePublicRoot = join(repoRoot, 'apps', 'office-web', 'public');
  const officeReleasePublicRoot = join(officeServerRoot, 'public');
  check(
    'office-web public assets are packaged when present',
    !existsSync(officeSourcePublicRoot) || existsSync(officeReleasePublicRoot),
    {
      officeSourcePublicRoot: relative(repoRoot, officeSourcePublicRoot),
      officeReleasePublicRoot: relative(repoRoot, officeReleasePublicRoot),
      sourcePublicExists: existsSync(officeSourcePublicRoot)
    }
  );
  check(
    'api migrations are packaged',
    existsSync(join(releaseRoot, 'apps', 'api', 'src', 'database', 'migrations'))
  );

  // Install + update tooling the runbook depends on.
  check(
    'install tooling is packaged',
    existsSync(join(releaseRoot, 'tools', 'install', 'render-windows-services.mjs'))
  );
  check(
    'updater entrypoint is packaged',
    existsSync(join(releaseRoot, 'tools', 'install', 'update-bellfield.mjs'))
  );
  check(
    'release signing lib is packaged',
    existsSync(join(releaseRoot, 'tools', 'update', 'release-artifact.mjs'))
  );
  check(
    'server env example is packaged',
    existsSync(join(releaseRoot, 'bellfield-server.env.example'))
  );

  // The env example must seed a production-shaped config (matches the
  // release runtime-mode guard: no dev mode, no bootstrap seeding).
  const envExample = readFileSync(join(releaseRoot, 'bellfield-server.env.example'), 'utf8');
  check('env example forces production mode', /^NODE_ENV=production$/m.test(envExample));
  check('env example disables bootstrap seeding', /^BOOTSTRAP_SEED_DATA=false$/m.test(envExample));

  const postgresBin = join(releaseRoot, 'postgres', 'bin');
  const shouldCheckPostgres = requireGateDayDeps || existsSync(postgresBin);
  if (shouldCheckPostgres) {
    for (const tool of [
      'postgres',
      'pg_ctl',
      'initdb',
      'psql',
      'pg_dump',
      'pg_restore',
      'createdb',
      'dropdb'
    ]) {
      check(`gate-day PostgreSQL tool is packaged: ${tool}`, existsSync(pgTool(postgresBin, tool)));
    }
    check(
      'gate-day PostgreSQL lib runtime is packaged',
      existsSync(join(releaseRoot, 'postgres', 'lib'))
    );
    check(
      'gate-day PostgreSQL share runtime is packaged',
      existsSync(join(releaseRoot, 'postgres', 'share', 'postgres.bki'))
    );
    if (process.platform === 'win32') {
      for (const file of requiredPostgresVcRuntimeFiles) {
        check(
          `gate-day PostgreSQL app-local VC++ runtime is packaged: ${file}`,
          existsSync(join(postgresBin, file))
        );
      }
    }
    const postgresSmoke = await runPackagedPostgresSmoke(postgresBin);
    check('gate-day packaged PostgreSQL initializes, starts, and answers SQL', true, postgresSmoke);
  }

  if (requireGateDayDeps) {
    check(
      'gate-day WinSW executable is packaged',
      existsSync(join(releaseRoot, 'tools', 'winsw', 'WinSW-x64.exe'))
    );
  }

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'release-build-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'release-build-smoke.json')}`);
  process.exitCode = 1;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function getBooleanArg(name, defaultValue) {
  const value = getArgValue(name);
  if (value === undefined) {
    return process.argv.includes(name) ? true : defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate));
}

function hasFileMatching(root, pattern) {
  if (!existsSync(root)) {
    return false;
  }

  for (const entry of readdirSync(root)) {
    const entryPath = join(root, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory() && hasFileMatching(entryPath, pattern)) {
      return true;
    }
    if (stats.isFile() && pattern.test(entry)) {
      return true;
    }
  }

  return false;
}

function pgTool(postgresBin, name) {
  return join(postgresBin, process.platform === 'win32' ? `${name}.exe` : name);
}

function runCommand(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'ignore'],
    timeout: options.timeoutMs ?? 60_000
  });
  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}${
        stdout ? `\nstdout:\n${stdout}` : ''
      }${stderr ? `\nstderr:\n${stderr}` : ''}`
    );
  }
  return result;
}

async function runPackagedPostgresSmoke(postgresBin) {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-release-postgres-smoke-'));
  const dataDir = join(root, 'data');
  const port = await getAvailablePort();
  let started = false;
  try {
    runCommand(pgTool(postgresBin, 'initdb'), [
      '-D',
      dataDir,
      '-U',
      'postgres',
      '--encoding=UTF8',
      '--locale=C',
      '--auth=trust'
    ]);
    runCommand(pgTool(postgresBin, 'pg_ctl'), [
      '-D',
      dataDir,
      '-o',
      `-h 127.0.0.1 -p ${port}`,
      '-w',
      'start'
    ]);
    started = true;
    const query = runCommand(
      pgTool(postgresBin, 'psql'),
      [
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--username',
        'postgres',
        '--dbname',
        'postgres',
        '--no-password',
        '--tuples-only',
        '--no-align',
        '--command',
        'select 1;'
      ],
      { capture: true, env: { ...process.env, PGCONNECT_TIMEOUT: '5' } }
    );
    const queryOutput = query.stdout.trim();
    if (queryOutput !== '1') {
      throw new Error(`Packaged psql returned unexpected output: ${queryOutput}`);
    }
    stopPostgres(postgresBin, dataDir);
    started = false;
    return { port, queryOutput };
  } finally {
    if (started || readPostmasterPid(dataDir)) {
      cleanupPostgres(postgresBin, dataDir);
    }
    removeTemporaryDirectory(root);
  }
}

async function getAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a local TCP port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function stopPostgres(postgresBin, dataDir) {
  runCommand(pgTool(postgresBin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
}

function cleanupPostgres(postgresBin, dataDir) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      stopPostgres(postgresBin, dataDir);
      return;
    } catch {
      // Try once more before falling back to killing the postmaster pid below.
    }
  }
  const pid = readPostmasterPid(dataDir);
  if (!pid) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore']
      });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // Cleanup is best-effort; the original smoke failure remains visible.
  }
}

function readPostmasterPid(dataDir) {
  try {
    const raw = readFileSync(join(dataDir, 'postmaster.pid'), 'utf8');
    const pid = Number(raw.split(/\r?\n/, 1)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removeTemporaryDirectory(root) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(root, { force: true, recursive: true, maxRetries: 2, retryDelay: 250 });
      return;
    } catch {
      // Windows can briefly hold PostgreSQL files after shutdown; retry below.
    }
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0 || result.error) {
    throw new Error(`Failed to run ${command} ${args.join(' ')}`);
  }

  return result.stdout.trim();
}
