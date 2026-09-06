import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { parseSyncArgs, planSyncSteps, runSyncSteps } from './sync-workstation.mjs';

test('plans pull, install, env copy, and both migrations by default', () => {
  const steps = planSyncSteps(parseSyncArgs([]));

  assert.deepEqual(
    steps.map((step) => [step.command, ...step.args].join(' ')),
    [
      'git pull --ff-only',
      'corepack pnpm install --frozen-lockfile',
      `node ${path.join('tools', 'sync-local-env.mjs')}`,
      'corepack pnpm dev:migrate',
      'corepack pnpm dev:relay:migrate'
    ]
  );
  assert.equal(steps.filter((step) => step.optional).length, 1);
});

test('skip flags remove exactly the matching steps', () => {
  const steps = planSyncSteps(parseSyncArgs(['--skip-pull', '--skip-env', '--skip-migrate']));

  assert.deepEqual(
    steps.map((step) => step.command),
    ['corepack']
  );
});

test('a failed optional step is skipped while a failed required step stops the sync', () => {
  const steps = planSyncSteps(parseSyncArgs([]));
  const attempted = [];
  const status = runSyncSteps(steps, (step) => {
    attempted.push(step.name);
    if (step.optional) {
      return 1;
    }
    return step.args.includes('dev:migrate') ? 7 : 0;
  });

  assert.equal(status, 7);
  assert.deepEqual(
    attempted,
    steps.slice(0, 4).map((step) => step.name)
  );
});
