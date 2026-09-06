import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Development-only convenience: seeds process.env from the gitignored local
 * `.env` files so `pnpm dev:*` works without exporting variables by hand.
 *
 * Precedence, highest first:
 *   1. values already present in the shell / process environment
 *   2. <app>/.env
 *   3. <workspace root>/.env
 *
 * Production and test runs never read these files. Installed servers get
 * their environment from bellfield-server.env through the service wrapper.
 */
export type LocalEnvOptions = {
  nodeEnv?: string | undefined;
  startDir?: string;
  env?: Record<string, string | undefined>;
};

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

export function findWorkspaceRoot(startDir: string): string | undefined {
  let current = resolve(startDir);

  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function resolveLocalEnvFiles(startDir: string): string[] {
  const appDir = resolve(startDir);
  const workspaceRoot = findWorkspaceRoot(appDir);
  const candidates = [join(appDir, '.env')];

  if (workspaceRoot && workspaceRoot !== appDir) {
    candidates.push(join(workspaceRoot, '.env'));
  }

  return candidates.filter((file) => existsSync(file));
}

export function loadLocalEnvFiles(options: LocalEnvOptions = {}): string[] {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === 'production' || nodeEnv === 'test') {
    return [];
  }

  const env = options.env ?? process.env;
  const loaded: string[] = [];

  for (const file of resolveLocalEnvFiles(options.startDir ?? process.cwd())) {
    const parsed = parseEnv(readFileSync(file, 'utf8'));

    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] === undefined) {
        env[key] = value;
      }
    }

    loaded.push(file);
  }

  return loaded;
}
