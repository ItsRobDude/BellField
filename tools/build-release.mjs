import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readArgs } from './install/install-utils.mjs';
import { writeSignedReleaseArtifact } from './update/release-artifact.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = join(repoRoot, 'release');
const args = readArgs();
let cachedPnpmExecutable;

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
}

function deployWorkspacePackage(filter, target) {
  run('pnpm', ['--filter', filter, 'deploy', '--prod', '--legacy', target]);
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate)) ?? null;
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

rmSync(releaseRoot, { force: true, recursive: true });
mkdirSync(releaseRoot, { recursive: true });

run('pnpm', ['--filter', '@bellfield/contracts', 'build']);
run('pnpm', ['--filter', '@bellfield/api', 'build']);
run('pnpm', ['--filter', '@bellfield/worker', 'build']);
run('pnpm', ['--filter', '@bellfield/office-web', 'build']);

copyNodeRuntime();

deployWorkspacePackage('@bellfield/api', join(releaseRoot, 'apps', 'api'));
deployWorkspacePackage('@bellfield/worker', join(releaseRoot, 'apps', 'worker'));

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

copyRequired(
  join(repoRoot, 'apps', 'office-web', '.next', 'standalone'),
  join(releaseRoot, 'apps', 'office-web')
);

const officeServer = firstExisting([
  join(releaseRoot, 'apps', 'office-web', 'server.js'),
  join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
]);
if (!officeServer) {
  throw new Error('Office standalone server.js was not found in the release artifact.');
}
const officeServerRoot = dirname(officeServer);
copyRequired(
  join(repoRoot, 'apps', 'office-web', '.next', 'static'),
  join(officeServerRoot, '.next', 'static')
);
if (existsSync(join(repoRoot, 'apps', 'office-web', 'public'))) {
  copyRequired(join(repoRoot, 'apps', 'office-web', 'public'), join(officeServerRoot, 'public'));
}

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
