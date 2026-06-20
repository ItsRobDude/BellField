import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getBoolean, readArgs } from './install/install-utils.mjs';
import { writeSignedReleaseArtifact } from './update/release-artifact.mjs';
import {
  assertDependencyPackageJsons,
  assertNoReparsePoints,
  assertNodeResolves,
  officeServerPath,
  packageDependencyNames
} from './release-portability.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = join(repoRoot, 'release');
const args = readArgs();
let cachedPnpmExecutable;
const requiredPostgresVcRuntimeFiles = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'];

function expectedPnpmVersion() {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const match = /^pnpm@(.+)$/.exec(String(packageJson.packageManager ?? ''));
  return match?.[1] ?? null;
}

function collectPnpmExecutables(directory, results = []) {
  if (!directory || !existsSync(directory)) {
    return results;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectPnpmExecutables(entryPath, results);
    } else if (entry.isFile() && entry.name.toLowerCase() === 'pnpm.exe') {
      results.push(entryPath);
    }
  }

  return results;
}

function readExecutableVersion(executable) {
  const result = spawnSync(executable, ['--version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function pathEntries() {
  return (process.env.PATH ?? process.env.Path ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function findPnpmExecutable() {
  if (cachedPnpmExecutable) {
    return cachedPnpmExecutable;
  }

  const expected = expectedPnpmVersion();
  const searchRoots = [
    process.env.PNPM_HOME,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'pnpm') : null
  ].filter(Boolean);
  const candidates = [
    ...searchRoots.flatMap((root) => collectPnpmExecutables(join(root, '.tools'))),
    ...pathEntries()
      .map((entry) => join(entry, 'pnpm.exe'))
      .filter((candidate) => existsSync(candidate))
  ];

  for (const candidate of candidates) {
    if (!expected || readExecutableVersion(candidate) === expected) {
      cachedPnpmExecutable = candidate;
      return cachedPnpmExecutable;
    }
  }

  if (candidates[0]) {
    cachedPnpmExecutable = candidates[0];
    return cachedPnpmExecutable;
  }

  return null;
}

function resolveCommandInvocation(command, args) {
  if (process.platform !== 'win32') {
    return { executable: command, args, env: process.env };
  }

  if (command === 'pnpm') {
    const pnpmExecutable = findPnpmExecutable();
    if (pnpmExecutable) {
      return { executable: pnpmExecutable, args, env: process.env };
    }

    const corepackPnpm = join(
      dirname(process.execPath),
      'node_modules',
      'corepack',
      'dist',
      'pnpm.js'
    );
    if (!existsSync(corepackPnpm)) {
      throw new Error('Could not find a pnpm.exe on PATH/PNPM_HOME or a Corepack pnpm entrypoint.');
    }
    return {
      executable: process.execPath,
      args: [corepackPnpm, ...args],
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' }
    };
  }

  if (command === 'git') {
    return { executable: 'git.exe', args, env: process.env };
  }

  return { executable: command, args, env: process.env };
}

function run(command, args) {
  const invocation = resolveCommandInvocation(command, args);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: repoRoot,
    env: invocation.env,
    shell: false,
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
}

function runCapture(command, args) {
  const invocation = resolveCommandInvocation(command, args);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: repoRoot,
    env: invocation.env,
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0 || result.error) {
    return null;
  }

  return result.stdout.trim();
}

function copyRequired(source, target) {
  if (!existsSync(source)) {
    throw new Error(`Required release artifact is missing: ${relative(repoRoot, source)}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function copyFileRequired(source, target) {
  if (!existsSync(source)) {
    throw new Error(`Required release file is missing: ${relative(repoRoot, source)}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function copyNodeRuntime() {
  const nodeTarget = join(
    releaseRoot,
    'runtime',
    'node',
    process.platform === 'win32' ? 'node.exe' : 'node'
  );
  copyFileRequired(process.execPath, nodeTarget);
  return nodeTarget;
}

function copyOptionalGateDayDependencies() {
  const postgresRoot = args['postgres-root'] ?? process.env.BELLFIELD_RELEASE_POSTGRES_ROOT;
  const postgresBin = args['postgres-bin'] ?? process.env.BELLFIELD_RELEASE_POSTGRES_BIN;
  const vcRedistRoot = args['vc-redist-root'] ?? process.env.BELLFIELD_RELEASE_VC_REDIST_ROOT;
  const winSwExe = args['winsw-exe'] ?? process.env.BELLFIELD_RELEASE_WINSW_EXE;
  let copiedPostgres = false;

  if (postgresRoot || postgresBin) {
    copyPostgresRuntime({ postgresRoot, postgresBin });
    copiedPostgres = true;
  }
  if (copiedPostgres && process.platform === 'win32') {
    copyPostgresVcRuntime(vcRedistRoot ? String(vcRedistRoot) : null);
  }
  if (winSwExe) {
    copyWinSwExe(String(winSwExe));
  }
}

function copyPostgresRuntime(input) {
  const root = resolvePostgresRoot(input);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`PostgreSQL root directory was not found: ${root}`);
  }

  const bin = join(root, 'bin');
  const lib = join(root, 'lib');
  const share = join(root, 'share');
  assertDirectory(bin, 'PostgreSQL bin directory');
  assertDirectory(lib, 'PostgreSQL lib directory');
  assertDirectory(share, 'PostgreSQL share directory');
  assertPostgresTools(bin);
  assertFile(join(share, 'postgres.bki'), 'PostgreSQL share runtime file');

  copyRequired(bin, join(releaseRoot, 'postgres', 'bin'));
  copyRequired(lib, join(releaseRoot, 'postgres', 'lib'));
  copyRequired(share, join(releaseRoot, 'postgres', 'share'));
}

function resolvePostgresRoot(input) {
  if (input.postgresRoot) {
    return resolve(String(input.postgresRoot));
  }

  const candidate = resolve(String(input.postgresBin));
  if (basename(candidate).toLowerCase() === 'bin') {
    return dirname(candidate);
  }

  // Be tolerant when an operator accidentally passes the root to the legacy
  // --postgres-bin flag; the validation below still enforces the real shape.
  if (existsSync(join(candidate, 'bin'))) {
    return candidate;
  }

  return dirname(candidate);
}

function assertDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} was not found: ${path}`);
  }
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} was not found: ${path}`);
  }
}

function assertPostgresTools(postgresBin) {
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
    assertFile(
      join(postgresBin, process.platform === 'win32' ? `${tool}.exe` : tool),
      `PostgreSQL required tool ${tool}`
    );
  }
}

function copyPostgresVcRuntime(vcRedistRoot) {
  const postgresBinTarget = join(releaseRoot, 'postgres', 'bin');
  if (hasRequiredPostgresVcRuntime(postgresBinTarget)) {
    return;
  }
  if (!vcRedistRoot) {
    throw new Error(
      [
        'PostgreSQL bin is missing app-local VC++ runtime DLLs.',
        'Pass --vc-redist-root=<Visual Studio redist x64 folder> or set BELLFIELD_RELEASE_VC_REDIST_ROOT.'
      ].join(' ')
    );
  }

  const crtDirectory = resolveVcRedistCrtDirectory(vcRedistRoot);
  for (const entry of readdirSync(crtDirectory)) {
    if (entry.toLowerCase().endsWith('.dll')) {
      copyFileRequired(join(crtDirectory, entry), join(postgresBinTarget, entry));
    }
  }
  assertRequiredPostgresVcRuntime(postgresBinTarget, 'PostgreSQL app-local VC++ runtime');
}

function resolveVcRedistCrtDirectory(vcRedistRoot) {
  const root = resolve(vcRedistRoot);
  assertDirectory(root, 'Visual C++ redistributable root directory');
  if (hasRequiredPostgresVcRuntime(root)) {
    return root;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^Microsoft\.VC\d+\.CRT$/i.test(entry.name)) {
      continue;
    }
    const candidate = join(root, entry.name);
    if (hasRequiredPostgresVcRuntime(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Visual C++ redistributable root does not contain the required CRT DLLs: ${root}`
  );
}

function hasRequiredPostgresVcRuntime(directory) {
  return requiredPostgresVcRuntimeFiles.every((file) => {
    const path = join(directory, file);
    return existsSync(path) && statSync(path).isFile();
  });
}

function assertRequiredPostgresVcRuntime(directory, label) {
  for (const file of requiredPostgresVcRuntimeFiles) {
    assertFile(join(directory, file), `${label} file ${file}`);
  }
}

function copyWinSwExe(winSwExe) {
  const source = resolve(winSwExe);
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new Error(`WinSW executable was not found: ${source}`);
  }
  copyFileRequired(source, join(releaseRoot, 'tools', 'winsw', 'WinSW-x64.exe'));
}

function deployWorkspacePackage(filter, target) {
  // pnpm legacy deploy is most reliable with repo-relative targets on Windows;
  // absolute or cross-drive paths can be folded into the workspace path.
  const deployTarget = relative(repoRoot, target);
  run('pnpm', [
    '--filter',
    filter,
    'deploy',
    '--prod',
    '--legacy',
    '--config.node-linker=hoisted',
    deployTarget
  ]);
}

function assertReleasePackageDependencies(input) {
  const dependencies = packageDependencyNames(input.sourcePackageJson);
  assertDependencyPackageJsons(input.packageRoot, dependencies, input.label);
  const resolved = assertNodeResolves({
    nodeExe: input.nodeExe,
    fromFile: join(input.packageRoot, 'package.json'),
    dependencies,
    label: input.label
  });
  console.log(
    `${input.label} production dependency resolution verified (${resolved.length} package(s)).`
  );
}

function copyNodeModules(source, target) {
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`Required node_modules directory was not found: ${source}`);
  }
  rmSync(target, { force: true, recursive: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { dereference: true, recursive: true });
}

function removeNestedNodeModules(root) {
  if (!existsSync(root)) {
    return;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    const entryStats = lstatSync(entryPath);
    if (entry.name === 'node_modules' && entryStats.isDirectory()) {
      rmSync(entryPath, { force: true, recursive: true });
      continue;
    }
    if (entryStats.isDirectory()) {
      removeNestedNodeModules(entryPath);
    }
  }
}

function packageOfficeWebRuntime(nodeExe) {
  const officeReleaseRoot = join(releaseRoot, 'apps', 'office-web');
  copyRequired(join(repoRoot, 'apps', 'office-web', '.next', 'standalone'), officeReleaseRoot);

  const officeServer = officeServerPath(releaseRoot);
  if (!officeServer) {
    throw new Error('Office standalone server.js was not found in the release artifact.');
  }
  const officeServerRoot = dirname(officeServer);

  // Replace all traced Next node_modules with one hoisted production tree next
  // to server.js so the artifact does not depend on pnpm store reparse points.
  removeNestedNodeModules(officeReleaseRoot);
  // Keep the temp deploy on the repo drive; pnpm legacy deploy can mis-handle
  // cross-drive absolute targets on Windows CI.
  const deployRoot = mkdtempSync(join(repoRoot, 'bellfield-office-web-deploy-'));
  try {
    deployWorkspacePackage('@bellfield/office-web', deployRoot);
    copyNodeModules(join(deployRoot, 'node_modules'), join(officeServerRoot, 'node_modules'));
  } finally {
    rmSync(deployRoot, { force: true, recursive: true, maxRetries: 3, retryDelay: 250 });
  }

  assertReleasePackageDependencies({
    nodeExe,
    sourcePackageJson: join(repoRoot, 'apps', 'office-web', 'package.json'),
    packageRoot: officeServerRoot,
    label: 'office-web release'
  });

  copyRequired(
    join(repoRoot, 'apps', 'office-web', '.next', 'static'),
    join(officeServerRoot, '.next', 'static')
  );
  if (existsSync(join(repoRoot, 'apps', 'office-web', 'public'))) {
    copyRequired(join(repoRoot, 'apps', 'office-web', 'public'), join(officeServerRoot, 'public'));
  }
}

function readPackageVersion() {
  const raw = JSON.parse(readFileSync(join(repoRoot, 'apps', 'api', 'package.json'), 'utf8'));
  return raw.version;
}

function assertNonBlank(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value) {
    throw new Error(`${name} must be a non-empty string without surrounding whitespace.`);
  }
  return value;
}

function assertIsoDate(value, name) {
  const checked = assertNonBlank(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checked)) {
    throw new Error(`${name} must be a YYYY-MM-DD date.`);
  }

  const [year, month, day] = checked.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${name} must be a real calendar date.`);
  }
  return checked;
}

function assertCleanSourceTree() {
  const allowDirty = getBoolean(
    args['allow-dirty'] ?? process.env.BELLFIELD_RELEASE_ALLOW_DIRTY,
    false
  );
  if (allowDirty) {
    return;
  }

  const status = runCapture('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status === null) {
    throw new Error('Refusing to build a release because git status could not be read.');
  }
  if (status.trim()) {
    throw new Error(
      [
        'Refusing to build a signed release from a dirty working tree.',
        'Commit or stash changes so bellfield-build-manifest.json points at reproducible source.',
        'For diagnostic-only builds, pass --allow-dirty=true.'
      ].join(' ')
    );
  }
}

assertCleanSourceTree();

rmSync(releaseRoot, { force: true, recursive: true });
mkdirSync(releaseRoot, { recursive: true });

run('pnpm', ['--filter', '@bellfield/contracts', 'build']);
run('pnpm', ['--filter', '@bellfield/i18n', 'build']);
run('pnpm', ['--filter', '@bellfield/api', 'build']);
run('pnpm', ['--filter', '@bellfield/worker', 'build']);
run('pnpm', ['--filter', '@bellfield/office-web', 'build']);

const nodeExe = copyNodeRuntime();

deployWorkspacePackage('@bellfield/api', join(releaseRoot, 'apps', 'api'));
deployWorkspacePackage('@bellfield/worker', join(releaseRoot, 'apps', 'worker'));
assertReleasePackageDependencies({
  nodeExe,
  sourcePackageJson: join(repoRoot, 'apps', 'api', 'package.json'),
  packageRoot: join(releaseRoot, 'apps', 'api'),
  label: 'api release'
});
assertReleasePackageDependencies({
  nodeExe,
  sourcePackageJson: join(repoRoot, 'apps', 'worker', 'package.json'),
  packageRoot: join(releaseRoot, 'apps', 'worker'),
  label: 'worker release'
});

const buildManifest = {
  schemaVersion: 1,
  buildKind: 'release',
  licenseRequired: true,
  version: assertNonBlank(
    String(args.version ?? process.env.BELLFIELD_RELEASE_VERSION ?? readPackageVersion()),
    'release version'
  ),
  releaseDate: assertIsoDate(
    String(
      args['release-date'] ??
        process.env.BELLFIELD_RELEASE_DATE ??
        new Date().toISOString().slice(0, 10)
    ),
    'release date'
  ),
  generatedAt: new Date().toISOString(),
  sourceCommit: runCapture('git', ['rev-parse', '--short', 'HEAD'])
};
const buildManifestJson = `${JSON.stringify(buildManifest, null, 2)}\n`;
writeFileSync(join(releaseRoot, 'bellfield-build-manifest.json'), buildManifestJson, 'utf8');
writeFileSync(
  join(releaseRoot, 'apps', 'api', 'bellfield-build-manifest.json'),
  buildManifestJson,
  'utf8'
);

copyRequired(
  join(repoRoot, 'apps', 'api', 'src', 'database', 'migrations'),
  join(releaseRoot, 'apps', 'api', 'src', 'database', 'migrations')
);
copyRequired(
  join(repoRoot, 'apps', 'api', 'scripts', 'migrations'),
  join(releaseRoot, 'apps', 'api', 'scripts', 'migrations')
);

packageOfficeWebRuntime(nodeExe);

copyFileRequired(
  join(repoRoot, 'bellfield-server.env.example'),
  join(releaseRoot, 'bellfield-server.env.example')
);
copyRequired(join(repoRoot, 'tools', 'install'), join(releaseRoot, 'tools', 'install'));
copyFileRequired(
  join(repoRoot, 'tools', 'license', 'license-format.mjs'),
  join(releaseRoot, 'tools', 'license', 'license-format.mjs')
);
copyFileRequired(
  join(repoRoot, 'tools', 'update', 'release-artifact.mjs'),
  join(releaseRoot, 'tools', 'update', 'release-artifact.mjs')
);
copyFileRequired(
  join(repoRoot, 'tools', 'update', 'license-verification.mjs'),
  join(releaseRoot, 'tools', 'update', 'license-verification.mjs')
);

copyOptionalGateDayDependencies();

assertNoReparsePoints(releaseRoot, 'release tree before signing');

writeFileSync(
  join(releaseRoot, 'README.txt'),
  [
    'BellField server release bundle',
    `Version: ${buildManifest.version}`,
    `Release date: ${buildManifest.releaseDate}`,
    '',
    '1. Copy bellfield-server.env.example to bellfield-server.env and edit the values.',
    '2. Run tools\\install\\write-server-config.mjs to create install-local paths when needed.',
    '3. Run apps\\api\\scripts\\migrations\\up.mjs after PostgreSQL is provisioned.',
    '4. Register services with tools\\install\\install-windows-services.ps1.',
    '5. Restore, when needed, with tools\\install\\restore-backup.mjs and docs/restore-runbook.md.',
    '6. Update artifacts are signed with bellfield-update-manifest.json + bellfield-update-signature.json.',
    '',
    'See docs/install-runbook.md in the source tree for the current supported runbook.'
  ].join('\r\n')
);

const signedArtifact = writeSignedReleaseArtifact({
  releaseRoot,
  privateKeyPath:
    args['release-private-key'] ?? process.env.BELLFIELD_RELEASE_PRIVATE_KEY_PATH ?? undefined
});
console.log(`Signed update artifact manifest at ${signedArtifact.manifestPath}`);

console.log(`Release assembled at ${releaseRoot}`);
