import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findPnpmActionEntrypoint, readPnpmEntrypointVersion } from './pnpm-invocation.mjs';

test('finds and verifies the pnpm/action-setup JavaScript entrypoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-pnpm-action-'));
  const pnpmHome = join(root, 'node_modules', '.bin');
  const entrypoint = join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');

  try {
    mkdirSync(pnpmHome, { recursive: true });
    mkdirSync(dirname(entrypoint), { recursive: true });
    writeFileSync(
      entrypoint,
      "if (process.argv[2] === '--version') process.stdout.write('11.13.0\\n');\n",
      'utf8'
    );

    assert.equal(findPnpmActionEntrypoint(pnpmHome), entrypoint);
    assert.equal(readPnpmEntrypointVersion(entrypoint), '11.13.0');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('returns null when pnpm/action-setup has no package entrypoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'bellfield-pnpm-action-missing-'));

  try {
    const pnpmHome = join(root, 'node_modules', '.bin');
    mkdirSync(pnpmHome, { recursive: true });
    assert.equal(findPnpmActionEntrypoint(pnpmHome), null);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('both isolated and inner release layers consume the verified pnpm action resolver', () => {
  const toolsRoot = dirname(fileURLToPath(import.meta.url));

  for (const filename of ['build-release-isolated.mjs', 'build-release.mjs']) {
    const source = readFileSync(join(toolsRoot, filename), 'utf8');
    assert.match(source, /findPnpmActionEntrypoint/);
    assert.match(source, /readPnpmEntrypointVersion/);
  }
});
