import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertNoReparsePoints } from './release-portability.mjs';
import { readArgs } from './install/install-utils.mjs';

const args = readArgs();
const releaseRoot = resolve(args['release-root'] ?? 'release');
const output = args.output ? resolve(String(args.output)) : null;

if (!output) {
  throw new Error('Usage: pnpm package:release-zip -- --release-root=release --output=<zip>');
}
if (!existsSync(releaseRoot) || !statSync(releaseRoot).isDirectory()) {
  throw new Error(`Release root was not found: ${releaseRoot}`);
}
if (process.platform !== 'win32') {
  throw new Error('Release ZIP packaging currently requires Windows tar.exe.');
}
const outputRelativeToRelease = relative(releaseRoot, output);
if (
  outputRelativeToRelease &&
  !outputRelativeToRelease.startsWith('..') &&
  !isAbsolute(outputRelativeToRelease)
) {
  throw new Error(`Release ZIP output must be outside the release root: ${output}`);
}

assertNoReparsePoints(releaseRoot, 'release tree before ZIP packaging');
mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });

// Windows PowerShell 5.1 Compress-Archive still has MAX_PATH edge cases on deep
// node_modules/.next trees. The inbox tar.exe is bsdtar and is the release packer
// here; smoke:release-zip remains the authoritative post-extraction proof.
const result = spawnSync(
  'tar.exe',
  ['-a', '-c', '-f', output, '-C', dirname(releaseRoot), basename(releaseRoot)],
  {
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000
  }
);

if (result.error) {
  throw new Error(`Failed to create release ZIP: ${result.error.message}`);
}
if (result.status !== 0) {
  throw new Error(`Failed to create release ZIP:\n${result.stderr.trim()}`);
}
if (!existsSync(output) || statSync(output).size === 0) {
  throw new Error(`Release ZIP was not created or is empty: ${output}`);
}

console.log(`Release ZIP created at ${output}`);
