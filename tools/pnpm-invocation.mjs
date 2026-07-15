import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function findPnpmActionEntrypoint(pnpmHome) {
  if (!pnpmHome) {
    return null;
  }

  // pnpm/action-setup sets PNPM_HOME to <dest>/node_modules/.bin and installs
  // the package entrypoint beside that directory at ../pnpm/bin/pnpm.cjs.
  const candidate = resolve(pnpmHome, '..', 'pnpm', 'bin', 'pnpm.cjs');
  return existsSync(candidate) ? candidate : null;
}

export function readPnpmEntrypointVersion(entrypoint, nodeExecutable = process.execPath) {
  const result = spawnSync(nodeExecutable, [entrypoint, '--version'], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return result.status === 0 ? result.stdout.trim() : null;
}
