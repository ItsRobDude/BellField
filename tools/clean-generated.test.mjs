import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, test } from 'node:test';
import { cleanGeneratedDirectories, collectGeneratedDirectories } from './clean-generated.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-clean-generated-test-'));
  temporaryRoots.push(root);

  for (const directory of [
    'release',
    'coverage',
    'apps/api/dist',
    'apps/office-web/.next',
    'packages/contracts/dist',
    'bellfield-office-web-deploy-fixture',
    'bellfield-release-publish-fixture',
    'artifacts',
    'node_modules',
    'apps/api/operator-notes'
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, 'keep-or-remove.txt'), directory, 'utf8');
  }

  return root;
}

test('collectGeneratedDirectories returns only the fixed generated-output allowlist', () => {
  const root = fixtureRoot();
  const collected = collectGeneratedDirectories(root).map((path) =>
    relative(root, path).split(sep).join('/')
  );

  assert.deepEqual(
    collected.sort(),
    [
      'apps/api/dist',
      'apps/office-web/.next',
      'bellfield-office-web-deploy-fixture',
      'bellfield-release-publish-fixture',
      'coverage',
      'packages/contracts/dist',
      'release'
    ].sort()
  );
  assert.equal(collected.includes('artifacts'), false);
  assert.equal(collected.includes('node_modules'), false);
  assert.equal(collected.includes('apps/api/operator-notes'), false);
});

test('dry-run reports candidates without deleting them', () => {
  const root = fixtureRoot();
  const lines = [];

  cleanGeneratedDirectories({ root, dryRun: true, log: (line) => lines.push(line) });

  assert.equal(existsSync(join(root, 'release')), true);
  assert.ok(lines.some((line) => line === '[dry-run] release'));
  assert.ok(lines.every((line) => line.startsWith('[dry-run] ')));
});

test('apply removes generated directories and preserves non-generated local data', () => {
  const root = fixtureRoot();

  cleanGeneratedDirectories({ root, dryRun: false, log: () => {} });

  assert.equal(existsSync(join(root, 'release')), false);
  assert.equal(existsSync(join(root, 'apps/api/dist')), false);
  assert.equal(existsSync(join(root, 'artifacts/keep-or-remove.txt')), true);
  assert.equal(existsSync(join(root, 'node_modules/keep-or-remove.txt')), true);
  assert.equal(existsSync(join(root, 'apps/api/operator-notes/keep-or-remove.txt')), true);
});
