import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getBoolean, readArgs } from './install/install-utils.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = join(repoRoot, 'release');
const rawArgs = process.argv.slice(2);
const args = readArgs();
let cachedPnpmExecutable;

function expectedPnpmVersion() {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const match = /^pnpm@(.+)$/.exec(String(packageJson.packageManager ?? ''));
  if (!match) {
    throw new Error('package.json must pin pnpm through its packageManager field.');
  }
  return match[1];
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

function findPnpmExecutable() {
  if (cachedPnpmExecutable) {
    return cachedPnpmExecutable;
  }

  const expected = expectedPnpmVersion();
  const localPnpmRoot = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'pnpm') : null;
  const searchRoots = [process.env.PNPM_HOME, localPnpmRoot].filter(Boolean);
  const candidates = [
    ...searchRoots.flatMap((root) => collectPnpmExecutables(join(root, '.tools'))),
    ...(localPnpmRoot
      ? collectPnpmExecutables(join(localPnpmRoot, 'store', 'v11', 'links', '@pnpm', 'exe'))
      : []),
    ...(process.env.PATH ?? process.env.Path ?? '')
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => join(entry, 'pnpm.exe'))
      .filter((candidate) => existsSync(candidate))
  ];

  cachedPnpmExecutable = candidates.find(
    (candidate) => readExecutableVersion(candidate) === expected
  );
  return cachedPnpmExecutable ?? null;
}

function resolveInvocation(command, commandArgs) {
  if (process.platform !== 'win32') {
    return { executable: command, args: commandArgs, env: process.env };
  }

  if (command === 'pnpm') {
    const pnpmExecutable = findPnpmExecutable();
    if (pnpmExecutable) {
      return { executable: pnpmExecutable, args: commandArgs, env: process.env };
    }

    const corepackPnpm = join(
      dirname(process.execPath),
      'node_modules',
      'corepack',
      'dist',
      'pnpm.js'
    );
    if (!existsSync(corepackPnpm)) {
      throw new Error(
        `Could not find pnpm ${expectedPnpmVersion()} or a Corepack pnpm entrypoint.`
      );
    }
    return {
      executable: process.execPath,
      args: [corepackPnpm, ...commandArgs],
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' }
    };
  }

  return {
    executable: command === 'git' ? 'git.exe' : command,
    args: commandArgs,
    env: process.env
  };
}

function run(command, commandArgs, options = {}) {
  const invocation = resolveInvocation(command, commandArgs);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...invocation.env, ...options.env },
    shell: false,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = options.capture ? String(result.stderr ?? '').trim() : '';
    throw new Error(
      `${command} ${commandArgs[0] ?? ''} exited with ${result.status}${detail ? `: ${detail}` : ''}`
    );
  }

  return options.capture ? String(result.stdout ?? '').trim() : '';
}

function assertCleanSourceTree() {
  const allowDirty = getBoolean(
    args['allow-dirty'] ?? process.env.BELLFIELD_RELEASE_ALLOW_DIRTY,
    false
  );
  const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    capture: true
  });

  if (!status) {
    return;
  }
  if (allowDirty) {
    console.warn(
      '[WARN] Building the committed HEAD from an isolated worktree; uncommitted source changes are excluded.'
    );
    return;
  }

  throw new Error(
    [
      'Refusing to build a signed release from a dirty working tree.',
      'Commit or stash changes so bellfield-build-manifest.json points at reproducible source.',
      'For a diagnostic build of committed HEAD, pass --allow-dirty=true.'
    ].join(' ')
  );
}

function assertOwnedChild(parent, child, label) {
  const childRelative = relative(resolve(parent), resolve(child));
  if (!childRelative || childRelative.startsWith('..') || isAbsolute(childRelative)) {
    throw new Error(`Refusing to manage ${label} outside its owned parent: ${child}`);
  }
}

function removeStagedBuildResidue(stagingRepo) {
  const generatedDirectories = [
    join(stagingRepo, 'node_modules'),
    join(stagingRepo, 'release'),
    join(stagingRepo, 'coverage')
  ];

  for (const parentName of ['apps', 'packages']) {
    const parent = join(stagingRepo, parentName);
    if (!existsSync(parent)) {
      continue;
    }
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      generatedDirectories.push(join(parent, entry.name, 'node_modules'));
      generatedDirectories.push(join(parent, entry.name, 'dist'));
      if (parentName === 'apps') {
        generatedDirectories.push(join(parent, entry.name, '.next'));
        generatedDirectories.push(join(parent, entry.name, '.expo'));
        generatedDirectories.push(join(parent, entry.name, '.turbo'));
      }
    }
  }

  for (const entry of readdirSync(stagingRepo, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('bellfield-office-web-deploy-')) {
      generatedDirectories.push(join(stagingRepo, entry.name));
    }
  }

  for (const generatedDirectory of generatedDirectories) {
    if (existsSync(generatedDirectory)) {
      rmSync(generatedDirectory, {
        force: true,
        maxRetries: 20,
        recursive: true,
        retryDelay: 250
      });
    }
  }
}

assertCleanSourceTree();

const sourceCommit = run('git', ['rev-parse', 'HEAD'], { capture: true });
const stagingParent = mkdtempSync(join(tmpdir(), 'bf-rel-'));
const stagingRepo = join(stagingParent, 's');
const stagedReleaseRoot = join(stagingRepo, 'release');
const publishRoot = join(repoRoot, `bellfield-release-publish-${process.pid}-${Date.now()}`);
let worktreeAdded = false;

assertOwnedChild(tmpdir(), stagingParent, 'release staging directory');
assertOwnedChild(stagingParent, stagingRepo, 'release staging worktree');
assertOwnedChild(repoRoot, publishRoot, 'release publish directory');

try {
  console.log(`release staging: checking out ${sourceCommit.slice(0, 12)}...`);
  run('git', ['worktree', 'add', '--detach', stagingRepo, sourceCommit]);
  worktreeAdded = true;

  console.log('release staging: installing frozen dependencies...');
  run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: stagingRepo,
    env: { SKIP_INSTALL_SIMPLE_GIT_HOOKS: '1' }
  });

  console.log('release staging: assembling and signing in the disposable worktree...');
  run('pnpm', ['exec', 'node', 'tools/build-release.mjs', ...rawArgs], {
    cwd: stagingRepo,
    env: {
      BELLFIELD_RELEASE_STAGED_BUILD: '1',
      SKIP_INSTALL_SIMPLE_GIT_HOOKS: '1'
    }
  });

  if (!existsSync(stagedReleaseRoot) || !statSync(stagedReleaseRoot).isDirectory()) {
    throw new Error('The staged release build completed without producing release/.');
  }

  rmSync(publishRoot, { force: true, recursive: true });
  cpSync(stagedReleaseRoot, publishRoot, { recursive: true });
  rmSync(releaseRoot, { force: true, recursive: true });
  renameSync(publishRoot, releaseRoot);
  console.log(
    `Release assembled from isolated commit ${sourceCommit.slice(0, 12)} at ${releaseRoot}`
  );
} finally {
  if (existsSync(publishRoot)) {
    rmSync(publishRoot, { force: true, recursive: true });
  }

  if (worktreeAdded) {
    try {
      removeStagedBuildResidue(stagingRepo);
      run('git', ['-c', 'core.longpaths=true', 'worktree', 'remove', '--force', stagingRepo]);
    } catch (error) {
      console.warn(`Git worktree cleanup needed a filesystem fallback: ${error.message}`);
      if (existsSync(stagingRepo)) {
        rmSync(stagingRepo, {
          force: true,
          maxRetries: 20,
          recursive: true,
          retryDelay: 250
        });
      }
      try {
        run('git', ['worktree', 'prune', '--expire=now']);
      } catch (pruneError) {
        console.warn(`Git worktree metadata cleanup needs attention: ${pruneError.message}`);
      }
    }
  }

  if (!existsSync(stagingRepo) && existsSync(stagingParent)) {
    rmSync(stagingParent, { force: true, recursive: true });
  }
}
