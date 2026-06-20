import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSmokeEvidence } from './smoke-evidence.mjs';
import {
  assertDependencyPackageJsons,
  assertNoReparsePoints,
  assertNodeResolves,
  packageDependencyNames,
  packagedNodeExecutable
} from '../release-portability.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const zipPath = getArgValue('--zip') ? resolve(getArgValue('--zip')) : null;
const requireGateDayDeps = getBooleanArg('--require-gate-day-deps', false);
const releasePublicKeyPath =
  getArgValue('--release-public-key') ?? process.env.BELLFIELD_RELEASE_PUBLIC_KEY_PATH;

const evidence = {
  name: 'Release ZIP smoke',
  startedAt: new Date().toISOString(),
  zipPath,
  checks: []
};
const evidenceRunId = evidence.startedAt.replace(/[:.]/g, '-');
const evidenceDir = join(repoRoot, 'artifacts', 'validation', evidenceRunId);

let tempRoot;

try {
  check('release ZIP argument is provided', Boolean(zipPath), { zipPath });
  check('release ZIP exists', existsSync(zipPath), { zipPath });

  tempRoot = mkdtempSync(join(tmpdir(), 'bellfield-release-zip-smoke-'));
  extractZip(zipPath, tempRoot);
  const releaseRoot = join(tempRoot, 'release');
  evidence.releaseRoot = releaseRoot;
  check('extracted release root exists', existsSync(releaseRoot), { releaseRoot });

  assertNoReparsePoints(releaseRoot, 'extracted release tree');
  check('extracted release tree contains no reparse points or symlinks', true);

  const manifest = JSON.parse(
    readFileSync(join(releaseRoot, 'bellfield-build-manifest.json'), 'utf8')
  );
  runReleaseBuildSmoke(releaseRoot, manifest.sourceCommit);
  check('release-build smoke passes against extracted ZIP', true, {
    sourceCommit: manifest.sourceCommit
  });

  const nodeExe = packagedNodeExecutable(releaseRoot);
  check('bundled node exists in extracted ZIP', Boolean(nodeExe), { nodeExe });
  verifyPackageDependencies({
    nodeExe,
    packageRoot: join(releaseRoot, 'apps', 'api'),
    sourcePackageJson: join(repoRoot, 'apps', 'api', 'package.json'),
    label: 'extracted API'
  });
  verifyPackageDependencies({
    nodeExe,
    packageRoot: join(releaseRoot, 'apps', 'worker'),
    sourcePackageJson: join(repoRoot, 'apps', 'worker', 'package.json'),
    label: 'extracted worker'
  });

  assertMigrationEntrypointLoads(releaseRoot, nodeExe);
  check('migration entrypoint reaches DATABASE_URL guard from extracted ZIP', true);

  runOfficeWebSmoke(releaseRoot);
  check('office-web boots and serves HTML/static assets from extracted ZIP', true);

  const postgresBin = join(releaseRoot, 'postgres', 'bin');
  if (requireGateDayDeps || existsSync(postgresBin)) {
    const migrationSmoke = await runPackagedMigrationSmoke(releaseRoot, nodeExe, postgresBin);
    check('packaged PostgreSQL runs migrations from extracted ZIP', true, migrationSmoke);
  }

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'release-zip-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'release-zip-smoke.json')}`);
  process.exitCode = 1;
} finally {
  if (tempRoot) {
    removeTemporaryDirectory(tempRoot);
  }
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

function extractZip(zip, destination) {
  if (process.platform === 'win32') {
    runCommand(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:BELLFIELD_ZIP_PATH -DestinationPath $env:BELLFIELD_ZIP_DESTINATION -Force"
      ],
      {
        env: {
          ...process.env,
          BELLFIELD_ZIP_PATH: zip,
          BELLFIELD_ZIP_DESTINATION: destination
        },
        timeoutMs: 300_000
      }
    );
    return;
  }
  runCommand('unzip', ['-q', zip, '-d', destination], { timeoutMs: 300_000 });
}

function runReleaseBuildSmoke(releaseRoot, expectedSourceCommit) {
  const args = [
    join(repoRoot, 'tools', 'smoke', 'release-build-smoke.mjs'),
    `--release-root=${releaseRoot}`,
    `--expected-source-commit=${expectedSourceCommit}`
  ];
  if (releasePublicKeyPath) {
    args.push(`--release-public-key=${resolve(releasePublicKeyPath)}`);
  }
  if (requireGateDayDeps) {
    args.push('--require-gate-day-deps=true');
  }
  runCommand(process.execPath, args, { timeoutMs: 300_000 });
}

function verifyPackageDependencies(input) {
  const dependencies = packageDependencyNames(input.sourcePackageJson);
  assertDependencyPackageJsons(input.packageRoot, dependencies, input.label);
  assertNodeResolves({
    nodeExe: input.nodeExe,
    fromFile: join(input.packageRoot, 'package.json'),
    dependencies,
    label: input.label
  });
  check(`${input.label} production dependencies resolve`, true, { count: dependencies.length });
}

function assertMigrationEntrypointLoads(releaseRoot, nodeExe) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = runCommand(
    nodeExe,
    [join(releaseRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs')],
    {
      allowFailure: true,
      capture: true,
      env,
      timeoutMs: 30_000
    }
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0 || !output.includes('DATABASE_URL is required')) {
    throw new Error(`Migration entrypoint did not reach DATABASE_URL guard:\n${output.trim()}`);
  }
}

function runOfficeWebSmoke(releaseRoot) {
  runCommand(
    process.execPath,
    [
      join(repoRoot, 'tools', 'smoke', 'release-office-web-assets-smoke.mjs'),
      `--release-root=${releaseRoot}`,
      `--evidence-dir=${evidenceDir}`
    ],
    { timeoutMs: 180_000 }
  );
}

async function runPackagedMigrationSmoke(releaseRoot, nodeExe, postgresBin) {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-release-migration-smoke-'));
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
    const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    runCommand(nodeExe, [join(releaseRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs')], {
      cwd: join(releaseRoot, 'apps', 'api'),
      env: { ...process.env, DATABASE_URL: databaseUrl, PGCONNECT_TIMEOUT: '5' },
      timeoutMs: 180_000
    });
    stopPostgres(postgresBin, dataDir);
    started = false;
    return { port };
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

function pgTool(postgresBin, name) {
  return join(postgresBin, process.platform === 'win32' ? `${name}.exe` : name);
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
      // Windows can briefly hold files after process shutdown; retry below.
    }
  }
}

function runCommand(command, args, options = {}) {
  const capture = options.capture === true || options.allowFailure === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    timeout: options.timeoutMs ?? 60_000
  });
  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (!options.allowFailure && result.status !== 0) {
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
