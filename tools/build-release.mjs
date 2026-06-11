import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = join(repoRoot, 'release');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
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

rmSync(releaseRoot, { force: true, recursive: true });
mkdirSync(releaseRoot, { recursive: true });

run('pnpm', ['--filter', '@bellfield/contracts', 'build']);
run('pnpm', ['--filter', '@bellfield/api', 'build']);
run('pnpm', ['--filter', '@bellfield/worker', 'build']);
run('pnpm', ['--filter', '@bellfield/office-web', 'build']);

copyNodeRuntime();

deployWorkspacePackage('@bellfield/api', join(releaseRoot, 'apps', 'api'));
deployWorkspacePackage('@bellfield/worker', join(releaseRoot, 'apps', 'worker'));

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

writeFileSync(
  join(releaseRoot, 'README.txt'),
  [
    'BellField server release bundle',
    '',
    '1. Copy bellfield-server.env.example to bellfield-server.env and edit the values.',
    '2. Run tools\\install\\write-server-config.mjs to create install-local paths when needed.',
    '3. Run apps\\api\\scripts\\migrations\\up.mjs after PostgreSQL is provisioned.',
    '4. Register services with tools\\install\\install-windows-services.ps1.',
    '5. Restore, when needed, with tools\\install\\restore-backup.mjs and docs/restore-runbook.md.',
    '',
    'See docs/install-runbook.md in the source tree for the current supported runbook.'
  ].join('\r\n')
);

console.log(`Release assembled at ${releaseRoot}`);
