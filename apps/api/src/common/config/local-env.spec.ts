import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWorkspaceRoot, loadLocalEnvFiles, resolveLocalEnvFiles } from './local-env';

describe('local env files', () => {
  let workspaceRoot: string;
  let appDir: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'bellfield-local-env-'));
    appDir = join(workspaceRoot, 'apps', 'api');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  });

  afterEach(() => {
    rmSync(workspaceRoot, { force: true, recursive: true });
  });

  it('finds the workspace root by walking up from the app directory', () => {
    expect(findWorkspaceRoot(appDir)).toBe(workspaceRoot);
    expect(findWorkspaceRoot(join(workspaceRoot, 'missing', 'deeper'))).toBe(workspaceRoot);
  });

  it('lists the app env before the root env and skips files that do not exist', () => {
    expect(resolveLocalEnvFiles(appDir)).toEqual([]);

    writeFileSync(join(workspaceRoot, '.env'), 'PORT=3001\n');
    expect(resolveLocalEnvFiles(appDir)).toEqual([join(workspaceRoot, '.env')]);

    writeFileSync(join(appDir, '.env'), 'PORT=3002\n');
    expect(resolveLocalEnvFiles(appDir)).toEqual([
      join(appDir, '.env'),
      join(workspaceRoot, '.env')
    ]);
  });

  it('lets the shell win, then the app env, then the root env', () => {
    writeFileSync(join(workspaceRoot, '.env'), 'PORT=3001\nDATABASE_URL=root\nONLY_ROOT=yes\n');
    writeFileSync(join(appDir, '.env'), 'DATABASE_URL=app\nONLY_APP=yes\n');
    const env: Record<string, string | undefined> = { PORT: '4000' };

    const loaded = loadLocalEnvFiles({ nodeEnv: 'development', startDir: appDir, env });

    expect(loaded).toEqual([join(appDir, '.env'), join(workspaceRoot, '.env')]);
    expect(env).toEqual({ PORT: '4000', DATABASE_URL: 'app', ONLY_APP: 'yes', ONLY_ROOT: 'yes' });
  });

  it('never reads local env files for production or test runs', () => {
    writeFileSync(join(workspaceRoot, '.env'), 'PORT=3001\n');

    for (const nodeEnv of ['production', 'test']) {
      const env: Record<string, string | undefined> = {};
      expect(loadLocalEnvFiles({ nodeEnv, startDir: appDir, env })).toEqual([]);
      expect(env).toEqual({});
    }
  });
});
