import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseEnvFile, pickEnv, readArgs } from './install-utils.mjs';

const usage = [
  'Usage:',
  '  node tools/install/clear-login-attempts.mjs --email=<employee@example.com> [--install-root=C:\\BellField] [--release-root=C:\\BellField\\release] [--env=C:\\BellField\\bellfield-server.env]'
].join('\n');

const args = readArgs();
const email = String(args.email ?? '').trim();

if (!email) {
  console.error('Error: --email is required.');
  console.error(usage);
  process.exitCode = 1;
} else {
  const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
  const releaseRoot = resolve(String(args['release-root'] ?? join(installRoot, 'release')));
  const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
  const env = parseEnvFile(envPath);
  const nodeExe =
    process.platform === 'win32'
      ? join(releaseRoot, 'runtime', 'node', 'node.exe')
      : process.execPath;
  const cliPath = join(
    releaseRoot,
    'apps',
    'api',
    'dist',
    'apps',
    'api',
    'src',
    'cli',
    'identity-admin.js'
  );

  if (!existsSync(cliPath)) {
    console.error(`Error: identity admin command was not found at ${cliPath}.`);
    process.exitCode = 1;
  } else if (process.platform === 'win32' && !existsSync(nodeExe)) {
    console.error(`Error: bundled Node runtime was not found at ${nodeExe}.`);
    process.exitCode = 1;
  } else {
    const result = spawnSync(nodeExe, [cliPath, 'clear-login-attempts', `--email=${email}`], {
      cwd: join(releaseRoot, 'apps', 'api'),
      env: {
        ...process.env,
        ...pickEnv(env, [
          'DATABASE_URL',
          'BELLFIELD_API_PORT',
          'BELLFIELD_OFFICE_ORIGINS',
          'BELLFIELD_LICENSE_REQUIRED',
          'BELLFIELD_LICENSE_PATH',
          'BELLFIELD_RELAY_BASE_URL',
          'BELLFIELD_RELAY_TOKEN',
          'BELLFIELD_RELAY_SERVER_INSTANCE_ID'
        ]),
        NODE_ENV: 'production',
        BOOTSTRAP_SEED_DATA: 'false',
        PORT: env.BELLFIELD_API_PORT ?? '3001'
      },
      shell: false,
      stdio: 'inherit'
    });

    process.exitCode = result.status ?? 1;
  }
}
