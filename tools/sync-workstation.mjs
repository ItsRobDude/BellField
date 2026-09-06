import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One command for "I just sat down at this PC": pull, install, copy local env
// files, and migrate both local databases. Every step is skippable.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postgresHint =
  'Start PostgreSQL first: pnpm dev:postgres:docker (Docker) or pnpm dev:postgres (native).';

export function parseSyncArgs(argv) {
  return {
    pull: !argv.includes('--skip-pull'),
    install: !argv.includes('--skip-install'),
    env: !argv.includes('--skip-env'),
    migrate: !argv.includes('--skip-migrate')
  };
}

export function planSyncSteps(flags) {
  const steps = [];

  if (flags.pull) {
    steps.push({
      name: 'Pull the latest commits (fast-forward only)',
      command: 'git',
      args: ['pull', '--ff-only'],
      hint: 'Commit or stash local work, or check out a branch that tracks a remote, then re-run.'
    });
  }

  if (flags.install) {
    steps.push({
      name: 'Install workspace dependencies from the lockfile',
      command: 'corepack',
      args: ['pnpm', 'install', '--frozen-lockfile'],
      // pnpm otherwise stops to ask before rebuilding node_modules in a non-interactive shell.
      env: { npm_config_confirm_modules_purge: 'false' }
    });
  }

  if (flags.env) {
    steps.push({
      name: 'Copy local env files from the shared dev folder',
      command: 'node',
      args: [path.join('tools', 'sync-local-env.mjs')],
      optional: true,
      hint: 'Run pnpm dev:env once the shared drive is available.'
    });
  }

  if (flags.migrate) {
    steps.push(
      {
        name: 'Apply API database migrations',
        command: 'corepack',
        args: ['pnpm', 'dev:migrate'],
        hint: postgresHint
      },
      {
        name: 'Apply relay database migrations',
        command: 'corepack',
        args: ['pnpm', 'dev:relay:migrate'],
        hint: postgresHint
      }
    );
  }

  return steps;
}

export function runSyncSteps(steps, runStep = spawnStep) {
  for (const step of steps) {
    console.log(`\n==> ${step.name}`);
    const status = runStep(step);

    if (status === 0) {
      continue;
    }

    if (step.optional) {
      console.warn(`Skipped: ${step.name} failed. ${step.hint ?? ''}`.trim());
      continue;
    }

    console.error(`\nSync stopped: ${step.name} failed.${step.hint ? ` ${step.hint}` : ''}`);
    return status;
  }

  console.log('\nWorkstation is in sync.');
  return 0;
}

function spawnStep(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    env: { ...process.env, ...step.env },
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runSyncSteps(planSyncSteps(parseSyncArgs(process.argv.slice(2)))));
}
