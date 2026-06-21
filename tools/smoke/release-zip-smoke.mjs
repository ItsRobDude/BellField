import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSmokeEvidence } from './smoke-evidence.mjs';
import { parseEnvFile } from '../install/install-utils.mjs';
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
const defaultLicensePrivateKeyPath =
  'C:\\Users\\rober\\Documents\\API Keys\\BellField\\license-v1\\bellfield-license-private-key.pem';
const licensePrivateKeyPath =
  getArgValue('--license-private-key') ??
  process.env.BELLFIELD_LICENSE_PRIVATE_KEY_PATH ??
  defaultLicensePrivateKeyPath;

const evidence = {
  name: 'Release ZIP smoke',
  startedAt: new Date().toISOString(),
  zipPath,
  checks: []
};
const evidenceRunId = evidence.startedAt.replace(/[:.]/g, '-');
const evidenceDir = join(repoRoot, 'artifacts', 'validation', evidenceRunId);
const zipExtractionTimeoutMs = 900_000;

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
  if (requireGateDayDeps) {
    const runtimeBootSmoke = await runReleaseRuntimeBootSmoke(releaseRoot, nodeExe, postgresBin);
    check(
      'packaged API and worker boot from generated clean-install config',
      true,
      runtimeBootSmoke
    );
  } else {
    evidence.runtimeBootSmoke = 'skipped; pass --require-gate-day-deps=true to run it';
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
    const shell = findWindowsPowerShell();
    runCommand(
      shell,
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
        timeoutMs: zipExtractionTimeoutMs
      }
    );
    return;
  }
  runCommand('unzip', ['-q', zip, '-d', destination], { timeoutMs: zipExtractionTimeoutMs });
}

function findWindowsPowerShell() {
  for (const candidate of ['pwsh.exe', 'powershell.exe']) {
    const result = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 10_000
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return 'powershell.exe';
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
  const pgLog = join(root, 'postgres.log');
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
      '-l',
      pgLog,
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

async function runReleaseRuntimeBootSmoke(releaseRoot, nodeExe, postgresBin) {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-release-runtime-smoke-'));
  const installRoot = join(root, 'install');
  const dataDir = join(root, 'postgres-data');
  const logsDir = join(root, 'logs');
  const pgLog = join(logsDir, 'postgres.log');
  const apiLog = join(logsDir, 'api.out.log');
  const apiErr = join(logsDir, 'api.err.log');
  const workerLog = join(logsDir, 'worker.out.log');
  const workerErr = join(logsDir, 'worker.err.log');
  const port = await getAvailablePort();
  const apiPort = await getAvailablePort();
  const officePort = await getAvailablePort();
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const details = {
    port,
    apiPort,
    officePort,
    logsDir
  };
  const children = [];
  let started = false;

  mkdirSync(logsDir, { recursive: true });

  try {
    check('license private key exists for runtime boot smoke', existsSync(licensePrivateKeyPath), {
      licensePrivateKeyPath
    });
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
      '-l',
      pgLog,
      '-o',
      `-h 127.0.0.1 -p ${port}`,
      '-w',
      'start'
    ]);
    started = true;

    runCommand(nodeExe, [join(releaseRoot, 'apps', 'api', 'scripts', 'migrations', 'up.mjs')], {
      cwd: join(releaseRoot, 'apps', 'api'),
      env: { ...process.env, DATABASE_URL: databaseUrl, PGCONNECT_TIMEOUT: '5' },
      timeoutMs: 180_000
    });

    const envPath = join(installRoot, 'bellfield-server.env');
    runCommand(nodeExe, [
      join(releaseRoot, 'tools', 'install', 'write-server-config.mjs'),
      `--install-root=${installRoot}`
    ]);
    const mediaRoot = join(installRoot, 'data', 'media');
    const backupRoot = join(installRoot, 'data', 'backups');
    const licensePath = join(installRoot, 'data', 'license', 'bellfield-license.json');
    patchEnvFile(envPath, {
      DATABASE_URL: databaseUrl,
      BELLFIELD_API_PORT: String(apiPort),
      BELLFIELD_OFFICE_WEB_PORT: String(officePort),
      NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      BELLFIELD_OFFICE_ORIGINS: `http://127.0.0.1:${officePort},http://localhost:${officePort}`,
      BELLFIELD_MEDIA_ROOT: mediaRoot,
      BELLFIELD_BACKUP_ROOT: backupRoot,
      BELLFIELD_LICENSE_PATH: licensePath,
      BELLFIELD_POSTGRES_BIN: postgresBin
    });
    issueSmokeLicense(licensePath, root);

    const serverEnv = {
      ...process.env,
      ...parseEnvFile(envPath),
      NODE_ENV: 'production',
      BOOTSTRAP_SEED_DATA: 'false',
      PGCONNECT_TIMEOUT: '5',
      BELLFIELD_BUILD_MANIFEST_PATH: join(releaseRoot, 'bellfield-build-manifest.json')
    };
    const backupResult = runCommand(
      nodeExe,
      [join(releaseRoot, 'apps', 'worker', 'dist', 'jobs', 'backup', 'run-backup-cli.js')],
      {
        cwd: releaseRoot,
        env: serverEnv,
        capture: true,
        timeoutMs: 180_000
      }
    );
    const backup = parseBackupCliResult(backupResult.stdout);
    details.manualBackup = {
      status: backup.status,
      backupSetPath: backup.backupSetPath
    };

    const api = startLoggedProcess({
      command: nodeExe,
      args: [join(releaseRoot, 'apps', 'api', 'dist', 'apps', 'api', 'src', 'main.js')],
      cwd: join(releaseRoot, 'apps', 'api'),
      env: serverEnv,
      stdoutPath: apiLog,
      stderrPath: apiErr
    });
    children.push({ name: 'api', child: api, logs: [apiLog, apiErr] });
    await waitForHealth({
      url: `http://127.0.0.1:${apiPort}/health`,
      timeoutMs: 60_000,
      child: api,
      logPaths: [apiLog, apiErr]
    });

    const worker = startLoggedProcess({
      command: nodeExe,
      args: [join(releaseRoot, 'apps', 'worker', 'dist', 'index.js')],
      cwd: join(releaseRoot, 'apps', 'worker'),
      env: serverEnv,
      stdoutPath: workerLog,
      stderrPath: workerErr
    });
    children.push({ name: 'worker', child: worker, logs: [workerLog, workerErr] });
    await assertProcessStaysAlive(worker, 20_000, [workerLog, workerErr]);

    details.apiHealth = 'ok';
    details.workerStayedAliveMs = 20_000;
    evidence.runtimeBootSmoke = details;
    return details;
  } catch (error) {
    details.error = error instanceof Error ? error.message : String(error);
    details.logTails = {
      postgres: tailFile(pgLog),
      api: [tailFile(apiLog), tailFile(apiErr)].filter(Boolean).join('\n'),
      worker: [tailFile(workerLog), tailFile(workerErr)].filter(Boolean).join('\n')
    };
    evidence.runtimeBootSmoke = details;
    throw error;
  } finally {
    for (const entry of children.reverse()) {
      await stopChildProcess(entry.child);
    }
    if (started || readPostmasterPid(dataDir)) {
      cleanupPostgres(postgresBin, dataDir);
    }
    removeTemporaryDirectory(root);
  }
}

function patchEnvFile(envPath, updates) {
  const seen = new Set();
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  const patched = lines.map((line) => {
    const match = /^([^#=\s][^=]*)=(.*)$/.exec(line);
    if (!match) {
      return line;
    }
    const name = match[1];
    if (!Object.hasOwn(updates, name)) {
      return line;
    }
    seen.add(name);
    return `${name}=${updates[name]}`;
  });

  for (const [name, value] of Object.entries(updates)) {
    if (!seen.has(name)) {
      patched.push(`${name}=${value}`);
    }
  }

  writeFileSync(envPath, patched.join('\n'), 'utf8');
}

function issueSmokeLicense(licensePath, root) {
  const updateWindowEnd = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  runCommand(process.execPath, [
    join(repoRoot, 'tools', 'license', 'issue-license.mjs'),
    `--private-key=${licensePrivateKeyPath}`,
    '--kind=paid',
    '--license-id=lic_release_runtime_smoke',
    '--shop-name=BellField Release Runtime Smoke',
    `--update-window-end=${updateWindowEnd}`,
    `--output=${licensePath}`,
    `--ledger=${join(root, 'issued-licenses.jsonl')}`,
    '--force=true'
  ]);
}

function parseBackupCliResult(stdout) {
  const resultLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('BELLFIELD_BACKUP_RESULT '));
  if (!resultLine) {
    throw new Error('Manual backup CLI did not print BELLFIELD_BACKUP_RESULT.');
  }

  const parsed = JSON.parse(resultLine.replace(/^BELLFIELD_BACKUP_RESULT /, ''));
  if (parsed.status !== 'succeeded') {
    throw new Error(`Manual backup CLI reported ${parsed.status ?? 'unknown'} status.`);
  }
  return parsed;
}

function startLoggedProcess(input) {
  const stdout = openSync(input.stdoutPath, 'a');
  const stderr = openSync(input.stderrPath, 'a');
  try {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      shell: false,
      stdio: ['ignore', stdout, stderr]
    });
    child.once('error', (error) => {
      writeFileSync(input.stderrPath, `Process spawn failed: ${error.message}\n`, { flag: 'a' });
    });
    return child;
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
}

async function waitForHealth(input) {
  const deadline = Date.now() + input.timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    throwIfExited(input.child, input.logPaths);
    try {
      const response = await fetch(input.url);
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.status === 'ok') {
          return;
        }
        lastError = new Error(`API status ${body?.status ?? 'unreadable'}`);
      } else {
        lastError = new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000);
  }

  throw new Error(`API health did not pass at ${input.url}: ${lastError?.message ?? 'timeout'}`);
}

async function assertProcessStaysAlive(child, settleMs, logPaths) {
  const deadline = Date.now() + settleMs;
  while (Date.now() < deadline) {
    throwIfExited(child, logPaths);
    await sleep(500);
  }
}

function throwIfExited(child, logPaths) {
  if (child.exitCode === null && child.signalCode === null) {
    return;
  }

  throw new Error(
    [
      `Process exited early with code=${child.exitCode ?? 'null'} signal=${child.signalCode ?? 'null'}.`,
      ...logPaths.map((path) => tailFile(path)).filter(Boolean)
    ].join('\n')
  );
}

async function stopChildProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  const closed = await Promise.race([
    new Promise((resolve) => child.once('close', () => resolve(true))),
    sleep(5_000).then(() => false)
  ]);
  if (closed) {
    return;
  }

  try {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore']
      });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    // Cleanup is best-effort; the original smoke failure remains visible.
  }
}

function tailFile(path, maxLines = 80) {
  try {
    if (!existsSync(path)) {
      return '';
    }
    return readFileSync(path, 'utf8').split(/\r?\n/).slice(-maxLines).join('\n').trim();
  } catch (error) {
    return `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
