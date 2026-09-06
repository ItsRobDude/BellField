import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { applyLocalEnvSync, describeLocalEnvSync, planLocalEnvSync } from './sync-local-env.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-sync-local-env-'));
  temporaryRoots.push(root);
  const sourceDir = join(root, 'master');
  const repoRoot = join(root, 'repo');
  mkdirSync(sourceDir, { recursive: true });
  for (const app of ['office-web', 'field-mobile', 'relay']) {
    mkdirSync(join(repoRoot, 'apps', app), { recursive: true });
  }
  writeFileSync(
    join(repoRoot, 'apps', 'office-web', '.env.example'),
    'NEXT_PUBLIC_API_BASE_URL=x\n'
  );
  writeFileSync(
    join(repoRoot, 'apps', 'field-mobile', '.env.example'),
    'EXPO_PUBLIC_API_BASE_URL=x\n'
  );
  return { sourceDir, repoRoot };
}

test('copies master env files into place and seeds missing client env files from examples', () => {
  const { sourceDir, repoRoot } = fixture();
  writeFileSync(join(sourceDir, 'bellfield-dev.env'), 'PORT=3001\n');
  writeFileSync(join(sourceDir, 'bellfield-dev-relay.env'), 'BELLFIELD_RELAY_PORT=3201\n');
  writeFileSync(
    join(repoRoot, 'apps', 'field-mobile', '.env'),
    'EXPO_PUBLIC_API_BASE_URL=custom\n'
  );

  const actions = applyLocalEnvSync(planLocalEnvSync({ sourceDir, repoRoot }));

  assert.deepEqual(
    actions.map((action) => action.type),
    ['copy', 'copy', 'copy', 'keep']
  );
  assert.equal(readFileSync(join(repoRoot, '.env'), 'utf8'), 'PORT=3001\n');
  assert.equal(
    readFileSync(join(repoRoot, 'apps', 'relay', '.env'), 'utf8'),
    'BELLFIELD_RELAY_PORT=3201\n'
  );
  assert.equal(
    readFileSync(join(repoRoot, 'apps', 'office-web', '.env'), 'utf8'),
    'NEXT_PUBLIC_API_BASE_URL=x\n'
  );
  assert.equal(
    readFileSync(join(repoRoot, 'apps', 'field-mobile', '.env'), 'utf8'),
    'EXPO_PUBLIC_API_BASE_URL=custom\n'
  );
});

test('reports missing master files without touching the checkout and never prints contents', () => {
  const { sourceDir, repoRoot } = fixture();
  writeFileSync(join(sourceDir, 'bellfield-dev.env'), 'SECRET=do-not-print\n');

  const actions = applyLocalEnvSync(planLocalEnvSync({ sourceDir, repoRoot }), { dryRun: true });
  const lines = describeLocalEnvSync(actions, repoRoot);

  assert.equal(actions.filter((action) => action.type === 'missing').length, 1);
  assert.ok(lines.some((line) => line.startsWith('missing source ')));
  assert.ok(lines.every((line) => !line.includes('do-not-print')));
  assert.throws(() => readFileSync(join(repoRoot, '.env')), { code: 'ENOENT' });
});
