import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile, readArgs } from './install-utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');
const args = readArgs();
const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const env = parseEnvFile(envPath);
const requireFromHere = createRequire(import.meta.url);

try {
  applyServerEnv(env, releaseRoot);

  const apiRuntimeModule = requireFromHere(
    join(
      releaseRoot,
      'apps',
      'api',
      'dist',
      'apps',
      'api',
      'src',
      'common',
      'config',
      'runtime-config.js'
    )
  );
  const apiLicenseModule = requireFromHere(
    join(
      releaseRoot,
      'apps',
      'api',
      'dist',
      'apps',
      'api',
      'src',
      'modules',
      'licensing',
      'license-verification.js'
    )
  );
  const workerRuntimeModule = requireFromHere(
    join(releaseRoot, 'apps', 'worker', 'dist', 'common', 'config', 'runtime-config.js')
  );

  const apiConfig = apiRuntimeModule.getApiRuntimeConfig();
  apiLicenseModule.assertRuntimeLicense(apiConfig);
  const workerConfig = workerRuntimeModule.getWorkerRuntimeConfig();

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        api: {
          nodeEnv: apiConfig.nodeEnv,
          port: apiConfig.port,
          relayConfigured: Boolean(apiConfig.relay),
          licenseRequired: apiConfig.licenseRequired,
          licensePathConfigured: Boolean(apiConfig.licensePath)
        },
        worker: {
          nodeEnv: workerConfig.nodeEnv,
          relayConfigured: Boolean(workerConfig.relay),
          backupEnabled: workerConfig.backup.enabled,
          backupRootConfigured: Boolean(workerConfig.backup.root)
        }
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

function applyServerEnv(env, releaseRoot) {
  const managedKeys = [
    ...Object.keys(env),
    'PORT',
    'BELLFIELD_BUILD_MANIFEST_PATH',
    'BOOTSTRAP_SEED_DATA'
  ];
  for (const key of managedKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, env, {
    NODE_ENV: 'production',
    BOOTSTRAP_SEED_DATA: 'false',
    PORT: env.BELLFIELD_API_PORT ?? '3001',
    BELLFIELD_BUILD_MANIFEST_PATH: join(releaseRoot, 'bellfield-build-manifest.json')
  });

  const manifestPath = process.env.BELLFIELD_BUILD_MANIFEST_PATH;
  if (!manifestPath || !existsSync(manifestPath)) {
    throw new Error(`Release build manifest not found: ${manifestPath}`);
  }
}
